// Deterministic greedy constraint solver for physician scheduling.
//
// Strategy: walk the month day by day. For each day we must staff `coverage`
// physicians. We only ever consider *eligible* physicians (those who break no
// HARD rule), so the output can never violate a hard constraint — at worst a
// day is left under-covered, which we report as a gap. Among eligible
// candidates we pick the ones who most "need" the shift (furthest below their
// weekly + monthly targets, fewest weekends so far), which spreads the work
// evenly and pushes everyone toward their target hours.

import {
  Assignment,
  CoverageGap,
  ISODate,
  Physician,
  PhysicianStat,
  Rules,
  Schedule,
  TimeOff,
} from '../types';
import {
  addDays,
  daysInMonth,
  isWeekend,
  weekKey,
  weekendKey,
} from './dates';

interface Tracker {
  shifts: number;
  hours: number;
  /** Distinct weekend keys this physician has worked this month. */
  weekends: Set<string>;
  /** shifts worked, keyed by week-of-month (Monday key). */
  shiftsByWeek: Record<string, number>;
  /** dates assigned, for consecutive-day checks. */
  assigned: Set<ISODate>;
}

function buildTimeOffIndex(timeOff: TimeOff[]): Map<string, Set<ISODate>> {
  const idx = new Map<string, Set<ISODate>>();
  for (const t of timeOff) {
    let cur = t.start;
    // guard against reversed ranges
    if (t.end < t.start) continue;
    while (cur <= t.end) {
      if (!idx.has(t.physicianId)) idx.set(t.physicianId, new Set());
      idx.get(t.physicianId)!.add(cur);
      cur = addDays(cur, 1);
    }
  }
  return idx;
}

function consecutiveDaysEndingBefore(
  tracker: Tracker,
  date: ISODate,
  cap: number,
): number {
  // Count how many consecutive prior days are already assigned.
  let count = 0;
  let cur = addDays(date, -1);
  while (tracker.assigned.has(cur) && count <= cap) {
    count++;
    cur = addDays(cur, -1);
  }
  return count;
}

export function generateSchedule(
  monthStart: ISODate,
  physicians: Physician[],
  rules: Rules,
  timeOff: TimeOff[],
): Schedule {
  const days = daysInMonth(monthStart);
  const offIndex = buildTimeOffIndex(timeOff);

  const trackers = new Map<string, Tracker>();
  for (const p of physicians) {
    trackers.set(p.id, {
      shifts: 0,
      hours: 0,
      weekends: new Set(),
      shiftsByWeek: {},
      assigned: new Set(),
    });
  }

  const weeklyTargetShifts = (fte: number) =>
    (rules.weeklyTargetHours * fte) / rules.hoursPerShift;

  const assignments: Assignment[] = [];
  const gaps: CoverageGap[] = [];

  for (const date of days) {
    const weekend = isWeekend(date);
    const coverage = weekend ? rules.weekendCoverage : rules.weekdayCoverage;
    const wk = weekKey(date);
    const wknd = weekendKey(date);

    // Build the eligible candidate list for this day.
    const candidates = physicians.filter((p) => {
      const t = trackers.get(p.id)!;
      // HARD: time off
      if (offIndex.get(p.id)?.has(date)) return false;
      // HARD: already assigned today (shouldn't happen, but be safe)
      if (t.assigned.has(date)) return false;
      // HARD: max consecutive days
      const consec = consecutiveDaysEndingBefore(t, date, rules.maxConsecutiveDays);
      if (consec >= rules.maxConsecutiveDays) return false;
      // HARD: max weekends per month (only blocks if this is a NEW weekend)
      if (
        weekend &&
        !t.weekends.has(wknd) &&
        t.weekends.size >= rules.maxWeekendsPerMonth
      ) {
        return false;
      }
      return true;
    });

    // Score: higher = more deserving of this shift. Sort descending.
    const scored = candidates.map((p) => {
      const t = trackers.get(p.id)!;
      const target = weeklyTargetShifts(p.fte);
      const thisWeek = t.shiftsByWeek[wk] ?? 0;
      const weeklyDeficit = target - thisWeek; // want to fill the week
      const monthlyLoad = t.shifts; // spread total load
      let score = weeklyDeficit * 100 - monthlyLoad * 5;
      if (weekend) {
        // Prefer physicians who've worked fewer weekends; strongly prefer
        // those already on this weekend (avoid spreading one weekend across
        // many people) but never exceed the cap.
        score -= t.weekends.size * 40;
        if (t.weekends.has(wknd)) score += 25;
      }
      return { p, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.p.id < b.p.id ? -1 : 1; // deterministic tie-break
    });

    const picked = scored.slice(0, coverage);
    for (const { p } of picked) {
      const t = trackers.get(p.id)!;
      t.shifts += 1;
      t.hours += rules.hoursPerShift;
      t.assigned.add(date);
      t.shiftsByWeek[wk] = (t.shiftsByWeek[wk] ?? 0) + 1;
      if (weekend) t.weekends.add(wknd);
      assignments.push({ date, physicianId: p.id });
    }

    if (picked.length < coverage) {
      gaps.push({ date, needed: coverage, filled: picked.length });
    }
  }

  const stats = computeStats(monthStart, physicians, rules, assignments, trackers);

  return {
    id: `sch_${monthStart}_${assignments.length}_${gaps.length}`,
    month: monthStart,
    createdAt: new Date().toISOString(),
    rules,
    assignments,
    gaps,
    stats,
  };
}

function computeStats(
  monthStart: ISODate,
  physicians: Physician[],
  rules: Rules,
  assignments: Assignment[],
  trackers: Map<string, Tracker>,
): PhysicianStat[] {
  return physicians.map((p) => {
    const t = trackers.get(p.id)!;
    // Hours deviation: per week, |actual − target|, summed.
    const target = (rules.weeklyTargetHours * p.fte);
    let deviation = 0;
    const weeks = new Set<string>();
    daysInMonth(monthStart).forEach((d) => weeks.add(weekKey(d)));
    weeks.forEach((wk) => {
      const shifts = t.shiftsByWeek[wk] ?? 0;
      deviation += Math.abs(shifts * rules.hoursPerShift - target);
    });
    return {
      physicianId: p.id,
      shifts: t.shifts,
      hours: t.hours,
      weekendsWorked: t.weekends.size,
      hoursDeviation: deviation,
    };
  });
}

/**
 * Recompute coverage gaps + per-physician stats from an arbitrary set of
 * assignments. Used after a manual swap/reassignment so the schedule's derived
 * data stays consistent with its (hand-edited) assignments.
 */
export function recomputeDerived(
  month: ISODate,
  physicians: Physician[],
  rules: Rules,
  assignments: Assignment[],
): { stats: PhysicianStat[]; gaps: CoverageGap[] } {
  const trackers = new Map<string, Tracker>();
  physicians.forEach((p) =>
    trackers.set(p.id, { shifts: 0, hours: 0, weekends: new Set(), shiftsByWeek: {}, assigned: new Set() }),
  );
  const perDate = new Map<string, number>();
  for (const a of assignments) {
    const t = trackers.get(a.physicianId);
    if (!t) continue;
    t.shifts += 1;
    t.hours += rules.hoursPerShift;
    t.assigned.add(a.date);
    const wk = weekKey(a.date);
    t.shiftsByWeek[wk] = (t.shiftsByWeek[wk] ?? 0) + 1;
    if (isWeekend(a.date)) t.weekends.add(weekendKey(a.date));
    perDate.set(a.date, (perDate.get(a.date) ?? 0) + 1);
  }

  const gaps: CoverageGap[] = [];
  for (const date of daysInMonth(month)) {
    const needed = isWeekend(date) ? rules.weekendCoverage : rules.weekdayCoverage;
    const filled = perDate.get(date) ?? 0;
    if (filled < needed) gaps.push({ date, needed, filled });
  }

  const stats = computeStats(month, physicians, rules, assignments, trackers);
  return { stats, gaps };
}

/** Human-readable summary of how well a schedule met its targets. */
export function summarizeSchedule(s: Schedule, physicians: Physician[]): string[] {
  const lines: string[] = [];
  const totalGapSlots = s.gaps.reduce((n, g) => n + (g.needed - g.filled), 0);
  if (totalGapSlots === 0) {
    lines.push('All shifts covered with no rule violations.');
  } else {
    lines.push(
      `${totalGapSlots} shift slot${totalGapSlots === 1 ? '' : 's'} could not be filled across ${s.gaps.length} day${s.gaps.length === 1 ? '' : 's'} — not enough available physicians. Consider relaxing rules or reducing coverage.`,
    );
  }
  const overCap = s.stats.filter(
    (st) => st.weekendsWorked > s.rules.maxWeekendsPerMonth,
  );
  if (overCap.length === 0) {
    lines.push(`Weekend limit (≤${s.rules.maxWeekendsPerMonth}/mo) respected for everyone.`);
  }
  return lines;
}
