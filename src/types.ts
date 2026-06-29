// Core domain model for ShiftMD — physician shift-template scheduling.
//
// New model (v2): the schedule is built from a weekly SHIFT TEMPLATE that runs
// Monday → next Monday and repeats every week. Each shift is an arbitrary time
// range (30-min steps) with a required headcount. The solver fills every shift
// instance across a horizon (in whole months) while balancing each physician
// toward a single global target-hours number and honoring rest rules.

export type ISODate = string; // 'YYYY-MM-DD'
export type HHMM = string; // 'HH:MM' 24-hour, on 30-min boundaries

export const WEEK_MIN = 7 * 24 * 60; // 10080 minutes in a week

export interface Physician {
  id: string;
  name: string;
  color: string;
  email?: string;
  /** Secret iCal URL (Google Calendar "Secret address in iCal format"). */
  calendarUrl?: string;
  calendarLastSync?: string;
}

/**
 * A shift in the weekly template. Position is stored as minutes from the week
 * start (Monday at rules.weekStartTime). 0 = week start. Values are multiples
 * of 30. endMin > startMin; both in [0, WEEK_MIN]. Overnight / multi-day shifts
 * are just larger ranges.
 */
export interface Shift {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  headcount: number;
  color: string;
}

export const shiftDurationMin = (s: { startMin: number; endMin: number }) =>
  s.endMin - s.startMin;

export interface TimeOff {
  id: string;
  physicianId: string;
  start: ISODate;
  end: ISODate; // inclusive
  reason?: string;
  source: 'manual' | 'google';
  eventUid?: string;
}

export type CalendarImportMode = 'allday' | 'keyword' | 'all';
export interface CalendarSettings {
  mode: CalendarImportMode;
  keywords: string[];
}
export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  mode: 'allday',
  keywords: ['vacation', 'pto', 'ooo', 'out of office', 'off', 'leave', 'cme', 'holiday'],
};

/** Global scheduling rules. */
export interface Rules {
  /** Monday clock time the week (and each calendar day) starts. Default 08:30. */
  weekStartTime: HHMM;
  /** Scheduling horizon length, whole months. */
  horizonMonths: number;
  /** Single global target hours each physician aims for across the whole horizon. */
  targetHours: number;
  /** A shift longer than this many hours requires the LONG rest after it. */
  restThresholdHours: number;
  /** Rest required after a shift at or under the threshold. */
  shortRestHours: number;
  /** Rest required after a shift over the threshold. */
  longRestHours: number;
}

/** ~160h/month is a reasonable full-time default; fully editable. */
export const DEFAULT_TARGET_PER_MONTH = 160;

export const DEFAULT_RULES: Rules = {
  weekStartTime: '08:30',
  horizonMonths: 1,
  targetHours: DEFAULT_TARGET_PER_MONTH,
  restThresholdHours: 12,
  shortRestHours: 12,
  longRestHours: 24,
};

/** A concrete occurrence of a template shift on a specific date. */
export interface ShiftInstance {
  id: string;
  shiftId: string;
  label: string;
  color: string;
  /** ISO date the shift starts on (local). */
  date: ISODate;
  /** Absolute epoch-ms start/end (for ordering, overlap, rest math). */
  start: number;
  end: number;
  durationMin: number;
  headcount: number;
  /** 'HH:MM' clock labels and a day label for display. */
  startLabel: string;
  endLabel: string;
  endDate: ISODate;
}

export interface Assignment {
  instanceId: string;
  physicianId: string;
}

export interface CoverageGap {
  instanceId: string;
  date: ISODate;
  label: string;
  needed: number;
  filled: number;
}

export interface PhysicianStat {
  physicianId: string;
  shifts: number;
  hours: number;
  /** target − hours (positive = under target). */
  deviation: number;
}

export interface Schedule {
  id: string;
  /** First Monday of the horizon. */
  startDate: ISODate;
  /** Last date covered (exclusive end shown as inclusive label elsewhere). */
  endDate: ISODate;
  weeks: number;
  createdAt: string;
  rules: Rules;
  shifts: Shift[];
  instances: ShiftInstance[];
  assignments: Assignment[];
  gaps: CoverageGap[];
  stats: PhysicianStat[];
  edited?: boolean;
}

export interface AppData {
  physicians: Physician[];
  shifts: Shift[];
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

export const SHIFT_COLORS = [
  '#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626',
];
