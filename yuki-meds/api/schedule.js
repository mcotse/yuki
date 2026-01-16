// API endpoint to get medication schedule

import { getDaySchedule } from '../src/lib/scheduler.js';
import { getDayNumber } from '../src/config/medications.js';
import { requireAuth } from '../src/lib/auth.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // CORS - allow credentials for auth cookies
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  if (!requireAuth(req, res)) return;

  const day = req.query.day ? parseInt(req.query.day) : null;

  let date = new Date();
  if (day) {
    // Calculate date for specific day number
    const surgeryDate = new Date('2026-01-12T12:00:00-08:00');
    date = new Date(surgeryDate);
    date.setDate(date.getDate() + day - 1);
  }

  const schedule = getDaySchedule(date);
  const dayNumber = getDayNumber(date);

  return res.status(200).json({
    dayNumber,
    date: date.toDateString(),
    schedule: schedule.schedule
  });
}
