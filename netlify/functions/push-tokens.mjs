import { createClient } from '@supabase/supabase-js';

export default async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    const { data: profile } = user ? await admin.from('profiles').select('id,role,active').eq('id', user.id).maybeSingle() : { data: null };
    const body = await request.json();
    if (!profile?.active || profile.role !== 'operator' || !body.token) return Response.json({ error: 'Registro no autorizado.' }, { status: 403 });
    const { error } = await admin.from('operator_push_tokens').upsert({ operator_id: profile.id, token: body.token, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error.message || 'Error' }, { status: 400 }); }
};
