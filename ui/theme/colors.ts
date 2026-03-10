export const colorPalette = {
  primary: {
    25: '#F0F7FF',
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },

  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  danger: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },

  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7',
    600: '#9333EA',
    700: '#7E22CE',
    800: '#6B21A8',
    900: '#581C87',
  },

  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  white: '#FFFFFF',
  black: '#000000',
};

export const lightTheme = {
  primary: colorPalette.primary,
  success: colorPalette.success,
  warning: colorPalette.warning,
  danger: colorPalette.danger,
  purple: colorPalette.purple,
  neutral: colorPalette.neutral,
  white: colorPalette.white,
  black: colorPalette.black,

  background: {
    primary: '#F9FAFB',
    secondary: '#FFFFFF',
    tertiary: '#F3F4F6',
  },

  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
  },

  border: {
    light: '#F3F4F6',
    medium: '#E5E7EB',
    dark: '#D1D5DB',
  },

  action: {
    add: {
      background: colorPalette.primary[500],
      icon: colorPalette.white,
    },
  },

  modal: {
    overlay: 'rgba(15, 23, 42, 0.5)',
  },
};

export const darkTheme = {
  primary: colorPalette.primary,
  success: colorPalette.success,
  warning: colorPalette.warning,
  danger: colorPalette.danger,
  purple: colorPalette.purple,
  neutral: colorPalette.neutral,
  white: colorPalette.white,
  black: colorPalette.black,

  background: {
    primary: '#0F172A',
    secondary: '#1E293B',
    tertiary: '#334155',
  },

  text: {
    primary: '#F1F5F9',
    secondary: '#94A3B8',
    tertiary: '#64748B',
    inverse: '#0F172A',
  },

  border: {
    light: '#334155',
    medium: '#475569',
    dark: '#64748B',
  },

  action: {
    add: {
      background: colorPalette.primary[500],
      icon: colorPalette.white,
    },
  },

  modal: {
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

export type Theme = typeof lightTheme;

export const colors = lightTheme;
