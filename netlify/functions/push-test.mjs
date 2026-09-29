import { createClient } from '@supabase/supabase-js';
import { notifyOperator } from './push.mjs';

export default async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    const { data: profile } = user ? await admin.from('profiles').select('id,role,active').eq('id', user.id).maybeSingle() : { data: null };
    if (!profile?.active || profile.role !== 'operator') return Response.json({ error: 'Solo operadores activos.' }, { status: 403 });
    const result = await notifyOperator(admin, profile.id, { id: 'test', subject: 'Notificaciones activadas' });
    if (result.skipped) return Response.json({ error: 'El dispositivo todavía no registró su token push.' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error.message || 'No se pudo enviar prueba.' }, { status: 400 }); }
};
