import { toZonedTime } from 'date-fns-tz';
import {
  getAllMedications,
  TIME_SLOTS,
  FREQUENCY_SLOTS,
  getDayNumber,
  getAtropineSlots
} from '../config/medications.js';

const TIMEZONE = 'America/Los_Angeles';
const EYE_DROP_STAGGER_MINUTES = 6;

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

  // Define windows around each time slot (30 min before to 30 min after)
  const slots = [
    { name: 'MORNING', time: 8 * 60 + 30 },   // 8:30
    { name: 'MIDDAY', time: 14 * 60 },         // 14:00
    { name: 'EVENING', time: 19 * 60 },        // 19:00
    { name: 'NIGHT', time: 24 * 60 }           // 00:00 (midnight)
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
export function isMedicationDue(med, slot, date = new Date()) {
  const checkDate = toDateOnly(date);

  // Check if medication has started (compare dates only)
  if (med.startDate && toDateOnly(med.startDate) > checkDate) {
    return false;
  }

  // Check if medication has ended (compare dates only)
  if (med.endDate && toDateOnly(med.endDate) < checkDate) {
    return false;
  }

  // Skip as-needed medications in regular reminders
  if (med.asNeeded) {
    return false;
  }

  // Special handling for Atropine tapering
  if (med.id === 'atropine') {
    const atropineSlots = getAtropineSlots(date);
    return atropineSlots.includes(slot);
  }

  // Check regular frequency
  const slots = FREQUENCY_SLOTS[med.frequency];
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
    MIDDAY: { hours: 14, minutes: 0 },
    EVENING: { hours: 19, minutes: 0 },
    NIGHT: { hours: 0, minutes: 0 }
  };

  const base = baseTimes[slotName];
  const totalMinutes = base.hours * 60 + base.minutes + (staggerIndex * EYE_DROP_STAGGER_MINUTES);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return { hours, minutes, formatted: formatTime(hours, minutes) };
}

// Generate individual medication reminders with staggered times
export function getIndividualReminders(date = new Date()) {
  const slot = getCurrentTimeSlot(date);
  if (!slot) return { slot: null, reminders: [] };

  const allMeds = getAllMedications();
  const dueMeds = allMeds.filter(med => med.active && isMedicationDue(med, slot, date));
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
export function getMedicationsDue(date = new Date()) {
  const slot = getCurrentTimeSlot(date);
  if (!slot) return { slot: null, medications: [] };

  const allMeds = getAllMedications();
  const dueMeds = allMeds.filter(med => med.active && isMedicationDue(med, slot, date));

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
    MIDDAY: '☀️ Midday',
    EVENING: '🌆 Evening',
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
export function getMedicationsForSlot(slot, date = new Date()) {
  const allMeds = getAllMedications();
  return allMeds.filter(med => med.active && isMedicationDue(med, slot, date));
}

// Preview full day schedule
export function getDaySchedule(date = new Date()) {
  const slots = ['MORNING', 'MIDDAY', 'EVENING', 'NIGHT'];
  const schedule = {};

  for (const slot of slots) {
    const meds = getMedicationsForSlot(slot, date);
    schedule[slot] = {
      time: TIME_SLOTS[slot],
      medications: meds
    };
  }

  return {
    dayNumber: getDayNumber(date),
    date: date.toDateString(),
    schedule
  };
}
