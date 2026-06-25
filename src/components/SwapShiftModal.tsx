import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dayNumber, fromISO, isWeekend, weekdayName, weekendKey } from '../engine/dates';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { Schedule } from '../types';
import { Avatar, Pill } from './ui';

export interface SwapTarget {
  date: string;
  physicianId: string;
}

export default function SwapShiftModal({
  schedule,
  target,
  onClose,
}: {
  schedule: Schedule;
  target: SwapTarget | null;
  onClose: () => void;
}) {
  const { data, reassignShift } = useStore();
  if (!target) return null;

  const physById = Object.fromEntries(data.physicians.map((p) => [p.id, p]));
  const from = physById[target.physicianId];
  if (!from) return null;

  const dateLabel = `${weekdayName(target.date)} ${fromISO(target.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;

  const onThisDay = new Set(
    schedule.assignments.filter((a) => a.date === target.date).map((a) => a.physicianId),
  );

  const weekendCap = schedule.rules.maxWeekendsPerMonth;
  const dateIsWeekend = isWeekend(target.date);

  const isOff = (pid: string) =>
    data.timeOff.some((t) => t.physicianId === pid && t.start <= target.date && target.date <= t.end);

  const worksThisWeekend = (pid: string) =>
    schedule.assignments.some(
      (a) => a.physicianId === pid && weekendKey(a.date) === weekendKey(target.date),
    );

  const weekendsWorked = (pid: string) =>
    schedule.stats.find((s) => s.physicianId === pid)?.weekendsWorked ?? 0;

  // Candidates = everyone else not already on this day.
  const candidates = data.physicians
    .filter((p) => p.id !== target.physicianId && !onThisDay.has(p.id))
    .map((p) => {
      const warnings: string[] = [];
      if (isOff(p.id)) warnings.push('On time off');
      if (dateIsWeekend && !worksThisWeekend(p.id) && weekendsWorked(p.id) >= weekendCap) {
        warnings.push(`At ${weekendCap}-weekend limit`);
      }
      return { p, warnings };
    });

  const choose = (toId: string | null) => {
    reassignShift(schedule.id, target.date, target.physicianId, toId);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <Avatar name={from.name} color={from.color} size={34} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.title}>{from.name}</Text>
              <Text style={styles.sub}>
                Can’t work {dateLabel}? Pick who covers it{dateIsWeekend ? ' · weekend' : ''}.
              </Text>
            </View>
          </View>

          <Text style={styles.section}>REASSIGN THIS SHIFT TO</Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {candidates.length === 0 ? (
              <Text style={styles.empty}>Everyone else is already working this day.</Text>
            ) : (
              candidates.map(({ p, warnings }) => (
                <Pressable key={p.id} style={styles.cand} onPress={() => choose(p.id)}>
                  <Avatar name={p.name} color={p.color} size={28} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.candName}>{p.name}</Text>
                    {warnings.length > 0 && (
                      <View style={styles.warnRow}>
                        {warnings.map((w) => (
                          <Pill key={w} label={`⚠ ${w}`} color={theme.colors.warning} bg={theme.colors.warningSoft} />
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.pick}>Assign →</Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          <Pressable style={styles.removeBtn} onPress={() => choose(null)}>
            <Text style={styles.removeText}>Remove — leave this shift open</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.note}>
            Manual swaps stay until you regenerate the schedule.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: 20,
    paddingBottom: 34,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text },
  sub: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2 },
  section: { fontSize: theme.font.tiny, fontWeight: '700', letterSpacing: 0.6, color: theme.colors.textSubtle, marginBottom: 8, marginLeft: 2 },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.body, padding: 12, textAlign: 'center' },
  cand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    marginBottom: 8,
  },
  candName: { fontSize: theme.font.h3, fontWeight: '600', color: theme.colors.text },
  warnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  pick: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  removeBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: theme.colors.danger, fontWeight: '700', fontSize: theme.font.body },
  cancelBtn: { marginTop: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: theme.colors.textMuted, fontWeight: '700', fontSize: theme.font.body },
  note: { textAlign: 'center', color: theme.colors.textSubtle, fontSize: theme.font.small, marginTop: 8 },
});
