-- Date limite : une tâche non faite à l'heure passe en « ratée » (tableau de la honte)

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('open','done','expired'));
alter table public.tasks
  add column if not exists deadline timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists expired_notified_at timestamptz;
alter table public.recurrences add column if not exists deadline_time time;

drop function if exists public.create_task(text, text, date, int, text, uuid[], int);
create or replace function public.create_task(
  p_title text, p_note text, p_scheduled_date date, p_interval_minutes int, p_mode text, p_members uuid[],
  p_pick_count int default 1, p_deadline timestamptz default null
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
  if p_deadline is not null and p_deadline <= now() then raise exception 'La date limite est déjà passée'; end if;
  n := array_length(p_members, 1);
  if p_mode = 'roulette' then
    if n < 2 then raise exception 'La roulette demande au moins 2 personnes'; end if;
    if p_pick_count < 1 or p_pick_count >= n then raise exception 'Nombre de tirés invalide'; end if;
    select array_agg(x) into winners from (select x from unnest(p_members) as x order by random() limit p_pick_count) s;
  else
    winners := p_members;
  end if;
  insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates, deadline)
  values (trim(p_title), nullif(trim(coalesce(p_note,'')), ''), me, coalesce(p_scheduled_date, (now() at time zone 'Europe/Paris')::date),
          coalesce(p_interval_minutes, 60), p_mode, case when p_mode = 'roulette' then p_members else '{}' end, p_deadline)
  returning * into t;
  insert into public.task_assignees (task_id, member_id) select t.id, w from unnest(winners) as w;
  return t;
end $$;
grant execute on function public.create_task(text, text, date, int, text, uuid[], int, timestamptz) to authenticated;

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
  if exists (select 1 from public.tasks where id = p_task_id and status = 'expired') then
    raise exception 'Trop tard : la date limite est passée';
  end if;
  update public.tasks set status = 'done', done_by = me, done_at = now()
  where id = p_task_id and status = 'open' returning * into t;
  if t.id is null then select * into t from public.tasks where id = p_task_id; end if;
  return t;
end $$;

drop function if exists public.create_recurrence(text, text, text, uuid[], int, int, int[], time);
create or replace function public.create_recurrence(
  p_title text, p_note text, p_mode text, p_members uuid[], p_pick_count int,
  p_interval_minutes int, p_days int[], p_at_time time, p_deadline_time time default null
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
  if p_deadline_time is not null and p_deadline_time <= p_at_time then raise exception 'La limite doit être après l''heure de création'; end if;
  n := cardinality(p_members);
  if p_mode = 'roulette' then
    if n < 2 then raise exception 'La roulette demande au moins 2 personnes'; end if;
    if p_pick_count < 1 or p_pick_count >= n then raise exception 'Nombre de tirés invalide'; end if;
  end if;
  insert into public.recurrences (title, note, created_by, mode, members, pick_count, interval_minutes, days, at_time, deadline_time, last_spawned_date)
  values (trim(p_title), nullif(trim(coalesce(p_note, '')), ''), me, p_mode, p_members,
          case when p_mode = 'roulette' then p_pick_count else 1 end,
          coalesce(p_interval_minutes, 60), p_days, p_at_time, p_deadline_time,
          case when nowt >= p_at_time then today else null end)
  returning * into r;
  return r;
end $$;
grant execute on function public.create_recurrence(text, text, text, uuid[], int, int, int[], time, time) to authenticated;

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
  dl timestamptz;
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
    dl := case when r.deadline_time is not null then (today::timestamp + r.deadline_time) at time zone 'Europe/Paris' end;

    if r.mode = 'roulette' and cardinality(present) >= 2 then
      pick := least(r.pick_count, cardinality(present) - 1);
      select array_agg(x) into winners from (select x from unnest(present) as x order by random() limit pick) s;
      insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates, recurrence_id, deadline)
      values (r.title, r.note, r.created_by, today, r.interval_minutes, 'roulette', present, r.id, dl) returning id into tid;
    else
      winners := present;
      insert into public.tasks (title, note, created_by, scheduled_date, interval_minutes, mode, candidates, recurrence_id, deadline)
      values (r.title, r.note, r.created_by, today, r.interval_minutes, 'direct', '{}', r.id, dl) returning id into tid;
    end if;
    insert into public.task_assignees (task_id, member_id) select tid, w from unnest(winners) as w;
    return next tid;
  end loop;
end $$;

-- Appelée par le serveur : passe en « ratée » les tâches dont la limite est dépassée
create or replace function public.expire_due_tasks()
returns setof uuid language sql security definer set search_path = public as $$
  update public.tasks set status = 'expired', expired_at = now()
  where status = 'open' and deadline is not null and deadline <= now()
  returning id
$$;
revoke all on function public.expire_due_tasks() from public, anon, authenticated;
grant execute on function public.expire_due_tasks() to service_role;

-- Tableau de la honte : tâches ratées par personne
create or replace function public.shame_board()
returns table (member_id uuid, total bigint, this_month bigint, this_week bigint)
language sql stable security definer set search_path = public as $$
  select m.id,
    count(t.id) filter (where t.status = 'expired') as total,
    count(t.id) filter (where t.status = 'expired' and t.expired_at >= date_trunc('month', now() at time zone 'Europe/Paris')) as this_month,
    count(t.id) filter (where t.status = 'expired' and t.expired_at >= date_trunc('week', now() at time zone 'Europe/Paris')) as this_week
  from public.members m
  left join public.task_assignees a on a.member_id = m.id
  left join public.tasks t on t.id = a.task_id
  where public.is_member()
  group by m.id
$$;
grant execute on function public.shame_board() to authenticated;
