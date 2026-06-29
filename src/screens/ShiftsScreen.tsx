import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import {
  clock12, DAY_NAMES, durationLabel, offsetFromWeekStart, offsetToDayTime, parseHHMM, shiftOffsets,
} from '../engine/shifttime';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { Shift, shiftDurationMin, WEEK_MIN } from '../types';

interface Seg { row: number; left: number; width: number; shift: Shift }

function segmentsFor(shifts: Shift[]): Seg[] {
  const segs: Seg[] = [];
  for (const s of shifts) {
    const startDay = Math.floor(s.startMin / 1440);
    const endDay = Math.floor((s.endMin - 1) / 1440);
    for (let d = startDay; d <= endDay; d++) {
      const dayStart = d * 1440;
      const segStart = Math.max(s.startMin, dayStart);
      const segEnd = Math.min(s.endMin, dayStart + 1440);
      segs.push({
        row: ((d % 7) + 7) % 7,
        left: ((segStart - dayStart) / 1440) * 100,
        width: Math.max(((segEnd - segStart) / 1440) * 100, 4),
        shift: s,
      });
    }
  }
  return segs;
}

export default function ShiftsScreen() {
  const { data, addShift, updateShift, removeShift, loadSampleData } = useStore();
  const wsMin = parseHHMM(data.rules.weekStartTime);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [label, setLabel] = useState('');
  const [startDay, setStartDay] = useState(0);
  const [startT, setStartT] = useState(wsMin);
  const [endDay, setEndDay] = useState(0);
  const [endT, setEndT] = useState((wsMin + 480) % 1440);
  const [headcount, setHeadcount] = useState(1);

  const segsByRow = useMemo(() => {
    const rows: Seg[][] = [[], [], [], [], [], [], []];
    segmentsFor(data.shifts).forEach((seg) => rows[seg.row].push(seg));
    return rows;
  }, [data.shifts]);

  const preview = useMemo(() => {
    const o = shiftOffsets(startDay, startT, endDay, endT, wsMin);
    return { ...o, dur: o.endMin - o.startMin };
  }, [startDay, startT, endDay, endT, wsMin]);

  // Typing a duration (in hours) moves the END (start stays put).
  const [durText, setDurText] = useState('');
  const [durFocused, setDurFocused] = useState(false);
  // Keep the field in sync with the live duration unless the user is typing it.
  useEffect(() => {
    if (!durFocused) setDurText(String(preview.dur / 60));
  }, [preview.dur, durFocused]);

  const setDuration = (newDur: number) => {
    const d = Math.max(30, Math.min(WEEK_MIN, newDur));
    const startOff = offsetFromWeekStart(startDay, startT, wsMin);
    const b = offsetToDayTime((startOff + d) % WEEK_MIN, wsMin);
    setEndDay(b.day);
    setEndT(b.timeMin);
  };
  const onDurChange = (t: string) => {
    setDurText(t);
    const h = parseFloat(t);
    if (isFinite(h) && h > 0) setDuration(Math.round((h * 60) / 30) * 30);
  };

  const totalWeeklyHours = useMemo(
    () => data.shifts.reduce((n, s) => n + (shiftDurationMin(s) / 60) * s.headcount, 0),
    [data.shifts],
  );

  const openAdd = () => openAddForDay(0);

  // Tap a day column → add the next shift: start at the end of that day's last
  // shift (or the day start if none), end defaulting to +8h.
  const openAddForDay = (col: number) => {
    setEditing(null);
    setLabel('');
    const cands = data.shifts.filter((s) => Math.floor(s.startMin / 1440) === col);
    const startOff = cands.length ? Math.max(...cands.map((s) => s.endMin)) : col * 1440;
    const a = offsetToDayTime(startOff % WEEK_MIN, wsMin);
    const b = offsetToDayTime((startOff + 480) % WEEK_MIN, wsMin);
    setStartDay(a.day); setStartT(a.timeMin); setEndDay(b.day); setEndT(b.timeMin);
    setHeadcount(1);
    setModal(true);
  };
  const openEdit = (s: Shift) => {
    setEditing(s);
    setLabel(s.label);
    const a = offsetToDayTime(s.startMin, wsMin);
    const b = offsetToDayTime(s.endMin % WEEK_MIN, wsMin);
    setStartDay(a.day); setStartT(a.timeMin); setEndDay(b.day); setEndT(b.timeMin);
    setHeadcount(s.headcount);
    setModal(true);
  };
  const save = () => {
    if (preview.dur <= 0) { Alert.alert('Invalid times', 'The shift end must be after its start.'); return; }
    const payload = { label: label.trim() || 'Shift', startMin: preview.startMin, endMin: preview.endMin, headcount };
    if (editing) updateShift(editing.id, payload);
    else addShift(payload);
    setModal(false);
  };
  const confirmRemove = (s: Shift) => {
    Alert.alert('Remove shift', `Remove "${s.label}" from the weekly template?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeShift(s.id) },
    ]);
  };
  const removeEditing = () => {
    if (!editing) return;
    const e = editing;
    Alert.alert('Remove shift', `Remove "${e.label}" from the weekly template?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeShift(e.id); setModal(false); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Shifts</Text>
          <Text style={styles.subtitle}>Weekly template · repeats every week</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.weekHint}>Tap a day to add a shift; tap a block to edit.</Text>
        <View style={styles.weekGrid}>
          <View style={styles.gutter}>
            <View style={styles.gutSpacer} />
            <View style={styles.gutTrack}>
              {[0, 0.25, 0.5, 0.75].map((f) => {
                const t = clock12((wsMin + f * 1440) % 1440).replace(' AM', 'a').replace(' PM', 'p');
                return <Text key={f} style={[styles.gutLabel, { top: `${f * 100}%` }]}>{t}</Text>;
              })}
              <Text style={styles.gutBottom}>{clock12(wsMin).replace(' AM', 'a').replace(' PM', 'p')}{'\n'}next day</Text>
            </View>
          </View>
          {DAY_NAMES.map((name, col) => (
            <View key={name} style={styles.dayCol}>
              <Text style={styles.colHead}>{name}</Text>
              <Pressable style={styles.colTrack} onPress={() => openAddForDay(col)}>
                {[0.25, 0.5, 0.75].map((f) => (
                  <View key={f} style={[styles.htick, { top: `${f * 100}%` }]} />
                ))}
                {segsByRow[col].map((seg, i) => (
                  <Pressable
                    key={seg.shift.id + i}
                    onPress={() => openEdit(seg.shift)}
                    style={[styles.cblock, { top: `${seg.left}%`, height: `${seg.width}%`, backgroundColor: seg.shift.color }]}
                  >
                    <Text numberOfLines={1} style={styles.cblockRot}>{seg.shift.label} ×{seg.shift.headcount}</Text>
                  </Pressable>
                ))}
              </Pressable>
            </View>
          ))}
        </View>

        {data.shifts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyHint}>No shifts yet — tap any day above to add one, or load a sample week to explore.</Text>
            <Button title="Load sample week" variant="secondary" onPress={loadSampleData} style={{ marginTop: 12 }} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>ALL SHIFTS ({data.shifts.length})</Text>
            {[...data.shifts].sort((a, b) => a.startMin - b.startMin).map((s) => (
              <Pressable key={s.id} onPress={() => openEdit(s)} style={styles.listRow}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listLabel}>{s.label} · ×{s.headcount}</Text>
                  <Text style={styles.listMeta}>
                    {offsetLabel(s.startMin, wsMin)} → {offsetLabel(s.endMin, wsMin)} · {durationLabel(shiftDurationMin(s))}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => confirmRemove(s)}><Text style={styles.remove}>✕</Text></Pressable>
              </Pressable>
            ))}
            <Text style={styles.totals}>
              {data.shifts.length} shifts · {Math.round(totalWeeklyHours)} staffed hours per week
            </Text>
          </>
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{editing ? 'Edit shift' : 'Add shift'}</Text>

            <Text style={styles.field}>Name</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Day, Night, Call…" placeholderTextColor={theme.colors.textSubtle} />

            <Text style={styles.field}>Starts</Text>
            <DayRow value={startDay} onChange={setStartDay} />
            <TimeStepper value={startT} onChange={setStartT} />

            <Text style={[styles.field, { marginTop: 14 }]}>Ends</Text>
            <DayRow value={endDay} onChange={setEndDay} />
            <TimeStepper value={endT} onChange={setEndT} />

            <Text style={[styles.field, { marginTop: 14 }]}>Duration (hours)</Text>
            <View style={styles.durRow}>
              <TextInput
                style={styles.durInput}
                value={durText}
                onChangeText={onDurChange}
                onFocus={() => setDurFocused(true)}
                onBlur={() => setDurFocused(false)}
                keyboardType="decimal-pad"
                placeholder="8"
                placeholderTextColor={theme.colors.textSubtle}
                returnKeyType="done"
                selectTextOnFocus
              />
              <Text style={styles.durUnit}>= {durationLabel(preview.dur)}</Text>
            </View>
            <Text style={styles.durHint}>Type hours (e.g. 8 or 12) to set the end time instantly.</Text>

            <Text style={[styles.field, { marginTop: 14 }]}>Headcount</Text>
            <View style={styles.hcRow}>
              <Pressable style={styles.hcBtn} onPress={() => setHeadcount(Math.max(1, headcount - 1))}><Text style={styles.hcBtnText}>−</Text></Pressable>
              <Text style={styles.hcVal}>{headcount}</Text>
              <Pressable style={styles.hcBtn} onPress={() => setHeadcount(Math.min(20, headcount + 1))}><Text style={styles.hcBtnText}>+</Text></Pressable>
              <Text style={styles.hcHint}>physicians needed</Text>
            </View>

            <Button title={editing ? 'Save shift' : 'Add shift'} onPress={save} style={{ marginTop: 18 }} />
            {editing && <Button title="Remove shift" variant="danger" onPress={removeEditing} style={{ marginTop: 8 }} />}
            <Button title="Cancel" variant="ghost" onPress={() => setModal(false)} style={{ marginTop: 8 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function offsetLabel(offset: number, wsMin: number): string {
  const { day, timeMin } = offsetToDayTime(offset % WEEK_MIN, wsMin);
  return `${DAY_NAMES[day]} ${clock12(timeMin)}`;
}

function DayRow({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <View style={styles.dayPick}>
      {DAY_NAMES.map((n, i) => (
        <Pressable key={n} style={[styles.dayChip, value === i && styles.dayChipOn]} onPress={() => onChange(i)}>
          <Text style={[styles.dayChipText, value === i && styles.dayChipTextOn]}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TimeStepper({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <View style={styles.timeStep}>
      <Pressable style={styles.timeBtn} onPress={() => onChange((value - 30 + 1440) % 1440)}><Text style={styles.timeBtnText}>−30m</Text></Pressable>
      <Text style={styles.timeVal}>{clock12(value)}</Text>
      <Pressable style={styles.timeBtn} onPress={() => onChange((value + 30) % 1440)}><Text style={styles.timeBtnText}>+30m</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.body, color: theme.colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.font.body },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  weekHint: { fontSize: theme.font.small, color: theme.colors.textSubtle, marginBottom: 10, marginLeft: 2 },
  weekGrid: { flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, paddingHorizontal: 6 },
  gutter: { width: 42 },
  gutSpacer: { height: 18 },
  gutTrack: { height: 470, position: 'relative' },
  gutLabel: { position: 'absolute', right: 3, fontSize: 8, color: theme.colors.textSubtle, marginTop: -4 },
  gutBottom: { position: 'absolute', bottom: 0, right: 3, fontSize: 8, lineHeight: 9, color: theme.colors.textSubtle, textAlign: 'right' },
  dayCol: { flex: 1 },
  colHead: { height: 18, textAlign: 'center', fontSize: theme.font.tiny, fontWeight: '700', color: theme.colors.textMuted },
  colTrack: { height: 470, marginHorizontal: 1.5, backgroundColor: theme.colors.bg, borderRadius: 5, position: 'relative', overflow: 'hidden' },
  htick: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: theme.colors.border },
  cblock: { position: 'absolute', left: 1.5, right: 1.5, borderRadius: 4, overflow: 'hidden', minHeight: 14, alignItems: 'center', justifyContent: 'center' },
  cblockRot: { color: '#fff', fontSize: 12, fontWeight: '800', transform: [{ rotate: '90deg' }] },
  emptyBox: { marginTop: 18, paddingHorizontal: 8, alignItems: 'center' },
  emptyHint: { fontSize: theme.font.body, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 21 },
  sectionLabel: { fontSize: theme.font.tiny, fontWeight: '700', letterSpacing: 0.6, color: theme.colors.textSubtle, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  listLabel: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  listMeta: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2 },
  remove: { color: theme.colors.textSubtle, fontSize: 18, fontWeight: '600', paddingHorizontal: 4 },
  totals: { textAlign: 'center', color: theme.colors.textSubtle, fontSize: theme.font.small, marginTop: 12 },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: 22, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text, marginBottom: 14 },
  field: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 14, height: 46, fontSize: theme.font.h3, color: theme.colors.text, backgroundColor: theme.colors.bg, marginBottom: 16 },
  dayPick: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  dayChip: { flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  dayChipOn: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
  dayChipText: { fontSize: theme.font.tiny, fontWeight: '700', color: theme.colors.textMuted },
  dayChipTextOn: { color: theme.colors.primary },
  timeStep: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.bg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 6, height: 46 },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  timeBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.body },
  timeVal: { fontSize: theme.font.h3, fontWeight: '800', color: theme.colors.text },
  durRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  durInput: { width: 90, height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.bg, paddingHorizontal: 14, fontSize: theme.font.h3, fontWeight: '800', color: theme.colors.text },
  durUnit: { fontSize: theme.font.body, color: theme.colors.textMuted, fontWeight: '600' },
  durHint: { fontSize: theme.font.tiny, color: theme.colors.textSubtle, textAlign: 'center', marginTop: 6 },
  hcRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hcBtn: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  hcBtnText: { fontSize: 22, fontWeight: '700', color: theme.colors.primary },
  hcVal: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text, minWidth: 28, textAlign: 'center' },
  hcHint: { fontSize: theme.font.small, color: theme.colors.textMuted },
});
