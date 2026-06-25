import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarSyncModal from '../components/CalendarSyncModal';
import { Avatar, Button, Card, EmptyState, Pill } from '../components/ui';
import { fromISO, toISO } from '../engine/dates';
import { useStore } from '../store/store';
import { theme } from '../theme';

function rangeLabel(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = fromISO(start).toLocaleDateString(undefined, opts);
  if (start === end) return s;
  const e = fromISO(end).toLocaleDateString(undefined, opts);
  return `${s} – ${e}`;
}

function daysBetween(start: string, end: string): number {
  return Math.round((fromISO(end).getTime() - fromISO(start).getTime()) / 86400000) + 1;
}

export default function TimeOffScreen() {
  const { data, addTimeOff, removeTimeOff } = useStore();
  const [modal, setModal] = useState(false);
  const [physicianId, setPhysicianId] = useState<string>('');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const googleCount = data.timeOff.filter((t) => t.source === 'google').length;
  const linkedCount = data.physicians.filter((p) => p.calendarUrl).length;

  const sorted = useMemo(
    () => [...data.timeOff].sort((a, b) => (a.start < b.start ? -1 : 1)),
    [data.timeOff],
  );

  const nameOf = (id: string) => data.physicians.find((p) => p.id === id)?.name ?? 'Unknown';
  const colorOf = (id: string) => data.physicians.find((p) => p.id === id)?.color ?? theme.colors.textSubtle;

  const openAdd = () => {
    if (data.physicians.length === 0) {
      Alert.alert('Add physicians first', 'Create your roster on the Physicians tab before adding time off.');
      return;
    }
    setPhysicianId(data.physicians[0].id);
    const today = new Date();
    setStart(today);
    setEnd(today);
    setReason('');
    setModal(true);
  };

  const save = () => {
    let s = toISO(start);
    let e = toISO(end);
    if (e < s) [s, e] = [e, s];
    addTimeOff({ physicianId, start: s, end: e, reason: reason.trim() || undefined, source: 'manual' });
    setModal(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Time Off</Text>
          <Text style={styles.subtitle}>Vacation & unavailable days</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => setCalendarOpen(true)}>
          <Card style={styles.gcal}>
            <Text style={{ fontSize: 22 }}>📅</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.gcalTitle}>Google Calendar</Text>
              <Text style={styles.gcalSub}>
                {linkedCount > 0
                  ? `${linkedCount} linked · ${googleCount} imported`
                  : 'Import vacation from iCal links'}
              </Text>
            </View>
            <Pill
              label={linkedCount > 0 ? 'Sync' : 'Set up'}
              color={theme.colors.primary}
              bg={theme.colors.primarySoft}
            />
          </Card>
        </Pressable>

        {sorted.length === 0 ? (
          <EmptyState
            icon="🏖️"
            title="No time off logged"
            subtitle="Add vacation days or other unavailable dates. The scheduler will never assign a physician on their days off."
          />
        ) : (
          sorted.map((t) => (
            <Card key={t.id} style={styles.row}>
              <Avatar name={nameOf(t.physicianId)} color={colorOf(t.physicianId)} size={32} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{nameOf(t.physicianId)}</Text>
                  {t.source === 'google' && (
                    <Pill label="📅 Calendar" color={theme.colors.primary} bg={theme.colors.primarySoft} />
                  )}
                </View>
                <Text style={styles.meta}>
                  {rangeLabel(t.start, t.end)} · {daysBetween(t.start, t.end)} day
                  {daysBetween(t.start, t.end) === 1 ? '' : 's'}
                  {t.reason ? ` · ${t.reason}` : ''}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={() => removeTimeOff(t.id)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add time off</Text>

            <Text style={styles.fieldLabel}>Physician</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
                {data.physicians.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setPhysicianId(p.id)}
                    style={[styles.physChip, physicianId === p.id && { borderColor: p.color, backgroundColor: p.color + '18' }]}
                  >
                    <Avatar name={p.name} color={p.color} size={22} />
                    <Text style={[styles.physChipText, physicianId === p.id && { color: p.color }]}>
                      {p.name.replace(/^Dr\.?\s*/i, '')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>From</Text>
                <Pressable style={styles.dateBtn} onPress={() => setPicker(picker === 'start' ? null : 'start')}>
                  <Text style={styles.dateText}>{fromISO(toISO(start)).toLocaleDateString()}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>To</Text>
                <Pressable style={styles.dateBtn} onPress={() => setPicker(picker === 'end' ? null : 'end')}>
                  <Text style={styles.dateText}>{fromISO(toISO(end)).toLocaleDateString()}</Text>
                </Pressable>
              </View>
            </View>

            {picker === 'start' && (
              <DateTimePicker
                value={start}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS !== 'ios') setPicker(null);
                  if (d) {
                    setStart(d);
                    if (d > end) setEnd(d);
                  }
                }}
              />
            )}
            {picker === 'end' && (
              <DateTimePicker
                value={end}
                mode="date"
                minimumDate={start}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS !== 'ios') setPicker(null);
                  if (d) setEnd(d);
                }}
              />
            )}

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Reason (optional)</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Vacation, conference, CME…"
              placeholderTextColor={theme.colors.textSubtle}
            />

            <Button title="Add time off" onPress={save} style={{ marginTop: 18 }} />
            <Button title="Cancel" variant="ghost" onPress={() => setModal(false)} style={{ marginTop: 8 }} />
          </View>
        </View>
      </Modal>

      <CalendarSyncModal visible={calendarOpen} onClose={() => setCalendarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.body, color: theme.colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.font.body },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  gcal: { flexDirection: 'row', alignItems: 'center' },
  gcalTitle: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  gcalSub: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2 },
  remove: { color: theme.colors.textSubtle, fontSize: 18, fontWeight: '600', paddingHorizontal: 4 },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: 22, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text, marginBottom: 18 },
  fieldLabel: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 8 },
  physChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg },
  physChipText: { fontSize: theme.font.small, fontWeight: '600', color: theme.colors.textMuted },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, height: 48, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: theme.colors.bg },
  dateText: { fontSize: theme.font.body, fontWeight: '600', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 14, height: 48, fontSize: theme.font.body, color: theme.colors.text, backgroundColor: theme.colors.bg },
});
