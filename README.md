# Mesa de Ayuda — Panel Super Admin

Este sitio se publica en Netlify y usa Supabase como fuente central de verdad.

## Puesta en marcha

1. En Supabase, ejecuta `supabase/schema.sql` en SQL Editor.
2. Crea tu usuario de dueño en **Authentication > Users**.
3. Copia el UUID de ese usuario y ejecuta:
   `insert into public.super_admins (user_id) values ('UUID_DEL_DUENO');`
4. En Netlify configura `SUPABASE_URL` y `SUPABASE_ANON_KEY` (la clave pública).
5. Publica esta carpeta como sitio estático. La función Netlify usa además
   `SUPABASE_SERVICE_ROLE_KEY`, que nunca se expone al navegador.

La función `netlify/functions/provision-company.mjs` crea empresas y sus
administradores desde tu panel. Las empresas solo pueden crear agentes y
consultores mediante las políticas de Supabase.
