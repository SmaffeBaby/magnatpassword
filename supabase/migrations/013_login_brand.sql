begin;
-- Only the application server can resolve the presentation brand of an account.
create or replace function public.login_brand(p_email text)
returns text language sql stable security definer set search_path='' as $$
 select case when raw_user_meta_data->>'account_brand'='light' then 'light' else 'magnat' end
 from auth.users where lower(email)=lower(btrim(p_email)) and deleted_at is null limit 1;
$$;
revoke all on function public.login_brand(text) from public,anon,authenticated;
grant execute on function public.login_brand(text) to service_role;
notify pgrst,'reload schema';
commit;
