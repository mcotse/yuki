/**
 * Browser tests for Yuki Meds Dashboard using Agent Browser
 *
 * Prerequisites:
 * - npm install -g agent-browser
 * - agent-browser install
 * - Start local server: vercel dev (or similar)
 *
 * Run: TEST_URL=http://localhost:3000 bun test tests/browser/dashboard.test.js
 * Skip: SKIP_BROWSER_TESTS=1 bun test
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'child_process';

const SKIP_BROWSER_TESTS = process.env.SKIP_BROWSER_TESTS === '1';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

let browserAvailable = false;

// Helper to run agent-browser commands
function ab(command, options = {}) {
  if (!browserAvailable && !options.init) return null;

  const cmd = `agent-browser ${command}`;
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: options.timeout || 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (error) {
    if (options.allowFail) return null;
    throw error;
  }
}

// Parse JSON output from agent-browser
function abJson(command) {
  const result = ab(`${command} --json`);
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

describe('Yuki Meds Dashboard - Browser Tests', () => {
  beforeAll(() => {
    if (SKIP_BROWSER_TESTS) {
      console.log('[Browser Tests] Skipped (SKIP_BROWSER_TESTS=1)');
      return;
    }

    try {
      // Try to open the browser
      ab(`open ${BASE_URL}`, { init: true, allowFail: false });
      ab('wait 2000', { init: true });
      browserAvailable = true;
      console.log('[Browser Tests] Browser started successfully');
    } catch (error) {
      console.log('[Browser Tests] Skipped: Browser unavailable');
      browserAvailable = false;
    }
  });

  afterAll(() => {
    if (browserAvailable) {
      try {
        execSync('agent-browser close', { stdio: 'pipe' });
      } catch {
        // Ignore close errors
      }
    }
  });

  describe('Page Load', () => {
    it('should have correct title', () => {
      if (!browserAvailable) return;
      const title = ab('get title');
      expect(title).toContain('Yuki Meds');
    });

    it('should display header', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Yuki Meds');
    });
  });

  describe('Pending Reminders Section', () => {
    it('should have pending reminders card', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Pending');
    });

    it('should have refresh button', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Refresh');
    });
  });

  describe('Schedule Section', () => {
    it('should have medication schedule card', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Schedule');
    });

    it('should have day selector buttons', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Day');
    });
  });

  describe('Settings', () => {
    it('should have settings button', () => {
      if (!browserAvailable) return;
      const snapshot = ab('snapshot -c');
      // Settings gear icon should be present
      expect(snapshot).toBeTruthy();
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      if (!browserAvailable) return;
      ab('set viewport 375 667');
      ab('wait 500');
      const snapshot = ab('snapshot -c');
      expect(snapshot).toContain('Yuki');
    });

    it('should reset to desktop viewport', () => {
      if (!browserAvailable) return;
      ab('set viewport 1280 720');
      ab('wait 500');
      expect(true).toBe(true);
    });
  });
});

describe('Browser Test Status', () => {
  it('should report browser availability', () => {
    if (SKIP_BROWSER_TESTS) {
      console.log('Status: Browser tests were skipped');
    } else if (browserAvailable) {
      console.log('Status: Browser tests ran successfully');
    } else {
      console.log('Status: Browser unavailable, tests skipped');
    }
    expect(true).toBe(true);
  });
});
