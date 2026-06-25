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
import {
  AppData,
  CalendarSettings,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_RULES,
  Physician,
  PHYSICIAN_COLORS,
  Rules,
  Schedule,
  TimeOff,
} from '../types';

const STORAGE_KEY = 'shiftmd:data:v1';

const EMPTY: AppData = {
  physicians: [],
  timeOff: [],
  rules: DEFAULT_RULES,
  schedules: [],
  calendarSettings: DEFAULT_CALENDAR_SETTINGS,
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

interface StoreValue {
  data: AppData;
  loaded: boolean;
  // physicians
  addPhysician: (name: string, fte: number, email?: string) => void;
  updatePhysician: (id: string, patch: Partial<Physician>) => void;
  removePhysician: (id: string) => void;
  // time off
  addTimeOff: (t: Omit<TimeOff, 'id'>) => void;
  removeTimeOff: (id: string) => void;
  // calendar sync
  setPhysicianCalendar: (id: string, url: string, lastSync?: string) => void;
  replaceGoogleTimeOff: (physicianId: string, entries: TimeOff[]) => void;
  updateCalendarSettings: (patch: Partial<CalendarSettings>) => void;
  // rules
  updateRules: (patch: Partial<Rules>) => void;
  // schedules
  saveSchedule: (s: Schedule) => void;
  removeSchedule: (id: string) => void;
  /** Move a single day's shift from one physician to another (or clear it). */
  reassignShift: (scheduleId: string, date: string, fromId: string, toId: string | null) => void;
  // seed demo
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
        console.warn('Failed to load data', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on every change once initial load is done.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) =>
      console.warn('Failed to save data', e),
    );
  }, [data, loaded]);

  const addPhysician = useCallback((name: string, fte: number, email?: string) => {
    setData((d) => {
      const color = PHYSICIAN_COLORS[d.physicians.length % PHYSICIAN_COLORS.length];
      const p: Physician = { id: uid('md'), name: name.trim(), color, fte, email: email?.trim() || undefined };
      return { ...d, physicians: [...d.physicians, p] };
    });
  }, []);

  const updatePhysician = useCallback((id: string, patch: Partial<Physician>) => {
    setData((d) => ({
      ...d,
      physicians: d.physicians.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const removePhysician = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      physicians: d.physicians.filter((p) => p.id !== id),
      timeOff: d.timeOff.filter((t) => t.physicianId !== id),
    }));
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
        p.id === id
          ? { ...p, calendarUrl: url.trim() || undefined, ...(lastSync ? { calendarLastSync: lastSync } : {}) }
          : p,
      ),
    }));
  }, []);

  const replaceGoogleTimeOff = useCallback((physicianId: string, entries: TimeOff[]) => {
    setData((d) => ({
      ...d,
      // Drop this physician's previously-imported entries; keep manual + others.
      timeOff: [
        ...d.timeOff.filter((t) => !(t.physicianId === physicianId && t.source === 'google')),
        ...entries,
      ],
      physicians: d.physicians.map((p) =>
        p.id === physicianId ? { ...p, calendarLastSync: new Date().toISOString() } : p,
      ),
    }));
  }, []);

  const updateCalendarSettings = useCallback((patch: Partial<CalendarSettings>) => {
    setData((d) => ({ ...d, calendarSettings: { ...d.calendarSettings, ...patch } }));
  }, []);

  const updateRules = useCallback((patch: Partial<Rules>) => {
    setData((d) => ({ ...d, rules: { ...d.rules, ...patch } }));
  }, []);

  const saveSchedule = useCallback((s: Schedule) => {
    setData((d) => {
      // Replace any existing schedule for the same month.
      const others = d.schedules.filter((x) => x.month !== s.month);
      return { ...d, schedules: [s, ...others] };
    });
  }, []);

  const removeSchedule = useCallback((id: string) => {
    setData((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id) }));
  }, []);

  const reassignShift = useCallback(
    (scheduleId: string, date: string, fromId: string, toId: string | null) => {
      setData((d) => {
        const sch = d.schedules.find((s) => s.id === scheduleId);
        if (!sch) return d;
        let assignments = sch.assignments.filter(
          (a) => !(a.date === date && a.physicianId === fromId),
        );
        if (toId && !assignments.some((a) => a.date === date && a.physicianId === toId)) {
          assignments = [...assignments, { date, physicianId: toId }];
        }
        const { stats, gaps } = recomputeDerived(sch.month, d.physicians, sch.rules, assignments);
        const updated: Schedule = { ...sch, assignments, stats, gaps, edited: true };
        return { ...d, schedules: d.schedules.map((s) => (s.id === scheduleId ? updated : s)) };
      });
    },
    [],
  );

  const loadSampleData = useCallback(() => {
    const names = [
      'Dr. Adler', 'Dr. Bello', 'Dr. Chen', 'Dr. Davies', 'Dr. Evans',
      'Dr. Farooq', 'Dr. Gupta', 'Dr. Haddad', 'Dr. Ibrahim', 'Dr. Jensen',
    ];
    const physicians: Physician[] = names.map((name, i) => ({
      id: uid('md'),
      name,
      color: PHYSICIAN_COLORS[i % PHYSICIAN_COLORS.length],
      fte: i === 9 ? 0.6 : 1.0, // one part-time physician
    }));
    setData((d) => ({
      ...d,
      physicians,
      rules: DEFAULT_RULES,
      timeOff: [],
    }));
  }, []);

  const resetAll = useCallback(() => setData(EMPTY), []);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      loaded,
      addPhysician,
      updatePhysician,
      removePhysician,
      addTimeOff,
      removeTimeOff,
      setPhysicianCalendar,
      replaceGoogleTimeOff,
      updateCalendarSettings,
      updateRules,
      saveSchedule,
      removeSchedule,
      reassignShift,
      loadSampleData,
      resetAll,
    }),
    [data, loaded, addPhysician, updatePhysician, removePhysician, addTimeOff,
      removeTimeOff, setPhysicianCalendar, replaceGoogleTimeOff, updateCalendarSettings,
      updateRules, saveSchedule, removeSchedule, reassignShift, loadSampleData, resetAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
