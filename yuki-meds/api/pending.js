// API endpoint to get pending reminders and confirmation history

import { getPendingReminders, confirmLatestPending, confirmById, clearPending, dedupePendingReminders, getConfirmationHistory } from '../src/lib/storage.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Check if requesting confirmation history
    const { history, date } = req.query || {};

    if (history !== undefined) {
      // Return confirmation history for the specified date (or today)
      const historyDate = date ? new Date(date) : new Date();
      const confirmations = await getConfirmationHistory(historyDate);

      return res.status(200).json({
        date: historyDate.toISOString().split('T')[0],
        count: confirmations.length,
        confirmations: confirmations.map(c => ({
          medicationId: c.medicationId,
          medication: c.medication?.name || c.medicationId,
          location: c.medication?.location,
          dose: c.medication?.dose,
          slot: c.slot,
          confirmedAt: c.confirmedAt,
          confirmedAtFormatted: new Date(c.confirmedAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Los_Angeles'
          })
        }))
      });
    }

    // Default: return pending reminders
    const pending = await getPendingReminders();
    return res.status(200).json({
      count: pending.length,
      reminders: pending.map(r => ({
        id: r.id,
        medicationId: r.medicationId,
        medication: r.medication.name,
        location: r.medication.location,
        dose: r.medication.dose,
        scheduledTime: r.scheduledTime,
        slot: r.slot,
        sentAt: r.sentAt,
        ageMinutes: r.sentAt ? Math.round((Date.now() - r.sentAt) / 60000) : null
      }))
    });
  }

  if (req.method === 'POST') {
    // If ID provided, confirm that specific reminder (from dashboard)
    // Otherwise confirm oldest (from WhatsApp reply)
    const { id } = req.body || {};

    if (id) {
      const result = await confirmById(id);
      return res.status(200).json(result);
    }

    // Fallback for WhatsApp replies without ID
    const result = await confirmLatestPending();
    return res.status(200).json(result);
  }

  if (req.method === 'DELETE') {
    // Clear all pending (for testing)
    await clearPending();
    return res.status(200).json({ cleared: true });
  }

  if (req.method === 'PATCH') {
    // Deduplicate pending reminders
    const result = await dedupePendingReminders();
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
