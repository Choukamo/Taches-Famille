-- Cases toutes prêtes (noms de tâches réutilisables) + tâches qui se répètent

create table if not exists public.task_presets (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.task_presets enable row level security;
create policy "presets read" on public.task_presets for select to authenticated using (public.is_member());
insert into public.task_presets (title, sort_order) values
  ('Jeter les poubelles', 1), ('Vider le lave-vaisselle', 2), ('Mettre la table', 3), ('Débarrasser la table', 4)
on conflict (title) do nothing;

create or replace function public.add_preset(p_title text)
returns public.task_presets language plpgsql security definer set search_path = public as $$
declare p public.task_presets;
begin
  if public.current_member_id() is null then raise exception 'Non connecté'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Nom vide'; end if;
  insert into public.task_presets (title) values (trim(p_title))
  on conflict (title) do update set title = excluded.title returning * into p;
  return p;
end $$;

create or replace function public.delete_preset(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_id() is null then raise exception 'Non connecté'; end if;
  delete from public.task_presets where id = p_id;
end $$;

create table if not exists public.recurrences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  created_by uuid not null references public.members(id),
  mode text not null default 'direct' check (mode in ('direct','roulette')),
  members uuid[] not null,
  pick_count int not null default 1,
  interval_minutes int not null default 60 check (interval_minutes >= 5),
  days int[] not null default '{1,2,3,4,5,6,7}',
  at_time time not null default '20:00',
  active boolean not null default true,
  last_spawned_date date,
  created_at timestamptz not null default now(),
  check (cardinality(members) >= 1),
  check (cardinality(days) >= 1)
);
alter table public.recurrences enable row level security;
create policy "recurrences read" on public.recurrences for select to authenticated using (public.is_member());
alter table public.tasks add column if not exists recurrence_id uuid references public.recurrences(id) on delete set null;
alter publication supabase_realtime add table public.recurrences;
alter publication supabase_realtime add table public.task_presets;

create or replace function public.create_recurrence(
  p_title text, p_note text, p_mode text, p_members uuid[], p_pick_count int,
  p_interval_minutes int, p_days int[], p_at_time time
) returns public.recurrences language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  r public.recurrences;
  n int;
  today date := (now() at time zone 'Europe/Paris')::date;
  nowt time := (now() at time zone 'Europe/Paris')::time;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Titre vide'; end if;
  if p_members is null or cardinality(p_members) = 0 then raise exception 'Choisis au moins une personne'; end if;
  if p_days is null or cardinality(p_days) = 0 then raise exception 'Choisis au moins un jour'; end if;
  n := cardinality(p_members);
  if p_mode = 'roulette' then
    if n < 2 then raise exception 'La roulette demande au moins 2 personnes'; end if;
    if p_pick_count < 1 or p_pick_count >= n then raise exception 'Nombre de tirés invalide'; end if;
  end if;
  insert into public.recurrences (title, note, created_by, mode, members, pick_count, interval_minutes, days, at_time, last_spawned_date)
  values (trim(p_title), nullif(trim(coalesce(p_note, '')), ''), me, p_mode, p_members,
          case when p_mode = 'roulette' then p_pick_count else 1 end,
          coalesce(p_interval_minutes, 60), p_days, p_at_time,
          case when nowt >= p_at_time then today else null end)
  returning * into r;
  return r;
end $$;

create or replace function public.delete_recurrence(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_id() is null then raise exception 'Non connecté'; end if;
  delete from public.recurrences where id = p_id;
end $$;

-- Appelée par le serveur (toutes les 5 min) : crée les tâches du jour dont l'heure est passée
create or replace function public.spawn_due_recurrences()
returns setof uuid language plpgsql security definer set search_path = public as $$
declare
  r public.recurrences;
  today date := (now() at time zone 'Europe/Paris')::date;
  nowt time := (now() at time zone 'Europe/Paris')::time;
  dow int := extract(isodow from today);
  present uuid[];
  winners uuid[];
  pick int;
  tid uuid;
begin
  for r in
    select * from public.recurrences
    where active and dow = any(days) and at_time <= nowt and (last_spawned_date is null or last_spawned_date < today)
    for update skip locked
  loop
    update public.recurrences set last_spawned_date = today where id = r.id;
    select array_agg(m.id order by array_position(r.members, m.id)) into present
      from public.members m where m.id = any(r.members) and public.member_present_on(m, today);
    if present is null then continue; end if;

    if r.mode = 'roulette' and cardinality(present) >= 2 then
      pick := least(r.pick_count, cardinality(present) - 1);
      select array_agg(x) into winners from (select x from unnest(present) as x order by random() limit pick) s;
      insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates, recurrence_id)
      values (r.title, r.note, r.created_by, today, r.interval_minutes, 'roulette', present, r.id) returning id into tid;
    else
      winners := present;
      insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates, recurrence_id)
      values (r.title, r.note, r.created_by, today, r.interval_minutes, 'direct', '{}', r.id) returning id into tid;
    end if;
    insert into public.task_assignees (task_id, member_id) select tid, w from unnest(winners) as w;
    return next tid;
  end loop;
end $$;

revoke all on function public.spawn_due_recurrences() from public, anon, authenticated;
grant execute on function public.spawn_due_recurrences() to service_role;
grant execute on function public.add_preset(text) to authenticated;
grant execute on function public.delete_preset(uuid) to authenticated;
grant execute on function public.create_recurrence(text, text, text, uuid[], int, int, int[], time) to authenticated;
grant execute on function public.delete_recurrence(uuid) to authenticated;
