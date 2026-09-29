-- Un token por operador y dispositivo. Solo las funciones Netlify con
-- service role lo leen o escriben; la APK nunca consulta tokens de terceros.
create table if not exists public.operator_push_tokens (
  operator_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);
alter table public.operator_push_tokens enable row level security;
