import { toZonedTime } from 'date-fns-tz';
import {
  getAllMedications,
  TIME_SLOTS,
  FREQUENCY_SLOTS,
  getDayNumber,
  getAtropineSlots
} from '../config/medications.js';
import { isAlreadyConfirmed, getMedicationSchedule } from './storage.js';

const TIMEZONE = 'America/Los_Angeles';
const EYE_DROP_STAGGER_MINUTES = 6;

// Cache custom schedules for 5 minutes to reduce Redis lookups
const scheduleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getMedicationScheduleWithCache(medicationId) {
  const cached = scheduleCache.get(medicationId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const schedule = await getMedicationSchedule(medicationId);
  scheduleCache.set(medicationId, { data: schedule, timestamp: Date.now() });
  return schedule;
}

// Convert to local timezone
function toLocalTime(date) {
  return toZonedTime(date, TIMEZONE);
}

// Get current time slot based on time
export function getCurrentTimeSlot(date = new Date()) {
  const localDate = toLocalTime(date);
  const hours = localDate.getHours();
  const minutes = localDate.getMinutes();
  const currentTime = hours * 60 + minutes;

  // Define windows around each time slot
  const slots = [
    { name: 'MORNING', time: 8 * 60 + 30 },      // 8:30
    { name: 'LATE_MORNING', time: 11 * 60 },     // 11:00
    { name: 'MIDDAY', time: 14 * 60 },           // 14:00
    { name: 'EVENING', time: 19 * 60 },          // 19:00
    { name: 'LATE_NIGHT', time: 22 * 60 + 30 },  // 22:30 (10:30 PM)
    { name: 'NIGHT', time: 24 * 60 }             // 00:00 (midnight)
  ];

  for (const slot of slots) {
    // 15 min window to trigger (slot time to slot time + 15 min)
    if (currentTime >= slot.time && currentTime < slot.time + 15) {
      return slot.name;
    }
  }

  // Special handling for midnight (00:00-00:15)
  if (currentTime >= 0 && currentTime < 15) {
    return 'NIGHT';
  }

  return null;
}

// Helper to get date-only comparison (ignores time)
function toDateOnly(d) {
  const date = new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Check if medication is due at given slot
export async function isMedicationDue(med, slot, date = new Date()) {
  // Get custom schedule from Redis (if exists)
  const customSchedule = await getMedicationScheduleWithCache(med.id);

  // Merge: custom schedule overrides default
  const effectiveSchedule = {
    ...med,  // Default from medications.js
    ...(customSchedule || {})  // Custom from Redis (if exists)
  };

  // Check if inactive (custom schedules can disable medications)
  if (effectiveSchedule.active === false) {
    return false;
  }

  const checkDate = toDateOnly(date);

  // Check if medication has started (compare dates only)
  if (effectiveSchedule.startDate && toDateOnly(effectiveSchedule.startDate) > checkDate) {
    return false;
  }

  // Check if medication has ended (compare dates only)
  if (effectiveSchedule.endDate && toDateOnly(effectiveSchedule.endDate) < checkDate) {
    return false;
  }

  // Skip as-needed medications in regular reminders
  if (effectiveSchedule.asNeeded) {
    return false;
  }

  // Special handling for Atropine tapering
  if (effectiveSchedule.id === 'atropine') {
    const atropineSlots = getAtropineSlots(date);
    return atropineSlots.includes(slot);
  }

  // Check regular frequency (use effective frequency - custom or default)
  const slots = FREQUENCY_SLOTS[effectiveSchedule.frequency];
  if (!slots) return false;

  return slots.includes(slot);
}

// Format time as HH:MM AM/PM
function formatTime(hours, minutes) {
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${period}`;
}

// Get staggered time for a medication within a slot
function getStaggeredTime(slotName, staggerIndex) {
  const baseTimes = {
    MORNING: { hours: 8, minutes: 30 },
    LATE_MORNING: { hours: 11, minutes: 0 },
    MIDDAY: { hours: 14, minutes: 0 },
    EVENING: { hours: 19, minutes: 0 },
    LATE_NIGHT: { hours: 22, minutes: 30 },  // 10:30 PM
    NIGHT: { hours: 0, minutes: 0 }
  };

  const base = baseTimes[slotName];
  const totalMinutes = base.hours * 60 + base.minutes + (staggerIndex * EYE_DROP_STAGGER_MINUTES);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return { hours, minutes, formatted: formatTime(hours, minutes) };
}

// Generate individual medication reminders with staggered times
export async function getIndividualReminders(date = new Date()) {
  const slot = getCurrentTimeSlot(date);
  if (!slot) return { slot: null, reminders: [] };

  const allMeds = getAllMedications();

  // Filter medications that are due (async)
  const dueChecks = await Promise.all(
    allMeds.map(async (med) => ({
      med,
      isDue: med.active && await isMedicationDue(med, slot, date)
    }))
  );
  const dueMeds = dueChecks.filter(result => result.isDue).map(result => result.med);

  const dayNumber = getDayNumber(date);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD for deterministic IDs

  // Group by location to calculate stagger
  const byLocation = {};
  for (const med of dueMeds) {
    const loc = med.location;
    if (!byLocation[loc]) {
      byLocation[loc] = [];
    }
    byLocation[loc].push(med);
  }

  // Generate individual reminders with staggered times
  const reminders = [];

  // Process eye drops first (need staggering), then oral
  const locationOrder = ['LEFT eye', 'RIGHT eye', 'ORAL'];
  let globalStaggerIndex = 0;

  for (const location of locationOrder) {
    const meds = byLocation[location] || [];

    for (let i = 0; i < meds.length; i++) {
      const med = meds[i];
      const isEyeDrop = location.includes('eye');

      // Eye drops get staggered, oral meds don't
      const staggerIndex = isEyeDrop ? globalStaggerIndex : 0;
      const time = getStaggeredTime(slot, staggerIndex);

      if (isEyeDrop) {
        globalStaggerIndex++;
      }

      // Deterministic ID: date + slot + medication (prevents duplicates on re-runs)
      const reminder = {
        id: `${dateStr}-${slot}-${med.id}`,
        medicationId: med.id,
        medication: med,
        slot,
        dayNumber,
        scheduledTime: time.formatted,
        message: formatIndividualMessage(med, time.formatted, dayNumber),
        confirmed: false,
        sentAt: null
      };

      reminders.push(reminder);
    }
  }

  return {
    slot,
    slotTime: TIME_SLOTS[slot],
    dayNumber,
    reminders
  };
}

// Format a single medication reminder message
function formatIndividualMessage(med, timeStr, dayNumber) {
  const locationEmoji = {
    'LEFT eye': '👁️ LEFT',
    'RIGHT eye': '👁️ RIGHT',
    'ORAL': '💊 ORAL'
  };

  let msg = `⏰ ${timeStr} - Day ${dayNumber}\n\n`;
  msg += `${locationEmoji[med.location] || med.location}\n`;
  msg += `${med.name}\n`;
  msg += `Dose: ${med.dose}\n`;

  if (med.notes) {
    msg += `\n${med.notes}\n`;
  }

  msg += `\n✅ Reply "done" to confirm`;

  return msg;
}

// Get all medications due at current time (legacy - for combined message)
export async function getMedicationsDue(date = new Date()) {
  const slot = getCurrentTimeSlot(date);
  if (!slot) return { slot: null, medications: [] };

  const allMeds = getAllMedications();

  // Filter medications that are due (async)
  const dueChecks = await Promise.all(
    allMeds.map(async (med) => ({
      med,
      isDue: med.active && await isMedicationDue(med, slot, date)
    }))
  );
  const dueMeds = dueChecks.filter(result => result.isDue).map(result => result.med);

  return {
    slot,
    slotTime: TIME_SLOTS[slot],
    dayNumber: getDayNumber(date),
    medications: dueMeds
  };
}

// Format medications for SMS (legacy - combined message)
export function formatSmsMessage(dueInfo) {
  if (!dueInfo.slot || dueInfo.medications.length === 0) {
    return null;
  }

  const slotNames = {
    MORNING: '🌅 Morning',
    LATE_MORNING: '🕚 Late Morning',
    MIDDAY: '☀️ Midday',
    EVENING: '🌆 Evening',
    LATE_NIGHT: '🌃 Late Night',
    NIGHT: '🌙 Night'
  };

  let msg = `${slotNames[dueInfo.slot]} meds for Yuki (Day ${dueInfo.dayNumber}):\n\n`;

  // Group by location
  const byLocation = {};
  for (const med of dueInfo.medications) {
    if (!byLocation[med.location]) {
      byLocation[med.location] = [];
    }
    byLocation[med.location].push(med);
  }

  // Format each group
  for (const [location, meds] of Object.entries(byLocation)) {
    msg += `👁 ${location}:\n`;
    for (const med of meds) {
      msg += `• ${med.name} - ${med.dose}\n`;
      if (med.notes) {
        msg += `  ${med.notes}\n`;
      }
    }
    msg += '\n';
  }

  msg += '✅ Reply DONE when complete';

  return msg;
}

// Get medications for a specific slot (for testing/preview)
export async function getMedicationsForSlot(slot, date = new Date()) {
  const allMeds = getAllMedications();

  // Filter medications that are due (async)
  const dueChecks = await Promise.all(
    allMeds.map(async (med) => ({
      med,
      isDue: med.active && await isMedicationDue(med, slot, date)
    }))
  );

  return dueChecks.filter(result => result.isDue).map(result => result.med);
}

// Preview full day schedule
export async function getDaySchedule(date = new Date()) {
  const slots = ['MORNING', 'LATE_MORNING', 'MIDDAY', 'EVENING', 'LATE_NIGHT', 'NIGHT'];
  const schedule = {};

  for (const slot of slots) {
    const meds = await getMedicationsForSlot(slot, date);
    // Only include slots that have medications
    if (meds.length > 0) {
      schedule[slot] = {
        time: TIME_SLOTS[slot],
        medications: meds
      };
    }
  }

  return {
    dayNumber: getDayNumber(date),
    date: date.toDateString(),
    schedule
  };
}

// Get time slots that have passed for today
export function getPastTimeSlots(date = new Date()) {
  const localDate = toLocalTime(date);
  const hours = localDate.getHours();
  const minutes = localDate.getMinutes();
  const currentTime = hours * 60 + minutes;

  const slots = [
    { name: 'MORNING', time: 8 * 60 + 30 },      // 8:30
    { name: 'LATE_MORNING', time: 11 * 60 },     // 11:00
    { name: 'MIDDAY', time: 14 * 60 },           // 14:00
    { name: 'EVENING', time: 19 * 60 },          // 19:00
    { name: 'LATE_NIGHT', time: 22 * 60 + 30 },  // 22:30 (10:30 PM)
  ];

  // Return slots where the time has passed (with 15 min buffer)
  return slots
    .filter(slot => currentTime >= slot.time + 15)
    .map(slot => slot.name);
}

// Get medications that are past due and not confirmed
// This includes medications from past time slots that haven't been confirmed
export async function getPastDueMedications(date = new Date()) {
  const pastSlots = getPastTimeSlots(date);
  const allMeds = getAllMedications();
  const dayNumber = getDayNumber(date);
  const dateStr = date.toISOString().split('T')[0];

  const pastDue = [];

  for (const slot of pastSlots) {
    // Filter medications that are due (async)
    const dueChecks = await Promise.all(
      allMeds.map(async (med) => ({
        med,
        isDue: med.active && await isMedicationDue(med, slot, date)
      }))
    );
    const dueMeds = dueChecks.filter(result => result.isDue).map(result => result.med);

    for (const med of dueMeds) {
      pastDue.push({
        id: `${dateStr}-${slot}-${med.id}`,
        medicationId: med.id,
        medication: med,
        slot,
        dayNumber,
        scheduledTime: TIME_SLOTS[slot],
        pastDue: true  // Flag to indicate this is a missed/past due medication
      });
    }
  }

  return pastDue;
}

// Get past due medications that haven't been confirmed (async - checks confirmation status)
export async function getPastDueUnconfirmed(date = new Date()) {
  const pastDue = await getPastDueMedications(date);
  const unconfirmed = [];

  for (const med of pastDue) {
    const confirmed = await isAlreadyConfirmed(med.medicationId, med.slot, date);
    if (!confirmed) {
      unconfirmed.push(med);
    }
  }

  return unconfirmed;
}
