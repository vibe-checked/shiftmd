// Interval scheduler for the weekly shift-template model.
//
// Strategy: materialize every shift instance across the horizon, then walk them
// in chronological order. For each instance we fill its headcount from the
// physicians who break NO hard rule — no overlap with an existing assignment,
// the required rest gap since their last shift (rest length depends on that
// last shift's duration), and not on time off. Among eligible physicians we
// pick whoever is furthest below the global target, which balances hours.
// Slots that can't be filled are reported as gaps rather than breaking a rule.

import {
  Assignment,
  CoverageGap,
  ISODate,
  Physician,
  PhysicianStat,
  Rules,
  Schedule,
  Shift,
  ShiftInstance,
  TimeOff,
} from '../types';
import { addDays } from './dates';
import {
  clock12,
  DAY_NAMES,
  horizonWeeks,
  mondayOf,
  msToISODate,
  parseHHMM,
  weekBaseMs,
} from './shifttime';

function dayName(ms: number): string {
  const dow = new Date(ms).getDay(); // 0=Sun..6=Sat
  return DAY_NAMES[dow === 0 ? 6 : dow - 1];
}

function clockOf(ms: number): string {
  const d = new Date(ms);
  return clock12(d.getHours() * 60 + d.getMinutes());
}

/** Build every concrete shift occurrence across the horizon. */
export function materialize(
  startDate: ISODate,
  shifts: Shift[],
  rules: Rules,
): { instances: ShiftInstance[]; weeks: ISODate[] } {
  const weekStartMin = parseHHMM(rules.weekStartTime);
  const startMonday = mondayOf(startDate);
  const weeks = horizonWeeks(startMonday, rules.horizonMonths);
  const instances: ShiftInstance[] = [];
  weeks.forEach((monday, wi) => {
    const base = weekBaseMs(monday, weekStartMin);
    for (const s of shifts) {
      const start = base + s.startMin * 60000;
      const end = base + s.endMin * 60000;
      const date = msToISODate(start);
      const endDate = msToISODate(end - 60000); // last minute covered
      instances.push({
        id: `${s.id}@${wi}`,
        shiftId: s.id,
        label: s.label,
        color: s.color,
        date,
        endDate,
        start,
        end,
        durationMin: s.endMin - s.startMin,
        headcount: s.headcount,
        startLabel: `${dayName(start)} ${clockOf(start)}`,
        endLabel: `${dayName(end)} ${clockOf(end)}`,
      });
    }
  });
  instances.sort((a, b) => a.start - b.start || (a.shiftId < b.shiftId ? -1 : 1));
  return { instances, weeks };
}

interface Track {
  hours: number;
  shifts: number;
  intervals: { start: number; end: number; durationMin: number }[];
}

function buildOffIndex(timeOff: TimeOff[]): Map<string, { start: ISODate; end: ISODate }[]> {
  const idx = new Map<string, { start: ISODate; end: ISODate }[]>();
  for (const t of timeOff) {
    if (t.end < t.start) continue;
    if (!idx.has(t.physicianId)) idx.set(t.physicianId, []);
    idx.get(t.physicianId)!.push({ start: t.start, end: t.end });
  }
  return idx;
}

function onTimeOff(
  offs: { start: ISODate; end: ISODate }[] | undefined,
  inst: ShiftInstance,
): boolean {
  if (!offs) return false;
  // overlap of date spans [inst.date, inst.endDate] and [off.start, off.end]
  return offs.some((o) => o.start <= inst.endDate && inst.date <= o.end);
}

export function generateSchedule(
  startDate: ISODate,
  physicians: Physician[],
  shifts: Shift[],
  rules: Rules,
  timeOff: TimeOff[],
): Schedule {
  const { instances, weeks } = materialize(startDate, shifts, rules);
  const offIndex = buildOffIndex(timeOff);

  const tracks = new Map<string, Track>();
  physicians.forEach((p) => tracks.set(p.id, { hours: 0, shifts: 0, intervals: [] }));

  const restThresholdMs = rules.restThresholdHours * 3600000;
  const shortRestMs = rules.shortRestHours * 3600000;
  const longRestMs = rules.longRestHours * 3600000;
  const target = rules.targetHours;

  const assignments: Assignment[] = [];
  const gaps: CoverageGap[] = [];

  for (const inst of instances) {
    const eligible = physicians.filter((p) => {
      const t = tracks.get(p.id)!;
      if (onTimeOff(offIndex.get(p.id), inst)) return false;
      // overlap with any existing assignment
      for (const iv of t.intervals) {
        if (iv.start < inst.end && inst.start < iv.end) return false;
      }
      // rest since the most recent prior shift
      let prevEnd = -Infinity;
      let prevDur = 0;
      for (const iv of t.intervals) {
        if (iv.end <= inst.start && iv.end > prevEnd) {
          prevEnd = iv.end;
          prevDur = iv.durationMin;
        }
      }
      if (prevEnd > -Infinity) {
        const need = prevDur > rules.restThresholdHours * 60 ? longRestMs : shortRestMs;
        if (inst.start - prevEnd < need) return false;
      }
      return true;
    });

    const scored = eligible.map((p) => {
      const t = tracks.get(p.id)!;
      // furthest below target first; tie-break: fewer shifts, then id.
      const deficitHours = target - t.hours;
      const score = deficitHours * 1000 - t.shifts;
      return { p, score };
    });
    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.p.id < b.p.id ? -1 : 1));

    const picked = scored.slice(0, inst.headcount);
    for (const { p } of picked) {
      const t = tracks.get(p.id)!;
      t.hours += inst.durationMin / 60;
      t.shifts += 1;
      t.intervals.push({ start: inst.start, end: inst.end, durationMin: inst.durationMin });
      assignments.push({ instanceId: inst.id, physicianId: p.id });
    }
    if (picked.length < inst.headcount) {
      gaps.push({
        instanceId: inst.id,
        date: inst.date,
        label: `${inst.label} · ${inst.startLabel}`,
        needed: inst.headcount,
        filled: picked.length,
      });
    }
  }

  const stats = computeStats(physicians, rules, instances, assignments);
  const endMonday = weeks.length ? addDays(weeks[weeks.length - 1], 7) : startDate;

  return {
    id: `sch_${mondayOf(startDate)}_${rules.horizonMonths}_${assignments.length}_${gaps.length}`,
    startDate: mondayOf(startDate),
    endDate: addDays(endMonday, -1),
    weeks: weeks.length,
    createdAt: new Date().toISOString(),
    rules,
    shifts,
    instances,
    assignments,
    gaps,
    stats,
  };
}

export function computeStats(
  physicians: Physician[],
  rules: Rules,
  instances: ShiftInstance[],
  assignments: Assignment[],
): PhysicianStat[] {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const acc = new Map<string, { hours: number; shifts: number }>();
  physicians.forEach((p) => acc.set(p.id, { hours: 0, shifts: 0 }));
  for (const a of assignments) {
    const inst = byId.get(a.instanceId);
    const t = acc.get(a.physicianId);
    if (!inst || !t) continue;
    t.hours += inst.durationMin / 60;
    t.shifts += 1;
  }
  return physicians.map((p) => {
    const t = acc.get(p.id)!;
    return {
      physicianId: p.id,
      shifts: t.shifts,
      hours: Math.round(t.hours * 10) / 10,
      deviation: Math.round((rules.targetHours - t.hours) * 10) / 10,
    };
  });
}

/** Recompute gaps + stats after a manual edit to assignments. */
export function recomputeDerived(
  physicians: Physician[],
  rules: Rules,
  instances: ShiftInstance[],
  assignments: Assignment[],
): { stats: PhysicianStat[]; gaps: CoverageGap[] } {
  const filled = new Map<string, number>();
  assignments.forEach((a) => filled.set(a.instanceId, (filled.get(a.instanceId) ?? 0) + 1));
  const gaps: CoverageGap[] = [];
  for (const inst of instances) {
    const f = filled.get(inst.id) ?? 0;
    if (f < inst.headcount) {
      gaps.push({
        instanceId: inst.id,
        date: inst.date,
        label: `${inst.label} · ${inst.startLabel}`,
        needed: inst.headcount,
        filled: f,
      });
    }
  }
  return { stats: computeStats(physicians, rules, instances, assignments), gaps };
}

/** Check whether assigning `physicianId` to `inst` would break a hard rule,
 *  given the current assignments. Used by the swap UI to warn. */
export function assignmentWarnings(
  physicianId: string,
  inst: ShiftInstance,
  rules: Rules,
  instances: ShiftInstance[],
  assignments: Assignment[],
  timeOff: TimeOff[],
): string[] {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const mine = assignments
    .filter((a) => a.physicianId === physicianId && a.instanceId !== inst.id)
    .map((a) => byId.get(a.instanceId)!)
    .filter(Boolean);
  const warnings: string[] = [];

  const offs = buildOffIndex(timeOff).get(physicianId);
  if (onTimeOff(offs, inst)) warnings.push('On time off');

  for (const iv of mine) {
    if (iv.start < inst.end && inst.start < iv.end) {
      warnings.push('Overlaps another shift');
      break;
    }
  }
  // rest vs nearest neighbor on each side
  const before = mine.filter((iv) => iv.end <= inst.start).sort((a, b) => b.end - a.end)[0];
  if (before) {
    const need = (before.durationMin > rules.restThresholdHours * 60 ? rules.longRestHours : rules.shortRestHours) * 3600000;
    if (inst.start - before.end < need) warnings.push('Too little rest before');
  }
  const after = mine.filter((iv) => iv.start >= inst.end).sort((a, b) => a.start - b.start)[0];
  if (after) {
    const need = (inst.durationMin > rules.restThresholdHours * 60 ? rules.longRestHours : rules.shortRestHours) * 3600000;
    if (after.start - inst.end < need) warnings.push('Too little rest after');
  }
  return warnings;
}

export function summarize(s: Schedule): string[] {
  const lines: string[] = [];
  const totalGap = s.gaps.reduce((n, g) => n + (g.needed - g.filled), 0);
  if (totalGap === 0) {
    lines.push('All shifts fully staffed — no rule violations.');
  } else {
    lines.push(
      `${totalGap} slot${totalGap === 1 ? '' : 's'} across ${s.gaps.length} shift${
        s.gaps.length === 1 ? '' : 's'
      } couldn’t be filled within the rest rules. Add physicians or relax rest/target.`,
    );
  }
  return lines;
}
