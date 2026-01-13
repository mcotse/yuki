// API endpoint to get pending reminders

import { getPendingReminders, confirmLatestPending, confirmById, clearPending } from '../src/lib/storage.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const pending = await getPendingReminders();
    return res.status(200).json({
      count: pending.length,
      reminders: pending.map(r => ({
        id: r.id,
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

  return res.status(405).json({ error: 'Method not allowed' });
}
