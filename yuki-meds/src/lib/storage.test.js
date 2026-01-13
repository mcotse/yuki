// Tests for storage module
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getPendingReminders,
  addPendingReminders,
  confirmMedication,
  confirmLatestPending,
  confirmById,
  clearPending
} from './storage.js';

describe('Storage', () => {
  beforeEach(async () => {
    await clearPending();
  });

  describe('addPendingReminders', () => {
    it('should add reminders to empty list', async () => {
      const reminders = [
        { id: 'r1', medicationId: 'med1', slot: 'MORNING', medication: { name: 'Med A' }, sentAt: Date.now() - 60000 },
        { id: 'r2', medicationId: 'med2', slot: 'MORNING', medication: { name: 'Med B' }, sentAt: Date.now() - 30000 },
      ];

      await addPendingReminders(reminders);
      const pending = await getPendingReminders();

      expect(pending.length).toBe(2);
      expect(pending[0].id).toBe('r1');
      expect(pending[1].id).toBe('r2');
    });
  });

  describe('confirmLatestPending (confirms oldest)', () => {
    it('should confirm the OLDEST (first) reminder, not the clicked one', async () => {
      // Setup: 4 pending reminders in order they were sent
      const reminders = [
        { id: 'r1', medicationId: 'atropine', slot: 'MORNING', medication: { name: 'Atropine 1%' }, sentAt: Date.now() - 60000 },
        { id: 'r2', medicationId: 'pred', slot: 'MORNING', medication: { name: 'Prednisolone acetate 1%' }, sentAt: Date.now() - 50000 },
        { id: 'r3', medicationId: 'tacro', slot: 'MORNING', medication: { name: 'Tacrolimus' }, sentAt: Date.now() - 40000 },
        { id: 'r4', medicationId: 'amox', slot: 'MORNING', medication: { name: 'Amoxicillin/Clavulanate liquid' }, sentAt: Date.now() - 30000 },
      ];
      await addPendingReminders(reminders);

      // User clicks "Confirm" on Amoxicillin card, but confirmLatestPending confirms oldest
      const result = await confirmLatestPending();

      // BUG: This confirms Atropine (oldest), not Amoxicillin (clicked)
      expect(result.medication).toBe('Atropine 1%');

      const pending = await getPendingReminders();
      expect(pending.length).toBe(3);
      // Amoxicillin is STILL pending (not confirmed)
      expect(pending.some(r => r.medicationId === 'amox')).toBe(true);
      // Atropine was confirmed (removed)
      expect(pending.some(r => r.medicationId === 'atropine')).toBe(false);
    });
  });

  describe('confirmById (new function to fix bug)', () => {
    it('should confirm specific reminder by ID', async () => {
      const reminders = [
        { id: 'r1', medicationId: 'atropine', slot: 'MORNING', medication: { name: 'Atropine 1%' }, sentAt: Date.now() - 60000 },
        { id: 'r2', medicationId: 'pred', slot: 'MORNING', medication: { name: 'Prednisolone' }, sentAt: Date.now() - 50000 },
        { id: 'r3', medicationId: 'amox', slot: 'MORNING', medication: { name: 'Amoxicillin' }, sentAt: Date.now() - 40000 },
      ];
      await addPendingReminders(reminders);

      // Confirm Amoxicillin by ID (the one user actually clicked)
      const result = await confirmById('r3');

      expect(result.confirmed).toBe(true);
      expect(result.medication).toBe('Amoxicillin');

      const pending = await getPendingReminders();
      expect(pending.length).toBe(2);
      // Amoxicillin should be removed
      expect(pending.some(r => r.id === 'r3')).toBe(false);
      // Others should remain
      expect(pending.some(r => r.id === 'r1')).toBe(true);
      expect(pending.some(r => r.id === 'r2')).toBe(true);
    });

    it('should return error for non-existent ID', async () => {
      const reminders = [
        { id: 'r1', medicationId: 'med1', slot: 'MORNING', medication: { name: 'Med A' } },
      ];
      await addPendingReminders(reminders);

      const result = await confirmById('nonexistent');

      expect(result.confirmed).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('confirmMedication (by medicationId + slot)', () => {
    it('should confirm by medication ID and slot', async () => {
      const reminders = [
        { id: 'r1', medicationId: 'med1', slot: 'MORNING', medication: { name: 'Med A' } },
        { id: 'r2', medicationId: 'med2', slot: 'MORNING', medication: { name: 'Med B' } },
        { id: 'r3', medicationId: 'med1', slot: 'EVENING', medication: { name: 'Med A' } },
      ];
      await addPendingReminders(reminders);

      // Confirm med1 MORNING slot
      const result = await confirmMedication('med1', 'MORNING');

      expect(result.confirmed).toBe(true);

      const pending = await getPendingReminders();
      expect(pending.length).toBe(2);
      // r1 removed (med1 MORNING)
      expect(pending.some(r => r.id === 'r1')).toBe(false);
      // r2 remains (different med)
      expect(pending.some(r => r.id === 'r2')).toBe(true);
      // r3 remains (same med, different slot)
      expect(pending.some(r => r.id === 'r3')).toBe(true);
    });
  });
});
