// Printable HTML for a shift schedule (used by expo-print for the PDF).

import { Physician, Schedule, ShiftInstance } from '../types';
import { fromISO } from './dates';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function fmtDay(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
function fmtShort(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function buildScheduleHtml(schedule: Schedule, physicians: Physician[]): string {
  const byId = Object.fromEntries(physicians.map((p) => [p.id, p]));
  const assignedBy: Record<string, string[]> = {};
  schedule.assignments.forEach((a) => { (assignedBy[a.instanceId] ??= []).push(a.physicianId); });

  const dates = new Map<string, ShiftInstance[]>();
  schedule.instances.forEach((i) => { if (!dates.has(i.date)) dates.set(i.date, []); dates.get(i.date)!.push(i); });
  const dayBlocks = [...dates.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, insts]) => {
    insts.sort((a, b) => a.start - b.start);
    const rows = insts.map((inst) => {
      const ids = assignedBy[inst.id] ?? [];
      const names = ids.map((id) => byId[id]).filter(Boolean).map((p) => {
        return `<span class="who"><span class="dot" style="background:${p.color}"></span>${esc(p.name.replace(/^Dr\.?\s*/i, ''))}</span>`;
      }).join('');
      const gap = ids.length < inst.headcount ? `<span class="gap">−${inst.headcount - ids.length} needed</span>` : '';
      return `<tr>
        <td class="c-shift"><span class="sdot" style="background:${inst.color}"></span>${esc(inst.label)}</td>
        <td class="c-time">${esc(inst.startLabel)} – ${esc(inst.endLabel)}</td>
        <td class="c-who">${names || '<span class="none">—</span>'} ${gap}</td>
      </tr>`;
    }).join('');
    return `<div class="day"><div class="day-h">${fmtDay(date)}</div>
      <table class="grid">${rows}</table></div>`;
  }).join('');

  const summaryRows = physicians.map((p) => {
    const st = schedule.stats.find((s) => s.physicianId === p.id);
    const hrs = st?.hours ?? 0;
    const dev = st?.deviation ?? schedule.rules.targetHours;
    return `<tr><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td>
      <td>${st?.shifts ?? 0}</td><td>${hrs}</td>
      <td>${dev >= 0 ? dev + 'h under' : (-dev) + 'h over'}</td></tr>`;
  }).join('');

  const totalGap = schedule.gaps.reduce((n, g) => n + (g.needed - g.filled), 0);
  const note = totalGap > 0
    ? `<p class="warn">⚠ ${totalGap} shift slot(s) could not be filled within the rest rules.</p>`
    : `<p class="ok">✓ Every shift fully staffed — no rule violations.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4 portrait; margin: 18px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #101828; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .sub { color: #667085; font-size: 11px; margin: 0 0 8px; }
  .ok { color: #059669; font-size: 11px; margin: 4px 0 12px; }
  .warn { color: #B42318; font-size: 11px; margin: 4px 0 12px; }
  .day { margin-bottom: 10px; break-inside: avoid; }
  .day-h { font-size: 12px; font-weight: 800; color: #344054; border-bottom: 1.5px solid #E4E7EC; padding-bottom: 3px; margin-bottom: 4px; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid td { font-size: 10px; padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #F2F4F7; }
  .c-shift { width: 18%; font-weight: 700; }
  .c-time { width: 30%; color: #475467; }
  .sdot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
  .who { display: inline-block; margin-right: 8px; white-space: nowrap; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 3px; }
  .none { color: #98A2B3; }
  .gap { color: #B42318; font-weight: 700; }
  h2 { font-size: 13px; margin: 14px 0 6px; }
  table.sum { border-collapse: collapse; font-size: 10px; width: 100%; }
  table.sum th, table.sum td { border: 1px solid #E4E7EC; padding: 4px 8px; text-align: left; }
  table.sum th { background: #F2F4F7; color: #475467; }
  .foot { margin-top: 12px; font-size: 9px; color: #98A2B3; }
</style></head><body>
  <h1>Shift Schedule — ${fmtShort(schedule.startDate)} to ${fmtShort(schedule.endDate)}</h1>
  <p class="sub">Generated ${new Date(schedule.createdAt).toLocaleDateString()} · ${physicians.length} physicians · ${schedule.weeks} weeks · target ${schedule.rules.targetHours}h</p>
  ${note}
  ${dayBlocks}
  <h2>Hours per physician</h2>
  <table class="sum"><thead><tr><th>Physician</th><th>Shifts</th><th>Hours</th><th>vs ${schedule.rules.targetHours}h target</th></tr></thead>
  <tbody>${summaryRows}</tbody></table>
  <p class="foot">ShiftMD · physician shift schedule</p>
</body></html>`;
}
