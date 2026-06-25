import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: theme.colors.primary, fg: '#fff' },
    secondary: { bg: theme.colors.primarySoft, fg: theme.colors.primary },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    ghost: { bg: 'transparent', fg: theme.colors.textMuted, border: theme.colors.border },
  };
  const p = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: p.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        p.border ? { borderWidth: 1, borderColor: p.border } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <Text style={[styles.btnText, { color: p.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  color,
  bg,
  style,
  textStyle,
}: {
  label: string;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg ?? theme.colors.bg },
        style,
      ]}
    >
      <Text style={[styles.pillText, { color: color ?? theme.colors.textMuted }, textStyle]}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 44, marginBottom: 8 }}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  sectionLabel: {
    fontSize: theme.font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.colors.textSubtle,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  btn: {
    height: 50,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnText: { fontSize: theme.font.h3, fontWeight: '700' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: theme.font.tiny, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: theme.font.h3, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  emptySub: { fontSize: theme.font.body, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
