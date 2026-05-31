'use strict';

/**
 * Tests for utils/kvantigramClient.js
 * Uses Node.js built-in test runner (node:test) — no extra deps required.
 *
 * Run: node --test utils/kvantigramClient.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const CLIENT_PATH = path.resolve(__dirname, 'kvantigramClient.js');
const LOGGER_PATH = path.resolve(__dirname, 'logger.js');

// ── Helpers ───────────────────────────────────────────────────────────────

let logEntries = [];
const mockLogger = {
  info: (tag, msg) => logEntries.push({ level: 'info', tag, msg }),
  warn: (tag, msg) => logEntries.push({ level: 'warn', tag, msg }),
};

// Inject mock logger once (stable across reloads because we overwrite the
// cache entry, not the object reference)
function injectLogger() {
  require.cache[LOGGER_PATH] = {
    id: LOGGER_PATH,
    filename: LOGGER_PATH,
    loaded: true,
    exports: mockLogger,
  };
}

/**
 * Load (or re-load) the client with specific env vars and an optional axios mock.
 * Returns the fresh module exports.
 */
function loadClient({ baseUrl = '', token = '', axiosMock = null } = {}) {
  // Purge previously cached client so constants are re-evaluated
  delete require.cache[CLIENT_PATH];

  // Inject axios stub if provided
  if (axiosMock !== null) {
    const axiosPath = require.resolve('axios');
    require.cache[axiosPath] = {
      id: axiosPath,
      filename: axiosPath,
      loaded: true,
      exports: axiosMock,
    };
  }

  // Set env vars BEFORE requiring (constants read at module load)
  process.env.KVANTIGRAM_INTEGRATION_URL      = baseUrl;
  process.env.KVANTIGRAM_BOT_INTEGRATION_TOKEN = token;

  injectLogger();
  const client = require(CLIENT_PATH);

  // Clear log spy for the next test
  logEntries = [];

  return client;
}

const FAKE_URL   = 'http://localhost:19999';
const FAKE_TOKEN = 'test-token-kvclient-00001';

// ── isEnabled ─────────────────────────────────────────────────────────────

test('isEnabled() → false when env vars are empty', () => {
  const client = loadClient({ baseUrl: '', token: '' });
  assert.equal(client.isEnabled(), false);
});

test('isEnabled() → false when only URL is set', () => {
  const client = loadClient({ baseUrl: FAKE_URL, token: '' });
  assert.equal(client.isEnabled(), false);
});

test('isEnabled() → false when only TOKEN is set', () => {
  const client = loadClient({ baseUrl: '', token: FAKE_TOKEN });
  assert.equal(client.isEnabled(), false);
});

test('isEnabled() → true when both env vars are set', () => {
  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN });
  assert.equal(client.isEnabled(), true);
});

// ── sendByPhone: disabled ─────────────────────────────────────────────────

test('sendByPhone() returns disabled when env not set', async () => {
  const client = loadClient({ baseUrl: '', token: '' });
  const result = await client.sendByPhone({ phone: '+79001234567', text: 'hi' });
  assert.deepEqual(result, { sent: false, reason: 'disabled' });
});

// ── sendByPhone: 201 delivered ────────────────────────────────────────────

test('sendByPhone() → delivered:true on HTTP 201', async () => {
  const axiosMock = {
    post: async () => ({
      status: 201,
      data: { ok: true, delivered: true, messageId: 'msg-abc', chatId: 'chat-xyz', idempotent: false },
    }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({ phone: '+79001234567', text: 'check-in' });

  assert.equal(result.sent, true);
  assert.equal(result.delivered, true);
  assert.equal(result.messageId, 'msg-abc');
  assert.equal(result.chatId, 'chat-xyz');
  assert.equal(result.idempotent, false);
});

test('sendByPhone() logs KVANTIGRAM info on delivery', async () => {
  const axiosMock = {
    post: async () => ({
      status: 201,
      data: { ok: true, delivered: true, messageId: 'm1', chatId: 'c1', idempotent: false },
    }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  logEntries = [];
  await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  const infoLog = logEntries.find(e => e.level === 'info' && e.tag === 'KVANTIGRAM');
  assert.ok(infoLog, 'expected KVANTIGRAM info log on delivery');
});

// ── sendByPhone: 200 delivered:false (no account) ─────────────────────────

test('sendByPhone() → delivered:false on 200+delivered:false', async () => {
  const axiosMock = {
    post: async () => ({
      status: 200,
      data: { ok: true, delivered: false, reason: 'no_kvantigram_account' },
    }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({ phone: '+79009990000', text: 'hi' });

  assert.equal(result.sent, true);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'no_kvantigram_account');
});

// ── sendByPhone: idempotent duplicate ─────────────────────────────────────

test('sendByPhone() → idempotent:true on duplicate externalId', async () => {
  const axiosMock = {
    post: async () => ({
      status: 200,
      data: { ok: true, delivered: true, idempotent: true, messageId: 'msg-dup', chatId: 'chat-1' },
    }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({
    phone: '+79001234567',
    text: 'msg',
    externalId: 'rfid:42:+79001234567:check_in',
  });

  assert.equal(result.sent, true);
  assert.equal(result.delivered, true);
  assert.equal(result.idempotent, true);
});

// ── sendByPhone: unexpected HTTP status ───────────────────────────────────

test('sendByPhone() → sent:false on unexpected HTTP 500', async () => {
  const axiosMock = {
    post: async () => ({ status: 500, data: {} }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.equal(result.sent, false);
  assert.equal(result.error, 'http_500');
});

// ── sendByPhone: timeout ──────────────────────────────────────────────────

test('sendByPhone() → sent:false on ECONNABORTED timeout', async () => {
  const timeoutErr = Object.assign(new Error('timeout'), { code: 'ECONNABORTED', isAxiosError: true });
  const axiosMock = {
    post: async () => { throw timeoutErr; },
    isAxiosError: (e) => !!e.isAxiosError,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.equal(result.sent, false);
  assert.equal(result.error, 'timeout');
});

// ── sendByPhone: network error ────────────────────────────────────────────

test('sendByPhone() → sent:false on ECONNREFUSED network error', async () => {
  const netErr = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED', isAxiosError: true });
  const axiosMock = {
    post: async () => { throw netErr; },
    isAxiosError: (e) => !!e.isAxiosError,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  const result = await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.equal(result.sent, false);
  assert.ok(result.error, 'expected error string');
});

// ── sendByPhone: Authorization header ────────────────────────────────────

test('sendByPhone() sends correct Authorization header', async () => {
  let capturedHeaders = null;
  const axiosMock = {
    post: async (url, body, opts) => {
      capturedHeaders = opts.headers || {};
      return { status: 201, data: { ok: true, delivered: true, messageId: 'm', chatId: 'c', idempotent: false } };
    },
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.equal(capturedHeaders['Authorization'], `Bearer ${FAKE_TOKEN}`);
});

// ── sendByPhone: request body ─────────────────────────────────────────────

test('sendByPhone() sends phone, text, type, externalId, metadata in body', async () => {
  let capturedBody = null;
  const axiosMock = {
    post: async (url, body) => {
      capturedBody = body;
      return { status: 201, data: { ok: true, delivered: true, messageId: 'm', chatId: 'c', idempotent: false } };
    },
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  await client.sendByPhone({
    phone: '+79001234567',
    text: 'hello',
    type: 'attendance.check_in',
    externalId: 'rfid:1:+79001234567:check_in',
    metadata: { source: 'rfid' },
  });

  assert.equal(capturedBody.phone, '+79001234567');
  assert.equal(capturedBody.text, 'hello');
  assert.equal(capturedBody.type, 'attendance.check_in');
  assert.equal(capturedBody.externalId, 'rfid:1:+79001234567:check_in');
  assert.deepEqual(capturedBody.metadata, { source: 'rfid' });
});

// ── sendByPhone: token not in logs ────────────────────────────────────────

test('token never appears in log output', async () => {
  const axiosMock = {
    post: async () => ({ status: 500, data: {} }),
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  logEntries = [];
  await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  for (const entry of logEntries) {
    assert.ok(
      !String(entry.msg || '').includes(FAKE_TOKEN),
      `token found in log: ${entry.msg}`
    );
  }
});

// ── sendByPhone: request URL ──────────────────────────────────────────────

test('sendByPhone() posts to correct endpoint URL', async () => {
  let capturedUrl = null;
  const axiosMock = {
    post: async (url) => {
      capturedUrl = url;
      return { status: 201, data: { ok: true, delivered: true, messageId: 'm', chatId: 'c', idempotent: false } };
    },
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: FAKE_URL, token: FAKE_TOKEN, axiosMock });
  await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.equal(capturedUrl, `${FAKE_URL}/api/integrations/kvantik-bot/notifications/by-phone`);
});

// ── sendByPhone: trailing slash in base URL stripped ─────────────────────

test('trailing slash in KVANTIGRAM_INTEGRATION_URL is stripped from URL', async () => {
  let capturedUrl = null;
  const axiosMock = {
    post: async (url) => {
      capturedUrl = url;
      return { status: 201, data: { ok: true, delivered: true, messageId: 'm', chatId: 'c', idempotent: false } };
    },
    isAxiosError: () => false,
  };

  const client = loadClient({ baseUrl: `${FAKE_URL}/`, token: FAKE_TOKEN, axiosMock });
  await client.sendByPhone({ phone: '+79001234567', text: 'msg' });

  assert.ok(!capturedUrl.includes('//api'), `double slash found in URL: ${capturedUrl}`);
  assert.equal(capturedUrl, `${FAKE_URL}/api/integrations/kvantik-bot/notifications/by-phone`);
});
