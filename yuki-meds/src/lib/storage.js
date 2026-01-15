// Storage for pending medication reminders
// Uses Upstash Redis in production, in-memory for local dev

import { Redis } from '@upstash/redis';

const PENDING_KEY = 'yuki:pending';
const CONFIRMED_PREFIX = 'yuki:confirmed:';
const SCHEDULE_PREFIX = 'yuki:schedule:';

// Check if we're in production with Upstash credentials
const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;

function getRedis() {
  if (!redis && hasUpstash) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

// In-memory fallback for local dev
let memoryStore = {
  pending: [],
  confirmed: new Set()
};

// Get all pending reminders
export async function getPendingReminders() {
  const client = getRedis();
  if (client) {
    const pending = await client.get(PENDING_KEY);
    return pending || [];
  }
  return memoryStore.pending;
}

// Add reminders to pending list (dedupes by ID to prevent duplicates)
export async function addPendingReminders(reminders) {
  const client = getRedis();
  if (client) {
    const existing = await getPendingReminders();
    const existingIds = new Set(existing.map(r => r.id));

    // Only add reminders that don't already exist
    const newReminders = reminders.filter(r => !existingIds.has(r.id));

    if (newReminders.length === 0) {
      console.log(`[Storage] All ${reminders.length} reminders already exist, skipping`);
      return existing;
    }

    if (newReminders.length < reminders.length) {
      console.log(`[Storage] Filtered ${reminders.length - newReminders.length} duplicate reminders`);
    }

    const updated = [...existing, ...newReminders];
    await client.set(PENDING_KEY, updated, { ex: 86400 }); // 24h expiry
    return updated;
  }

  // Memory fallback with same deduplication
  const existingIds = new Set(memoryStore.pending.map(r => r.id));
  const newReminders = reminders.filter(r => !existingIds.has(r.id));
  memoryStore.pending = [...memoryStore.pending, ...newReminders];
  return memoryStore.pending;
}

// Mark a medication as confirmed
export async function confirmMedication(medicationId, slot, medication = null) {
  const key = `${slot}-${medicationId}`;
  const client = getRedis();
  const confirmedAt = Date.now();

  if (client) {
    // Remove from pending
    const pending = await getPendingReminders();
    const reminder = pending.find(r => r.medicationId === medicationId && r.slot === slot);
    const updated = pending.filter(r => !(r.medicationId === medicationId && r.slot === slot));
    await client.set(PENDING_KEY, updated, { ex: 86400 });

    // Store confirmation with timestamp and medication details
    const today = new Date().toISOString().split('T')[0];
    const confirmationData = {
      confirmedAt,
      medicationId,
      slot,
      medication: medication || reminder?.medication || { name: medicationId }
    };
    await client.set(`${CONFIRMED_PREFIX}${today}:${key}`, confirmationData, { ex: 86400 });

    return { confirmed: true, remaining: updated.length, confirmedAt };
  }

  // Memory fallback
  memoryStore.pending = memoryStore.pending.filter(
    r => !(r.medicationId === medicationId && r.slot === slot)
  );
  memoryStore.confirmed.add(key);
  return { confirmed: true, remaining: memoryStore.pending.length, confirmedAt };
}

// Confirm the most recent pending reminder (for simple "done" replies via WhatsApp)
export async function confirmLatestPending() {
  const pending = await getPendingReminders();
  if (pending.length === 0) {
    return { confirmed: false, message: 'No pending medications to confirm' };
  }

  // Confirm the oldest (first sent) pending reminder
  const oldest = pending[0];
  const result = await confirmMedication(oldest.medicationId, oldest.slot);

  return {
    confirmed: true,
    medication: oldest.medication.name,
    remaining: result.remaining
  };
}

// Confirm a specific reminder by its unique ID (for dashboard UI)
export async function confirmById(reminderId) {
  const pending = await getPendingReminders();
  const reminder = pending.find(r => r.id === reminderId);

  if (!reminder) {
    return { confirmed: false, message: `Reminder ${reminderId} not found` };
  }

  const client = getRedis();
  const updated = pending.filter(r => r.id !== reminderId);
  const confirmedAt = Date.now();

  if (client) {
    await client.set(PENDING_KEY, updated, { ex: 86400 });

    // Store confirmation with timestamp and medication details
    const today = new Date().toISOString().split('T')[0];
    const key = `${reminder.slot}-${reminder.medicationId}`;
    const confirmationData = {
      confirmedAt,
      medicationId: reminder.medicationId,
      slot: reminder.slot,
      medication: reminder.medication
    };
    await client.set(`${CONFIRMED_PREFIX}${today}:${key}`, confirmationData, { ex: 86400 });
  } else {
    memoryStore.pending = updated;
    memoryStore.confirmed.add(`${reminder.slot}-${reminder.medicationId}`);
  }

  return {
    confirmed: true,
    medication: reminder.medication.name,
    remaining: updated.length,
    confirmedAt
  };
}

// Get reminders that need re-reminding (sent > 30 min ago, not confirmed)
export async function getRemindersToResend(minutesThreshold = 30) {
  const pending = await getPendingReminders();
  const now = Date.now();
  const threshold = minutesThreshold * 60 * 1000;

  return pending.filter(r => {
    if (!r.sentAt) return false;
    return (now - r.sentAt) >= threshold;
  });
}

// Atomically claim a slot to prevent duplicate sends (uses SETNX)
// Returns true if this invocation claimed the slot, false if already claimed
export async function claimSlot(slot, date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  const key = `yuki:sent:${dateStr}:${slot}`;

  const client = getRedis();
  if (client) {
    // SETNX: only sets if key doesn't exist, returns true if set, false if existed
    const claimed = await client.setnx(key, Date.now());
    if (claimed) {
      // Set expiry so it cleans up (2 hours is plenty)
      await client.expire(key, 7200);
    }
    return claimed === 1;
  }

  // Memory fallback for local dev
  if (!memoryStore.sentSlots) {
    memoryStore.sentSlots = new Set();
  }
  if (memoryStore.sentSlots.has(key)) {
    return false;
  }
  memoryStore.sentSlots.add(key);
  return true;
}

// Clear all pending (for testing/reset)
export async function clearPending() {
  const client = getRedis();
  if (client) {
    await client.del(PENDING_KEY);
  }
  memoryStore.pending = [];
  memoryStore.confirmed.clear();
}

// Deduplicate pending reminders by medication ID + slot (removes existing duplicates)
export async function dedupePendingReminders() {
  const pending = await getPendingReminders();
  const seen = new Map(); // key -> reminder (keeps most recent sentAt)

  for (const reminder of pending) {
    const key = `${reminder.slot}-${reminder.medicationId}`;
    const existing = seen.get(key);

    // Keep the one with the most recent sentAt
    if (!existing || (reminder.sentAt && (!existing.sentAt || reminder.sentAt > existing.sentAt))) {
      seen.set(key, reminder);
    }
  }

  const deduped = Array.from(seen.values());
  const removed = pending.length - deduped.length;

  if (removed > 0) {
    console.log(`[Storage] Deduped: removed ${removed} duplicates, ${deduped.length} remaining`);

    const client = getRedis();
    if (client) {
      await client.set(PENDING_KEY, deduped, { ex: 86400 });
    } else {
      memoryStore.pending = deduped;
    }
  }

  return { before: pending.length, after: deduped.length, removed };
}

// Get confirmation history for a specific date
export async function getConfirmationHistory(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  const client = getRedis();

  if (client) {
    // Scan for all confirmation keys for this date
    // Pattern: yuki:confirmed:YYYY-MM-DD:SLOT-medicationId
    const pattern = `${CONFIRMED_PREFIX}${dateStr}:*`;
    const keys = [];

    // Use SCAN to find all matching keys
    let cursor = 0;
    do {
      const result = await client.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    // Fetch all confirmation data
    const confirmations = [];
    for (const key of keys) {
      const data = await client.get(key);
      if (data && typeof data === 'object' && data.confirmedAt) {
        confirmations.push(data);
      }
    }

    // Sort by confirmation time (most recent first)
    confirmations.sort((a, b) => b.confirmedAt - a.confirmedAt);
    return confirmations;
  }

  // Memory fallback - return basic data
  const confirmations = [];
  for (const key of memoryStore.confirmed) {
    confirmations.push({
      confirmedAt: Date.now(),
      slot: key.split('-')[0],
      medicationId: key.split('-').slice(1).join('-'),
      medication: { name: key.split('-').slice(1).join('-') }
    });
  }
  return confirmations;
}

// Update sentAt timestamp for reminders
export async function markRemindersSent(reminderIds) {
  const pending = await getPendingReminders();
  const now = Date.now();

  const updated = pending.map(r => {
    if (reminderIds.includes(r.id)) {
      return { ...r, sentAt: now };
    }
    return r;
  });

  const client = getRedis();
  if (client) {
    await client.set(PENDING_KEY, updated, { ex: 86400 });
  } else {
    memoryStore.pending = updated;
  }

  return updated;
}

// ===== MEDICATION SCHEDULE STORAGE =====

// Get custom schedule for a medication (returns null if using default)
export async function getMedicationSchedule(medicationId) {
  const client = getRedis();
  const key = `${SCHEDULE_PREFIX}${medicationId}`;

  if (client) {
    const schedule = await client.get(key);
    return schedule || null;
  }

  // Memory fallback
  if (!memoryStore.schedules) {
    memoryStore.schedules = new Map();
  }
  return memoryStore.schedules.get(medicationId) || null;
}

// Get all custom schedules
export async function getAllCustomSchedules() {
  const client = getRedis();

  if (client) {
    const pattern = `${SCHEDULE_PREFIX}*`;
    const keys = [];

    let cursor = 0;
    do {
      const result = await client.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    const schedules = {};
    for (const key of keys) {
      const medicationId = key.replace(SCHEDULE_PREFIX, '');
      const schedule = await client.get(key);
      if (schedule) {
        schedules[medicationId] = schedule;
      }
    }
    return schedules;
  }

  // Memory fallback
  if (!memoryStore.schedules) {
    return {};
  }
  return Object.fromEntries(memoryStore.schedules);
}

// Update a medication's schedule
export async function updateMedicationSchedule(medicationId, scheduleUpdate) {
  const client = getRedis();
  const key = `${SCHEDULE_PREFIX}${medicationId}`;

  // scheduleUpdate can include: frequency, timeSlots, active, notes
  const scheduleData = {
    ...scheduleUpdate,
    updatedAt: Date.now()
  };

  if (client) {
    await client.set(key, scheduleData);
    return { updated: true, medicationId, schedule: scheduleData };
  }

  // Memory fallback
  if (!memoryStore.schedules) {
    memoryStore.schedules = new Map();
  }
  memoryStore.schedules.set(medicationId, scheduleData);
  return { updated: true, medicationId, schedule: scheduleData };
}

// Reset a medication's schedule to default (remove custom schedule)
export async function resetMedicationSchedule(medicationId) {
  const client = getRedis();
  const key = `${SCHEDULE_PREFIX}${medicationId}`;

  if (client) {
    await client.del(key);
    return { reset: true, medicationId };
  }

  // Memory fallback
  if (memoryStore.schedules) {
    memoryStore.schedules.delete(medicationId);
  }
  return { reset: true, medicationId };
}
