import { ISODate } from '../types';

/** Format a Date as a local 'YYYY-MM-DD' string (no UTC shift). */
export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a 'YYYY-MM-DD' string into a local Date at midnight. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(s: ISODate): number {
  return fromISO(s).getDay();
}

export function isWeekend(s: ISODate): boolean {
  const dow = dayOfWeek(s);
  return dow === 0 || dow === 6;
}

/** All dates in a calendar month, given the month's first day. */
export function daysInMonth(monthStart: ISODate): ISODate[] {
  const start = fromISO(monthStart);
  const year = start.getFullYear();
  const month = start.getMonth();
  const out: ISODate[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** First day of the month containing `s`. */
export function monthStartOf(s: ISODate): ISODate {
  const d = fromISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** First day of the month `n` months from `s`'s month. */
export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/**
 * A stable weekend key (the date of that weekend's Saturday) so Sat & Sun of
 * the same weekend count as one weekend worked.
 */
export function weekendKey(s: ISODate): string {
  const dow = dayOfWeek(s);
  if (dow === 6) return s; // Saturday
  if (dow === 0) return addDays(s, -1); // Sunday -> previous Saturday
  return s;
}

/** A stable week key (the date of that week's Monday). */
export function weekKey(s: ISODate): string {
  const dow = dayOfWeek(s); // 0..6, Sun..Sat
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(s, deltaToMonday);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(monthStart: ISODate): string {
  const d = fromISO(monthStart);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortMonthLabel(monthStart: ISODate): string {
  const d = fromISO(monthStart);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayName(s: ISODate): string {
  return WEEKDAY_NAMES[dayOfWeek(s)];
}

export function dayNumber(s: ISODate): number {
  return fromISO(s).getDate();
}
