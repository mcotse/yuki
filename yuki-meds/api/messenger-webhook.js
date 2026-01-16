// Facebook Messenger webhook endpoint for receiving replies
// Handles both verification (GET) and incoming messages (POST)

import crypto from 'crypto';
import { confirmLatestPending, getPendingReminders } from '../src/lib/storage.js';
import { sendMessenger } from '../src/lib/messenger.js';

// Words that count as confirmation (same as WhatsApp webhook)
const CONFIRMATION_WORDS = [
  'done', 'yes', 'good', 'ack', 'completed', 'complete',
  'ok', 'okay', 'yep', 'yup', 'confirmed', 'taken', 'gave', 'given',
  'finished', 'did', 'did it', 'y', '👍', '✅', '✓', 'check'
];

/**
 * Validate Facebook webhook signature to ensure request authenticity
 * @param {string} signature - The X-Hub-Signature-256 header value
 * @param {string} payload - The raw request body as a string
 * @param {string} appSecret - The Facebook app secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyFacebookSignature(signature, payload, appSecret) {
  if (!signature || !appSecret) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload, 'utf-8')
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // GET request - Facebook webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Messenger Webhook] Verification successful');
      return res.status(200).send(challenge);
    } else {
      console.log('[Messenger Webhook] Verification failed');
      return res.status(403).send('Verification failed');
    }
  }

  // POST request - incoming messages
  if (req.method === 'POST') {
    // Verify Facebook webhook signature in production
    const appSecret = process.env.FB_APP_SECRET;
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'];
      // For Vercel, we need to get the raw body - this may require body parser configuration
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (!verifyFacebookSignature(signature, rawBody, appSecret)) {
        console.error('[Messenger Webhook] Invalid Facebook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    const body = req.body;

    // Verify this is from a page subscription
    if (body.object !== 'page') {
      return res.status(404).send('Not found');
    }

    try {
      // Process each entry (can have multiple)
      for (const entry of body.entry || []) {
        // Get the webhook event (messaging)
        const webhookEvent = entry.messaging?.[0];
        if (!webhookEvent) continue;

        const senderPsid = webhookEvent.sender?.id;
        const messageText = webhookEvent.message?.text;

        if (!senderPsid || !messageText) continue;

        console.log(`[Messenger Webhook] Received from PSID ${senderPsid}: "${messageText}"`);

        // Check if message is a confirmation
        const normalizedMessage = messageText.toLowerCase().trim();
        const isConfirmation = CONFIRMATION_WORDS.some(word => {
          return normalizedMessage === word || normalizedMessage.startsWith(word + ' ');
        });

        if (!isConfirmation) {
          // Not a confirmation - send help message
          console.log(`[Messenger Webhook] Message not recognized as confirmation`);

          await sendMessengerReply(senderPsid,
            `🤔 I didn't understand that.\n\n` +
            `Reply with "done", "yes", or "ok" to confirm the medication.\n` +
            `Reply "status" to see pending medications.`
          );
          continue;
        }

        // Check for pending reminders
        const pending = await getPendingReminders();

        if (pending.length === 0) {
          await sendMessengerReply(senderPsid, `✅ No pending medications to confirm. Great job!`);
          continue;
        }

        // Confirm the latest pending medication
        const result = await confirmLatestPending();

        if (result.confirmed) {
          let responseMsg = `✅ Confirmed: ${result.medication}`;

          if (result.remaining > 0) {
            responseMsg += `\n\n⏳ ${result.remaining} more medication(s) pending`;
          } else {
            responseMsg += `\n\n🎉 All medications for this slot confirmed!`;
          }

          await sendMessengerReply(senderPsid, responseMsg);
        }
      }

      // Always respond with 200 to acknowledge receipt
      return res.status(200).json({ status: 'ok' });

    } catch (error) {
      console.error('[Messenger Webhook] Error:', error);
      // Still return 200 to prevent Facebook from retrying
      // Don't expose internal error details to clients
      return res.status(200).json({ status: 'error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Helper to send a reply to a specific user
async function sendMessengerReply(psid, message) {
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!PAGE_ACCESS_TOKEN) {
    console.log('[Messenger Webhook] Cannot reply - no PAGE_ACCESS_TOKEN');
    return;
  }

  try {
    const response = await fetch('https://graph.facebook.com/v18.0/me/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAGE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text: message }
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`[Messenger Webhook] Reply sent to ${psid}: ${data.message_id}`);
    } else {
      console.error(`[Messenger Webhook] Reply failed: ${JSON.stringify(data.error)}`);
    }
  } catch (error) {
    console.error(`[Messenger Webhook] Reply error: ${error.message}`);
  }
}
