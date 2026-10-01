import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization', 'Content-Type': 'application/json' };

export default async request => {
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const deviceKey = request.headers.get('x-tenant-device-key') || '';
    const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    let profile = null;
    let companyId = null;
    let coordinatorEmail = '';
    if (!user && deviceKey) {
      const keyHash = createHash('sha256').update(deviceKey).digest('hex');
      const { data: device, error: deviceError } = await admin.from('tenant_devices').select('company_id').eq('key_hash', keyHash).maybeSingle();
      if (deviceError) throw deviceError;
      if (!device) return Response.json({ error: 'Clave de instalación no válida.' }, { status: 401, headers });
      companyId = device.company_id;
    }
    if (!user && !companyId) return Response.json({ error: 'Sesión no válida.' }, { status: 401, headers });
    let profileError = null;
    if (user) {
      const profileResult = await admin.from('profiles').select('id,company_id,full_name,role,active').eq('id', user.id).maybeSingle();
      profile = profileResult.data;
      profileError = profileResult.error;
    }
    if (profileError) throw profileError;
    // Recuperación controlada de instalaciones antiguas: antes de existir el
    // perfil central, algunas empresas ya tenían su coordinador guardado como
    // correo de contacto. Solo el usuario que inició sesión con ese mismo
    // correo puede convertir esa relación en un perfil de company_admin.
    if (user && (!profile?.active || !['company_admin', 'super_admin'].includes(profile.role))) {
      if (!user) return Response.json({ error: 'La instalación no tiene permiso de administración.' }, { status: 403, headers });
      const { data: legacyCompany, error: legacyCompanyError } = await admin
        .from('companies')
        .select('*')
        .eq('contact_email', user.email || '')
        .maybeSingle();
      if (legacyCompanyError) throw legacyCompanyError;
      if (!legacyCompany) return Response.json({ error: 'Esta cuenta no administra una mesa de ayuda.' }, { status: 403, headers });
      const recovered = {
        id: user.id,
        company_id: legacyCompany.id,
        full_name: user.user_metadata?.full_name || legacyCompany.contact_name || 'Coordinador',
        role: 'company_admin',
        active: true,
      };
      const { error: recoverError } = await admin.from('profiles').upsert(recovered, { onConflict: 'id' });
      if (recoverError) throw recoverError;
      profile = recovered;
    }
    companyId = companyId || profile.company_id;
    const { data: company, error: companyError } = await admin.from('companies').select('*').eq('id', companyId).maybeSingle();
    if (companyError) throw companyError;
    const { data: profiles, error: operatorsError } = await admin.from('profiles').select('id,full_name,role,active').eq('company_id', companyId).eq('role', 'operator').eq('active', true);
    if (operatorsError) throw operatorsError;
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = new Map((authUsers?.users || []).map(item => [item.id, item.email || '']));
    const { data: coordinator } = profile ? { data: profile } : await admin.from('profiles').select('id,full_name').eq('company_id', companyId).eq('role', 'company_admin').maybeSingle();
    coordinatorEmail = user?.email || emails.get(coordinator?.id) || '';
    return Response.json({ company, coordinator: { id: coordinator?.id || profile?.id || '', name: coordinator?.full_name || profile?.full_name || '', email: coordinatorEmail }, operators: (profiles || []).map(item => ({ id: item.id, name: item.full_name, email: emails.get(item.id) || '' })) }, { headers });
  } catch (error) { return Response.json({ error: error.message || 'No se pudo cargar la empresa.' }, { status: 400, headers }); }
};
