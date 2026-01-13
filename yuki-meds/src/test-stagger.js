import { getMedicationsForSlot } from './lib/scheduler.js';

const meds = getMedicationsForSlot('MORNING');
const byLocation = {};
for (const med of meds) {
  if (!byLocation[med.location]) byLocation[med.location] = [];
  byLocation[med.location].push(med);
}

console.log('\n🌅 MORNING Staggered Schedule:\n');

const locationOrder = ['LEFT eye', 'RIGHT eye', 'ORAL'];
let staggerIndex = 0;

for (const location of locationOrder) {
  const locMeds = byLocation[location] || [];
  for (const med of locMeds) {
    const isEyeDrop = location.includes('eye');
    const baseMinutes = 8 * 60 + 30;
    const offsetMinutes = isEyeDrop ? staggerIndex * 6 : 0;
    const totalMin = baseMinutes + offsetMinutes;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const time = displayHours + ':' + String(mins).padStart(2, '0') + ' ' + period;

    console.log(`${time} - ${med.name} (${location})`);
    if (isEyeDrop) staggerIndex++;
  }
}
