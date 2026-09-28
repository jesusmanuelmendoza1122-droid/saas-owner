create extension if not exists pgcrypto;

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(), name text not null,
  contact_name text, contact_email text, plan text not null default 'basico',
  status text not null default 'activa' check(status in ('activa','suspendida','vencida')),
  user_limit integer not null default 3 check(user_limit > 0),
  license_key text unique not null default upper(encode(gen_random_bytes(12),'hex')),
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text not null, role text not null check(role in ('super_admin','company_admin','operator')),
  active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.super_admins where user_id=auth.uid()) $$;
create or replace function public.my_company_id() returns uuid language sql stable security definer set search_path=public as $$ select company_id from public.profiles where id=auth.uid() $$;
create policy "owner manages companies" on public.companies for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "company reads itself" on public.companies for select using (id=public.my_company_id());
create policy "owner manages profiles" on public.profiles for all using (public.is_super_admin()) with check(public.is_super_admin());
create policy "company reads users" on public.profiles for select using(company_id=public.my_company_id());
create policy "company admin manages operators" on public.profiles for insert with check (company_id=public.my_company_id() and role='operator' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='company_admin' and p.active));
create policy "company admin updates operators" on public.profiles for update using(company_id=public.my_company_id() and role='operator' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='company_admin' and p.active)) with check (company_id=public.my_company_id() and role='operator');
