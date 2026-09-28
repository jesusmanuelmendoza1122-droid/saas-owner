-- Plano cloud mínimo para la APK. Los datos de WhatsApp siguen en el tenant;
-- solo se replica lo necesario para que el operador vea sus tareas.
create table if not exists public.tenant_devices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  label text not null default 'Instalación principal', key_hash text not null unique, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.cloud_tickets (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  device_id uuid not null references public.tenant_devices(id) on delete cascade, source_ticket_id text not null,
  assigned_operator_id uuid references public.profiles(id), subject text, description text, category text,
  priority text not null default 'media', status text not null default 'abierto', updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(device_id,source_ticket_id)
);
alter table public.tenant_devices enable row level security;
alter table public.cloud_tickets enable row level security;
create policy "operator reads own cloud tasks" on public.cloud_tickets for select using(assigned_operator_id=auth.uid());
create policy "operator updates own cloud tasks" on public.cloud_tickets for update using(assigned_operator_id=auth.uid()) with check(assigned_operator_id=auth.uid());
