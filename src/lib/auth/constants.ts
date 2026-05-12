/**
 * Shared constants for OAuth popup flow and cross-window communication.
 */

// ── localStorage keys ──
export const PENDING_CHECKIN_KEY = 'pendingCheckin';
export const AUTH_POPUP_NONCE_KEY = 'auth_popup_nonce';
export const AUTH_POPUP_RESULT_KEY = 'auth_popup_result';

// ── BroadcastChannel ──
export const AUTH_BROADCAST_CHANNEL = 'auth_popup';

// ── Popup window dimensions ──
export const POPUP_WIDTH = 500;
export const POPUP_HEIGHT = 600;

// ── Timeouts (ms) ──
/** How often we poll for the popup being closed */
export const POPUP_POLL_INTERVAL = 500;
/** Safety timeout: if still loading after this, force-reset */
export const POPUP_SAFETY_TIMEOUT = 120_000;
/** Delay before re-enabling the duplicate-guard ref */
export const AUTH_HANDLED_RESET_DELAY = 2_000;
/** How long the pending-checkin flag remains valid after redirect-based login (ms) */
export const PENDING_CHECKIN_EXPIRY = 5 * 60 * 1000; // 5 minutes
