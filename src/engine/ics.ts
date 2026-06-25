// Minimal iCalendar (RFC 5545) parser — enough to pull vacation/OOO events out
// of a Google Calendar "Secret address in iCal format" feed. We only need the
// fields that decide which DAYS a physician is unavailable, so we read DTSTART,
// DTEND, SUMMARY and UID and ignore the rest (timezones, alarms, attendees…).

export interface CalEvent {
  uid: string;
  summary: string;
  /** 'YYYY-MM-DD' inclusive start. */
  start: string;
  /** 'YYYY-MM-DD' inclusive end. */
  end: string;
  allDay: boolean;
  /** True if the source event had an RRULE (we only keep the first occurrence). */
  recurring: boolean;
}

/** Unfold RFC 5545 line folding: continuation lines begin with space or tab. */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Split "DTSTART;VALUE=DATE:20260706" into { name, params, value }. */
function parseLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(';');
  if (semi === -1) return { name: left.toUpperCase(), params: '', value };
  return { name: left.slice(0, semi).toUpperCase(), params: left.slice(semi + 1).toUpperCase(), value };
}

/** 'YYYYMMDD' (or 'YYYYMMDDT…') -> 'YYYY-MM-DD'. */
function toISODate(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function parseICS(raw: string): CalEvent[] {
  const lines = unfold(raw);
  const events: CalEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (t === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (t === 'END:VEVENT') {
      if (cur) {
        const ev = buildEvent(cur);
        if (ev) events.push(ev);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    // Keep the first occurrence of each property.
    if (!cur[p.name]) cur[p.name] = { params: p.params, value: p.value };
  }
  return events;
}

function buildEvent(props: Record<string, { params: string; value: string }>): CalEvent | null {
  const dtstart = props['DTSTART'];
  if (!dtstart) return null;
  const start = toISODate(dtstart.value);
  if (!start) return null;

  const allDay = dtstart.params.includes('VALUE=DATE') || !dtstart.value.includes('T');

  let end = start;
  const dtend = props['DTEND'];
  if (dtend) {
    const e = toISODate(dtend.value);
    if (e) {
      // For all-day events DTEND is EXCLUSIVE, so the last day off is DTEND-1.
      end = allDay ? addDaysISO(e, -1) : e;
      if (end < start) end = start;
    }
  }

  const summary = (props['SUMMARY']?.value ?? '').replace(/\\,/g, ',').replace(/\\n/gi, ' ').trim();
  const uid = props['UID']?.value ?? `${start}_${summary}`;

  return { uid, summary, start, end, allDay, recurring: !!props['RRULE'] };
}
