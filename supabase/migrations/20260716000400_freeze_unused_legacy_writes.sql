begin;

revoke insert, update, delete on public.favorites from authenticated;
revoke insert, update, delete on public.entity_state from authenticated;
revoke insert, update, delete on public.annotations from authenticated;

commit;
