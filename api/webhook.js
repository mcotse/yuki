// Twilio webhook endpoint for WhatsApp replies
// Receives confirmation messages and marks medications as done

import { confirmLatestPending, getPendingReminders } from '../src/lib/storage.js';
import { sendWhatsApp } from '../src/lib/twilio.js';

// Words that count as confirmation
const CONFIRMATION_WORDS = [
  'done', 'yes', 'good', 'ack', 'completed', 'complete',
  'ok', 'okay', 'yep', 'yup', 'confirmed', 'taken', 'gave', 'given',
  'finished', 'did', 'did it', 'y', '👍', '✅', '✓', 'check'
];

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // Twilio sends POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse Twilio webhook payload
    const body = req.body || {};
    const messageBody = (body.Body || '').toLowerCase().trim();
    const from = body.From || '';
    const to = body.To || '';

    console.log(`[Webhook] Received message: "${messageBody}" from ${from}`);

    // Check if message is a confirmation
    const isConfirmation = CONFIRMATION_WORDS.some(word => {
      // Exact match or starts with the word
      return messageBody === word || messageBody.startsWith(word + ' ');
    });

    if (!isConfirmation) {
      // Not a confirmation - could add other commands here
      console.log(`[Webhook] Message not recognized as confirmation`);

      // Send help message
      await sendWhatsApp(
        `🤔 I didn't understand that.\n\n` +
        `Reply with "done", "yes", or "ok" to confirm the medication.\n` +
        `Reply "status" to see pending medications.`
      );

      return res.status(200).json({ processed: true, action: 'help_sent' });
    }

    // Check for pending reminders
    const pending = await getPendingReminders();

    if (pending.length === 0) {
      await sendWhatsApp(`✅ No pending medications to confirm. Great job!`);
      return res.status(200).json({ processed: true, action: 'none_pending' });
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

      await sendWhatsApp(responseMsg);
    }

    return res.status(200).json({
      processed: true,
      action: 'confirmed',
      medication: result.medication,
      remaining: result.remaining
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
