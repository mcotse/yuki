#!/usr/bin/env node
// Preview Yuki's medication schedule

import { getDaySchedule, formatSmsMessage, getMedicationsDue } from './lib/scheduler.js';
import { TIME_SLOTS, getDayNumber } from './config/medications.js';

const args = process.argv.slice(2);
const command = args[0];

function printDaySchedule(date = new Date()) {
  const schedule = getDaySchedule(date);

  console.log(`\n📅 Yuki's Medication Schedule - Day ${schedule.dayNumber}`);
  console.log(`   ${schedule.date}\n`);
  console.log('═'.repeat(50));

  const slotEmoji = {
    MORNING: '🌅',
    MIDDAY: '☀️',
    EVENING: '🌆',
    NIGHT: '🌙'
  };

  for (const [slot, data] of Object.entries(schedule.schedule)) {
    console.log(`\n${slotEmoji[slot]} ${slot} (${data.time})`);
    console.log('─'.repeat(40));

    if (data.medications.length === 0) {
      console.log('   No medications scheduled');
      continue;
    }

    // Group by location
    const byLocation = {};
    for (const med of data.medications) {
      if (!byLocation[med.location]) {
        byLocation[med.location] = [];
      }
      byLocation[med.location].push(med);
    }

    for (const [location, meds] of Object.entries(byLocation)) {
      console.log(`   ${location}:`);
      for (const med of meds) {
        console.log(`   • ${med.name} - ${med.dose}`);
        if (med.notes) {
          console.log(`     ${med.notes}`);
        }
      }
    }
  }

  console.log('\n' + '═'.repeat(50) + '\n');
}

function printSmsPreview(slot) {
  const now = new Date();
  const slotTimes = {
    MORNING: [8, 30],
    MIDDAY: [14, 0],
    EVENING: [19, 0],
    NIGHT: [0, 0]
  };

  if (slot && slotTimes[slot.toUpperCase()]) {
    const [h, m] = slotTimes[slot.toUpperCase()];
    now.setHours(h, m, 0, 0);
  }

  const dueInfo = {
    slot: slot ? slot.toUpperCase() : 'MORNING',
    slotTime: TIME_SLOTS[slot ? slot.toUpperCase() : 'MORNING'],
    dayNumber: getDayNumber(now),
    medications: []
  };

  // Get meds for that slot
  const schedule = getDaySchedule(now);
  dueInfo.medications = schedule.schedule[dueInfo.slot]?.medications || [];

  const msg = formatSmsMessage(dueInfo);

  console.log('\n📱 SMS Preview:\n');
  console.log('─'.repeat(40));
  console.log(msg || 'No medications due for this slot');
  console.log('─'.repeat(40));
  console.log(`\nCharacter count: ${msg?.length || 0}`);
}

function printHelp() {
  console.log(`
Yuki Medication Schedule Checker

Usage:
  node src/check-schedule.js [command]

Commands:
  today       Show today's full schedule (default)
  tomorrow    Show tomorrow's schedule
  day <n>     Show schedule for day N since surgery
  sms <slot>  Preview SMS for a specific slot
              (morning, midday, evening, night)
  now         Show what's due right now

Examples:
  node src/check-schedule.js today
  node src/check-schedule.js day 3
  node src/check-schedule.js sms morning
  `);
}

// Main
switch (command) {
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;

  case 'tomorrow': {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    printDaySchedule(tomorrow);
    break;
  }

  case 'day': {
    const dayNum = parseInt(args[1], 10);
    if (isNaN(dayNum) || dayNum < 1) {
      console.error('Please specify a valid day number (e.g., "day 3")');
      process.exit(1);
    }
    // Use noon to avoid timezone issues
    const date = new Date('2026-01-12T12:00:00-08:00');
    date.setDate(date.getDate() + dayNum - 1);
    printDaySchedule(date);
    break;
  }

  case 'sms':
    printSmsPreview(args[1] || 'morning');
    break;

  case 'now': {
    const dueInfo = getMedicationsDue();
    if (!dueInfo.slot) {
      console.log('\n⏰ No medication slot active right now.');
      console.log('   Next slots: 8:30 AM, 2:00 PM, 7:00 PM, 12:00 AM\n');
    } else {
      console.log(`\n⏰ Current slot: ${dueInfo.slot} (${dueInfo.slotTime})`);
      console.log(`   Day ${dueInfo.dayNumber} since surgery\n`);
      const msg = formatSmsMessage(dueInfo);
      console.log(msg);
    }
    break;
  }

  case 'today':
  default:
    printDaySchedule();
    break;
}
