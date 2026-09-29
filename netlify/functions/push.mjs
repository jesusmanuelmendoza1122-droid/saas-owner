import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function messaging() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(raw)) });
  return getMessaging();
}

export async function notifyOperator(admin, operatorId, ticket) {
  const client = messaging();
  if (!client || !operatorId) return { skipped: true };
  const { data: device } = await admin.from('operator_push_tokens').select('token').eq('operator_id', operatorId).maybeSingle();
  if (!device?.token) return { skipped: true };
  try {
    await client.send({
      token: device.token,
      notification: { title: 'Nueva tarea asignada', body: ticket.subject || 'Tienes una nueva solicitud.' },
      data: { ticketId: String(ticket.id), type: 'new_task' },
      android: { priority: 'high', notification: { channelId: 'operator_tasks', sound: 'default' } }
    });
    return { sent: true };
  } catch (error) {
    if (/registration-token-not-registered|invalid-registration-token/i.test(error.code || '')) await admin.from('operator_push_tokens').delete().eq('operator_id', operatorId);
    throw error;
  }
}
