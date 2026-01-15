// Yuki's medication schedule after corneal laceration repair
// Surgery date: January 12, 2026

// Use noon PST to avoid timezone issues
export const SURGERY_DATE = new Date('2026-01-12T12:00:00-08:00');

// Time slots for medication reminders (in 24h format)
export const TIME_SLOTS = {
  MORNING: '08:30',
  LATE_MORNING: '11:00',
  MIDDAY: '14:00',
  EVENING: '19:00',
  LATE_NIGHT: '23:00',
  NIGHT: '00:00'
};

// Frequency mapping to time slots
export const FREQUENCY_SLOTS = {
  '4x_daily': ['MORNING', 'MIDDAY', 'EVENING', 'NIGHT'],
  '2x_daily': ['MORNING', 'EVENING'],
  '1x_daily': ['MORNING'],
  '12h': ['MORNING', 'EVENING'],
  '12h_11': ['LATE_MORNING', 'LATE_NIGHT']  // 11 AM and 11 PM
};

export const medications = {
  // ===== LEFT EYE (post-surgery) =====
  leftEye: [
    {
      id: 'ofloxacin',
      name: 'Ofloxacin 0.3%',
      dose: '1 drop',
      frequency: '4x_daily',
      location: 'LEFT eye',
      notes: null,
      startDate: SURGERY_DATE,
      endDate: null, // until recheck
      active: true
    },
    {
      id: 'plasma',
      name: 'Homologous plasma',
      dose: '1 drop',
      frequency: '4x_daily',
      location: 'LEFT eye',
      notes: '❄️ Refrigerated',
      startDate: SURGERY_DATE,
      endDate: null,
      active: true
    },
    {
      id: 'amniotic',
      name: 'Amniotic eye drops',
      dose: '1 drop',
      frequency: '2x_daily',
      location: 'LEFT eye',
      notes: '❄️ Refrigerated',
      startDate: SURGERY_DATE,
      endDate: null,
      active: true
    },
    {
      id: 'atropine',
      name: 'Atropine 1%',
      dose: '1 drop',
      frequency: 'tapering', // special handling
      location: 'LEFT eye',
      notes: '⚠️ May cause drooling',
      startDate: SURGERY_DATE,
      endDate: null,
      active: true,
      tapering: {
        // Day 1: 3x daily (morning, midday, evening)
        // Day 2: 2x daily (morning, evening)
        // Day 3+: 1x daily (morning)
        day1: ['MORNING', 'MIDDAY', 'EVENING'],
        day2: ['MORNING', 'EVENING'],
        day3plus: ['MORNING']
      }
    }
  ],

  // ===== RIGHT EYE (chronic/long-term) =====
  rightEye: [
    {
      id: 'prednisolone-eye',
      name: 'Prednisolone acetate 1%',
      dose: '1 drop',
      frequency: '2x_daily',
      location: 'RIGHT eye',
      notes: '🛑 If squinting, STOP & call vet (650-551-1115)',
      startDate: SURGERY_DATE,
      endDate: null, // lifelong for this condition
      active: true
    },
    {
      id: 'tacrolimus-cyclosporine',
      name: 'Tacrolimus 0.03% + Cyclosporine 2%',
      dose: '1 drop',
      frequency: '2x_daily',
      location: 'RIGHT eye',
      notes: '🧤 Wash hands after. 🔁 Lifelong med',
      startDate: SURGERY_DATE,
      endDate: null,
      active: true
    }
  ],

  // ===== ORAL MEDICATIONS =====
  oral: [
    {
      id: 'prednisolone-oral',
      name: 'Prednisolone 5mg tablet',
      dose: '½ tablet',
      frequency: '1x_daily',
      location: 'ORAL',
      notes: '⚠️ Do NOT stop abruptly. May increase hunger/thirst/urination',
      startDate: new Date('2026-01-15T12:00:00-08:00'), // Wednesday
      endDate: null,
      active: true
    },
    {
      id: 'amoxicillin',
      name: 'Amoxicillin/Clavulanate liquid',
      dose: '1 mL',
      frequency: '12h',
      location: 'ORAL',
      notes: '🍽️ Give with food. ❄️ Refrigerate',
      startDate: new Date('2026-01-13T12:00:00-08:00'), // tomorrow
      endDate: null, // continue until finished
      active: true
    },
    {
      id: 'gabapentin',
      name: 'Gabapentin 50mg',
      dose: '1 tablet',
      frequency: '12h_11',
      location: 'ORAL',
      notes: '💊 For pain. May cause sedation',
      startDate: SURGERY_DATE,
      endDate: null,
      active: true
    }
  ]
};

// Medication dependencies - eye drops on same eye need 5 minute spacing
// This allows each drop to absorb before applying the next
export const MEDICATION_DEPENDENCIES = {
  // Spacing in minutes required between conflicting medications
  spacingMinutes: 5,

  // Groups of medications that conflict with each other (same eye)
  conflictGroups: {
    leftEye: ['ofloxacin', 'plasma', 'amniotic', 'atropine'],
    rightEye: ['prednisolone-eye', 'tacrolimus-cyclosporine']
  }
};

// Get medications that conflict with a given medication
export function getConflictingMeds(medicationId) {
  for (const [group, meds] of Object.entries(MEDICATION_DEPENDENCIES.conflictGroups)) {
    if (meds.includes(medicationId)) {
      // Return all other meds in the same group
      return meds.filter(m => m !== medicationId);
    }
  }
  return [];
}

// Helper to get all medications as flat array
export function getAllMedications() {
  return [
    ...medications.leftEye,
    ...medications.rightEye,
    ...medications.oral
  ];
}

// Get day number since surgery (1-indexed)
export function getDayNumber(date = new Date()) {
  // Normalize both dates to just their date components in local time
  const surgeryYear = 2026;
  const surgeryMonth = 0; // January
  const surgeryDay = 12;

  const checkDate = new Date(date);
  const checkYear = checkDate.getFullYear();
  const checkMonth = checkDate.getMonth();
  const checkDay = checkDate.getDate();

  // Create dates at noon to avoid DST issues
  const surgeryNoon = new Date(surgeryYear, surgeryMonth, surgeryDay, 12, 0, 0);
  const checkNoon = new Date(checkYear, checkMonth, checkDay, 12, 0, 0);

  const diffTime = checkNoon - surgeryNoon;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  return diffDays + 1; // Day 1 is surgery day
}

// Get Atropine schedule for current day
export function getAtropineSlots(date = new Date()) {
  const dayNum = getDayNumber(date);
  const atropine = medications.leftEye.find(m => m.id === 'atropine');

  if (dayNum === 1) return atropine.tapering.day1;
  if (dayNum === 2) return atropine.tapering.day2;
  return atropine.tapering.day3plus;
}
