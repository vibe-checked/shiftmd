import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Card, EmptyState } from '../components/ui';
import { useStore } from '../store/store';
import { theme } from '../theme';
import { Physician } from '../types';

export default function PhysiciansScreen() {
  const { data, addPhysician, updatePhysician, removePhysician, loadSampleData } = useStore();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Physician | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const openAdd = () => { setEditing(null); setName(''); setEmail(''); setModal(true); };
  const openEdit = (p: Physician) => { setEditing(p); setName(p.name); setEmail(p.email ?? ''); setModal(true); };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a physician name.'); return; }
    const cleanEmail = email.trim() || undefined;
    if (editing) updatePhysician(editing.id, { name: trimmed, email: cleanEmail });
    else addPhysician(trimmed, cleanEmail);
    setModal(false);
  };

  const confirmRemove = (p: Physician) => {
    Alert.alert('Remove physician', `Remove ${p.name} and their time-off entries?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePhysician(p.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Physicians</Text>
          <Text style={styles.subtitle}>{data.physicians.length} on the rotation</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openAdd}><Text style={styles.addBtnText}>+ Add</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {data.physicians.length === 0 ? (
          <>
            <EmptyState icon="🩺" title="No physicians yet" subtitle="Add the doctors on your rotation, or load a sample roster of 10 to explore the app." />
            <Button title="Load sample roster (10)" variant="secondary" onPress={loadSampleData} />
          </>
        ) : (
          data.physicians.map((p) => (
            <Pressable key={p.id} onPress={() => openEdit(p)}>
              <Card style={styles.row}>
                <Avatar name={p.name} color={p.color} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  {p.email ? <Text style={styles.email}>✉︎ {p.email}</Text> : <Text style={styles.meta}>Tap to add email</Text>}
                </View>
                <Pressable hitSlop={10} onPress={() => confirmRemove(p)} style={{ marginLeft: 10 }}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </Card>
            </Pressable>
          ))
        )}
        {data.physicians.length > 0 && <Text style={styles.hint}>Tap a physician to edit their name or email.</Text>}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{editing ? 'Edit physician' : 'Add physician'}</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Dr. Smith" placeholderTextColor={theme.colors.textSubtle} autoFocus returnKeyType="next" />

            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="doctor@example.com" placeholderTextColor={theme.colors.textSubtle} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" returnKeyType="done" onSubmitEditing={save} />

            <Button title={editing ? 'Save changes' : 'Add physician'} onPress={save} style={{ marginTop: 8 }} />
            <Button title="Cancel" variant="ghost" onPress={() => setModal(false)} style={{ marginTop: 8 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: theme.font.h1, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.body, color: theme.colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.font.body },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  name: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.textSubtle, marginTop: 2 },
  email: { fontSize: theme.font.small, color: theme.colors.primary, marginTop: 2 },
  remove: { color: theme.colors.textSubtle, fontSize: 18, fontWeight: '600', paddingHorizontal: 4 },
  hint: { textAlign: 'center', color: theme.colors.textSubtle, fontSize: theme.font.small, marginTop: 12 },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: 22, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.text, marginBottom: 18 },
  fieldLabel: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 14, height: 50, fontSize: theme.font.h3, color: theme.colors.text, backgroundColor: theme.colors.bg, marginBottom: 16 },
});
