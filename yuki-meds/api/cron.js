// Vercel Cron endpoint - triggered at medication times
// Sends individual WhatsApp reminders with staggered timing

import { getIndividualReminders, getCurrentTimeSlot } from '../src/lib/scheduler.js';
import { sendWhatsApp } from '../src/lib/twilio.js';
import { addPendingReminders, markRemindersSent, getRemindersToResend, getPendingReminders } from '../src/lib/storage.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // Verify cron secret in production
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = new Date();
  console.log(`[${now.toISOString()}] Cron triggered`);

  // Check for re-reminders first (meds sent > 30 min ago, not confirmed)
  const toResend = await getRemindersToResend(30);

  if (toResend.length > 0) {
    console.log(`[Cron] Re-sending ${toResend.length} unconfirmed reminders`);

    for (const reminder of toResend) {
      const reRemindMsg = `⏰ REMINDER: ${reminder.medication.name} not yet confirmed!\n\n` +
        `${reminder.message}\n\n` +
        `⚠️ Please reply "done" when taken`;

      try {
        await sendWhatsApp(reRemindMsg);
        // Update sentAt to reset the 30-min timer
        await markRemindersSent([reminder.id]);
      } catch (error) {
        console.error(`[Cron] Failed to re-send reminder:`, error);
      }
    }

    return res.status(200).json({
      triggered: true,
      action: 're-remind',
      count: toResend.length
    });
  }

  // Check if there's an active medication slot
  const slot = getCurrentTimeSlot(now);

  if (!slot) {
    // No active slot, but check if there are pending reminders from a recent slot
    const pending = await getPendingReminders();
    if (pending.length > 0) {
      console.log(`[Cron] ${pending.length} pending reminders, no active slot`);
    }

    return res.status(200).json({
      triggered: true,
      slot: null,
      sent: false,
      reason: 'No active medication slot',
      pendingCount: pending.length
    });
  }

  // Check if we already sent reminders for this slot
  const existingPending = await getPendingReminders();
  const alreadySentForSlot = existingPending.filter(r => r.slot === slot);

  if (alreadySentForSlot.length > 0) {
    console.log(`[Cron] Already sent ${alreadySentForSlot.length} reminders for ${slot}, skipping`);
    return res.status(200).json({
      triggered: true,
      slot,
      sent: false,
      reason: `Already sent reminders for ${slot}`,
      existingCount: alreadySentForSlot.length
    });
  }

  // Get individual reminders for this slot
  const { reminders, dayNumber } = getIndividualReminders(now);

  if (reminders.length === 0) {
    return res.status(200).json({
      triggered: true,
      slot,
      sent: false,
      reason: 'No medications due for this slot'
    });
  }

  console.log(`[Cron] Sending ${reminders.length} individual reminders for ${slot}`);

  // Send individual WhatsApp messages
  const sentIds = [];

  for (const reminder of reminders) {
    try {
      await sendWhatsApp(reminder.message);
      reminder.sentAt = Date.now();
      sentIds.push(reminder.id);

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[Cron] Failed to send reminder for ${reminder.medication.name}:`, error);
    }
  }

  // Store pending reminders for confirmation tracking
  const sentReminders = reminders.filter(r => sentIds.includes(r.id));
  await addPendingReminders(sentReminders);

  return res.status(200).json({
    triggered: true,
    slot,
    dayNumber,
    sent: true,
    count: sentIds.length,
    reminders: sentReminders.map(r => ({
      medication: r.medication.name,
      time: r.scheduledTime
    }))
  });
}
