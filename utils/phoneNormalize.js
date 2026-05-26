/**
 * Russian phone number normalization helper.
 *
 * Canonical form: +7XXXXXXXXXX (12 chars, E.164-like)
 *
 * Handles:
 *   +75551234567        → +75551234567
 *   75551234567         → +75551234567
 *   85551234567         → +75551234567
 *   8 (555) 123-45-67   → +75551234567
 *   +7 555 123 45 67    → +75551234567
 *
 * Returns null for invalid / unrecognized numbers rather than guessing.
 */
function normalizeRussianPhone(phone) {
  if (phone == null) return null;

  // Strip all separators: spaces, dashes, parentheses
  const cleaned = String(phone).trim().replace(/[\s\-()]/g, '');

  if (!cleaned) return null;

  // International +7XXXXXXXXXX form
  if (cleaned.startsWith('+')) {
    return /^\+7\d{10}$/.test(cleaned) ? cleaned : null;
  }

  // Must be all digits at this point
  if (!/^\d+$/.test(cleaned)) return null;

  // 11-digit Russian: 8XXXXXXXXXX or 7XXXXXXXXXX
  if (cleaned.length === 11 && (cleaned[0] === '8' || cleaned[0] === '7')) {
    return '+7' + cleaned.slice(1);
  }

  return null;
}

module.exports = { normalizeRussianPhone };
