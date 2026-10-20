-- Tâches Famille : schéma initial
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- Tables ----------
create table if not exists public.family (
  id int primary key default 1 check (id = 1),
  name text not null default 'Famille',
  code text not null
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('parent','child')),
  color text not null default '#6b7280',
  sort_order int not null default 0,
  avail_start time not null default '10:00',
  avail_end time not null default '22:00',
  alternating boolean not null default false,
  present_week_start date,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  auth_uid uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  created_by uuid not null references public.members(id),
  scheduled_date date not null default (now() at time zone 'Europe/Paris')::date,
  interval_minutes int not null default 60 check (interval_minutes >= 5),
  mode text not null default 'direct' check (mode in ('direct','roulette')),
  candidates uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open','done')),
  done_by uuid references public.members(id),
  done_at timestamptz,
  roulette_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  last_notified_at timestamptz,
  notify_count int not null default 0,
  primary key (task_id, member_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  auth_uid uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Helpers ----------
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select member_id from public.devices where auth_uid = auth.uid()
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.devices where auth_uid = auth.uid())
$$;

-- Présence : fenêtre horaire + semaine sur deux
create or replace function public.member_present_on(m public.members, d date)
returns boolean language plpgsql immutable as $$
declare
  w int;
begin
  if not m.alternating or m.present_week_start is null then
    return true;
  end if;
  w := floor((date_trunc('week', d::timestamp)::date - date_trunc('week', m.present_week_start::timestamp)::date) / 7.0);
  return (w % 2) = 0;
end $$;

-- ---------- RLS ----------
alter table public.family enable row level security;
alter table public.members enable row level security;
alter table public.devices enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

-- La table family n'est jamais lue directement (le code reste secret).
create policy "members read" on public.members for select to authenticated using (public.is_member());
create policy "members update self" on public.members for update to authenticated
  using (id = public.current_member_id()) with check (id = public.current_member_id());

create policy "devices read own" on public.devices for select to authenticated using (auth_uid = auth.uid());
create policy "devices delete own" on public.devices for delete to authenticated using (auth_uid = auth.uid());

create policy "tasks read" on public.tasks for select to authenticated using (public.is_member());
create policy "tasks delete by creator" on public.tasks for delete to authenticated
  using (created_by = public.current_member_id());

create policy "assignees read" on public.task_assignees for select to authenticated using (public.is_member());

create policy "subs read own" on public.push_subscriptions for select to authenticated using (auth_uid = auth.uid());
create policy "subs insert own" on public.push_subscriptions for insert to authenticated
  with check (auth_uid = auth.uid() and member_id = public.current_member_id());
create policy "subs delete own" on public.push_subscriptions for delete to authenticated using (auth_uid = auth.uid());

create policy "notifications read own" on public.notifications for select to authenticated
  using (member_id = public.current_member_id());

-- ---------- RPC ----------
-- Rejoindre la famille : code + prénom choisi
create or replace function public.join_family(p_code text, p_member_id uuid)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  if not exists (select 1 from public.family where lower(code) = lower(trim(p_code))) then
    raise exception 'Code famille incorrect';
  end if;
  select * into m from public.members where id = p_member_id;
  if m.id is null then
    raise exception 'Membre inconnu';
  end if;
  insert into public.devices (auth_uid, member_id) values (auth.uid(), p_member_id)
  on conflict (auth_uid) do update set member_id = excluded.member_id;
  return m;
end $$;

-- Quitter (changer de prénom)
create or replace function public.leave_family()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where auth_uid = auth.uid();
  delete from public.devices where auth_uid = auth.uid();
end $$;

-- Créer une tâche (direct ou roulette). Le tirage est fait côté serveur.
create or replace function public.create_task(
  p_title text,
  p_note text,
  p_scheduled_date date,
  p_interval_minutes int,
  p_mode text,
  p_members uuid[],
  p_pick_count int default 1
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  t public.tasks;
  winners uuid[];
  n int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Titre vide'; end if;
  if p_members is null or array_length(p_members, 1) is null then raise exception 'Choisis au moins une personne'; end if;
  n := array_length(p_members, 1);

  if p_mode = 'roulette' then
    if n < 2 then raise exception 'La roulette demande au moins 2 personnes'; end if;
    if p_pick_count < 1 or p_pick_count >= n then raise exception 'Nombre de tirés invalide'; end if;
    select array_agg(x) into winners
      from (select x from unnest(p_members) as x order by random() limit p_pick_count) s;
  else
    winners := p_members;
  end if;

  insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates)
  values (trim(p_title), nullif(trim(coalesce(p_note,'')), ''), me, coalesce(p_scheduled_date, (now() at time zone 'Europe/Paris')::date),
          coalesce(p_interval_minutes, 60), p_mode, case when p_mode = 'roulette' then p_members else '{}' end)
  returning * into t;

  insert into public.task_assignees (task_id, member_id)
  select t.id, w from unnest(winners) as w;

  return t;
end $$;

-- Valider une tâche : seulement une personne qui l'a reçue
create or replace function public.complete_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  t public.tasks;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from public.task_assignees where task_id = p_task_id and member_id = me) then
    raise exception 'Cette tâche ne t''est pas attribuée';
  end if;
  update public.tasks set status = 'done', done_by = me, done_at = now()
  where id = p_task_id and status = 'open' returning * into t;
  if t.id is null then
    select * into t from public.tasks where id = p_task_id;
  end if;
  return t;
end $$;

-- Annuler une validation (erreur de clic) : par celui qui a validé ou le créateur
create or replace function public.reopen_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  t public.tasks;
begin
  update public.tasks set status = 'open', done_by = null, done_at = null
  where id = p_task_id and status = 'done' and (done_by = me or created_by = me)
  returning * into t;
  if t.id is null then raise exception 'Impossible'; end if;
  return t;
end $$;

-- Réglages personnels
create or replace function public.update_my_settings(
  p_name text,
  p_avail_start time,
  p_avail_end time,
  p_alternating boolean,
  p_present_this_week boolean
) returns public.members language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  m public.members;
  monday date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
begin
  if me is null then raise exception 'Non connecté'; end if;
  update public.members set
    name = coalesce(nullif(trim(p_name),''), name),
    avail_start = coalesce(p_avail_start, avail_start),
    avail_end = coalesce(p_avail_end, avail_end),
    alternating = coalesce(p_alternating, alternating),
    present_week_start = case
      when coalesce(p_alternating, alternating) = false then null
      when p_present_this_week is null then present_week_start
      when p_present_this_week then monday
      else monday + 7
    end
  where id = me returning * into m;
  return m;
end $$;

-- Classement
create or replace function public.leaderboard()
returns table (member_id uuid, total bigint, this_month bigint, this_week bigint)
language sql stable security definer set search_path = public as $$
  select m.id,
    count(t.id) filter (where t.status = 'done') as total,
    count(t.id) filter (where t.status = 'done' and t.done_at >= date_trunc('month', now() at time zone 'Europe/Paris')) as this_month,
    count(t.id) filter (where t.status = 'done' and t.done_at >= date_trunc('week', now() at time zone 'Europe/Paris')) as this_week
  from public.members m
  left join public.tasks t on t.done_by = m.id
  where public.is_member()
  group by m.id
$$;

grant execute on function public.join_family(text, uuid) to authenticated;
grant execute on function public.leave_family() to authenticated;
grant execute on function public.create_task(text, text, date, int, text, uuid[], int) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid) to authenticated;
grant execute on function public.update_my_settings(text, time, time, boolean, boolean) to authenticated;
grant execute on function public.leaderboard() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_member() to authenticated;

-- Liste publique des prénoms pour l'écran de connexion (avant d'être membre)
create or replace function public.list_members_public()
returns table (id uuid, name text, role text, color text, sort_order int)
language sql stable security definer set search_path = public as $$
  select id, name, role, color, sort_order from public.members order by sort_order
$$;
grant execute on function public.list_members_public() to anon, authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignees;
alter publication supabase_realtime add table public.members;

-- ---------- Données de départ ----------
-- Le vrai code famille est défini directement dans la base (pas dans le dépôt public)
insert into public.family (id, name, code) values (1, 'Famille', 'A-CHANGER') on conflict (id) do nothing;
insert into public.members (name, role, color, sort_order) values
  ('Flora', 'parent', '#d9486f', 1),
  ('John',  'parent', '#2f6fed', 2),
  ('Matis', 'child',  '#14937a', 3),
  ('Nina',  'child',  '#e08a1e', 4)
on conflict do nothing;
