export const theme = {
  colors: {
    bg: '#F2F4F7',
    card: '#FFFFFF',
    border: '#E4E7EC',
    text: '#101828',
    textMuted: '#667085',
    textSubtle: '#98A2B3',
    primary: '#2563EB',
    primarySoft: '#EFF4FF',
    danger: '#DC2626',
    dangerSoft: '#FEF3F2',
    success: '#059669',
    successSoft: '#ECFDF3',
    warning: '#D97706',
    warningSoft: '#FFFAEB',
    weekend: '#FFF7ED',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 22 },
  space: (n: number) => n * 4,
  font: {
    h1: 28,
    h2: 20,
    h3: 17,
    body: 15,
    small: 13,
    tiny: 11,
  },
};

export type Theme = typeof theme;
