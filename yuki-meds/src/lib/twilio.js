import twilio from 'twilio';
import crypto from 'crypto';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// WhatsApp sandbox number (can be overridden via env)
const WHATSAPP_SANDBOX = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

// All phone numbers to receive notifications (from environment variable)
// Format: comma-separated list of phone numbers
const RECIPIENT_NUMBERS = (process.env.TWILIO_RECIPIENT_NUMBERS || '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);

let client = null;

function getClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendWhatsApp(message) {
  const twilioClient = getClient();
  const results = [];
  const timestamp = new Date().toISOString();

  console.log(`[WhatsApp ${timestamp}] Sending to ${RECIPIENT_NUMBERS.length} recipients`);
  console.log(`[WhatsApp ${timestamp}] Message preview: "${message.substring(0, 50)}..."`);

  for (const number of RECIPIENT_NUMBERS) {
    try {
      console.log(`[WhatsApp ${timestamp}] Attempting send to ${number}...`);
      const result = await twilioClient.messages.create({
        body: message,
        from: `whatsapp:${WHATSAPP_SANDBOX}`,
        to: `whatsapp:${number}`
      });
      console.log(`[WhatsApp ${timestamp}] SUCCESS: ${number} - SID: ${result.sid}, Status: ${result.status}`);
      results.push({
        sid: result.sid,
        status: result.status,
        to: result.to,
        success: true
      });
    } catch (error) {
      console.error(`[WhatsApp ${timestamp}] FAILED: ${number} - Error: ${error.message}`);
      console.error(`[WhatsApp ${timestamp}] Error code: ${error.code}, Status: ${error.status}`);
      results.push({
        to: number,
        error: error.message,
        errorCode: error.code,
        success: false
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`[WhatsApp ${timestamp}] Complete: ${successCount} sent, ${failCount} failed`);

  return results;
}

export async function sendMedicationReminder(formattedMessage) {
  if (!formattedMessage) {
    return { sent: false, reason: 'No medications due' };
  }

  try {
    const result = await sendWhatsApp(formattedMessage);
    return {
      sent: true,
      ...result
    };
  } catch (error) {
    return {
      sent: false,
      error: error.message
    };
  }
}

/**
 * Validate Twilio webhook signature to ensure request authenticity
 * Uses HMAC-SHA1 as per Twilio's specification
 * @param {string} signature - The X-Twilio-Signature header value
 * @param {string} url - The full URL of the webhook endpoint
 * @param {object} params - The POST body parameters
 * @returns {boolean} - Whether the signature is valid
 */
export function validateTwilioSignature(signature, url, params) {
  if (!signature || !authToken) {
    return false;
  }

  // Build the data string: URL + sorted params
  let data = url;
  if (params && typeof params === 'object') {
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(data, 'utf-8')
    .digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
