import { createClient } from '@supabase/supabase-js';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization', 'Content-Type': 'application/json' };

export default async request => {
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'Sesión no válida.' }, { status: 401, headers });
    const { data: profile, error: profileError } = await admin.from('profiles').select('id,company_id,full_name,role,active').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active || !['company_admin', 'super_admin'].includes(profile.role)) return Response.json({ error: 'Esta cuenta no administra una mesa de ayuda.' }, { status: 403, headers });
    const { data: company, error: companyError } = await admin.from('companies').select('*').eq('id', profile.company_id).maybeSingle();
    if (companyError) throw companyError;
    const { data: profiles, error: operatorsError } = await admin.from('profiles').select('id,full_name,role,active').eq('company_id', profile.company_id).eq('role', 'operator').eq('active', true);
    if (operatorsError) throw operatorsError;
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = new Map((authUsers?.users || []).map(item => [item.id, item.email || '']));
    return Response.json({ company, coordinator: { id: profile.id, name: profile.full_name, email: user.email }, operators: (profiles || []).map(item => ({ id: item.id, name: item.full_name, email: emails.get(item.id) || '' })) }, { headers });
  } catch (error) { return Response.json({ error: error.message || 'No se pudo cargar la empresa.' }, { status: 400, headers }); }
};
