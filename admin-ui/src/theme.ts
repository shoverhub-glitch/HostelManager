// Centralized Theme - matches main UI app
// Use this theme for all styling via inline styles

export const colorPalette = {
  primary: {
    25:  '#F5F3FF',
    50:  '#EDE9FE',
    100: '#DDD6FE',
    200: '#C4B5FD',
    300: '#A78BFA',
    400: '#8B5CF6',
    500: '#7C3AED',
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

  danger: {
    50:  '#FFF1F2',
    100: '#FFE4E6',
    200: '#FECDD3',
    300: '#FDA4AF',
    400: '#FB7185',
    500: '#F43F5E',
    600: '#E11D48',
    700: '#BE123C',
    800: '#9F1239',
    900: '#881337',
  },

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
};

export const brandColor = colorPalette.primary[500];

export const typography = {
  fontFamily: {
    light:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    regular:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    medium:   "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    semiBold: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    bold:     "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  fontSize: {
    xs:      11,
    sm:      13,
    md:      15,
    lg:      18,
    xl:      20,
    xxl:     24,
    xxxl:    28,
    display: 32,
  },
  letterSpacing: {
    tight:  -0.5,
    normal:  0,
    wide:    0.3,
    wider:   0.8,
  },
};

export const spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
};

export const radius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  24,
  full: 9999,
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 2px 8px rgba(0, 0, 0, 0.08)',
  lg: '0 4px 16px rgba(0, 0, 0, 0.12)',
  xl: '0 8px 24px rgba(0, 0, 0, 0.15)',
};

export const layout = {
  headerHeight: 64,
  siderWidth: 250,
  maxContentWidth: 1200,
};

export type Colors = typeof colorPalette;

// Pre-built style objects for common patterns
export const styles = {
  // Page layouts
  pageContainer: {
    padding: spacing.lg,
    minHeight: 'calc(100vh - 64px)',
    backgroundColor: colorPalette.neutral[50],
    fontFamily: typography.fontFamily.regular,
  },
  pageHeader: {
    marginBottom: spacing.lg,
  },
  pageTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: 600,
    color: colorPalette.neutral[900],
    margin: 0,
    letterSpacing: typography.letterSpacing.tight,
  } as React.CSSProperties,
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colorPalette.neutral[500],
    margin: `${spacing.xs}px 0 0 0`,
  } as React.CSSProperties,

  // Cards
  card: {
    borderRadius: radius.lg,
    boxShadow: shadows.sm,
    backgroundColor: '#FFFFFF',
    border: `1px solid ${colorPalette.neutral[200]}`,
    overflow: 'hidden',
  },
  statCard: {
    borderRadius: radius.lg,
    boxShadow: shadows.sm,
    backgroundColor: '#FFFFFF',
    border: `1px solid ${colorPalette.neutral[200]}`,
    padding: spacing.lg,
    transition: 'transform 0.2s, box-shadow 0.2s',
  },

  // Buttons
  primaryButton: {
    backgroundColor: brandColor,
    borderColor: brandColor,
    borderRadius: radius.md,
    fontWeight: 500,
    boxShadow: shadows.sm,
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderColor: colorPalette.neutral[300],
    color: colorPalette.neutral[700],
  },

  // Form elements
  input: {
    borderRadius: radius.md,
    borderColor: colorPalette.neutral[300],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: 500,
    color: colorPalette.neutral[600],
    marginBottom: spacing.xs,
  } as React.CSSProperties,

  // Status
  successBadge: {
    backgroundColor: colorPalette.success[50],
    color: colorPalette.success[600],
    border: `1px solid ${colorPalette.success[500]}`,
    borderRadius: radius.full,
    padding: '2px 8px',
    fontSize: typography.fontSize.xs,
    fontWeight: 500,
  },
  warningBadge: {
    backgroundColor: colorPalette.warning[50],
    color: colorPalette.warning[600],
    border: `1px solid ${colorPalette.warning[500]}`,
    borderRadius: radius.full,
    padding: '2px 8px',
    fontSize: typography.fontSize.xs,
    fontWeight: 500,
  },
  dangerBadge: {
    backgroundColor: colorPalette.danger[50],
    color: colorPalette.danger[600],
    border: `1px solid ${colorPalette.danger[500]}`,
    borderRadius: radius.full,
    padding: '2px 8px',
    fontSize: typography.fontSize.xs,
    fontWeight: 500,
  },

  // Layout helpers
  flexCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flexRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  flexColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },

  // Text
  textPrimary: {
    color: colorPalette.neutral[900],
    fontSize: typography.fontSize.md,
  },
  textSecondary: {
    color: colorPalette.neutral[500],
    fontSize: typography.fontSize.sm,
  },
  textMuted: {
    color: colorPalette.neutral[400],
    fontSize: typography.fontSize.xs,
  },
  textBold: {
    fontWeight: 600,
  },
  textUppercase: {
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wider,
    fontSize: typography.fontSize.xs,
    fontWeight: 600,
  },

  // Sider
  sider: {
    background: `linear-gradient(180deg, ${colorPalette.neutral[900]} 0%, ${colorPalette.neutral[950]} 100%)`,
    boxShadow: '2px 0 12px rgba(0, 0, 0, 0.2)',
  },
  siderBrand: {
    height: layout.headerHeight,
    padding: `0 ${spacing.md}`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    color: '#FFFFFF',
    fontSize: typography.fontSize.lg,
    fontWeight: 600,
    background: 'rgba(255, 255, 255, 0.05)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },

  // Header
  header: {
    background: '#FFFFFF',
    padding: `0 ${spacing.lg}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: layout.headerHeight,
    boxShadow: shadows.sm,
    borderBottom: `1px solid ${colorPalette.neutral[100]}`,
  },

  // Loading
  loadingScreen: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#FFFFFF',
  },

  // Login
  loginPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${colorPalette.neutral[50]} 0%, ${colorPalette.primary[50]} 100%)`,
    padding: spacing.md,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    padding: spacing.lg,
    background: '#FFFFFF',
  },

  // Grid
  row: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    margin: `0 ${-spacing.sm}px`,
  },
  col: (span: number) => ({
    flex: `0 0 ${(span / 12) * 100}%`,
    maxWidth: `${(span / 12) * 100}%`,
    padding: `0 ${spacing.sm}px`,
  }),
};
