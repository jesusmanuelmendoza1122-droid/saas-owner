create table if not exists public.portal_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 public_code text unique not null default ('SOL-' || to_char(now(),'YYYY') || '-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8))),
 requester_name text not null, requester_email text not null, requester_whatsapp text not null,
 request_type text not null, location text default '', subject text not null, description text not null,
 status text not null default 'recibida' check(status in ('recibida','clasificada','asignada','en_progreso','resuelta','cerrada')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.portal_requests enable row level security;
create index if not exists portal_requests_company_created on public.portal_requests(company_id,created_at desc);