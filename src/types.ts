// Core domain model for ShiftMD — physician rotation scheduling.

export type ISODate = string; // 'YYYY-MM-DD'

export interface Physician {
  id: string;
  name: string;
  color: string;
  /** Full-time equivalent. 1.0 = full time. Scales the weekly hour target. */
  fte: number;
  /** Optional email — used to pre-fill recipients when sharing a schedule. */
  email?: string;
  /** Secret iCal URL (Google Calendar "Secret address in iCal format"). */
  calendarUrl?: string;
  /** ISO timestamp of the last successful calendar sync. */
  calendarLastSync?: string;
}

export interface TimeOff {
  id: string;
  physicianId: string;
  start: ISODate;
  end: ISODate; // inclusive
  reason?: string;
  /** Where it came from. 'manual' = entered by hand; 'google' = iCal import. */
  source: 'manual' | 'google';
  /** For imported entries, the originating calendar event UID (for dedupe). */
  eventUid?: string;
}

/** How calendar events are interpreted as unavailable days. */
export type CalendarImportMode = 'allday' | 'keyword' | 'all';

export interface CalendarSettings {
  mode: CalendarImportMode;
  /** Lower-cased keywords matched against event titles when mode = 'keyword'. */
  keywords: string[];
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  mode: 'allday',
  keywords: ['vacation', 'pto', 'ooo', 'out of office', 'off', 'leave', 'cme', 'holiday'],
};

/** Global scheduling rules that the solver must respect. */
export interface Rules {
  /** Target work hours per week for a 1.0 FTE physician. */
  weeklyTargetHours: number;
  /** Hours credited for one day/shift worked. */
  hoursPerShift: number;
  /** Max distinct weekends a physician may work in a calendar month. */
  maxWeekendsPerMonth: number;
  /** Max consecutive days a physician may work without a day off. */
  maxConsecutiveDays: number;
  /** How many physicians must be on each weekday (Mon–Fri). */
  weekdayCoverage: number;
  /** How many physicians must be on each weekend day (Sat–Sun). */
  weekendCoverage: number;
}

export const DEFAULT_RULES: Rules = {
  weeklyTargetHours: 40,
  hoursPerShift: 8,
  maxWeekendsPerMonth: 2,
  maxConsecutiveDays: 6,
  weekdayCoverage: 6,
  weekendCoverage: 3,
};

/** A single physician assigned to a single day. */
export interface Assignment {
  date: ISODate;
  physicianId: string;
}

export interface CoverageGap {
  date: ISODate;
  needed: number;
  filled: number;
}

export interface PhysicianStat {
  physicianId: string;
  shifts: number;
  hours: number;
  weekendsWorked: number;
  /** Sum over weeks of |actual − target| hours. Lower is more balanced. */
  hoursDeviation: number;
}

export interface Schedule {
  id: string;
  /** First day of the scheduled month, e.g. '2026-07-01'. */
  month: ISODate;
  createdAt: string;
  rules: Rules;
  assignments: Assignment[];
  gaps: CoverageGap[];
  stats: PhysicianStat[];
}

export interface AppData {
  physicians: Physician[];
  timeOff: TimeOff[];
  rules: Rules;
  schedules: Schedule[];
  calendarSettings: CalendarSettings;
}

export const PHYSICIAN_COLORS = [
  '#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED',
  '#DB2777', '#0891B2', '#65A30D', '#EA580C', '#4F46E5',
  '#0D9488', '#9333EA', '#CA8A04', '#E11D48', '#16A34A',
];
