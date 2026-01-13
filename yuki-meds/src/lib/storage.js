// Storage for pending medication reminders
// Uses Upstash Redis in production, in-memory for local dev

import { Redis } from '@upstash/redis';

const PENDING_KEY = 'yuki:pending';
const CONFIRMED_PREFIX = 'yuki:confirmed:';

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

// Add reminders to pending list
export async function addPendingReminders(reminders) {
  const client = getRedis();
  if (client) {
    const existing = await getPendingReminders();
    const updated = [...existing, ...reminders];
    await client.set(PENDING_KEY, updated, { ex: 86400 }); // 24h expiry
    return updated;
  }
  memoryStore.pending = [...memoryStore.pending, ...reminders];
  return memoryStore.pending;
}

// Mark a medication as confirmed
export async function confirmMedication(medicationId, slot) {
  const key = `${slot}-${medicationId}`;
  const client = getRedis();

  if (client) {
    // Remove from pending
    const pending = await getPendingReminders();
    const updated = pending.filter(r => !(r.medicationId === medicationId && r.slot === slot));
    await client.set(PENDING_KEY, updated, { ex: 86400 });

    // Mark as confirmed for today
    const today = new Date().toISOString().split('T')[0];
    await client.set(`${CONFIRMED_PREFIX}${today}:${key}`, true, { ex: 86400 });

    return { confirmed: true, remaining: updated.length };
  }

  // Memory fallback
  memoryStore.pending = memoryStore.pending.filter(
    r => !(r.medicationId === medicationId && r.slot === slot)
  );
  memoryStore.confirmed.add(key);
  return { confirmed: true, remaining: memoryStore.pending.length };
}

// Confirm the most recent pending reminder (for simple "done" replies)
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

// Clear all pending (for testing/reset)
export async function clearPending() {
  const client = getRedis();
  if (client) {
    await client.del(PENDING_KEY);
  }
  memoryStore.pending = [];
  memoryStore.confirmed.clear();
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
