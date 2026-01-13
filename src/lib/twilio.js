import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const toNumber = process.env.TWILIO_TO_NUMBER;

// WhatsApp sandbox number
const WHATSAPP_SANDBOX = '+14155238886';

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
  if (!toNumber) {
    throw new Error('Missing TWILIO_TO_NUMBER');
  }

  const twilioClient = getClient();

  const result = await twilioClient.messages.create({
    body: message,
    from: `whatsapp:${WHATSAPP_SANDBOX}`,
    to: `whatsapp:${toNumber}`
  });

  return {
    sid: result.sid,
    status: result.status,
    to: result.to
  };
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
