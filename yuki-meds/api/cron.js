// Vercel Cron endpoint - triggered at medication times
// Sends individual reminders via WhatsApp and Messenger

import { getIndividualReminders, getCurrentTimeSlot } from '../src/lib/scheduler.js';
import { sendNotification } from '../src/lib/notifications.js';
import { addPendingReminders, markRemindersSent, getRemindersToResend, getPendingReminders, claimSlot } from '../src/lib/storage.js';

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
        console.log(`[Cron] Re-sending reminder for ${reminder.medication.name}...`);
        const sendResults = await sendNotification(reRemindMsg);

        // Log per-recipient results
        for (const result of sendResults) {
          if (result.success) {
            console.log(`[Cron] Re-remind ${reminder.medication.name} -> ${result.to}: sent (${result.sid})`);
          } else {
            console.error(`[Cron] Re-remind ${reminder.medication.name} -> ${result.to}: FAILED - ${result.error}`);
          }
        }

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

  // Atomically claim this slot to prevent duplicate sends from concurrent cron triggers
  const claimed = await claimSlot(slot, now);

  if (!claimed) {
    console.log(`[Cron] Slot ${slot} already claimed by another invocation, skipping`);
    return res.status(200).json({
      triggered: true,
      slot,
      sent: false,
      reason: `Slot ${slot} already claimed`
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
      console.log(`[Cron] Sending reminder for ${reminder.medication.name}...`);
      const sendResults = await sendNotification(reminder.message);

      // Log per-recipient results
      for (const result of sendResults) {
        if (result.success) {
          console.log(`[Cron] ${reminder.medication.name} -> ${result.to}: sent (${result.sid})`);
        } else {
          console.error(`[Cron] ${reminder.medication.name} -> ${result.to}: FAILED - ${result.error}`);
        }
      }

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
