/**
 * Outbound SMS and email channels.
 *
 *  - SMS: Africa's Talking (AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY)
 *  - Email: SendGrid v3 (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)
 *
 * When a provider is not configured the message is skipped and the function
 * returns false; nothing pretends to have been delivered. Logs never include
 * message bodies or full recipient details.
 */

function maskRecipient(value: string): string {
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function smsConfigured(): boolean {
  return Boolean(process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY);
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

interface SendGridRecipient {
  email: string;
  name?: string;
}

/**
 * Send SMS via Africa's Talking REST API
 */
export async function sendSms(to: string, message: string): Promise<boolean> {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const senderId = process.env.AFRICASTALKING_SENDER_ID;

  if (!username || !apiKey) {
    return false;
  }

  try {
    const isSandbox = username.toLowerCase() === 'sandbox';
    const endpoint = isSandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('to', to);
    params.append('message', message);
    if (senderId && !isSandbox) {
      params.append('from', senderId);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey: apiKey,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sms] provider returned HTTP ${response.status}:`, errorText.slice(0, 200));
      return false;
    }

    console.log(`[sms] sent to ${maskRecipient(to)}`);
    return true;
  } catch (err: any) {
    console.error(`[sms] failed for ${maskRecipient(to)}:`, err?.message || err);
    return false;
  }
}

/**
 * Send Transactional Email via SendGrid v3 API
 */
export async function sendEmail(
  to: SendGridRecipient | string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'Pinnacle Financial Services';

  const recipient: SendGridRecipient = typeof to === 'string' ? { email: to } : to;

  if (!apiKey || !fromEmail) {
    return false;
  }

  try {
    const payload = {
      personalizations: [
        {
          to: [recipient],
          subject: subject,
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      content: [
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok && response.status !== 202) {
      const errorText = await response.text();
      console.error(`[email] provider returned HTTP ${response.status}:`, errorText.slice(0, 200));
      return false;
    }

    console.log(`[email] sent to ${maskRecipient(recipient.email)}`);
    return true;
  } catch (err: any) {
    console.error(`[email] failed for ${maskRecipient(recipient.email)}:`, err?.message || err);
    return false;
  }
}
