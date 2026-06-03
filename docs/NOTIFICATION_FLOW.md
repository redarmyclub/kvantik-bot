# Kvantik Bot — Notification Flow

Documents how the RFID attendance system triggers parent notifications via Telegram and Kvantigram (kvantik-messenger).

---

## Overview

```
RFID reader
    │
    ▼
SQLite attendance_events table
    │
    ▼
modules/attendance.js  (polls every N seconds)
    │
    ├─── Telegram path (requires registered parent in bot user registry)
    │
    └─── Kvantigram path (phone-based, independent of Telegram)
```

Both paths execute **independently**. A missing Telegram parent does not suppress the Kvantigram notification, and a Kvantigram failure does not affect Telegram delivery.

---

## RFID event polling

`handleAttendanceEvent(event, children)` in `modules/attendance.js` reads new rows from `attendance_events` and dispatches to either `sendCheckinNotification` or `sendCheckoutNotification` based on `event_type`.

The SQLite cursor (`attendance_cursor`) advances only after successful processing.

---

## Check-in flow (`sendCheckinNotification`)

1. Find child record by `card_id` in `children` list.
2. If no child or no `parent_phone` → return early (no notification).
3. Build `message` text (includes child full name and event time).
4. **Telegram path**: look up parent by `parent_phone` in the bot's in-memory user registry (`findParentByPhone`). If found, send via `sendAttendanceMessageToTargets`.
5. **Kvantigram path** (independent, fire-and-forget):
   - Normalize `parent_phone` → `+7XXXXXXXXXX` via `normalizeRussianPhone`.
   - Check `kvantigramClient.isEnabled()`.
   - Call `kvantigramClient.sendByPhone(...)` with `.catch()` wrapper — errors are logged as warnings and never bubble up.

## Check-out flow (`sendCheckoutNotification`)

Identical structure to check-in. Additionally:
- Computes remaining lunch balance via `getLunchBalanceForCard`.
- Telegram path also calls `maybeSendLowLunchWarning` when balance is low.
- Kvantigram path uses `type: 'attendance.check_out'`.

---

## Phone normalization

`utils/phoneNormalize.js` — `normalizeRussianPhone(phone)`:

| Input | Output |
|---|---|
| `+79620217494` | `+79620217494` |
| `79620217494` | `+79620217494` |
| `89620217494` | `+79620217494` |
| invalid / short | `null` |

If normalization returns `null`, the Kvantigram path is silently skipped.

---

## Kvantigram HTTP client (`utils/kvantigramClient.js`)

### `isEnabled()`
Returns `true` only when both `KVANTIGRAM_INTEGRATION_URL` and `KVANTIGRAM_BOT_INTEGRATION_TOKEN` are set in env. Safe to call at any time — does not throw.

### `sendByPhone({ phone, text, type, externalId, metadata })`

Posts to:
```
POST {KVANTIGRAM_INTEGRATION_URL}/api/integrations/kvantik-bot/notifications/by-phone
Authorization: Bearer {KVANTIGRAM_BOT_INTEGRATION_TOKEN}
```

Timeout: **5 seconds**. Uses `validateStatus: () => true` so HTTP errors do not throw.

Return values:

| Condition | Return |
|---|---|
| `isEnabled()` false | `{sent:false, reason:'disabled'}` |
| `201` delivered | `{sent:true, delivered:true, messageId, chatId, idempotent:false}` |
| `200` idempotent | `{sent:true, delivered:true, messageId, idempotent:true}` |
| `200` no recipient | `{sent:true, delivered:false, reason:'no_kvantigram_account'}` |
| HTTP 4xx/5xx | `{sent:false, error:'http {status}'}` |
| Timeout | `{sent:false, error:'timeout'}` |
| Network error | `{sent:false, error: message}` |

The integration token is **never** written to logs.

---

## ExternalId scheme (idempotency)

```
rfid:{attendanceEventId}:{canonicalPhone}:{direction}
```

Examples:
- `rfid:100:+79620217494:check_in`
- `rfid:101:+79620217494:check_out`

The messenger backend deduplicates on `externalId`. Re-sending the same RFID event never creates a duplicate message.

---

## Failure isolation

- Kvantigram call is wrapped in `.catch(err => logger.warn(...))` plus an outer `try/catch`.
- A Kvantigram timeout or server error logs a warning and returns normally.
- The Telegram path is not affected by Kvantigram failures.
- The RFID cursor advances regardless of notification outcome.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `KVANTIGRAM_INTEGRATION_URL` | For Kvantigram | Base URL of the messenger server, e.g. `http://127.0.0.1:3000` |
| `KVANTIGRAM_BOT_INTEGRATION_TOKEN` | For Kvantigram | Pre-shared Bearer token matching `KVANTIK_BOT_INTEGRATION_TOKEN` on the messenger |

Both must be set in `/opt/kvantik-bot/.env` (excluded from git). If either is absent, `isEnabled()` returns `false` and the Kvantigram path is silently skipped — Telegram notifications continue normally.
