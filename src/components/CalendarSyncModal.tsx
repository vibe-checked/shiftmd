import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { syncPhysicianCalendar } from '../engine/calendarSync';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { CalendarImportMode } from '../types';
import { Avatar } from './ui';

type RowStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'ok'; count: number }
  | { state: 'error'; message: string };

const MODE_LABELS: Record<CalendarImportMode, string> = {
  allday: 'All-day',
  keyword: 'Keyword',
  all: 'Every event',
};

const MODE_HINTS: Record<CalendarImportMode, string> = {
  allday:
    'Only all-day & multi-day events count as time off. Timed meetings are ignored. Best with a dedicated PTO calendar.',
  keyword: 'Only events whose title contains one of these words count as time off — case doesn’t matter:',
  all: 'Every event counts — all-day and timed. Any event on a day marks that day unavailable.',
};

export default function CalendarSyncModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { data, setPhysicianCalendar, replaceGoogleTimeOff, updateCalendarSettings } = useStore();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [syncingAll, setSyncingAll] = useState(false);

  // Seed local URL drafts from stored physicians whenever opened.
  const seeded = useMemo(() => {
    const m: Record<string, string> = {};
    data.physicians.forEach((p) => (m[p.id] = p.calendarUrl ?? ''));
    return m;
  }, [data.physicians, visible]);

  const urlFor = (id: string) => (id in urls ? urls[id] : seeded[id] ?? '');

  const googleCountFor = (id: string) =>
    data.timeOff.filter((t) => t.physicianId === id && t.source === 'google').length;

  const syncOne = async (id: string): Promise<void> => {
    const physician = data.physicians.find((p) => p.id === id);
    if (!physician) return;
    const url = urlFor(id).trim();
    setPhysicianCalendar(id, url);
    if (!url) {
      setStatus((s) => ({ ...s, [id]: { state: 'error', message: 'No URL' } }));
      return;
    }
    setStatus((s) => ({ ...s, [id]: { state: 'syncing' } }));
    const result = await syncPhysicianCalendar({ ...physician, calendarUrl: url }, data.calendarSettings);
    if (result.ok) {
      replaceGoogleTimeOff(id, result.entries);
      setStatus((s) => ({ ...s, [id]: { state: 'ok', count: result.count } }));
    } else {
      setStatus((s) => ({ ...s, [id]: { state: 'error', message: result.error ?? 'Failed' } }));
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    const withUrls = data.physicians.filter((p) => urlFor(p.id).trim());
    for (const p of withUrls) {
      await syncOne(p.id);
    }
    setSyncingAll(false);
  };

  const anyUrls = data.physicians.some((p) => urlFor(p.id).trim());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Google Calendar</Text>
            <Text style={styles.subtitle}>Import time off from each physician’s calendar</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={8}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* How-to */}
            <View style={styles.howto}>
              <Text style={styles.howtoTitle}>How to get a calendar link</Text>
              <Text style={styles.howtoStep}>
                In Google Calendar on the web, find the calendar in the left sidebar
                (under “My calendars”), hover it → tap ⋮ → “Settings and sharing”.
                {'\n'}Scroll to the “Integrate calendar” section and copy the
                “Secret address in iCal format” (it ends in /basic.ics), then paste below.
                {'\n\n'}Note: this is per-calendar — the global Settings → “Import & export”
                page does NOT have it. Works only for calendars you own.
              </Text>
            </View>

            {/* Import mode */}
            <Text style={styles.sectionLabel}>WHAT COUNTS AS TIME OFF</Text>
            <View style={styles.segment}>
              {(Object.keys(MODE_LABELS) as CalendarImportMode[]).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segBtn, data.calendarSettings.mode === m && styles.segBtnActive]}
                  onPress={() => updateCalendarSettings({ mode: m })}
                >
                  <Text
                    style={[styles.segText, data.calendarSettings.mode === m && styles.segTextActive]}
                  >
                    {MODE_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modeHint}>{MODE_HINTS[data.calendarSettings.mode]}</Text>
            {data.calendarSettings.mode === 'keyword' && (
              <TextInput
                style={styles.keywordInput}
                value={data.calendarSettings.keywords.join(', ')}
                onChangeText={(v) =>
                  updateCalendarSettings({
                    keywords: v.split(',').map((k) => k.trim()).filter(Boolean),
                  })
                }
                placeholder="vacation, pto, ooo, off…"
                placeholderTextColor={theme.colors.textSubtle}
                autoCapitalize="none"
              />
            )}

            {/* Physician rows */}
            <Text style={styles.sectionLabel}>PHYSICIAN CALENDARS</Text>
            {data.physicians.length === 0 ? (
              <Text style={styles.emptyText}>Add physicians first on the Physicians tab.</Text>
            ) : (
              data.physicians.map((p) => {
                const st = status[p.id] ?? { state: 'idle' };
                const gCount = googleCountFor(p.id);
                return (
                  <View key={p.id} style={styles.row}>
                    <View style={styles.rowHead}>
                      <Avatar name={p.name} color={p.color} size={26} />
                      <Text style={styles.rowName}>{p.name}</Text>
                      {st.state === 'syncing' ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <Pressable
                          style={styles.rowSyncBtn}
                          onPress={() => syncOne(p.id)}
                          disabled={syncingAll}
                        >
                          <Text style={styles.rowSyncText}>Sync</Text>
                        </Pressable>
                      )}
                    </View>
                    <TextInput
                      style={styles.urlInput}
                      value={urlFor(p.id)}
                      onChangeText={(v) => setUrls((u) => ({ ...u, [p.id]: v }))}
                      onEndEditing={() => setPhysicianCalendar(p.id, urlFor(p.id))}
                      placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                      placeholderTextColor={theme.colors.textSubtle}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      multiline
                    />
                    <Text style={styles.rowStatus}>
                      {st.state === 'ok' && (
                        <Text style={{ color: theme.colors.success }}>
                          ✓ Imported {st.count} event{st.count === 1 ? '' : 's'}
                        </Text>
                      )}
                      {st.state === 'error' && (
                        <Text style={{ color: theme.colors.danger }}>⚠ {st.message}</Text>
                      )}
                      {st.state !== 'ok' && st.state !== 'error' && (
                        <Text style={{ color: theme.colors.textSubtle }}>
                          {gCount > 0
                            ? `${gCount} imported · last sync ${
                                p.calendarLastSync
                                  ? new Date(p.calendarLastSync).toLocaleDateString()
                                  : '—'
                              }`
                            : 'Not synced yet'}
                        </Text>
                      )}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          {data.physicians.length > 0 && (
            <View style={styles.footer}>
              <Pressable
                style={[styles.syncAllBtn, (!anyUrls || syncingAll) && { opacity: 0.5 }]}
                onPress={syncAll}
                disabled={!anyUrls || syncingAll}
              >
                {syncingAll ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.syncAllText}>Sync all calendars</Text>
                )}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.textMuted, marginTop: 2 },
  close: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.primary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  howto: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 18,
  },
  howtoTitle: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.primary, marginBottom: 4 },
  howtoStep: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 19 },
  sectionLabel: {
    fontSize: theme.font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.colors.textSubtle,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 6,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 3,
    marginBottom: 10,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.sm, alignItems: 'center' },
  segBtnActive: { backgroundColor: theme.colors.card },
  segText: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted },
  segTextActive: { color: theme.colors.text },
  modeHint: {
    fontSize: theme.font.small,
    color: theme.colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
    marginLeft: 4,
    marginRight: 4,
  },
  keywordInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    height: 44,
    fontSize: theme.font.small,
    color: theme.colors.text,
    backgroundColor: theme.colors.card,
    marginBottom: 10,
  },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.font.body, padding: 12 },
  row: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowName: { flex: 1, marginLeft: 10, fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  rowSyncBtn: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
  },
  rowSyncText: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  urlInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    fontSize: theme.font.small,
    color: theme.colors.text,
    backgroundColor: theme.colors.bg,
  },
  rowStatus: { marginTop: 6, fontSize: theme.font.small, marginLeft: 2 },
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  syncAllBtn: {
    height: 50,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncAllText: { color: '#fff', fontWeight: '700', fontSize: theme.font.h3 },
});
