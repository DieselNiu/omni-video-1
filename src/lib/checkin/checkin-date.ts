import { CHECKIN_RESET_TIMEZONE } from './constants';

const CHECKIN_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function getCurrentCheckinDate(now: Date = new Date()): string {
  if (CHECKIN_RESET_TIMEZONE !== 'UTC') {
    // Default to UTC until timezone-specific logic is needed.
    console.warn(
      `CHECKIN_RESET_TIMEZONE=${CHECKIN_RESET_TIMEZONE} is not supported yet, falling back to UTC.`
    );
  }

  return now.toISOString().slice(0, 10);
}

export function getPreviousCheckinDate(checkinDate: string): string {
  if (!CHECKIN_DATE_REGEX.test(checkinDate)) {
    throw new Error(`Invalid checkinDate format: ${checkinDate}`);
  }

  const [year, month, day] = checkinDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getNextCheckinResetAt(checkinDate: string): string {
  if (!CHECKIN_DATE_REGEX.test(checkinDate)) {
    throw new Error(`Invalid checkinDate format: ${checkinDate}`);
  }

  const [year, month, day] = checkinDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  return date.toISOString();
}
