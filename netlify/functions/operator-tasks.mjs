import { createClient } from '@supabase/supabase-js';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
export default async request => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    const { data: profile } = user ? await admin.from('profiles').select('id,role,active,company_id').eq('id', user.id).maybeSingle() : { data: null };
    if (!profile?.active || profile.role !== 'operator') return Response.json({ error: 'Solo los operadores activos pueden acceder.' }, { status: 403, headers });
    if (request.method === 'GET') {
      const { data, error } = await admin.from('cloud_tickets').select('*').eq('company_id', profile.company_id).eq('assigned_operator_id', profile.id).neq('status', 'cerrado').order('updated_at', { ascending: false });
      if (error) throw error;
      return Response.json(data, { headers });
    }
    if (request.method === 'PATCH') {
      const body = await request.json();
      // La APK nunca cierra definitivamente: solicita confirmación humana.
      const status = body.status === 'cerrado' || body.status === 'resuelto' ? 'pendiente_confirmacion' : body.status;
      if (!['abierto', 'en_progreso', 'pendiente_confirmacion'].includes(status)) return Response.json({ error: 'Estado inválido.' }, { status: 400, headers });
      const { error } = await admin.from('cloud_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', body.id).eq('assigned_operator_id', profile.id);
      if (error) throw error;
      return Response.json({ ok: true, status }, { headers });
    }
    return Response.json({ error: 'Método no permitido.' }, { status: 405, headers });
  } catch (error) { return Response.json({ error: error.message || 'Error' }, { status: 400, headers }); }
};
