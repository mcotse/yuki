// API endpoint for Yuki daily tracking
// GET - get tracking data for a date
// POST - update tracking item

import { getYukiTracking, updateYukiItem } from '../src/lib/storage.js';
import { requireAuth } from '../src/lib/auth.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { date } = req.query || {};
    const trackingDate = date ? new Date(date) : new Date();

    const data = await getYukiTracking(trackingDate);

    // Format the response with confirmation times
    const items = {};
    for (const [itemId, itemData] of Object.entries(data)) {
      items[itemId] = {
        checked: itemData.checked,
        confirmedAt: itemData.confirmedAt,
        confirmedAtFormatted: itemData.confirmedAt
          ? new Date(itemData.confirmedAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles'
            })
          : null
      };
    }

    return res.status(200).json({
      date: trackingDate.toISOString().split('T')[0],
      items
    });
  }

  if (req.method === 'POST') {
    const { itemId, checked, date } = req.body || {};

    if (!itemId) {
      return res.status(400).json({ error: 'itemId required' });
    }

    const trackingDate = date ? new Date(date) : new Date();
    const result = await updateYukiItem(itemId, checked, trackingDate);

    // Return formatted confirmation time
    if (result.data && result.data.confirmedAt) {
      result.data.confirmedAtFormatted = new Date(result.data.confirmedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Los_Angeles'
      });
    }

    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
