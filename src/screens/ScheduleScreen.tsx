import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SwapShiftModal, { SwapTarget } from '../components/SwapShiftModal';
import { Avatar, Button, Card, EmptyState, Pill, SectionLabel } from '../components/ui';
import {
  addMonths,
  dayNumber,
  daysInMonth,
  isWeekend,
  monthLabel,
  monthStartOf,
  toISO,
  weekdayName,
} from '../engine/dates';
import {
  emailSchedule,
  makeSchedulePdf,
  recipientEmails,
  shareSchedulePdf,
} from '../engine/exportSchedule';
import { generateSchedule, summarizeSchedule } from '../engine/solver';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { Schedule } from '../types';

type ViewMode = 'calendar' | 'balance';

export default function ScheduleScreen() {
  const { data, saveSchedule } = useStore();
  const [month, setMonth] = useState<string>(() => monthStartOf(toISO(new Date())));
  const [view, setView] = useState<ViewMode>('calendar');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);

  const schedule = useMemo<Schedule | undefined>(
    () => data.schedules.find((s) => s.month === month),
    [data.schedules, month],
  );

  const physById = useMemo(
    () => Object.fromEntries(data.physicians.map((p) => [p.id, p])),
    [data.physicians],
  );

  const assignmentsByDate = useMemo(() => {
    const m: Record<string, string[]> = {};
    schedule?.assignments.forEach((a) => {
      (m[a.date] ??= []).push(a.physicianId);
    });
    return m;
  }, [schedule]);

  const generate = () => {
    if (data.physicians.length === 0) {
      Alert.alert('No physicians', 'Add physicians on the Physicians tab before generating a schedule.');
      return;
    }
    setBusy(true);
    // Defer so the spinner can paint before the (fast) solve.
    setTimeout(() => {
      const result = generateSchedule(month, data.physicians, data.rules, data.timeOff);
      saveSchedule(result);
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
          if (res.status === 'unavailable') {
            // No Mail account set up — fall back to the share sheet.
            await shareSchedulePdf(pdf);
          }
        } else {
          await shareSchedulePdf(pdf);
        }
      } catch (e: any) {
        Alert.alert('Export failed', e?.message ?? 'Could not create the PDF.');
      } finally {
        setExporting(false);
      }
    })();
  };

  const onExportPress = () => {
    if (!schedule) return;
    const haveEmails = recipientEmails(data.physicians).length;
    Alert.alert(
      'Share schedule',
      haveEmails
        ? `Email a PDF to ${haveEmails} physician${haveEmails === 1 ? '' : 's'} on file, or open the share sheet.`
        : 'Create a PDF and choose how to send it. Add physician emails (Physicians tab) to pre-fill recipients.',
      [
        ...(haveEmails
          ? [{ text: `Email ${haveEmails} MD${haveEmails === 1 ? '' : 's'}`, onPress: () => runExport('email') }]
          : []),
        { text: 'Share PDF…', onPress: () => runExport('share') },
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const summary = schedule ? summarizeSchedule(schedule, data.physicians) : [];
  const totalGapSlots = schedule?.gaps.reduce((n, g) => n + (g.needed - g.filled), 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.monthNav}>
          <Pressable hitSlop={10} onPress={() => setMonth(addMonths(month, -1))}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
          <Pressable hitSlop={10} onPress={() => setMonth(addMonths(month, 1))}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      {!schedule ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <EmptyState
            icon="🗓️"
            title={`No schedule for ${monthLabel(month)}`}
            subtitle="Generate a schedule that respects your rules and everyone’s time off. You can regenerate any time."
          />
          <Button
            title={busy ? 'Generating…' : 'Generate schedule'}
            onPress={generate}
            loading={busy}
          />
          <Text style={styles.tinyNote}>
            {data.physicians.length} physician{data.physicians.length === 1 ? '' : 's'} ·{' '}
            {data.timeOff.length} time-off entr{data.timeOff.length === 1 ? 'y' : 'ies'}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Summary banner */}
          <Card style={[styles.summaryCard, totalGapSlots > 0 ? styles.summaryWarn : styles.summaryOk]}>
            <Text style={styles.summaryIcon}>{totalGapSlots > 0 ? '⚠️' : '✅'}</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              {summary.map((line, i) => (
                <Text key={i} style={styles.summaryText}>{line}</Text>
              ))}
            </View>
          </Card>

          {/* View toggle */}
          <View style={styles.toggle}>
            {(['calendar', 'balance'] as ViewMode[]).map((m) => (
              <Pressable
                key={m}
                style={[styles.toggleBtn, view === m && styles.toggleBtnActive]}
                onPress={() => setView(m)}
              >
                <Text style={[styles.toggleText, view === m && styles.toggleTextActive]}>
                  {m === 'calendar' ? 'Calendar' : 'Balance'}
                </Text>
              </Pressable>
            ))}
          </View>

          {view === 'calendar' ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.swapHint}>
                Tap a physician on any day to swap or reassign their shift.
              </Text>
              {daysInMonth(month).map((date) => {
                const ids = assignmentsByDate[date] ?? [];
                const weekend = isWeekend(date);
                const needed = weekend ? schedule.rules.weekendCoverage : schedule.rules.weekdayCoverage;
                const short = ids.length < needed;
                return (
                  <View key={date} style={[styles.dayRow, weekend && styles.dayRowWeekend]}>
                    <View style={styles.dayDate}>
                      <Text style={[styles.dayNum, weekend && styles.weekendText]}>{dayNumber(date)}</Text>
                      <Text style={[styles.dayName, weekend && styles.weekendText]}>{weekdayName(date)}</Text>
                    </View>
                    <View style={styles.dayAvatars}>
                      {ids.map((id) => {
                        const p = physById[id];
                        if (!p) return null;
                        return (
                          <Pressable
                            key={id}
                            style={styles.dayAvatar}
                            onPress={() => setSwapTarget({ date, physicianId: id })}
                          >
                            <Avatar name={p.name} color={p.color} size={28} />
                          </Pressable>
                        );
                      })}
                      <Pressable
                        style={styles.addChip}
                        onPress={() => setSwapTarget({ date, physicianId: null })}
                        hitSlop={6}
                      >
                        <Text style={styles.addChipText}>＋</Text>
                      </Pressable>
                    </View>
                    {short && (
                      <Pill
                        label={`-${needed - ids.length}`}
                        color={theme.colors.danger}
                        bg={theme.colors.dangerSoft}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <BalanceView schedule={schedule} physById={physById} />
          )}

          <Button
            title={exporting ? 'Preparing PDF…' : 'Share / Email PDF'}
            onPress={onExportPress}
            loading={exporting}
            style={{ marginTop: 18 }}
          />
          <Button
            title={busy ? 'Regenerating…' : 'Regenerate'}
            variant="secondary"
            onPress={generate}
            loading={busy}
            style={{ marginTop: 10 }}
          />
          <Text style={styles.tinyNote}>
            {schedule.edited ? 'Hand-edited · ' : ''}Created {new Date(schedule.createdAt).toLocaleString()}
          </Text>
        </ScrollView>
      )}

      {schedule && (
        <SwapShiftModal schedule={schedule} target={swapTarget} onClose={() => setSwapTarget(null)} />
      )}
    </SafeAreaView>
  );
}

function BalanceView({
  schedule,
  physById,
}: {
  schedule: Schedule;
  physById: Record<string, { name: string; color: string; fte: number }>;
}) {
  const maxHours = Math.max(1, ...schedule.stats.map((s) => s.hours));
  const ordered = [...schedule.stats].sort((a, b) => b.hours - a.hours);
  return (
    <View>
      <SectionLabel>Hours & weekends per physician</SectionLabel>
      <Card style={{ gap: 14 }}>
        {ordered.map((st) => {
          const p = physById[st.physicianId];
          if (!p) return null;
          const overWeekends = st.weekendsWorked > schedule.rules.maxWeekendsPerMonth;
          return (
            <View key={st.physicianId}>
              <View style={styles.balRow}>
                <Avatar name={p.name} color={p.color} size={26} />
                <Text style={styles.balName}>{p.name}</Text>
                <Text style={styles.balHours}>{st.hours}h</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(st.hours / maxHours) * 100}%`, backgroundColor: p.color },
                  ]}
                />
              </View>
              <View style={styles.balMetaRow}>
                <Text style={styles.balMeta}>{st.shifts} shifts</Text>
                <Pill
                  label={`${st.weekendsWorked} weekend${st.weekendsWorked === 1 ? '' : 's'}`}
                  color={overWeekends ? theme.colors.danger : theme.colors.textMuted}
                  bg={overWeekends ? theme.colors.dangerSoft : theme.colors.bg}
                />
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={styles.balFootnote}>
        Bars show total scheduled hours for {monthLabel(schedule.month)}. The solver balances toward
        each physician’s weekly target while honoring the weekend and consecutive-day limits.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 8 },
  navArrow: { fontSize: 28, fontWeight: '600', color: theme.colors.primary, width: 30, textAlign: 'center' },
  monthLabel: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  tinyNote: { textAlign: 'center', color: theme.colors.textSubtle, fontSize: theme.font.small, marginTop: 12 },
  swapHint: { fontSize: theme.font.small, color: theme.colors.textSubtle, paddingHorizontal: 4, paddingBottom: 2 },
  summaryCard: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  summaryOk: { backgroundColor: theme.colors.successSoft, borderColor: '#A6F4C5' },
  summaryWarn: { backgroundColor: theme.colors.warningSoft, borderColor: '#FEDF89' },
  summaryIcon: { fontSize: 20 },
  summaryText: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 19, marginBottom: 2 },
  toggle: { flexDirection: 'row', backgroundColor: theme.colors.border, borderRadius: theme.radius.md, padding: 3, marginBottom: 14 },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.sm, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: theme.colors.card },
  toggleText: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.textMuted },
  toggleTextActive: { color: theme.colors.text },
  dayRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 8, paddingHorizontal: 10 },
  dayRowWeekend: { backgroundColor: theme.colors.weekend, borderColor: '#FED7AA' },
  dayDate: { width: 46, alignItems: 'center' },
  dayNum: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text },
  dayName: { fontSize: theme.font.tiny, fontWeight: '600', color: theme.colors.textMuted, textTransform: 'uppercase' },
  weekendText: { color: theme.colors.warning },
  dayAvatars: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 8 },
  dayAvatar: {},
  addChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  addChipText: { color: theme.colors.textSubtle, fontSize: 16, fontWeight: '700', marginTop: -2 },
  balRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  balName: { flex: 1, marginLeft: 10, fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  balHours: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.bg, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  balMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  balMeta: { fontSize: theme.font.small, color: theme.colors.textMuted },
  balFootnote: { fontSize: theme.font.small, color: theme.colors.textSubtle, lineHeight: 18, marginTop: 14, paddingHorizontal: 4 },
});
