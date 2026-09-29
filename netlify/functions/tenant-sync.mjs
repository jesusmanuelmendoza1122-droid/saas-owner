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
      const { data: existing } = await admin.from('cloud_tickets').select('status,assigned_operator_id').eq('device_id', device.id).eq('source_ticket_id', sourceTicketId).maybeSingle();
      const localStatus = ticket.status || 'abierto';
      const preserveOperatorState = existing && operatorStates.has(existing.status) && existing.status !== localStatus && !ticket.confirmation_response;
      const status = preserveOperatorState ? existing.status : localStatus;
      const location = `Oficina: ${ticket.office || 'Sin especificar'} · Piso: ${ticket.floor || 'Sin especificar'} · Tiempo estimado: ${ticket.estimated_minutes || 60} min`;
      const description = `${ticket.description || 'Sin descripción.'}\n\n${location}`;
      const { error } = await admin.from('cloud_tickets').upsert({ company_id: device.company_id, device_id: device.id, source_ticket_id: sourceTicketId, assigned_operator_id: ticket.assigned_to || null, subject: ticket.subject || '', description, category: ticket.category_name || '', priority: ticket.priority || 'media', status, updated_at: new Date().toISOString() }, { onConflict: 'device_id,source_ticket_id' });
      if (error) throw error;
      if ((!existing || existing.assigned_operator_id !== ticket.assigned_to) && ticket.assigned_to) notifyOperator(admin, ticket.assigned_to, ticket).catch(error => console.error('Push:', error.message));
      if (status !== localStatus) updates.push({ sourceTicketId, status });
    }
    return Response.json({ ok: true, synced: tickets.length, updates });
  } catch (error) { return Response.json({ error: error.message || 'Error' }, { status: 400 }); }
};
