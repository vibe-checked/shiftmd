import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, SectionLabel } from '../components/ui';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { Rules } from '../types';

interface StepperProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Stepper({ label, hint, value, min, max, step = 1, unit, onChange }: StepperProps) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  return (
    <View style={styles.stepRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={dec} disabled={value <= min}>
          <Text style={[styles.stepBtnText, value <= min && styles.stepBtnDisabled]}>−</Text>
        </Pressable>
        <View style={styles.stepValueWrap}>
          <Text style={styles.stepValue}>{value}</Text>
          {unit ? <Text style={styles.stepUnit}>{unit}</Text> : null}
        </View>
        <Pressable style={styles.stepBtn} onPress={inc} disabled={value >= max}>
          <Text style={[styles.stepBtnText, value >= max && styles.stepBtnDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RulesScreen() {
  const { data, updateRules } = useStore();
  const r = data.rules;
  const set = (patch: Partial<Rules>) => updateRules(patch);

  const shiftsPerWeek = (r.weeklyTargetHours / r.hoursPerShift).toFixed(1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Scheduling Rules</Text>
        <Text style={styles.subtitle}>
          The solver guarantees these are never broken when it builds a schedule.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionLabel>Workload per physician</SectionLabel>
        <Card>
          <Stepper
            label="Weekly hours target"
            hint="Hours a full-time (1.0 FTE) physician should work each week"
            value={r.weeklyTargetHours}
            min={10}
            max={80}
            step={4}
            unit="h"
            onChange={(v) => set({ weeklyTargetHours: v })}
          />
          <Divider />
          <Stepper
            label="Hours per shift"
            hint="Credit for one day worked"
            value={r.hoursPerShift}
            min={4}
            max={24}
            step={1}
            unit="h"
            onChange={(v) => set({ hoursPerShift: v })}
          />
          <View style={styles.derived}>
            <Text style={styles.derivedText}>
              ≈ {shiftsPerWeek} shifts/week for a full-time physician
            </Text>
          </View>
        </Card>

        <SectionLabel>Fairness limits</SectionLabel>
        <Card>
          <Stepper
            label="Max weekends / month"
            hint="Most weekends any physician can be scheduled"
            value={r.maxWeekendsPerMonth}
            min={0}
            max={5}
            onChange={(v) => set({ maxWeekendsPerMonth: v })}
          />
          <Divider />
          <Stepper
            label="Max consecutive days"
            hint="Longest run of days without a day off"
            value={r.maxConsecutiveDays}
            min={1}
            max={14}
            onChange={(v) => set({ maxConsecutiveDays: v })}
          />
        </Card>

        <SectionLabel>Daily coverage</SectionLabel>
        <Card>
          <Stepper
            label="Weekday coverage"
            hint="Physicians needed Mon–Fri"
            value={r.weekdayCoverage}
            min={1}
            max={20}
            onChange={(v) => set({ weekdayCoverage: v })}
          />
          <Divider />
          <Stepper
            label="Weekend coverage"
            hint="Physicians needed Sat & Sun"
            value={r.weekendCoverage}
            min={1}
            max={20}
            onChange={(v) => set({ weekendCoverage: v })}
          />
        </Card>

        <Text style={styles.footer}>
          Time-off requests are always respected — set those up under the Time Off tab.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.body, color: theme.colors.textMuted, marginTop: 4, lineHeight: 20 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stepLabel: { fontSize: theme.font.h3, fontWeight: '600', color: theme.colors.text },
  stepHint: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.bg, borderRadius: theme.radius.md },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 24, fontWeight: '600', color: theme.colors.primary },
  stepBtnDisabled: { color: theme.colors.textSubtle, opacity: 0.4 },
  stepValueWrap: { minWidth: 48, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  stepValue: { fontSize: theme.font.h3, fontWeight: '800', color: theme.colors.text },
  stepUnit: { fontSize: theme.font.small, color: theme.colors.textMuted, marginLeft: 1 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 6 },
  derived: { marginTop: 10, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.sm, padding: 10 },
  derivedText: { fontSize: theme.font.small, color: theme.colors.primary, fontWeight: '600', textAlign: 'center' },
  footer: { fontSize: theme.font.small, color: theme.colors.textSubtle, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
