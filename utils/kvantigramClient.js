'use strict';

/**
 * kvantigramClient.js
 *
 * Thin HTTP client for the Kvantigram messenger integration API.
 * Sends parent-facing attendance notifications in parallel with Telegram.
 *
 * Disabled automatically if KVANTIGRAM_INTEGRATION_URL or
 * KVANTIGRAM_BOT_INTEGRATION_TOKEN are not set.
 *
 * All failures are non-fatal: the caller receives a result object and
 * the Telegram path is never blocked.
 *
 * Never logs the integration token.
 */

const axios = require('axios');
const logger = require('./logger');

const BASE_URL = (process.env.KVANTIGRAM_INTEGRATION_URL || '').replace(/\/$/, '');
const TOKEN    = process.env.KVANTIGRAM_BOT_INTEGRATION_TOKEN || '';

const TIMEOUT_MS = 5000;
const ENDPOINT   = '/api/integrations/kvantik-bot/notifications/by-phone';

/**
 * Whether the client is enabled (both env vars present).
 * @returns {boolean}
 */
function isEnabled() {
  return !!(BASE_URL && TOKEN);
}

/**
 * Send an attendance notification to a parent by phone number.
 *
 * @param {object} opts
 * @param {string}  opts.phone        - Parent phone in any Russian format (8xxx or +7xxx)
 * @param {string}  opts.text         - Message text
 * @param {string}  [opts.type]       - Semantic type, e.g. 'attendance.check_in'
 * @param {string}  [opts.externalId] - Idempotency key
 * @param {object}  [opts.metadata]   - Optional metadata passed to backend
 *
 * @returns {Promise<{
 *   sent: boolean,
 *   delivered?: boolean,
 *   reason?: string,
 *   messageId?: string,
 *   chatId?: string,
 *   idempotent?: boolean,
 *   error?: string,
 * }>}
 */
async function sendByPhone({ phone, text, type, externalId, metadata } = {}) {
  if (!isEnabled()) {
    return { sent: false, reason: 'disabled' };
  }

  const body = {
    phone,
    text,
    ...(type       ? { type }       : {}),
    ...(externalId ? { externalId } : {}),
    ...(metadata   ? { metadata }   : {}),
  };

  try {
    const response = await axios.post(`${BASE_URL}${ENDPOINT}`, body, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT_MS,
      // Never throw on non-2xx/3xx — we handle status ourselves
      validateStatus: () => true,
    });

    const data = response.data || {};
    const status = response.status;

    if (status === 200 && data.delivered === false) {
      logger.info('KVANTIGRAM', `no-recipient phone=${phone} reason=${data.reason}`);
      return { sent: true, delivered: false, reason: data.reason };
    }

    if (status === 201 || (status === 200 && data.delivered === true)) {
      logger.info('KVANTIGRAM', `delivered phone=${phone} messageId=${data.messageId} idempotent=${data.idempotent}`);
      return {
        sent: true,
        delivered: true,
        messageId: data.messageId,
        chatId: data.chatId,
        idempotent: !!data.idempotent,
      };
    }

    logger.warn('KVANTIGRAM', `unexpected status ${status} phone=${phone}`);
    return { sent: false, error: `http_${status}` };

  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        logger.warn('KVANTIGRAM', `timeout after ${TIMEOUT_MS}ms phone=${phone}`);
        return { sent: false, error: 'timeout' };
      }
      logger.warn('KVANTIGRAM', `request error: ${err.message} phone=${phone}`);
      return { sent: false, error: err.message };
    }
    logger.warn('KVANTIGRAM', `unexpected error: ${err.message} phone=${phone}`);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendByPhone, isEnabled };
