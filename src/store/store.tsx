import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { recomputeDerived } from '../engine/solver';
import { parseHHMM, shiftOffsets } from '../engine/shifttime';
import {
  AppData,
  Assignment,
  CalendarSettings,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_RULES,
  Physician,
  PHYSICIAN_COLORS,
  Rules,
  Schedule,
  Shift,
  SHIFT_COLORS,
  TimeOff,
  WEEK_MIN,
} from '../types';

const STORAGE_KEY = 'shiftmd:data:v2';

const EMPTY: AppData = {
  physicians: [],
  shifts: [],
  timeOff: [],
  rules: DEFAULT_RULES,
  schedules: [],
  calendarSettings: DEFAULT_CALENDAR_SETTINGS,
};

function uid(p: string): string {
  return `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

interface StoreValue {
  data: AppData;
  loaded: boolean;
  addPhysician: (name: string, email?: string) => void;
  updatePhysician: (id: string, patch: Partial<Physician>) => void;
  removePhysician: (id: string) => void;
  addShift: (s: Omit<Shift, 'id' | 'color'>) => void;
  updateShift: (id: string, patch: Partial<Shift>) => void;
  removeShift: (id: string) => void;
  addTimeOff: (t: Omit<TimeOff, 'id'>) => void;
  removeTimeOff: (id: string) => void;
  setPhysicianCalendar: (id: string, url: string, lastSync?: string) => void;
  replaceGoogleTimeOff: (physicianId: string, entries: TimeOff[]) => void;
  updateCalendarSettings: (patch: Partial<CalendarSettings>) => void;
  updateRules: (patch: Partial<Rules>) => void;
  saveSchedule: (s: Schedule) => void;
  reassignShift: (scheduleId: string, instanceId: string, fromId: string | '', toId: string | null) => void;
  loadSampleData: () => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppData;
          setData({
            ...EMPTY,
            ...parsed,
            rules: { ...DEFAULT_RULES, ...parsed.rules },
            calendarSettings: { ...DEFAULT_CALENDAR_SETTINGS, ...parsed.calendarSettings },
          });
        }
      } catch (e) {
        console.warn('load failed', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('save failed', e));
  }, [data, loaded]);

  const addPhysician = useCallback((name: string, email?: string) => {
    setData((d) => {
      const color = PHYSICIAN_COLORS[d.physicians.length % PHYSICIAN_COLORS.length];
      const p: Physician = { id: uid('md'), name: name.trim(), color, email: email?.trim() || undefined };
      return { ...d, physicians: [...d.physicians, p] };
    });
  }, []);

  const updatePhysician = useCallback((id: string, patch: Partial<Physician>) => {
    setData((d) => ({ ...d, physicians: d.physicians.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);

  const removePhysician = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      physicians: d.physicians.filter((p) => p.id !== id),
      timeOff: d.timeOff.filter((t) => t.physicianId !== id),
    }));
  }, []);

  const addShift = useCallback((s: Omit<Shift, 'id' | 'color'>) => {
    setData((d) => {
      const color = SHIFT_COLORS[d.shifts.length % SHIFT_COLORS.length];
      return { ...d, shifts: [...d.shifts, { ...s, id: uid('sh'), color }] };
    });
  }, []);

  const updateShift = useCallback((id: string, patch: Partial<Shift>) => {
    setData((d) => ({ ...d, shifts: d.shifts.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }, []);

  const removeShift = useCallback((id: string) => {
    setData((d) => ({ ...d, shifts: d.shifts.filter((s) => s.id !== id) }));
  }, []);

  const addTimeOff = useCallback((t: Omit<TimeOff, 'id'>) => {
    setData((d) => ({ ...d, timeOff: [...d.timeOff, { ...t, id: uid('off') }] }));
  }, []);

  const removeTimeOff = useCallback((id: string) => {
    setData((d) => ({ ...d, timeOff: d.timeOff.filter((t) => t.id !== id) }));
  }, []);

  const setPhysicianCalendar = useCallback((id: string, url: string, lastSync?: string) => {
    setData((d) => ({
      ...d,
      physicians: d.physicians.map((p) =>
        p.id === id ? { ...p, calendarUrl: url.trim() || undefined, ...(lastSync ? { calendarLastSync: lastSync } : {}) } : p,
      ),
    }));
  }, []);

  const replaceGoogleTimeOff = useCallback((physicianId: string, entries: TimeOff[]) => {
    setData((d) => ({
      ...d,
      timeOff: [...d.timeOff.filter((t) => !(t.physicianId === physicianId && t.source === 'google')), ...entries],
      physicians: d.physicians.map((p) => (p.id === physicianId ? { ...p, calendarLastSync: new Date().toISOString() } : p)),
    }));
  }, []);

  const updateCalendarSettings = useCallback((patch: Partial<CalendarSettings>) => {
    setData((d) => ({ ...d, calendarSettings: { ...d.calendarSettings, ...patch } }));
  }, []);

  const updateRules = useCallback((patch: Partial<Rules>) => {
    setData((d) => {
      let shifts = d.shifts;
      // Changing the week-start time must NOT move existing shifts' clock times.
      // Shifts are stored as offsets from the week start, so re-anchor them.
      if (patch.weekStartTime && patch.weekStartTime !== d.rules.weekStartTime) {
        const delta = parseHHMM(patch.weekStartTime) - parseHHMM(d.rules.weekStartTime);
        shifts = d.shifts.map((s) => {
          const dur = s.endMin - s.startMin;
          const start = (((s.startMin - delta) % WEEK_MIN) + WEEK_MIN) % WEEK_MIN;
          return { ...s, startMin: start, endMin: start + dur };
        });
      }
      return { ...d, rules: { ...d.rules, ...patch }, shifts };
    });
  }, []);

  const saveSchedule = useCallback((s: Schedule) => {
    setData((d) => ({ ...d, schedules: [s, ...d.schedules.filter((x) => x.startDate !== s.startDate)].slice(0, 12) }));
  }, []);

  const reassignShift = useCallback(
    (scheduleId: string, instanceId: string, fromId: string | '', toId: string | null) => {
      setData((d) => {
        const sch = d.schedules.find((s) => s.id === scheduleId);
        if (!sch) return d;
        let assignments: Assignment[] = fromId
          ? sch.assignments.filter((a) => !(a.instanceId === instanceId && a.physicianId === fromId))
          : [...sch.assignments];
        if (toId && !assignments.some((a) => a.instanceId === instanceId && a.physicianId === toId)) {
          assignments = [...assignments, { instanceId, physicianId: toId }];
        }
        const { stats, gaps } = recomputeDerived(d.physicians, sch.rules, sch.instances, assignments);
        const updated: Schedule = { ...sch, assignments, stats, gaps, edited: true };
        return { ...d, schedules: d.schedules.map((s) => (s.id === scheduleId ? updated : s)) };
      });
    },
    [],
  );

  const loadSampleData = useCallback(() => {
    const names = ['Dr. Adler', 'Dr. Bello', 'Dr. Chen', 'Dr. Davies', 'Dr. Vargas', 'Dr. Farooq', 'Dr. Gupta', 'Dr. Haddad', 'Dr. Ibrahim', 'Dr. Jensen'];
    const physicians: Physician[] = names.map((name, i) => ({ id: uid('md'), name, color: PHYSICIAN_COLORS[i % PHYSICIAN_COLORS.length] }));
    const ws = 510; // 08:30
    const shifts: Shift[] = [];
    for (let d = 0; d < 7; d++) {
      const day = shiftOffsets(d, 510, d, 990, ws); // 08:30–16:30 (8h)
      const eve = shiftOffsets(d, 990, d, 1290, ws); // 16:30–21:30 (5h)
      const night = shiftOffsets(d, 1290, (d + 1) % 7, 510, ws); // 21:30 → next 08:30 (11h)
      shifts.push({ id: uid('sh'), label: 'Day', ...day, headcount: 2, color: SHIFT_COLORS[0] });
      shifts.push({ id: uid('sh'), label: 'Evening', ...eve, headcount: 1, color: SHIFT_COLORS[1] });
      shifts.push({ id: uid('sh'), label: 'Night', ...night, headcount: 1, color: SHIFT_COLORS[2] });
    }
    setData((d) => ({ ...d, physicians, shifts, rules: DEFAULT_RULES, timeOff: [], schedules: [] }));
  }, []);

  const resetAll = useCallback(() => setData(EMPTY), []);

  const value = useMemo<StoreValue>(
    () => ({
      data, loaded, addPhysician, updatePhysician, removePhysician, addShift, updateShift, removeShift,
      addTimeOff, removeTimeOff, setPhysicianCalendar, replaceGoogleTimeOff, updateCalendarSettings,
      updateRules, saveSchedule, reassignShift, loadSampleData, resetAll,
    }),
    [data, loaded, addPhysician, updatePhysician, removePhysician, addShift, updateShift, removeShift,
      addTimeOff, removeTimeOff, setPhysicianCalendar, replaceGoogleTimeOff, updateCalendarSettings,
      updateRules, saveSchedule, reassignShift, loadSampleData, resetAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
