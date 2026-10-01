import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export default async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const key = request.headers.get('x-tenant-device-key') || '';
    const { data: device } = await admin.from('tenant_devices').select('company_id,active').eq('key_hash', hash(key)).maybeSingle();
    if (!device?.active) return Response.json({ error: 'Clave de instalación no válida.' }, { status: 403 });
    const body = await request.json();
    const name = String(body.name || '').trim(); const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) return Response.json({ error: 'Nombre, correo y contraseña de al menos 10 caracteres son obligatorios.' }, { status: 400 });
    // El esquema legado de profiles no guarda email: la fuente fiable es Auth.
    const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const authUser = (authUsers?.users || []).find(user => String(user.email || '').toLowerCase() === email);
    const { data: existing, error: existingError } = authUser
      ? await admin.from('profiles').select('id,company_id').eq('id', authUser.id).maybeSingle()
      : { data: null, error: null };
    if (existingError) throw existingError;
    if (existing) {
      if (existing.company_id !== device.company_id) return Response.json({ error: 'Ese correo pertenece a otra empresa.' }, { status: 409 });
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password }); if (error) throw error;
      await admin.from('profiles').update({ full_name: name, active: true, role: 'operator' }).eq('id', existing.id);
      return Response.json({ id: existing.id, updated: true });
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (createError) throw createError;
    const { error: profileError } = await admin.from('profiles').insert({ id: created.user.id, company_id: device.company_id, full_name: name, role: 'operator', active: true });
    if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError; }
    return Response.json({ id: created.user.id, created: true }, { status: 201 });
  } catch (error) { return Response.json({ error: error.message || 'No se pudo crear el operador.' }, { status: 400 }); }
};
