-- Ejecutar UNA VEZ en Supabase para migrar el modelo anterior.
-- Sustituye agentes/consultores por el único rol operativo: operator.
drop policy if exists "company admin manages agents" on public.profiles;
drop policy if exists "company admin updates agents" on public.profiles;
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role='operator' where role in ('agent','consultant');
alter table public.profiles add constraint profiles_role_check check(role in ('super_admin','company_admin','operator'));
create policy "company admin manages operators" on public.profiles for insert with check (company_id=public.my_company_id() and role='operator' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='company_admin' and p.active));
create policy "company admin updates operators" on public.profiles for update using(company_id=public.my_company_id() and role='operator' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='company_admin' and p.active)) with check(company_id=public.my_company_id() and role='operator');
