import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const reply = (data, status = 200) => Response.json(data, { status });

export default async request => {
  if (request.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let company = null;
  let coordinatorId = null;
  let createdAuthUser = false;
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return reply({ error: 'No autorizado.' }, 401);
    const { data: owner } = await admin.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!owner) return reply({ error: 'Solo el Super Admin puede crear empresas.' }, 403);

    const body = await request.json();
    const email = String(body.adminEmail || '').trim().toLowerCase();
    const password = String(body.adminPassword || '');
    if (!String(body.companyName || '').trim() || !email || password.length < 10) {
      return reply({ error: 'Empresa, correo y contraseña de coordinador son obligatorios.' }, 400);
    }

    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = (listed?.users || []).find(item => (item.email || '').toLowerCase() === email);
    if (existingUser) {
      const { data: existingProfile, error: profileLookupError } = await admin.from('profiles').select('company_id').eq('id', existingUser.id).maybeSingle();
      if (profileLookupError) throw profileLookupError;
      if (existingProfile) return reply({ error: 'Ese correo ya está asignado a otra empresa. Usa otro correo o administra la empresa existente.' }, 409);
      coordinatorId = existingUser.id;
    }

    const { data: createdCompany, error: companyError } = await admin
      .from('companies')
      .insert({ name: String(body.companyName).trim(), contact_name: String(body.contactName || '').trim(), contact_email: email, plan: body.plan || 'basico', user_limit: Number(body.userLimit) || 3 })
      .select()
      .single();
    if (companyError) throw companyError;
    company = createdCompany;

    if (!coordinatorId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createError) throw createError;
      coordinatorId = created.user.id;
      createdAuthUser = true;
    }
    const { error: profileError } = await admin.from('profiles').insert({
      id: coordinatorId,
      company_id: company.id,
      full_name: String(body.adminName || body.contactName || 'Coordinador').trim(),
      role: 'company_admin',
      active: true,
    });
    if (profileError) throw profileError;

    const activationKey = randomBytes(32).toString('base64url');
    const key_hash = createHash('sha256').update(activationKey).digest('hex');
    const { error: deviceError } = await admin.from('tenant_devices').insert({ company_id: company.id, key_hash });
    if (deviceError) throw deviceError;
    return reply({ company, adminEmail: email, activationKey }, 201);
  } catch (error) {
    if (company) {
      if (coordinatorId) await admin.from('profiles').delete().eq('id', coordinatorId).eq('company_id', company.id);
      await admin.from('tenant_devices').delete().eq('company_id', company.id);
      await admin.from('companies').delete().eq('id', company.id);
    }
    if (createdAuthUser && coordinatorId) await admin.auth.admin.deleteUser(coordinatorId);
    return reply({ error: error.message || 'No se pudo crear empresa y coordinador.' }, 400);
  }
};
