-- Échanges de tâches entre membres
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  from_member uuid not null references public.members(id) on delete cascade,
  to_member uuid not null references public.members(id) on delete cascade,
  requested uuid[] not null,          -- tâches de to_member que from_member veut prendre
  offered uuid[] not null default '{}', -- tâches de from_member données en échange
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  notified_at timestamptz,
  result_notified_at timestamptz,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_member <> to_member),
  check (cardinality(requested) >= 1)
);
alter table public.trades enable row level security;
create policy "trades read" on public.trades for select to authenticated using (public.is_member());

create or replace function public.propose_trade(p_to uuid, p_requested uuid[], p_offered uuid[], p_message text)
returns public.trades language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  tr public.trades;
  n int;
begin
  if me is null then raise exception 'Pas membre'; end if;
  if p_to = me then raise exception 'Tu ne peux pas échanger avec toi-même'; end if;
  if p_requested is null or cardinality(p_requested) = 0 then raise exception 'Choisis au moins une tâche à prendre'; end if;
  select count(*) into n from public.task_assignees a join public.tasks t on t.id = a.task_id
    where a.task_id = any(p_requested) and a.member_id = p_to and t.status = 'open';
  if n <> cardinality(p_requested) then raise exception 'Une des tâches demandées n''est plus disponible'; end if;
  select count(*) into n from public.task_assignees a join public.tasks t on t.id = a.task_id
    where a.task_id = any(coalesce(p_offered, '{}')) and a.member_id = me and t.status = 'open';
  if n <> cardinality(coalesce(p_offered, '{}')) then raise exception 'Une des tâches proposées n''est plus à toi'; end if;
  if exists (select 1 from public.trades where status = 'pending' and from_member = me and to_member = p_to) then
    raise exception 'Tu as déjà une proposition en attente avec cette personne';
  end if;
  insert into public.trades (from_member, to_member, requested, offered, message)
  values (me, p_to, p_requested, coalesce(p_offered, '{}'), nullif(trim(p_message), ''))
  returning * into tr;
  return tr;
end $$;

-- Transfère une tâche de p_from vers p_to (ignore si la tâche n'est plus ouverte / plus à p_from)
create or replace function public.transfer_task(p_task uuid, p_from uuid, p_to uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.task_assignees a join public.tasks t on t.id = a.task_id
                 where a.task_id = p_task and a.member_id = p_from and t.status = 'open') then
    return false;
  end if;
  if exists (select 1 from public.task_assignees where task_id = p_task and member_id = p_to) then
    delete from public.task_assignees where task_id = p_task and member_id = p_from;
  else
    update public.task_assignees set member_id = p_to, last_notified_at = null, notify_count = 0
      where task_id = p_task and member_id = p_from;
  end if;
  return true;
end $$;

create or replace function public.respond_trade(p_trade uuid, p_accept boolean)
returns public.trades language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  tr public.trades;
  tid uuid;
  moved int := 0;
begin
  select * into tr from public.trades where id = p_trade for update;
  if tr.id is null then raise exception 'Échange introuvable'; end if;
  if tr.to_member <> me then raise exception 'Cet échange ne t''est pas destiné'; end if;
  if tr.status <> 'pending' then raise exception 'Cet échange est déjà traité'; end if;
  if p_accept then
    foreach tid in array tr.requested loop
      if public.transfer_task(tid, tr.to_member, tr.from_member) then moved := moved + 1; end if;
    end loop;
    if moved = 0 then
      update public.trades set status = 'cancelled', responded_at = now() where id = p_trade returning * into tr;
      raise exception 'Ces tâches ne sont plus disponibles, l''échange est annulé';
    end if;
    foreach tid in array tr.offered loop
      perform public.transfer_task(tid, tr.from_member, tr.to_member);
    end loop;
    update public.trades set status = 'accepted', responded_at = now() where id = p_trade returning * into tr;
  else
    update public.trades set status = 'declined', responded_at = now() where id = p_trade returning * into tr;
  end if;
  return tr;
end $$;

create or replace function public.cancel_trade(p_trade uuid)
returns public.trades language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  tr public.trades;
begin
  update public.trades set status = 'cancelled', responded_at = now()
    where id = p_trade and from_member = me and status = 'pending' returning * into tr;
  if tr.id is null then raise exception 'Impossible d''annuler cet échange'; end if;
  return tr;
end $$;

revoke all on function public.transfer_task(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.propose_trade(uuid, uuid[], uuid[], text) to authenticated;
grant execute on function public.respond_trade(uuid, boolean) to authenticated;
grant execute on function public.cancel_trade(uuid) to authenticated;
alter publication supabase_realtime add table public.trades;
