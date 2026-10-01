import { createClient } from '@supabase/supabase-js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization',
  'Content-Type': 'application/json',
};

export default async request => {
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    const { data: owner } = user
      ? await admin.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!owner) return Response.json({ error: 'Solo Super Admin.' }, { status: 403, headers });

    const { data: companies, error } = await admin.from('companies').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ companies: companies || [] }, { headers });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al cargar empresas.' }, { status: 400, headers });
  }
};
