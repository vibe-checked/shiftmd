// Time helpers for the weekly shift-template model.
//
// A shift's position is stored as `startMin`/`endMin` = minutes from the week
// start (Monday at the configured weekStartTime). The clock/day a shift falls
// on is derived from that offset plus the week-start clock time.

import { ISODate, WEEK_MIN } from '../types';
import { fromISO, toISO } from './dates';

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** '08:30' -> 510 (minutes since 00:00). */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** 510 -> '08:30' (24h, zero-padded). */
export function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 510 -> '8:30 AM' (12h display). */
export function clock12(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/**
 * Convert a user's (day-of-week from Monday, clock minutes) into an offset from
 * the week start. Times before the week start on the starting Monday roll to
 * the end of the Mon→Mon week, matching "the week runs Mon 08:30 → next Mon
 * 08:30".
 */
export function offsetFromWeekStart(dayMon0: number, timeMin: number, weekStartMin: number): number {
  const absFromMonday00 = dayMon0 * 1440 + timeMin; // minute-of-week from Monday 00:00
  return ((absFromMonday00 - weekStartMin) % WEEK_MIN + WEEK_MIN) % WEEK_MIN;
}

/**
 * Build a shift's { startMin, endMin } from user-picked start/end day+time.
 * If the end lands at or before the start within the week, the shift wraps
 * toward the week boundary, so a week is added (endMin can exceed WEEK_MIN, up
 * to startMin + WEEK_MIN for a full-week shift).
 */
export function shiftOffsets(
  startDay: number,
  startTime: number,
  endDay: number,
  endTime: number,
  weekStartMin: number,
): { startMin: number; endMin: number } {
  const startMin = offsetFromWeekStart(startDay, startTime, weekStartMin);
  let endMin = offsetFromWeekStart(endDay, endTime, weekStartMin);
  if (endMin <= startMin) endMin += WEEK_MIN;
  return { startMin, endMin };
}

/** Inverse: offset -> { day (0=Mon), timeMin } for display/editing. */
export function offsetToDayTime(offset: number, weekStartMin: number): { day: number; timeMin: number } {
  const abs = ((weekStartMin + offset) % WEEK_MIN + WEEK_MIN) % WEEK_MIN;
  return { day: Math.floor(abs / 1440), timeMin: abs % 1440 };
}

/** 'Mon 8:30 AM' label for a week offset. */
export function offsetLabel(offset: number, weekStartMin: number): string {
  const { day, timeMin } = offsetToDayTime(offset, weekStartMin);
  return `${DAY_NAMES[day]} ${clock12(timeMin)}`;
}

/** Human duration like '8h', '90m', '1d 4h'. */
export function durationLabel(min: number): string {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(' ') || '0m';
}

/** Monday of the week containing `iso` (Mon-based). */
export function mondayOf(iso: ISODate): ISODate {
  const d = fromISO(iso);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + deltaToMonday);
  return toISO(d);
}

/** All week-start Mondays from `startMonday` (inclusive) spanning `months`. */
export function horizonWeeks(startMonday: ISODate, months: number): ISODate[] {
  const start = fromISO(startMonday);
  const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate());
  const out: ISODate[] = [];
  const d = new Date(start);
  while (d < end) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** Epoch-ms of a week's Monday at the week-start clock time. */
export function weekBaseMs(mondayISO: ISODate, weekStartMin: number): number {
  const d = fromISO(mondayISO);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + weekStartMin * 60000;
}

/** ISO date of an epoch-ms instant (local). */
export function msToISODate(ms: number): ISODate {
  return toISO(new Date(ms));
}
