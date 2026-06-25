// Builds a printable HTML document for a schedule, used by expo-print to make
// the PDF that gets shared/emailed to physicians.

import { Physician, Schedule } from '../types';
import {
  dayNumber,
  daysInMonth,
  fromISO,
  isWeekend,
  monthLabel,
  weekdayName,
} from './dates';

function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string),
  );
}

export function buildScheduleHtml(schedule: Schedule, physicians: Physician[]): string {
  const byId = Object.fromEntries(physicians.map((p) => [p.id, p]));
  const days = daysInMonth(schedule.month);

  const assignmentsByDate: Record<string, string[]> = {};
  schedule.assignments.forEach((a) => {
    (assignmentsByDate[a.date] ??= []).push(a.physicianId);
  });
  const gapDates = new Set(schedule.gaps.map((g) => g.date));

  // Pad the grid so the 1st lands in the right weekday column (Sun=0).
  const leadPad = fromISO(days[0]).getDay();
  const cells: (string | null)[] = [...Array(leadPad).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weekdayHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map((d) => `<th>${d}</th>`)
    .join('');

  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    const tds = week
      .map((date) => {
        if (!date) return '<td class="empty"></td>';
        const ids = assignmentsByDate[date] ?? [];
        const chips = ids
          .map((id) => {
            const p = byId[id];
            if (!p) return '';
            return `<span class="chip"><span class="dot" style="background:${p.color}"></span>${esc(initials(p.name))}</span>`;
          })
          .join('');
        const gap = gapDates.has(date) ? '<span class="gap">understaffed</span>' : '';
        const wkndClass = isWeekend(date) ? ' weekend' : '';
        return `<td class="day${wkndClass}"><div class="dnum">${dayNumber(date)}</div><div class="chips">${chips || '<span class="none">—</span>'}</div>${gap}</td>`;
      })
      .join('');
    rows.push(`<tr>${tds}</tr>`);
  }

  const legend = physicians
    .map(
      (p) =>
        `<span class="leg"><span class="dot" style="background:${p.color}"></span>${esc(initials(p.name))} · ${esc(p.name)}</span>`,
    )
    .join('');

  const statById = Object.fromEntries(schedule.stats.map((s) => [s.physicianId, s]));
  const summaryRows = physicians
    .map((p) => {
      const st = statById[p.id];
      return `<tr>
        <td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td>
        <td>${p.fte === 1 ? 'FT' : p.fte + '×'}</td>
        <td>${st?.shifts ?? 0}</td>
        <td>${st?.hours ?? 0}</td>
        <td>${st?.weekendsWorked ?? 0}</td>
      </tr>`;
    })
    .join('');

  const totalGap = schedule.gaps.reduce((n, g) => n + (g.needed - g.filled), 0);
  const gapNote =
    totalGap > 0
      ? `<p class="warn">⚠ ${totalGap} shift slot(s) across ${schedule.gaps.length} day(s) could not be filled — see the “understaffed” days.</p>`
      : `<p class="ok">✓ All shifts covered. Weekend limit (≤${schedule.rules.maxWeekendsPerMonth}/mo) and rules respected.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 16px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #101828; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #667085; font-size: 11px; margin: 0 0 10px; }
  .ok { color: #059669; font-size: 11px; margin: 6px 0; }
  .warn { color: #B42318; font-size: 11px; margin: 6px 0; }
  table.cal { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.cal th { background: #F2F4F7; font-size: 10px; color: #475467; padding: 4px; border: 1px solid #E4E7EC; }
  td.day, td.empty { border: 1px solid #E4E7EC; vertical-align: top; height: 78px; padding: 3px; }
  td.empty { background: #FAFBFC; }
  td.weekend { background: #FFF7ED; }
  .dnum { font-size: 11px; font-weight: 700; color: #344054; margin-bottom: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 2px; }
  .chip { font-size: 8.5px; font-weight: 700; color: #344054; background: #F2F4F7; border-radius: 8px; padding: 1px 4px 1px 2px; display: inline-flex; align-items: center; gap: 2px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .none { color: #98A2B3; font-size: 10px; }
  .gap { display: inline-block; margin-top: 2px; font-size: 7.5px; color: #B42318; font-weight: 700; }
  .legend { margin: 10px 0; font-size: 9.5px; color: #475467; display: flex; flex-wrap: wrap; gap: 8px; }
  .leg { display: inline-flex; align-items: center; gap: 3px; }
  table.sum { border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  table.sum th, table.sum td { border: 1px solid #E4E7EC; padding: 4px 10px; text-align: left; }
  table.sum th { background: #F2F4F7; color: #475467; }
  .foot { margin-top: 12px; font-size: 9px; color: #98A2B3; }
</style></head>
<body>
  <h1>Call Schedule — ${monthLabel(schedule.month)}</h1>
  <p class="sub">Generated ${new Date(schedule.createdAt).toLocaleDateString()} · ${physicians.length} physicians · ${schedule.rules.weekdayCoverage} weekday / ${schedule.rules.weekendCoverage} weekend coverage</p>
  ${gapNote}
  <table class="cal"><thead><tr>${weekdayHeader}</tr></thead><tbody>${rows.join('')}</tbody></table>
  <div class="legend">${legend}</div>
  <table class="sum">
    <thead><tr><th>Physician</th><th>FTE</th><th>Shifts</th><th>Hours</th><th>Weekends</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
  <p class="foot">ShiftMD · physician call schedule</p>
</body></html>`;
}
