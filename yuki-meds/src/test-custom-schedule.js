#!/usr/bin/env node
// Test custom schedule functionality

import { getMedicationSchedule } from './lib/storage.js';
import { isMedicationDue } from './lib/scheduler.js';
import { getAllMedications } from './config/medications.js';

console.log('🧪 Testing Custom Schedule Functionality\n');
console.log('═'.repeat(50));

async function testCustomSchedules() {
  const allMeds = getAllMedications();

  console.log('\n📋 Checking for custom schedules in Redis:\n');

  let foundCustomSchedules = false;

  for (const med of allMeds) {
    const customSchedule = await getMedicationSchedule(med.id);

    if (customSchedule) {
      foundCustomSchedules = true;
      console.log(`✅ ${med.name} (${med.id})`);
      console.log(`   Default: ${med.frequency}`);
      console.log(`   Custom:  ${customSchedule.frequency || 'not changed'}`);
      console.log(`   Active:  ${customSchedule.active !== undefined ? customSchedule.active : 'default (true)'}`);
      console.log('');
    }
  }

  if (!foundCustomSchedules) {
    console.log('ℹ️  No custom schedules found in Redis');
    console.log('   (This is expected if you haven\'t edited any schedules in the dashboard)');
  }

  console.log('\n═'.repeat(50));
  console.log('\n🔍 Testing isMedicationDue() with custom schedules:\n');

  // Test Ofloxacin (default is 4x daily: MORNING, MIDDAY, EVENING, LATE_NIGHT)
  const ofloxacin = allMeds.find(m => m.id === 'ofloxacin');

  if (ofloxacin) {
    console.log(`Testing: ${ofloxacin.name}`);
    console.log(`Default frequency: ${ofloxacin.frequency} (4x daily)\n`);

    const slots = ['MORNING', 'LATE_MORNING', 'MIDDAY', 'EVENING', 'LATE_NIGHT', 'NIGHT'];

    for (const slot of slots) {
      const isDue = await isMedicationDue(ofloxacin, slot);
      const expected = ['MORNING', 'MIDDAY', 'EVENING', 'LATE_NIGHT'].includes(slot);
      const icon = isDue ? '✅' : '❌';
      const expectIcon = isDue === expected ? '✓' : '⚠️';

      console.log(`${icon} ${slot.padEnd(15)} - ${isDue ? 'DUE' : 'NOT DUE'} ${expectIcon}`);
    }

    console.log('\n💡 If you edit Ofloxacin to 2x daily in the dashboard,');
    console.log('   only MORNING and EVENING should show as DUE.');
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Test complete!');
  console.log('\n📝 To test custom schedules:');
  console.log('   1. Open dashboard and edit a medication frequency');
  console.log('   2. Run this script again to see the custom schedule');
  console.log('   3. Check that isMedicationDue() respects the custom frequency\n');
}

testCustomSchedules().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
