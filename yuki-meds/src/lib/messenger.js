// Facebook Messenger API for sending medication reminders

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// All PSIDs (Page-Scoped User IDs) to receive notifications
// You get these when users message your page
const RECIPIENT_PSIDS = (process.env.FB_RECIPIENT_PSIDS || '').split(',').filter(Boolean);

const MESSENGER_API_URL = 'https://graph.facebook.com/v18.0/me/messages';

export async function sendMessenger(message) {
  if (!PAGE_ACCESS_TOKEN) {
    console.log('[Messenger] Skipping - FB_PAGE_ACCESS_TOKEN not configured');
    return [];
  }

  if (RECIPIENT_PSIDS.length === 0) {
    console.log('[Messenger] Skipping - No FB_RECIPIENT_PSIDS configured');
    return [];
  }

  const results = [];
  const timestamp = new Date().toISOString();

  console.log(`[Messenger ${timestamp}] Sending to ${RECIPIENT_PSIDS.length} recipients`);
  console.log(`[Messenger ${timestamp}] Message preview: "${message.substring(0, 50)}..."`);

  for (const psid of RECIPIENT_PSIDS) {
    try {
      console.log(`[Messenger ${timestamp}] Attempting send to PSID ${psid}...`);

      const response = await fetch(`${MESSENGER_API_URL}?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: psid },
          message: { text: message },
          messaging_type: 'MESSAGE_TAG',
          tag: 'CONFIRMED_EVENT_UPDATE' // Allows sending outside 24h window for important updates
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[Messenger ${timestamp}] SUCCESS: PSID ${psid} - Message ID: ${data.message_id}`);
        results.push({
          messageId: data.message_id,
          recipientId: data.recipient_id,
          to: psid,
          success: true
        });
      } else {
        console.error(`[Messenger ${timestamp}] FAILED: PSID ${psid} - Error: ${JSON.stringify(data.error)}`);
        results.push({
          to: psid,
          error: data.error?.message || 'Unknown error',
          errorCode: data.error?.code,
          success: false
        });
      }
    } catch (error) {
      console.error(`[Messenger ${timestamp}] FAILED: PSID ${psid} - Error: ${error.message}`);
      results.push({
        to: psid,
        error: error.message,
        success: false
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`[Messenger ${timestamp}] Complete: ${successCount} sent, ${failCount} failed`);

  return results;
}

// Verify webhook signature from Facebook
export async function verifySignature(signature, payload, appSecret) {
  if (!signature || !appSecret) return false;

  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  return signature === `sha256=${expectedSignature}`;
}

// Check if Messenger is configured
export function isMessengerConfigured() {
  return !!(PAGE_ACCESS_TOKEN && RECIPIENT_PSIDS.length > 0);
}
