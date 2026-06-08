'use client';

/**
 * Cross-reload retention of the home video hero's prompt.
 *
 * Video generation and reference uploads both require login. When a guest
 * triggers login (by attempting an upload or clicking Generate), OAuth does
 * a hard `window.location.reload()` (see `use-popup-oauth.ts`) that wipes
 * the in-memory form. We stash just the prompt text here so it can be
 * restored after the reload — the user does NOT have to retype it.
 *
 * Reference files are intentionally NOT persisted: uploads require login,
 * so a guest never produced an R2 URL, and raw File objects can't survive
 * a reload. After login the user re-picks any reference media.
 *
 * sessionStorage (not localStorage) so it's tab-scoped and cleared on close.
 */

const HOME_VIDEO_PROMPT_KEY = 'home:videoPromptDraft';
const DRAFT_TTL_MS = 10 * 60 * 1000;

interface PromptDraft {
  prompt: string;
  createdAt: number;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

export function writeHomeVideoPromptDraft(prompt: string) {
  if (!isBrowser()) return;
  // Nothing worth restoring for an empty prompt.
  if (!prompt.trim()) return;
  try {
    window.sessionStorage.setItem(
      HOME_VIDEO_PROMPT_KEY,
      JSON.stringify({ prompt, createdAt: Date.now() } satisfies PromptDraft)
    );
  } catch {
    // sessionStorage can throw in private mode / quota — non-fatal.
  }
}

export function readHomeVideoPromptDraft(): string | null {
  if (!isBrowser()) return null;
  const value = window.sessionStorage.getItem(HOME_VIDEO_PROMPT_KEY);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as PromptDraft;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > DRAFT_TTL_MS) {
      clearHomeVideoPromptDraft();
      return null;
    }
    return parsed.prompt || null;
  } catch {
    clearHomeVideoPromptDraft();
    return null;
  }
}

export function clearHomeVideoPromptDraft() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(HOME_VIDEO_PROMPT_KEY);
  } catch {
    // ignore
  }
}
