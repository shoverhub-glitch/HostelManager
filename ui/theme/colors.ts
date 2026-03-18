export const colorPalette = {
  primary: {
    25:  '#F5F3FF',
    50:  '#EDE9FE',
    100: '#DDD6FE',
    200: '#C4B5FD',
    300: '#A78BFA',
    400: '#8B5CF6',
    500: '#7C3AED',  // Main brand — deep violet
    600: '#6D28D9',
    700: '#5B21B6',
    800: '#4C1D95',
    900: '#3B0764',
  },

  success: {
    50:  '#ECFDF5',
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

  // Danger: Rose — more modern than pure red
  danger: {
    50:  '#FFF1F2',
    100: '#FFE4E6',
    200: '#FECDD3',
    300: '#FDA4AF',
    400: '#FB7185',
    500: '#F43F5E',  // Rose — feels modern
    600: '#E11D48',
    700: '#BE123C',
    800: '#9F1239',
    900: '#881337',
  },

  // Purple: kept for accent use
  purple: {
    50:  '#FAF5FF',
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

  // Neutral: Cool Slate — pairs perfectly with indigo primary
  neutral: {
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },

  white: '#FFFFFF',
  black: '#000000',
};

export const lightTheme = {
  primary:  colorPalette.primary,
  success:  colorPalette.success,
  warning:  colorPalette.warning,
  danger:   colorPalette.danger,
  purple:   colorPalette.purple,
  neutral:  colorPalette.neutral,
  white:    colorPalette.white,
  black:    colorPalette.black,

  background: {
    primary:   '#F8FAFC',   // Cool slate-white page bg
    secondary: '#FFFFFF',   // Pure white — cards, inputs
    tertiary:  '#F1F5F9',   // Subtle section dividers
    elevated:  '#FFFFFF',   // Modals, sheets
  },

  text: {
    primary:   '#0F172A',   // Near-black — strong readability
    secondary: '#475569',   // Slate-600 — supporting text
    tertiary:  '#94A3B8',   // Slate-400 — placeholders, hints
    inverse:   '#FFFFFF',
    accent:    '#7C3AED',   // Primary violet for links/labels
  },

  border: {
    light:  '#F1F5F9',      // Barely-there dividers
    medium: '#E2E8F0',      // Default input/card borders
    dark:   '#CBD5E1',      // Strong separators
    focus:  '#8B5CF6',      // Input focus ring — violet
  },

  action: {
    add: {
      background: colorPalette.primary[500],
      icon:       colorPalette.white,
    },
  },

  surface: {
    card:    '#FFFFFF',
    input:   '#F8FAFC',
    overlay: 'rgba(15, 23, 42, 0.04)',
  },

  modal: {
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
};

export const darkTheme = {
  primary:  colorPalette.primary,
  success:  colorPalette.success,
  warning:  colorPalette.warning,
  danger:   colorPalette.danger,
  purple:   colorPalette.purple,
  neutral:  colorPalette.neutral,
  white:    colorPalette.white,
  black:    colorPalette.black,

  background: {
    primary:   '#0B1120',   // Deepest navy — page/screen bg
    secondary: '#131C2E',   // Cards, sheets — slightly lighter
    tertiary:  '#1A2540',   // Inputs, secondary surfaces
    elevated:  '#1E2D45',   // Modals, popovers — pop above cards
  },

  text: {
    primary:   '#F0F4FF',   // Slightly blue-white — easier on eyes than pure white
    secondary: '#8899B4',   // Muted slate-blue — secondary labels
    tertiary:  '#4F6075',   // Dim — placeholders, disabled
    inverse:   '#0B1120',
    accent:    '#A78BFA',   // Primary-300 violet — links on dark
  },

  border: {
    light:  '#1A2540',      // Barely-there on dark — section dividers
    medium: '#243352',      // Default borders — visible but not harsh
    dark:   '#2E4168',      // Emphasized borders
    focus:  '#8B5CF6',      // Same violet focus ring in both modes
  },

  action: {
    add: {
      background: colorPalette.primary[400],  // Slightly lighter on dark
      icon:       colorPalette.white,
    },
  },

  surface: {
    card:    '#131C2E',
    input:   '#0F1929',
    overlay: 'rgba(139, 92, 246, 0.06)',      // Subtle violet tint on hover
  },

  modal: {
    overlay: 'rgba(2, 6, 23, 0.7)',
  },
};

export type Theme = typeof lightTheme;
export const colors = lightTheme;