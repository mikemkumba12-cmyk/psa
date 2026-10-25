import { many, one, pool, type Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';
import { sendEmail, sendSms } from './channels';

export interface NotificationInput {
  type: 'info' | 'success' | 'warning' | 'action';
  title: string;
  body: string;
  actionRoute?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Stores an in-app notification and, if the user opted in and a provider is
 * configured, sends it by email/SMS. External delivery failures never block
 * the business action that triggered the notification.
 */
export async function notifyUser(userId: string, input: NotificationInput, client: Queryable = pool): Promise<void> {
  await client.query(
    `INSERT INTO notifications (id, user_id, type, title, body, action_route, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId('ntf'), userId, input.type, input.title, input.body, input.actionRoute ?? null, input.entityType ?? null, input.entityId ?? null],
  );

  const user = await one<{ email: string; phone: string | null; notification_prefs: { email?: boolean; sms?: boolean } }>(
    'SELECT email, phone, notification_prefs FROM users WHERE id = $1 AND is_active',
    [userId],
    client,
  );
  if (!user) return;
  const prefs = user.notification_prefs || {};
  const text = `${input.title}. ${input.body}`;
  void Promise.allSettled([
    prefs.email ? sendEmail(user.email, input.title, `<p>${escapeHtml(input.body)}</p>`) : Promise.resolve(false),
    prefs.sms && user.phone ? sendSms(user.phone, text.slice(0, 300)) : Promise.resolve(false),
  ]);
}

/** Notifies every active staff member who holds a permission (e.g. new applications for assigners). */
export async function notifyStaffWithPermission(permission: string, input: NotificationInput, client: Queryable = pool): Promise<void> {
  const recipients = await many<{ id: string }>(
    `SELECT u.id FROM users u
      WHERE u.is_active AND u.role <> 'customer' AND (
        u.role = 'admin'
        OR (EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = u.role AND rp.permission_id = $1)
            AND NOT EXISTS (SELECT 1 FROM user_permissions d WHERE d.user_id = u.id AND d.permission_id = $1 AND d.effect = 'deny'))
        OR EXISTS (SELECT 1 FROM user_permissions g WHERE g.user_id = u.id AND g.permission_id = $1 AND g.effect = 'grant')
      )`,
    [permission],
    client,
  );
  for (const recipient of recipients) await notifyUser(recipient.id, input, client);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
