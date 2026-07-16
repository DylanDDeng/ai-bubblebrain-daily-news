begin;

revoke update on public.profiles from authenticated;

create or replace function public.admin_moderate_comment(
  p_comment_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('visible', 'hidden') then
    raise exception 'Invalid moderation status';
  end if;
  update public.comments
  set
    moderation_status = p_status,
    moderated_at = now(),
    moderation_reason = case
      when p_status = 'hidden' then nullif(left(btrim(p_reason), 500), '')
      else null
    end
  where id = p_comment_id
    and thread_id like 'page:/%';
  if not found then
    raise exception 'Page comment was not found';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_moderate_comment(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_moderate_comment(uuid, text, text)
  to service_role;

commit;
