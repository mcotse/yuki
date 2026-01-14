import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// WhatsApp sandbox number
const WHATSAPP_SANDBOX = '+14155238886';

// All phone numbers to receive notifications
const RECIPIENT_NUMBERS = [
  '+18573008938',
  '+13014615385'
];

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
