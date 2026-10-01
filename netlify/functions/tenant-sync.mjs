import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { notifyOperator } from './push.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const operatorStates = new Set(['en_progreso', 'pendiente_confirmacion']);
export default async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const key = request.headers.get('x-tenant-device-key') || '';
    const { data: device } = await admin.from('tenant_devices').select('id,company_id,active').eq('key_hash', hash(key)).maybeSingle();
    if (!device?.active) return Response.json({ error: 'Dispositivo no activado.' }, { status: 403 });
    const body = await request.json(); const tickets = Array.isArray(body.tickets) ? body.tickets : []; const updates = [];
    for (const ticket of tickets) {
      const sourceTicketId = String(ticket.id);
      const { data: existing } = await admin.from('cloud_tickets').select('status,assigned_operator_id,updated_at').eq('device_id', device.id).eq('source_ticket_id', sourceTicketId).maybeSingle();
      // La aplicación de escritorio conserva un ID local; para móvil se traduce
      // por correo al UUID del operador dentro de la misma empresa.
      // El cliente solo transmite un correo. Supabase resuelve su UUID de
      // manera interna; jamás se usa el correo como assigned_operator_id.
      let assignedOperatorId = null;
      const operatorEmail = String(ticket.assigned_operator_email || ticket.assigned_to || '').trim().toLowerCase();
      if (operatorEmail) {
        const { data: authUsers, error: authUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (authUsersError) throw authUsersError;
        const authUser = (authUsers?.users || []).find(user => String(user.email || '').toLowerCase() === operatorEmail);
        if (authUser) {
          const { data: profile, error: profileError } = await admin.from('profiles').select('id,company_id,role,active').eq('id', authUser.id).maybeSingle();
          if (profileError) throw profileError;
          if (profile?.company_id === device.company_id && profile.role === 'operator' && profile.active) assignedOperatorId = profile.id;
        }
      }
      const localStatus = ticket.status || 'abierto';
      const cloudIsNewer = existing && new Date(existing.updated_at).getTime() > new Date(ticket.updated_at).getTime();
      // La confirmación humana es definitiva: jamás se reemplaza por un estado pendiente almacenado en nube.
      const customerAnswered = ['confirmado', 'rechazado'].includes(ticket.confirmation_response);
      // Tras un NO, un operador puede solicitar una nueva confirmación. Solo se acepta si esa acción en nube es posterior a la respuesta del cliente.
      const reRequestAfterRejection = existing?.status === 'pendiente_confirmacion' && ticket.confirmation_response === 'rechazado' && cloudIsNewer;
      const preserveOperatorState = existing && operatorStates.has(existing.status) && existing.status !== localStatus && (!customerAnswered || reRequestAfterRejection) && cloudIsNewer;
      const status = preserveOperatorState ? existing.status : localStatus;
      const location = `Oficina: ${ticket.office || 'Sin especificar'} · Piso: ${ticket.floor || 'Sin especificar'} · Tiempo estimado: ${ticket.estimated_minutes || 60} min`;
      const description = `${ticket.description || 'Sin descripción.'}\n\n${location}`;
      const { error } = await admin.from('cloud_tickets').upsert({ company_id: device.company_id, device_id: device.id, source_ticket_id: sourceTicketId, assigned_operator_id: assignedOperatorId, subject: ticket.subject || '', description, category: ticket.category_name || '', priority: ticket.priority || 'media', status, updated_at: new Date().toISOString() }, { onConflict: 'device_id,source_ticket_id' });
      if (error) throw error;
      if ((!existing || existing.assigned_operator_id !== assignedOperatorId) && assignedOperatorId) notifyOperator(admin, assignedOperatorId, ticket).catch(error => console.error('Push:', error.message));
      if (status !== localStatus) updates.push({ sourceTicketId, status });
    }
    return Response.json({ ok: true, synced: tickets.length, updates });
  } catch (error) { return Response.json({ error: error.message || 'Error' }, { status: 400 }); }
};
