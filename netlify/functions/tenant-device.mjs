import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');

export default async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
    const { data: owner } = await admin.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!owner) return Response.json({ error: 'Solo el Super Admin puede generar claves de instalación.' }, { status: 403 });
    const { companyId } = await request.json();
    if (!companyId) return Response.json({ error: 'Empresa requerida.' }, { status: 400 });
    const activationKey = randomBytes(32).toString('base64url');
    const { error } = await admin.from('tenant_devices').insert({ company_id: companyId, key_hash: hash(activationKey), label: 'Instalación principal' });
    if (error) throw error;
    return Response.json({ activationKey });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo crear la clave.' }, { status: 400 });
  }
};
