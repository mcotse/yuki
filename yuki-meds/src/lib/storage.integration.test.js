// Integration tests that simulate the exact bug scenario
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getPendingReminders,
  addPendingReminders,
  confirmById,
  confirmLatestPending,
  clearPending
} from './storage.js';

describe('Bug Fix: Confirm specific medication from dashboard', () => {
  beforeEach(async () => {
    await clearPending();
  });

  it('SCENARIO: User sees 4 pending meds, clicks Confirm on Amoxicillin, expects Amoxicillin to be confirmed', async () => {
    // Setup: Add 4 medications in the order they would appear
    const reminders = [
      { id: 'r1', medicationId: 'atropine', slot: 'MORNING', medication: { name: 'Atropine 1%', location: 'LEFT eye', dose: '1 drop' }, sentAt: Date.now() - 60000 },
      { id: 'r2', medicationId: 'pred', slot: 'MORNING', medication: { name: 'Prednisolone acetate 1%', location: 'RIGHT eye', dose: '1 drop' }, sentAt: Date.now() - 54000 },
      { id: 'r3', medicationId: 'tacro', slot: 'MORNING', medication: { name: 'Tacrolimus 0.03% + Cyclosporine 2%', location: 'RIGHT eye', dose: '1 drop' }, sentAt: Date.now() - 48000 },
      { id: 'r4', medicationId: 'amox', slot: 'MORNING', medication: { name: 'Amoxicillin/Clavulanate liquid', location: 'ORAL', dose: '1 mL' }, sentAt: Date.now() - 42000 },
    ];
    await addPendingReminders(reminders);

    // Verify setup
    let pending = await getPendingReminders();
    expect(pending.length).toBe(4);
    console.log('\n=== BEFORE: 4 pending medications ===');
    pending.forEach((r, i) => console.log(`  ${i+1}. ${r.medication.name} (id: ${r.id})`));

    // ACTION: User clicks Confirm on Amoxicillin card (id: r4)
    console.log('\n=== ACTION: User clicks Confirm on Amoxicillin ===');
    const result = await confirmById('r4');

    // EXPECTED: Amoxicillin should be confirmed
    console.log(`  Result: ${result.medication} was confirmed`);
    expect(result.confirmed).toBe(true);
    expect(result.medication).toBe('Amoxicillin/Clavulanate liquid');

    // Verify remaining medications
    pending = await getPendingReminders();
    console.log('\n=== AFTER: 3 pending medications ===');
    pending.forEach((r, i) => console.log(`  ${i+1}. ${r.medication.name} (id: ${r.id})`));

    expect(pending.length).toBe(3);

    // Amoxicillin should be GONE
    expect(pending.some(r => r.id === 'r4')).toBe(false);

    // Other 3 should still be there
    expect(pending.some(r => r.id === 'r1')).toBe(true); // Atropine
    expect(pending.some(r => r.id === 'r2')).toBe(true); // Prednisolone
    expect(pending.some(r => r.id === 'r3')).toBe(true); // Tacrolimus

    console.log('\n✅ TEST PASSED: Amoxicillin was correctly confirmed, others remain pending');
  });

  it('BUG DEMO: Old confirmLatestPending() would confirm wrong medication', async () => {
    // Same setup
    const reminders = [
      { id: 'r1', medicationId: 'atropine', slot: 'MORNING', medication: { name: 'Atropine 1%' }, sentAt: Date.now() - 60000 },
      { id: 'r2', medicationId: 'pred', slot: 'MORNING', medication: { name: 'Prednisolone acetate 1%' }, sentAt: Date.now() - 54000 },
      { id: 'r3', medicationId: 'amox', slot: 'MORNING', medication: { name: 'Amoxicillin/Clavulanate liquid' }, sentAt: Date.now() - 48000 },
    ];
    await addPendingReminders(reminders);

    console.log('\n=== BUG DEMO: confirmLatestPending() behavior ===');
    console.log('User wants to confirm Amoxicillin, but API confirms oldest...');

    // This is what the OLD code did - always confirm oldest
    const result = await confirmLatestPending();

    console.log(`  Result: ${result.medication} was confirmed (not what user clicked!)`);

    // Atropine gets confirmed instead of Amoxicillin
    expect(result.medication).toBe('Atropine 1%');

    const pending = await getPendingReminders();
    // Amoxicillin is still there!
    expect(pending.some(r => r.medicationId === 'amox')).toBe(true);

    console.log('  ⚠️ Amoxicillin is still pending - this was the bug!');
  });
});
