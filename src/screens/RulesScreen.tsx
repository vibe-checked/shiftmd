import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, SectionLabel } from '../components/ui';
import { clock12, parseHHMM, toHHMM } from '../engine/shifttime';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { DEFAULT_TARGET_PER_MONTH, Rules } from '../types';

function Stepper({
  label, hint, value, display, min, max, step = 1, onChange,
}: {
  label: string; hint: string; value: number; display: string;
  min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))} disabled={value <= min}>
          <Text style={[styles.stepBtnText, value <= min && styles.dim]}>−</Text>
        </Pressable>
        <View style={styles.valWrap}><Text style={styles.val}>{display}</Text></View>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, +(value + step).toFixed(2)))} disabled={value >= max}>
          <Text style={[styles.stepBtnText, value >= max && styles.dim]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function RulesScreen() {
  const { data, updateRules } = useStore();
  const r = data.rules;
  const set = (patch: Partial<Rules>) => updateRules(patch);
  const wsMin = parseHHMM(r.weekStartTime);
  const weeks = Math.round(r.horizonMonths * 4.345);
  const perWeek = weeks > 0 ? (r.targetHours / weeks).toFixed(1) : '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Rules</Text>
        <Text style={styles.subtitle}>The solver guarantees these are never broken.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionLabel>Horizon & target</SectionLabel>
        <Card>
          <Stepper
            label="Scheduling horizon"
            hint="How many months each generated schedule covers"
            value={r.horizonMonths}
            display={`${r.horizonMonths} mo`}
            min={1}
            max={12}
            onChange={(v) => set({ horizonMonths: v, targetHours: Math.round((r.targetHours / r.horizonMonths) * v) })}
          />
          <Divider />
          <Stepper
            label="Target hours"
            hint="Hours each physician aims for across the whole horizon"
            value={r.targetHours}
            display={`${r.targetHours} h`}
            min={0}
            max={4000}
            step={10}
            onChange={(v) => set({ targetHours: v })}
          />
          <View style={styles.derived}>
            <Text numberOfLines={1} style={styles.derivedText}>
              ≈ {perWeek} h/wk · {weeks} wks  ·{' '}
              <Text style={styles.resetLink} onPress={() => set({ targetHours: DEFAULT_TARGET_PER_MONTH * r.horizonMonths })}>
                reset to {DEFAULT_TARGET_PER_MONTH}h/mo
              </Text>
            </Text>
          </View>
        </Card>

        <SectionLabel>The week</SectionLabel>
        <Card>
          <Stepper
            label="Week starts (Monday)"
            hint="Each week & day runs from this Monday time to the next"
            value={wsMin}
            display={clock12(wsMin)}
            min={0}
            max={1410}
            step={30}
            onChange={(v) => set({ weekStartTime: toHHMM(v) })}
          />
        </Card>

        <SectionLabel>Rest rules</SectionLabel>
        <Card>
          <Stepper
            label="Long-shift threshold"
            hint="Shifts longer than this require the longer rest after"
            value={r.restThresholdHours}
            display={`${r.restThresholdHours} h`}
            min={1}
            max={36}
            onChange={(v) => set({ restThresholdHours: v })}
          />
          <Divider />
          <Stepper
            label="Rest after a short shift"
            hint={`Min hours off after a shift ≤ ${r.restThresholdHours}h`}
            value={r.shortRestHours}
            display={`${r.shortRestHours} h`}
            min={0}
            max={48}
            onChange={(v) => set({ shortRestHours: v })}
          />
          <Divider />
          <Stepper
            label="Rest after a long shift"
            hint={`Min hours off after a shift > ${r.restThresholdHours}h`}
            value={r.longRestHours}
            display={`${r.longRestHours} h`}
            min={0}
            max={72}
            onChange={(v) => set({ longRestHours: v })}
          />
        </Card>

        <Text style={styles.footer}>
          Define the repeating shifts on the Shifts tab. Time off is always respected.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.body, color: theme.colors.textMuted, marginTop: 4 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stepLabel: { fontSize: theme.font.h3, fontWeight: '600', color: theme.colors.text },
  stepHint: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.bg, borderRadius: theme.radius.md },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 24, fontWeight: '600', color: theme.colors.primary },
  dim: { color: theme.colors.textSubtle, opacity: 0.4 },
  valWrap: { minWidth: 76, alignItems: 'center' },
  val: { fontSize: theme.font.h3, fontWeight: '800', color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 6 },
  derived: { marginTop: 10, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.sm, padding: 10 },
  derivedText: { fontSize: theme.font.small, color: theme.colors.primary, fontWeight: '600', textAlign: 'center' },
  resetLink: { textDecorationLine: 'underline', fontWeight: '700' },
  footer: { fontSize: theme.font.small, color: theme.colors.textSubtle, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
