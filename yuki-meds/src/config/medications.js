// Yuki's medication schedule after corneal laceration repair
// Surgery date: January 12, 2026
//
// Now loading from medications.json for easier editing

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file directory (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for loaded config
let medicationConfig = null;

/**
 * Load and parse medication configuration from JSON file
 * @returns {Object} Parsed medication configuration
 */
function loadMedicationConfig() {
  if (medicationConfig) {
    return medicationConfig;
  }

  try {
    const configPath = join(__dirname, 'medications.json');
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);

    // Validate the configuration
    validateMedicationConfig(config);

    // Convert date strings to Date objects
    config.surgeryDateObj = new Date(config.surgeryDate);

    // Convert medication dates to Date objects
    for (const category of ['leftEye', 'rightEye', 'oral']) {
      for (const med of config.medications[category]) {
        if (med.startDate) {
          med.startDate = new Date(med.startDate);
        }
        if (med.endDate) {
          med.endDate = new Date(med.endDate);
        }
      }
    }

    medicationConfig = config;
    return config;
  } catch (error) {
    console.error('Failed to load medication configuration:', error.message);
    throw new Error(`Medication config error: ${error.message}`);
  }
}

/**
 * Validate medication configuration structure and values
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If configuration is invalid
 */
function validateMedicationConfig(config) {
  // Check required fields
  if (!config.surgeryDate) {
    throw new Error('surgeryDate is required');
  }
  if (!config.timeSlots) {
    throw new Error('timeSlots is required');
  }
  if (!config.frequencySlots) {
    throw new Error('frequencySlots is required');
  }
  if (!config.medications) {
    throw new Error('medications is required');
  }

  // Validate surgery date is parseable
  const surgeryDate = new Date(config.surgeryDate);
  if (isNaN(surgeryDate.getTime())) {
    throw new Error(`Invalid surgeryDate: ${config.surgeryDate}`);
  }

  // Validate time slots format (HH:MM)
  for (const [slot, time] of Object.entries(config.timeSlots)) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new Error(`Invalid time format for ${slot}: ${time} (expected HH:MM)`);
    }
  }

  // Validate frequency slots reference valid time slots
  const validSlots = Object.keys(config.timeSlots);
  for (const [freq, slots] of Object.entries(config.frequencySlots)) {
    if (!Array.isArray(slots)) {
      throw new Error(`Frequency ${freq} slots must be an array`);
    }
    for (const slot of slots) {
      if (!validSlots.includes(slot)) {
        throw new Error(`Invalid slot '${slot}' in frequency '${freq}' (valid: ${validSlots.join(', ')})`);
      }
    }
  }

  // Validate medications
  const validFrequencies = [...Object.keys(config.frequencySlots), 'tapering'];
  for (const category of ['leftEye', 'rightEye', 'oral']) {
    if (!config.medications[category]) {
      throw new Error(`medications.${category} is required`);
    }
    if (!Array.isArray(config.medications[category])) {
      throw new Error(`medications.${category} must be an array`);
    }

    for (const med of config.medications[category]) {
      // Required fields
      if (!med.id) throw new Error(`Medication missing 'id' field`);
      if (!med.name) throw new Error(`Medication ${med.id} missing 'name' field`);
      if (!med.frequency) throw new Error(`Medication ${med.id} missing 'frequency' field`);

      // Validate frequency
      if (!validFrequencies.includes(med.frequency)) {
        throw new Error(`Invalid frequency '${med.frequency}' for ${med.id} (valid: ${validFrequencies.join(', ')})`);
      }

      // Validate startDate if present
      if (med.startDate) {
        const startDate = new Date(med.startDate);
        if (isNaN(startDate.getTime())) {
          throw new Error(`Invalid startDate for ${med.id}: ${med.startDate}`);
        }
      }

      // Validate endDate if present
      if (med.endDate) {
        const endDate = new Date(med.endDate);
        if (isNaN(endDate.getTime())) {
          throw new Error(`Invalid endDate for ${med.id}: ${med.endDate}`);
        }
      }
    }
  }

  return true;
}

// ===== EXPORTED VALUES =====

export const SURGERY_DATE = (() => {
  const config = loadMedicationConfig();
  return config.surgeryDateObj;
})();

export const TIME_SLOTS = (() => {
  const config = loadMedicationConfig();
  return config.timeSlots;
})();

export const FREQUENCY_SLOTS = (() => {
  const config = loadMedicationConfig();
  return config.frequencySlots;
})();

export const medications = (() => {
  const config = loadMedicationConfig();
  return config.medications;
})();

export const MEDICATION_DEPENDENCIES = (() => {
  const config = loadMedicationConfig();
  return config.medicationDependencies;
})();

// ===== HELPER FUNCTIONS =====

/**
 * Get medications that conflict with a given medication (same eye)
 * @param {string} medicationId - Medication ID to check
 * @returns {string[]} Array of conflicting medication IDs
 */
export function getConflictingMeds(medicationId) {
  const deps = MEDICATION_DEPENDENCIES;
  for (const [group, meds] of Object.entries(deps.conflictGroups)) {
    if (meds.includes(medicationId)) {
      // Return all other meds in the same group
      return meds.filter(m => m !== medicationId);
    }
  }
  return [];
}

/**
 * Get all medications as a flat array
 * @returns {Object[]} Array of all medication objects
 */
export function getAllMedications() {
  return [
    ...medications.leftEye,
    ...medications.rightEye,
    ...medications.oral
  ];
}

/**
 * Get day number since surgery (1-indexed)
 * @param {Date} date - Date to check (defaults to today)
 * @returns {number} Day number (1 = surgery day)
 */
export function getDayNumber(date = new Date()) {
  // Normalize both dates to just their date components in local time
  const surgeryYear = SURGERY_DATE.getFullYear();
  const surgeryMonth = SURGERY_DATE.getMonth();
  const surgeryDay = SURGERY_DATE.getDate();

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

/**
 * Get Atropine schedule for current day (tapering)
 * @param {Date} date - Date to check (defaults to today)
 * @returns {string[]} Array of time slot names for Atropine
 */
export function getAtropineSlots(date = new Date()) {
  const dayNum = getDayNumber(date);
  const atropine = medications.leftEye.find(m => m.id === 'atropine');

  if (!atropine || !atropine.tapering) {
    return [];
  }

  if (dayNum === 1) return atropine.tapering.day1;
  if (dayNum === 2) return atropine.tapering.day2;
  return atropine.tapering.day3plus;
}

/**
 * Reload configuration from disk (clears cache)
 * Useful for development or when JSON file is updated
 */
export function reloadConfig() {
  medicationConfig = null;
  return loadMedicationConfig();
}
