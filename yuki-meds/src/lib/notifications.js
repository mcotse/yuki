// Unified notification system - sends to all configured channels

import { sendWhatsApp } from './twilio.js';
import { sendMessenger, isMessengerConfigured } from './messenger.js';

// Send notification to all configured channels
export async function sendNotification(message) {
  const timestamp = new Date().toISOString();
  const results = {
    whatsapp: [],
    messenger: [],
    summary: { sent: 0, failed: 0 }
  };

  console.log(`[Notifications ${timestamp}] Sending to all channels...`);

  // Send via WhatsApp (always enabled if configured)
  try {
    results.whatsapp = await sendWhatsApp(message);
    const whatsappSuccess = results.whatsapp.filter(r => r.success).length;
    results.summary.sent += whatsappSuccess;
    results.summary.failed += results.whatsapp.length - whatsappSuccess;
  } catch (error) {
    console.error(`[Notifications ${timestamp}] WhatsApp error: ${error.message}`);
  }

  // Send via Messenger (if configured)
  if (isMessengerConfigured()) {
    try {
      results.messenger = await sendMessenger(message);
      const messengerSuccess = results.messenger.filter(r => r.success).length;
      results.summary.sent += messengerSuccess;
      results.summary.failed += results.messenger.length - messengerSuccess;
    } catch (error) {
      console.error(`[Notifications ${timestamp}] Messenger error: ${error.message}`);
    }
  }

  console.log(`[Notifications ${timestamp}] Total: ${results.summary.sent} sent, ${results.summary.failed} failed`);

  return results;
}

// Get status of all notification channels
export function getChannelStatus() {
  return {
    whatsapp: {
      enabled: true, // Always enabled if Twilio is configured
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    },
    messenger: {
      enabled: isMessengerConfigured(),
      configured: !!process.env.FB_PAGE_ACCESS_TOKEN
    }
  };
}
