#!/usr/bin/env node
// Test Twilio WhatsApp integration

import 'dotenv/config';
import { sendWhatsApp } from './lib/twilio.js';
import { getIndividualReminders, getMedicationsForSlot } from './lib/scheduler.js';
import { getDayNumber } from './config/medications.js';
import { addPendingReminders, getPendingReminders, confirmLatestPending, clearPending } from './lib/storage.js';

const args = process.argv.slice(2);
const command = args[0];

async function sendTestMessage() {
  console.log('📤 Sending test WhatsApp...\n');

  try {
    const result = await sendWhatsApp('🐕 Test from Yuki Meds! If you receive this, WhatsApp reminders are working.');
    console.log('✅ WhatsApp sent successfully!');
    console.log(`   SID: ${result.sid}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   To: ${result.to}`);
  } catch (error) {
    console.error('❌ Failed to send WhatsApp:', error.message);
    process.exit(1);
  }
}

async function sendIndividualReminders(slot) {
  const slotUpper = slot.toUpperCase();
  const meds = getMedicationsForSlot(slotUpper);

  if (meds.length === 0) {
    console.log(`No medications scheduled for ${slot}`);
    return;
  }

  console.log(`📤 Sending ${meds.length} individual reminders for ${slot}...\n`);

  // Generate staggered reminders
  const dayNumber = getDayNumber(new Date());
  const byLocation = {};
  for (const med of meds) {
    if (!byLocation[med.location]) byLocation[med.location] = [];
    byLocation[med.location].push(med);
  }

  const locationOrder = ['LEFT eye', 'RIGHT eye', 'ORAL'];
  let staggerIndex = 0;
  const reminders = [];

  for (const location of locationOrder) {
    const locMeds = byLocation[location] || [];
    for (const med of locMeds) {
      const isEyeDrop = location.includes('eye');
      const baseMinutes = {
        MORNING: 8 * 60 + 30,
        MIDDAY: 14 * 60,
        EVENING: 19 * 60,
        NIGHT: 0
      }[slotUpper];

      const offsetMinutes = isEyeDrop ? staggerIndex * 6 : 0;
      const totalMin = baseMinutes + offsetMinutes;
      const hours = Math.floor(totalMin / 60) % 24;
      const mins = totalMin % 60;
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const timeStr = `${displayHours}:${String(mins).padStart(2, '0')} ${period}`;

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

      reminders.push({
        id: `${slotUpper}-${med.id}-${Date.now()}`,
        medicationId: med.id,
        medication: med,
        slot: slotUpper,
        dayNumber,
        scheduledTime: timeStr,
        message: msg,
        confirmed: false,
        sentAt: null
      });

      if (isEyeDrop) staggerIndex++;
    }
  }

  // Send each reminder
  for (const reminder of reminders) {
    console.log(`─────────────────────────────────`);
    console.log(`${reminder.scheduledTime} - ${reminder.medication.name}`);
    console.log(`─────────────────────────────────`);

    try {
      const result = await sendWhatsApp(reminder.message);
      reminder.sentAt = Date.now();
      console.log(`✅ Sent (SID: ${result.sid})\n`);
    } catch (error) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Store as pending
  await addPendingReminders(reminders);
  console.log(`\n📋 ${reminders.length} reminders stored as pending`);
}

async function showPending() {
  const pending = await getPendingReminders();
  console.log(`\n📋 Pending Reminders: ${pending.length}\n`);

  if (pending.length === 0) {
    console.log('   No pending reminders');
    return;
  }

  for (const r of pending) {
    const age = r.sentAt ? Math.round((Date.now() - r.sentAt) / 60000) : 0;
    console.log(`   • ${r.medication.name} (${r.scheduledTime}) - sent ${age}m ago`);
  }
}

async function confirmNext() {
  const result = await confirmLatestPending();
  if (result.confirmed) {
    console.log(`\n✅ Confirmed: ${result.medication}`);
    console.log(`   Remaining: ${result.remaining}`);
  } else {
    console.log(`\n${result.message}`);
  }
}

// Main
switch (command) {
  case 'ping':
    await sendTestMessage();
    break;

  case 'morning':
  case 'midday':
  case 'evening':
  case 'night':
    await sendIndividualReminders(command);
    break;

  case 'pending':
    await showPending();
    break;

  case 'confirm':
    await confirmNext();
    break;

  case 'clear':
    await clearPending();
    console.log('✅ Cleared all pending reminders');
    break;

  default:
    console.log(`
Yuki Meds WhatsApp Tester

Usage:
  bun src/test-sms.js ping              Send a test message
  bun src/test-sms.js morning           Send morning reminders (individual)
  bun src/test-sms.js midday            Send midday reminders
  bun src/test-sms.js evening           Send evening reminders
  bun src/test-sms.js night             Send night reminders
  bun src/test-sms.js pending           Show pending reminders
  bun src/test-sms.js confirm           Confirm latest pending
  bun src/test-sms.js clear             Clear all pending

Required env vars:
  TWILIO_ACCOUNT_SID    Your Twilio account SID
  TWILIO_AUTH_TOKEN     Your Twilio auth token
  TWILIO_TO_NUMBER      Your phone number (joined WhatsApp sandbox)
    `);
}
