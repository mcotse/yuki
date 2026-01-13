// Storage for pending medication reminders
// Uses Vercel KV in production, in-memory for local dev

import { kv } from '@vercel/kv';

const PENDING_KEY = 'yuki:pending';
const CONFIRMED_PREFIX = 'yuki:confirmed:';

// Check if we're in Vercel environment
const isVercel = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// In-memory fallback for local dev
let memoryStore = {
  pending: [],
  confirmed: new Set()
};

// Get all pending reminders
export async function getPendingReminders() {
  if (isVercel) {
    const pending = await kv.get(PENDING_KEY);
    return pending || [];
  }
  return memoryStore.pending;
}

// Add reminders to pending list
export async function addPendingReminders(reminders) {
  if (isVercel) {
    const existing = await getPendingReminders();
    const updated = [...existing, ...reminders];
    await kv.set(PENDING_KEY, updated, { ex: 86400 }); // 24h expiry
    return updated;
  }
  memoryStore.pending = [...memoryStore.pending, ...reminders];
  return memoryStore.pending;
}

// Mark a medication as confirmed
export async function confirmMedication(medicationId, slot) {
  const key = `${slot}-${medicationId}`;

  if (isVercel) {
    // Remove from pending
    const pending = await getPendingReminders();
    const updated = pending.filter(r => !(r.medicationId === medicationId && r.slot === slot));
    await kv.set(PENDING_KEY, updated, { ex: 86400 });

    // Mark as confirmed for today
    const today = new Date().toISOString().split('T')[0];
    await kv.set(`${CONFIRMED_PREFIX}${today}:${key}`, true, { ex: 86400 });

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
  if (isVercel) {
    await kv.del(PENDING_KEY);
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

  if (isVercel) {
    await kv.set(PENDING_KEY, updated, { ex: 86400 });
  } else {
    memoryStore.pending = updated;
  }

  return updated;
}
