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

  for (const number of RECIPIENT_NUMBERS) {
    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: `whatsapp:${WHATSAPP_SANDBOX}`,
        to: `whatsapp:${number}`
      });
      results.push({
        sid: result.sid,
        status: result.status,
        to: result.to
      });
    } catch (error) {
      console.error(`Failed to send to ${number}:`, error.message);
      results.push({
        to: number,
        error: error.message
      });
    }
  }

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
