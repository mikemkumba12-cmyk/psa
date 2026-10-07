/**
 * Pinnacle Smart Advisor — Real Notifications Service
 *
 * Integrates:
 * 1. Africa's Talking (SMS gateway widely used in Africa/Malawi)
 * 2. SendGrid (v3 REST API for transactional emails)
 */

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
    console.log(`[SMS Service - Unconfigured Key Notice] Would send SMS to ${to}: "${message}"`);
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
      console.error(`[SMS Error] Africa's Talking HTTP ${response.status}:`, errorText);
      return false;
    }

    const data = await response.json();
    console.log(`[SMS Sent Successfully] to ${to}:`, data);
    return true;
  } catch (err: any) {
    console.error(`[SMS Exception] Failed to send SMS to ${to}:`, err?.message || err);
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
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@pinnacle.mw';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Pinnacle MFI';

  const recipient: SendGridRecipient = typeof to === 'string' ? { email: to } : to;

  if (!apiKey) {
    console.log(`[Email Service - Unconfigured Key Notice] Would send Email to ${recipient.email} | Subject: "${subject}"`);
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
      console.error(`[Email Error] SendGrid HTTP ${response.status}:`, errorText);
      return false;
    }

    console.log(`[Email Sent Successfully] to ${recipient.email} | Subject: "${subject}"`);
    return true;
  } catch (err: any) {
    console.error(`[Email Exception] Failed to send Email to ${recipient.email}:`, err?.message || err);
    return false;
  }
}
