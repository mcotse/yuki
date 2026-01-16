// API endpoint for medication management (view details, update schedules)

import { getMedicationSchedule, getAllCustomSchedules, updateMedicationSchedule, resetMedicationSchedule } from '../src/lib/storage.js';
import { getAllMedications, TIME_SLOTS, FREQUENCY_SLOTS } from '../src/config/medications.js';
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  if (!requireAuth(req, res)) return;

  // GET /api/medications - List all medications with their schedules
  // GET /api/medications?id=xyz - Get specific medication details
  if (req.method === 'GET') {
    const { id } = req.query || {};
    const allMeds = getAllMedications();
    const customSchedules = await getAllCustomSchedules();

    if (id) {
      // Get specific medication
      const med = allMeds.find(m => m.id === id);
      if (!med) {
        return res.status(404).json({ error: `Medication ${id} not found` });
      }

      const customSchedule = customSchedules[id];
      const effectiveSchedule = customSchedule || {
        frequency: med.frequency,
        timeSlots: med.frequency === 'tapering' ? null : FREQUENCY_SLOTS[med.frequency],
        active: med.active
      };

      return res.status(200).json({
        medication: {
          ...med,
          customSchedule: customSchedule || null,
          effectiveSchedule,
          availableFrequencies: Object.keys(FREQUENCY_SLOTS),
          timeSlots: TIME_SLOTS
        }
      });
    }

    // List all medications
    const medications = allMeds.map(med => {
      const customSchedule = customSchedules[med.id];
      return {
        id: med.id,
        name: med.name,
        dose: med.dose,
        location: med.location,
        frequency: customSchedule?.frequency || med.frequency,
        active: customSchedule?.active ?? med.active,
        notes: med.notes,
        hasCustomSchedule: !!customSchedule
      };
    });

    return res.status(200).json({
      count: medications.length,
      medications,
      timeSlots: TIME_SLOTS,
      frequencies: FREQUENCY_SLOTS
    });
  }

  // PUT /api/medications - Update a medication's schedule
  if (req.method === 'PUT') {
    const { id, frequency, timeSlots, active, notes } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Medication ID required' });
    }

    const allMeds = getAllMedications();
    const med = allMeds.find(m => m.id === id);
    if (!med) {
      return res.status(404).json({ error: `Medication ${id} not found` });
    }

    // Validate frequency if provided
    if (frequency && !FREQUENCY_SLOTS[frequency] && frequency !== 'tapering') {
      return res.status(400).json({
        error: `Invalid frequency. Must be one of: ${Object.keys(FREQUENCY_SLOTS).join(', ')}, tapering`
      });
    }

    // Build schedule update
    const scheduleUpdate = {};
    if (frequency !== undefined) scheduleUpdate.frequency = frequency;
    if (timeSlots !== undefined) scheduleUpdate.timeSlots = timeSlots;
    if (active !== undefined) scheduleUpdate.active = active;
    if (notes !== undefined) scheduleUpdate.notes = notes;

    const result = await updateMedicationSchedule(id, scheduleUpdate);

    return res.status(200).json({
      updated: true,
      medication: med.name,
      schedule: result.schedule
    });
  }

  // DELETE /api/medications?id=xyz - Reset medication to default schedule
  if (req.method === 'DELETE') {
    const { id } = req.query || {};

    if (!id) {
      return res.status(400).json({ error: 'Medication ID required' });
    }

    const result = await resetMedicationSchedule(id);
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
