'use strict';

/**
 * Tests for utils/phoneNormalize.js and related matching logic.
 * Uses Node.js built-in test runner (node:test) — no extra deps required.
 *
 * Run: node --test utils/phoneNormalize.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRussianPhone } = require('./phoneNormalize');

// ── normalizeRussianPhone: canonical inputs ────────────────────────────────

test('+75551234567 → +75551234567', () => {
  assert.equal(normalizeRussianPhone('+75551234567'), '+75551234567');
});

test('75551234567 → +75551234567', () => {
  assert.equal(normalizeRussianPhone('75551234567'), '+75551234567');
});

test('85551234567 → +75551234567', () => {
  assert.equal(normalizeRussianPhone('85551234567'), '+75551234567');
});

test('8 (555) 123-45-67 → +75551234567', () => {
  assert.equal(normalizeRussianPhone('8 (555) 123-45-67'), '+75551234567');
});

test('+7 555 123 45 67 → +75551234567', () => {
  assert.equal(normalizeRussianPhone('+7 555 123 45 67'), '+75551234567');
});

// ── normalizeRussianPhone: edge cases ─────────────────────────────────────

test('leading/trailing whitespace trimmed', () => {
  assert.equal(normalizeRussianPhone('  +75551234567  '), '+75551234567');
});

test('null input → null', () => {
  assert.equal(normalizeRussianPhone(null), null);
});

test('undefined input → null', () => {
  assert.equal(normalizeRussianPhone(undefined), null);
});

test('empty string → null', () => {
  assert.equal(normalizeRussianPhone(''), null);
});

test('too short number → null', () => {
  assert.equal(normalizeRussianPhone('12345'), null);
});

test('non-Russian 10-digit → null', () => {
  assert.equal(normalizeRussianPhone('5551234567'), null);
});

test('garbage string → null', () => {
  assert.equal(normalizeRussianPhone('not-a-phone'), null);
});

test('+1 US number → null', () => {
  assert.equal(normalizeRussianPhone('+12025551234'), null);
});

// ── idempotency: double normalization ─────────────────────────────────────

test('normalizing an already-canonical +7 number is idempotent', () => {
  const once = normalizeRussianPhone('85551234567');
  assert.equal(normalizeRussianPhone(once), once);
});

// ── duplicate +7/8 registration resolves to same parent ──────────────────

test('+7 and 8 forms normalize to the same value (no duplicate registrations)', () => {
  const a = normalizeRussianPhone('+75551234567');
  const b = normalizeRussianPhone('85551234567');
  assert.equal(a, b);
  assert.equal(a, '+75551234567');
});

test('7 (bare) and 8 forms normalize to the same value', () => {
  const a = normalizeRussianPhone('75551234567');
  const b = normalizeRussianPhone('85551234567');
  assert.equal(a, b);
});

// ── notification matching: parent stored as +7, bot entry as 8 ───────────

test('notification matching: parent stored as +7, lookup by 8 form finds match', () => {
  // Simulate users map as stored by the bot after registration
  const users = {
    '111111111': { phone: '+75551234567', parentFullName: 'Иванова Анна', parentName: 'Анна' },
    '222222222': { phone: '+74991112233', parentFullName: 'Петров Иван', parentName: 'Иван' },
  };

  function findParentByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = normalizeRussianPhone(phone);
    if (!normalizedPhone) return null;
    for (const [chatId, user] of Object.entries(users)) {
      const userPhone = normalizeRussianPhone(user.phone);
      if (!userPhone) continue;
      if (userPhone === normalizedPhone) {
        return { chatId, parentName: user.parentFullName || user.parentName };
      }
    }
    return null;
  }

  // Excel/1C stored as 8 form — should find the +7 parent
  const result = findParentByPhone('85551234567');
  assert.ok(result, 'Parent should be found');
  assert.equal(result.chatId, '111111111');
  assert.equal(result.parentName, 'Иванова Анна');
});

test('notification matching: parent stored as 8-form (legacy), lookup by +7 finds match', () => {
  // Legacy data: registered with 8 prefix, stored as 85551234567 (old bot behavior)
  // After fix: registration always stores +7; this tests lookup from either side
  const users = {
    '333333333': { phone: '85551234567', parentFullName: 'Сидорова Мария', parentName: 'Мария' },
  };

  function findParentByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = normalizeRussianPhone(phone);
    if (!normalizedPhone) return null;
    for (const [chatId, user] of Object.entries(users)) {
      const userPhone = normalizeRussianPhone(user.phone);
      if (!userPhone) continue;
      if (userPhone === normalizedPhone) {
        return { chatId, parentName: user.parentFullName || user.parentName };
      }
    }
    return null;
  }

  // Even if stored as 8-form legacy, lookup by +7 should succeed
  const result = findParentByPhone('+75551234567');
  assert.ok(result, 'Legacy 8-form parent should be found by +7 lookup');
  assert.equal(result.chatId, '333333333');
});

test('notification matching: no false match for unrelated number', () => {
  const users = {
    '444444444': { phone: '+75551234567', parentFullName: 'Козлов Дмитрий', parentName: 'Дмитрий' },
  };

  function findParentByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = normalizeRussianPhone(phone);
    if (!normalizedPhone) return null;
    for (const [chatId, user] of Object.entries(users)) {
      const userPhone = normalizeRussianPhone(user.phone);
      if (!userPhone) continue;
      if (userPhone === normalizedPhone) {
        return { chatId, parentName: user.parentFullName || user.parentName };
      }
    }
    return null;
  }

  assert.equal(findParentByPhone('89991112233'), null);
});

test('invalid phone in lookup returns null safely', () => {
  const users = {
    '555555555': { phone: '+75551234567', parentFullName: 'Тест', parentName: 'Тест' },
  };

  function findParentByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = normalizeRussianPhone(phone);
    if (!normalizedPhone) return null;
    for (const [chatId, user] of Object.entries(users)) {
      const userPhone = normalizeRussianPhone(user.phone);
      if (!userPhone) continue;
      if (userPhone === normalizedPhone) {
        return { chatId };
      }
    }
    return null;
  }

  assert.equal(findParentByPhone('invalid'), null);
  assert.equal(findParentByPhone(''), null);
  assert.equal(findParentByPhone(null), null);
});
