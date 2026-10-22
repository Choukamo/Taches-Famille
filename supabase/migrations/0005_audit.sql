-- Audit 2026-10 : (1) un échange accepté dont les tâches ont disparu ne doit pas rester bloqué
-- "en attente" ; (2) limiter les essais de code famille (force brute).

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
      -- Les tâches demandées ont été faites ou supprimées entre temps : on annule (sans erreur,
      -- sinon l'annulation serait perdue et l'échange resterait en attente pour toujours).
      update public.trades set status = 'cancelled', responded_at = now() where id = p_trade returning * into tr;
      return tr;
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

create table if not exists public.join_attempts (
  id bigserial primary key,
  at timestamptz not null default now()
);
alter table public.join_attempts enable row level security;

-- Retourne NULL si le code est faux (au lieu d'une erreur) : une erreur annulerait aussi
-- l'enregistrement de l'essai raté, et le compteur ne monterait jamais.
create or replace function public.join_family(p_code text, p_member_id uuid)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  recent int;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  delete from public.join_attempts where at < now() - interval '1 day';
  select count(*) into recent from public.join_attempts where at > now() - interval '15 minutes';
  if recent >= 10 then
    raise exception 'Trop d''essais de code. Réessaie dans 15 minutes.';
  end if;
  if not exists (select 1 from public.family where lower(code) = lower(trim(p_code))) then
    insert into public.join_attempts default values;
    return null;
  end if;
  select * into m from public.members where id = p_member_id;
  if m.id is null then
    raise exception 'Membre inconnu';
  end if;
  insert into public.devices (auth_uid, member_id) values (auth.uid(), p_member_id)
  on conflict (auth_uid) do update set member_id = excluded.member_id;
  return m;
end $$;
