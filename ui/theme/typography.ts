// ─── typography.ts ────────────────────────────────────────────────────────────
// All existing keys preserved — zero breaking changes.
// Added: fontFamily, letterSpacing, and textPresets.
//
// INSTALL (once):
//   npx expo install @expo-google-fonts/inter expo-font expo-splash-screen
//
// LOAD IN app/_layout.tsx:
//   import {
//     Inter_300Light, Inter_400Regular, Inter_500Medium,
//     Inter_600SemiBold, Inter_700Bold, useFonts,
//   } from '@expo-google-fonts/inter';
//   import * as SplashScreen from 'expo-splash-screen';
//   SplashScreen.preventAutoHideAsync();
//
//   const [fontsLoaded] = useFonts({
//     'Inter-Light':    Inter_300Light,
//     'Inter-Regular':  Inter_400Regular,
//     'Inter-Medium':   Inter_500Medium,
//     'Inter-SemiBold': Inter_600SemiBold,
//     'Inter-Bold':     Inter_700Bold,
//   });
//   useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);
//   if (!fontsLoaded) return null;
// ─────────────────────────────────────────────────────────────────────────────

export const typography = {

  // ── Font Sizes (unchanged) ───────────────────────────────────────────────
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

  // ── Font Weights (unchanged) ─────────────────────────────────────────────
  fontWeight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },

  // ── Line Heights (unchanged) ─────────────────────────────────────────────
  lineHeight: {
    tight:   1.2,
    normal:  1.5,
    relaxed: 1.75,
  },

  // ── Font Families (NEW — Inter) ──────────────────────────────────────────
  // Use these instead of fontWeight wherever possible.
  // On iOS/Android, named font files are more reliable than numeric weights.
  fontFamily: {
    light:    'Inter-Light',      // 300 — hero numbers, display text
    regular:  'Inter-Regular',    // 400 — body text, descriptions
    medium:   'Inter-Medium',     // 500 — list items, UI labels
    semiBold: 'Inter-SemiBold',   // 600 — buttons, field labels, subheadings
    bold:     'Inter-Bold',       // 700 — headings, strong emphasis
  },

  // ── Letter Spacing (NEW) ─────────────────────────────────────────────────
  letterSpacing: {
    tight:  -0.5,   // Large headings — tighter feels premium
    normal:  0,     // Body text
    wide:    0.3,   // Buttons, UI labels
    wider:   0.8,   // ALL-CAPS micro labels (FieldLabel component)
  },

} as const;

// ─── Text Style Presets (NEW) ─────────────────────────────────────────────────
// Spread directly into StyleSheet objects.
// Combine with a color from your theme for complete text styles.
//
// Example:
//   <Text style={[textPresets.h2, { color: colors.text.primary }]}>Dashboard</Text>
//   <Text style={[textPresets.label, { color: colors.text.secondary }]}>EMAIL</Text>
// ─────────────────────────────────────────────────────────────────────────────
export const textPresets = {

  // Display — hero stats, occupancy numbers
  display: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   typography.fontSize.display,
    letterSpacing: typography.letterSpacing.tight,
    lineHeight: typography.fontSize.display * typography.lineHeight.tight,
  },

  // H1 — screen/page headings
  h1: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   typography.fontSize.xxxl,
    letterSpacing: typography.letterSpacing.tight,
    lineHeight: typography.fontSize.xxxl * typography.lineHeight.tight,
  },

  // H2 — section headings
  h2: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
    lineHeight: typography.fontSize.xxl * typography.lineHeight.tight,
  },

  // H3 — card titles, list group headers
  h3: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xl,
    letterSpacing: 0,
    lineHeight: typography.fontSize.xl * typography.lineHeight.normal,
  },

  // H4 — subsection labels, card subtitles
  h4: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.lg,
    letterSpacing: 0,
    lineHeight: typography.fontSize.lg * typography.lineHeight.normal,
  },

  // Body — default readable text
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.md,
    letterSpacing: 0,
    lineHeight: typography.fontSize.md * typography.lineHeight.normal,
  },

  // Body Medium — slightly emphasized body
  bodyMedium: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.md,
    letterSpacing: 0,
    lineHeight: typography.fontSize.md * typography.lineHeight.normal,
  },

  // Caption — supporting small text
  caption: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
    letterSpacing: 0,
    lineHeight: typography.fontSize.sm * typography.lineHeight.relaxed,
  },

  // Label — ALL-CAPS field labels (FieldLabel component)
  label: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    lineHeight:    typography.fontSize.xs * typography.lineHeight.normal,
    textTransform: 'uppercase' as const,
  },

  // Button — primary/secondary action buttons
  button: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Button Small — compact buttons, chips
  buttonSm: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Hint — inline validation text under inputs
  hint: {
    fontFamily:    typography.fontFamily.regular,
    fontSize:      typography.fontSize.xs,
    letterSpacing: 0,
    lineHeight:    typography.fontSize.xs * typography.lineHeight.relaxed,
  },

  // Badge — status pills, count chips
  badge: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Tab — bottom navigation labels
  tab: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Mono — amounts, booking IDs, room numbers
  mono: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.md,
    letterSpacing: 0.5,
  },

} as const;

export default typography;