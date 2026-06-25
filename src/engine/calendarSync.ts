// Turns a physician's iCal feed into TimeOff entries the scheduler understands.

import { CalendarSettings, ISODate, Physician, TimeOff } from '../types';
import { addMonths, monthStartOf, toISO } from './dates';
import { CalEvent, parseICS } from './ics';

export interface SyncResult {
  ok: boolean;
  count: number;
  entries: TimeOff[];
  error?: string;
}

/** Normalize a pasted address: webcal:// -> https://, trim whitespace. */
export function normalizeCalendarUrl(url: string): string {
  const u = url.trim();
  if (u.toLowerCase().startsWith('webcal://')) return 'https://' + u.slice('webcal://'.length);
  return u;
}

function matchesMode(ev: CalEvent, settings: CalendarSettings): boolean {
  switch (settings.mode) {
    case 'allday':
      return ev.allDay;
    case 'all':
      return true;
    case 'keyword': {
      const s = ev.summary.toLowerCase();
      return settings.keywords.some((k) => k && s.includes(k.toLowerCase()));
    }
  }
}

/** Import window: from the start of last month out to ~18 months ahead. */
function importWindow(today: ISODate): { from: ISODate; to: ISODate } {
  const from = addMonths(monthStartOf(today), -1);
  const to = addMonths(monthStartOf(today), 18);
  return { from, to };
}

export function eventsToTimeOff(
  physicianId: string,
  events: CalEvent[],
  settings: CalendarSettings,
  today: ISODate = toISO(new Date()),
): TimeOff[] {
  const { from, to } = importWindow(today);
  const out: TimeOff[] = [];
  for (const ev of events) {
    if (!matchesMode(ev, settings)) continue;
    if (ev.end < from || ev.start > to) continue; // outside the window
    out.push({
      id: `goog_${physicianId}_${ev.uid}`,
      physicianId,
      start: ev.start,
      end: ev.end,
      reason: ev.summary || 'Calendar event',
      source: 'google',
      eventUid: ev.uid,
    });
  }
  return out;
}

/** Fetch + parse + convert. Network and parse errors are returned, not thrown. */
export async function syncPhysicianCalendar(
  physician: Physician,
  settings: CalendarSettings,
): Promise<SyncResult> {
  const raw = physician.calendarUrl ? normalizeCalendarUrl(physician.calendarUrl) : '';
  if (!raw) return { ok: false, count: 0, entries: [], error: 'No calendar URL set' };
  if (!/^https?:\/\//i.test(raw)) {
    return { ok: false, count: 0, entries: [], error: 'URL must start with https://' };
  }
  try {
    const res = await fetch(raw, { headers: { Accept: 'text/calendar, text/plain, */*' } });
    if (!res.ok) {
      return { ok: false, count: 0, entries: [], error: `Server returned ${res.status}` };
    }
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { ok: false, count: 0, entries: [], error: 'Not a valid iCal feed' };
    }
    const events = parseICS(text);
    const entries = eventsToTimeOff(physician.id, events, settings);
    return { ok: true, count: entries.length, entries };
  } catch (e: any) {
    return { ok: false, count: 0, entries: [], error: e?.message ?? 'Network error' };
  }
}
