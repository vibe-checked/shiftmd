import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SwapShiftModal, { SwapTarget } from '../components/SwapShiftModal';
import { Avatar, Button, Card, EmptyState, Pill, SectionLabel } from '../components/ui';
import { addDays, fromISO } from '../engine/dates';
import { emailSchedule, makeSchedulePdf, recipientEmails, shareSchedulePdf } from '../engine/exportSchedule';
import { generateSchedule, summarize } from '../engine/solver';
import { mondayOf } from '../engine/shifttime';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { ISODate, Schedule, ShiftInstance } from '../types';

type View2 = 'calendar' | 'balance';

function fmtDay(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtRange(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ScheduleScreen() {
  const { data, saveSchedule } = useStore();
  const [startMonday, setStartMonday] = useState<ISODate>(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const [view, setView] = useState<View2>('calendar');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);

  const schedule = useMemo<Schedule | undefined>(
    () => data.schedules.find((s) => s.startDate === startMonday),
    [data.schedules, startMonday],
  );
  const physById = useMemo(() => Object.fromEntries(data.physicians.map((p) => [p.id, p])), [data.physicians]);

  const assignedBy = useMemo(() => {
    const m: Record<string, string[]> = {};
    schedule?.assignments.forEach((a) => { (m[a.instanceId] ??= []).push(a.physicianId); });
    return m;
  }, [schedule]);

  const byDate = useMemo(() => {
    const m = new Map<string, ShiftInstance[]>();
    schedule?.instances.forEach((i) => { if (!m.has(i.date)) m.set(i.date, []); m.get(i.date)!.push(i); });
    for (const arr of m.values()) arr.sort((a, b) => a.start - b.start);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [schedule]);

  const generate = () => {
    if (data.physicians.length === 0) { Alert.alert('No physicians', 'Add physicians first.'); return; }
    if (data.shifts.length === 0) { Alert.alert('No shifts', 'Define your weekly shifts on the Shifts tab first.'); return; }
    setBusy(true);
    setTimeout(() => {
      const r = generateSchedule(startMonday, data.physicians, data.shifts, data.rules, data.timeOff);
      saveSchedule(r);
      setBusy(false);
    }, 30);
  };

  const runExport = (mode: 'email' | 'share') => {
    if (!schedule) return;
    setExporting(true);
    (async () => {
      try {
        const pdf = await makeSchedulePdf(schedule, data.physicians);
        if (mode === 'email') {
          const res = await emailSchedule(pdf, schedule, data.physicians);
          if (res.status === 'unavailable') await shareSchedulePdf(pdf);
        } else await shareSchedulePdf(pdf);
      } catch (e: any) {
        Alert.alert('Export failed', e?.message ?? 'Could not create the PDF.');
      } finally { setExporting(false); }
    })();
  };
  const onExport = () => {
    if (!schedule) return;
    const n = recipientEmails(data.physicians).length;
    Alert.alert('Share schedule', n ? `Email a PDF to ${n} physician${n === 1 ? '' : 's'} on file, or open the share sheet.` : 'Create a PDF and choose how to send it.', [
      ...(n ? [{ text: `Email ${n} MD${n === 1 ? '' : 's'}`, onPress: () => runExport('email') }] : []),
      { text: 'Share PDF…', onPress: () => runExport('share') },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const totalGap = schedule?.gaps.reduce((n, g) => n + (g.needed - g.filled), 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.nav}>
          <Pressable hitSlop={10} onPress={() => setStartMonday(addDays(startMonday, -7))}><Text style={styles.arrow}>‹</Text></Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.navLabel}>Week of {fmtRange(startMonday)}</Text>
            <Text style={styles.navSub}>{data.rules.horizonMonths} mo · target {data.rules.targetHours}h</Text>
          </View>
          <Pressable hitSlop={10} onPress={() => setStartMonday(addDays(startMonday, 7))}><Text style={styles.arrow}>›</Text></Pressable>
        </View>
      </View>

      {!schedule ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <EmptyState icon="🗓️" title="No schedule yet" subtitle={`Generate a ${data.rules.horizonMonths}-month schedule from your weekly shifts, honoring rest rules and time off.`} />
          <Button title={busy ? 'Generating…' : 'Generate schedule'} onPress={generate} loading={busy} />
          <Text style={styles.tiny}>{data.physicians.length} physicians · {data.shifts.length} shifts/week · {data.timeOff.length} time-off</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={[styles.summary, totalGap > 0 ? styles.warn : styles.ok]}>
            <Text style={{ fontSize: 20 }}>{totalGap > 0 ? '⚠️' : '✅'}</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              {summarize(schedule).map((l, i) => <Text key={i} style={styles.summaryText}>{l}</Text>)}
              <Text style={styles.summaryText}>{schedule.weeks} weeks · {fmtRange(schedule.startDate)} – {fmtRange(schedule.endDate)}</Text>
            </View>
          </Card>

          <View style={styles.toggle}>
            {(['calendar', 'balance'] as View2[]).map((m) => (
              <Pressable key={m} style={[styles.tBtn, view === m && styles.tBtnOn]} onPress={() => setView(m)}>
                <Text style={[styles.tText, view === m && styles.tTextOn]}>{m === 'calendar' ? 'Calendar' : 'Balance'}</Text>
              </Pressable>
            ))}
          </View>

          {view === 'calendar' ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.swapHint}>Tap a physician to swap; tap + to add to a shift.</Text>
              {byDate.map(([date, insts]) => (
                <View key={date}>
                  <Text style={styles.dateHead}>{fmtDay(date)}</Text>
                  {insts.map((inst) => {
                    const ids = assignedBy[inst.id] ?? [];
                    const short = ids.length < inst.headcount;
                    return (
                      <View key={inst.id} style={styles.instRow}>
                        <View style={[styles.instBar, { backgroundColor: inst.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.instLabel}>{inst.label}</Text>
                          <Text style={styles.instTime}>{inst.startLabel} – {inst.endLabel}</Text>
                          <View style={styles.avatars}>
                            {ids.map((id) => {
                              const p = physById[id];
                              if (!p) return null;
                              return (
                                <Pressable key={id} onPress={() => setSwapTarget({ instanceId: inst.id, physicianId: id })}>
                                  <Avatar name={p.name} color={p.color} size={26} />
                                </Pressable>
                              );
                            })}
                            <Pressable style={styles.addChip} hitSlop={6} onPress={() => setSwapTarget({ instanceId: inst.id, physicianId: null })}>
                              <Text style={styles.addChipText}>＋</Text>
                            </Pressable>
                            {short && <Pill label={`-${inst.headcount - ids.length}`} color={theme.colors.danger} bg={theme.colors.dangerSoft} style={{ marginLeft: 4 }} />}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <BalanceView schedule={schedule} physById={physById} />
          )}

          <Button title={exporting ? 'Preparing PDF…' : 'Share / Email PDF'} onPress={onExport} loading={exporting} style={{ marginTop: 18 }} />
          <Button title={busy ? 'Regenerating…' : 'Regenerate'} variant="secondary" onPress={generate} loading={busy} style={{ marginTop: 10 }} />
          <Text style={styles.tiny}>{schedule.edited ? 'Hand-edited · ' : ''}Created {new Date(schedule.createdAt).toLocaleString()}</Text>
        </ScrollView>
      )}

      {schedule && <SwapShiftModal schedule={schedule} target={swapTarget} onClose={() => setSwapTarget(null)} />}
    </SafeAreaView>
  );
}

function BalanceView({ schedule, physById }: { schedule: Schedule; physById: Record<string, { name: string; color: string }> }) {
  const target = schedule.rules.targetHours;
  const maxH = Math.max(target, ...schedule.stats.map((s) => s.hours), 1);
  const ordered = [...schedule.stats].sort((a, b) => b.hours - a.hours);
  return (
    <View>
      <SectionLabel>Hours vs target ({target}h)</SectionLabel>
      <Card style={{ gap: 14 }}>
        {ordered.map((st) => {
          const p = physById[st.physicianId];
          if (!p) return null;
          const over = st.hours > target;
          return (
            <View key={st.physicianId}>
              <View style={styles.balRow}>
                <Avatar name={p.name} color={p.color} size={24} />
                <Text style={styles.balName}>{p.name}</Text>
                <Text style={styles.balHours}>{st.hours}h</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.targetMark, { left: `${(target / maxH) * 100}%` }]} />
                <View style={[styles.barFill, { width: `${(st.hours / maxH) * 100}%`, backgroundColor: p.color }]} />
              </View>
              <Text style={styles.balMeta}>{st.shifts} shifts · {st.deviation >= 0 ? `${st.deviation}h under` : `${-st.deviation}h over`} target {over ? '↑' : ''}</Text>
            </View>
          );
        })}
      </Card>
      <Text style={styles.balFoot}>The dashed line is the {target}h target. Hours are balanced as evenly as the rest rules and coverage allow.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 6 },
  arrow: { fontSize: 28, fontWeight: '600', color: theme.colors.primary, width: 30, textAlign: 'center' },
  navLabel: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  navSub: { fontSize: theme.font.tiny, color: theme.colors.textMuted },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  tiny: { textAlign: 'center', color: theme.colors.textSubtle, fontSize: theme.font.small, marginTop: 12 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  ok: { backgroundColor: theme.colors.successSoft, borderColor: '#A6F4C5' },
  warn: { backgroundColor: theme.colors.warningSoft, borderColor: '#FEDF89' },
  summaryText: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 19 },
  toggle: { flexDirection: 'row', backgroundColor: theme.colors.border, borderRadius: theme.radius.md, padding: 3, marginBottom: 14 },
  tBtn: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.sm, alignItems: 'center' },
  tBtnOn: { backgroundColor: theme.colors.card },
  tText: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.textMuted },
  tTextOn: { color: theme.colors.text },
  swapHint: { fontSize: theme.font.small, color: theme.colors.textSubtle, paddingHorizontal: 4 },
  dateHead: { fontSize: theme.font.small, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', marginTop: 6, marginBottom: 6, marginLeft: 2 },
  instRow: { flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 10, marginBottom: 8, overflow: 'hidden' },
  instBar: { width: 4, borderRadius: 2, marginRight: 10 },
  instLabel: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  instTime: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 1 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 },
  addChip: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card },
  addChipText: { color: theme.colors.textSubtle, fontSize: 15, fontWeight: '700', marginTop: -2 },
  balRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  balName: { flex: 1, marginLeft: 10, fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  balHours: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.bg, overflow: 'hidden', position: 'relative' },
  barFill: { height: 8, borderRadius: 4 },
  targetMark: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: theme.colors.textSubtle, opacity: 0.7, zIndex: 2 },
  balMeta: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 6 },
  balFoot: { fontSize: theme.font.small, color: theme.colors.textSubtle, lineHeight: 18, marginTop: 14, paddingHorizontal: 4 },
});
