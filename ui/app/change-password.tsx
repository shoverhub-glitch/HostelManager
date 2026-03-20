import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  KeyRound,
  Eye,
  EyeOff,
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  Lock,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { authService } from '@/services/apiClient';

// ── Password strength rules ───────────────────────────────────────────────────
const RULES = [
  { label: 'At least 8 characters',           test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter',             test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter',             test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number',                       test: (v: string) => /\d/.test(v) },
  { label: 'One special character',            test: (v: string) => /[^\w\s]/.test(v) },
];

function validatePasswordStrength(value: string): string | null {
  for (const rule of RULES) {
    if (!rule.test(value)) return rule.label + ' is required';
  }
  return null;
}

// ── Password field ────────────────────────────────────────────────────────────
function PasswordField({
  label, value, onChange, placeholder, show, onToggle, editable,
  cardBg, cardBorder, textPrimary, textTertiary, brandColor,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; show: boolean; onToggle: () => void;
  editable: boolean; cardBg: string; cardBorder: string;
  textPrimary: string; textTertiary: string; brandColor: string;
}) {
  return (
    <View style={pfStyles.wrap}>
      <Text style={[pfStyles.label, { color: textPrimary }]}>{label}</Text>
      <View style={[pfStyles.row, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Lock size={15} color={textTertiary} strokeWidth={2} style={pfStyles.lockIcon} />
        <TextInput
          style={[pfStyles.input, { color: textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={textTertiary}
          secureTextEntry={!show}
          autoCapitalize="none"
          value={value}
          onChangeText={onChange}
          editable={editable}
        />
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={pfStyles.eye}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {show
            ? <EyeOff size={17} color={textTertiary} strokeWidth={2} />
            : <Eye    size={17} color={textTertiary} strokeWidth={2} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
const pfStyles = StyleSheet.create({
  wrap:     { gap: spacing.xs },
  label:    { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm, letterSpacing: typography.letterSpacing.wide },
  row:      { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, height: 50 },
  lockIcon: { marginRight: spacing.sm },
  input:    { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, padding: 0 },
  eye:      { paddingLeft: spacing.sm },
});

// ── Strength rule row ─────────────────────────────────────────────────────────
function StrengthRule({ label, met, successColor, textTertiary }: {
  label: string; met: boolean; successColor: string; textTertiary: string;
}) {
  return (
    <View style={srStyles.row}>
      <CheckCircle
        size={13}
        color={met ? successColor : textTertiary}
        strokeWidth={met ? 2.5 : 1.5}
        style={{ opacity: met ? 1 : 0.4 }}
      />
      <Text style={[srStyles.text, { color: met ? successColor : textTertiary }]}>{label}</Text>
    </View>
  );
}
const srStyles = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, letterSpacing: typography.letterSpacing.wide },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function ChangePasswordScreen() {
  const { colors, isDark }  = useTheme();
  const router              = useRouter();
  const { isTablet, contentMaxWidth, formMaxWidth } = useResponsiveLayout();

  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOld,     setShowOld]     = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Color aliases ────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const pageBg        = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;
  const successColor  = colors.success[500];

  // ── Live strength rules ──────────────────────────────────────────────────
  const rulesMet  = RULES.map(r => r.test(newPassword));
  const allMet    = rulesMet.every(Boolean);
  const metCount  = rulesMet.filter(Boolean).length;
  const strengthPct = (metCount / RULES.length) * 100;
  const strengthColor = metCount <= 1
    ? colors.danger[500]
    : metCount <= 3
      ? colors.warning[500]
      : colors.success[500];

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('All fields are required'); return;
    }
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) { setError(pwErr); return; }
    if (oldPassword === newPassword) {
      setError('New password must differ from current password'); return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match'); return;
    }
    try {
      setLoading(true); setError(null);
      await authService.changePassword({ oldPassword, newPassword });
      Alert.alert('Password Updated', 'Your password has been changed successfully.', [
        { text: 'OK', onPress: () => {
          setOldPassword(''); setNewPassword(''); setConfirmPassword('');
          router.back();
        }},
      ]);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sharedFieldProps = { editable: !loading, cardBg, cardBorder, textPrimary, textTertiary, brandColor };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={[
            styles.content,
            isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
          ]}>

            {/* ── Back button ────────────────────────────────────────────── */}
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
            </TouchableOpacity>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={styles.header}>
              <View style={[styles.headerIconBox, { backgroundColor: brandLight }]}>
                <KeyRound size={28} color={brandText} strokeWidth={2} />
              </View>
              <Text style={[styles.title, { color: textPrimary }]}>Change Password</Text>
              <Text style={[styles.subtitle, { color: textSecondary }]}>
                Enter your current password, then set a strong new one.
              </Text>
            </View>

            {/* ── Form ───────────────────────────────────────────────────── */}
            <View style={[
              styles.form,
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>

              {/* Error banner */}
              {error && (
                <View style={[styles.errorBanner, {
                  backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                  borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                }]}>
                  <AlertCircle size={15} color={isDark ? colors.danger[300] : colors.danger[500]} strokeWidth={2} />
                  <Text style={[styles.errorText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                    {error}
                  </Text>
                </View>
              )}

              {/* Current password */}
              <PasswordField
                label="Current Password"
                placeholder="Enter current password"
                value={oldPassword}
                onChange={setOldPassword}
                show={showOld}
                onToggle={() => setShowOld(v => !v)}
                {...sharedFieldProps}
              />

              {/* New password */}
              <PasswordField
                label="New Password"
                placeholder="Create a strong password"
                value={newPassword}
                onChange={(v) => { setNewPassword(v); setError(null); }}
                show={showNew}
                onToggle={() => setShowNew(v => !v)}
                {...sharedFieldProps}
              />

              {/* Strength indicator — only shown when user starts typing */}
              {newPassword.length > 0 && (
                <View style={styles.strengthBlock}>
                  {/* Progress bar */}
                  <View style={[styles.strengthTrack, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[200] }]}>
                    <View style={[styles.strengthFill, {
                      width: `${strengthPct}%`,
                      backgroundColor: strengthColor,
                    }]} />
                  </View>

                  {/* Rules checklist */}
                  <View style={styles.rulesList}>
                    {RULES.map((rule, i) => (
                      <StrengthRule
                        key={i}
                        label={rule.label}
                        met={rulesMet[i]}
                        successColor={successColor}
                        textTertiary={textTertiary}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Confirm password */}
              <PasswordField
                label="Confirm New Password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirm}
                onToggle={() => setShowConfirm(v => !v)}
                {...sharedFieldProps}
              />

              {/* Match indicator */}
              {confirmPassword.length > 0 && (
                <View style={styles.matchRow}>
                  <CheckCircle
                    size={13}
                    color={confirmPassword === newPassword ? successColor : colors.danger[500]}
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.matchText, {
                    color: confirmPassword === newPassword ? successColor : colors.danger[500],
                  }]}>
                    {confirmPassword === newPassword ? 'Passwords match' : 'Passwords do not match'}
                  </Text>
                </View>
              )}

              {/* CTA */}
              <TouchableOpacity
                style={[styles.ctaBtn, {
                  backgroundColor: brandColor,
                  opacity: loading ? 0.55 : 1,
                }]}
                onPress={handleChangePassword}
                activeOpacity={0.85}
                disabled={loading}>
                {loading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={[styles.ctaBtnText, { color: colors.white }]}>Update Password</Text>}
              </TouchableOpacity>

            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  scroll: {
    flexGrow:          1,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },

  content: { width: '100%' },

  // Back
  backBtn: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.md,
  },

  // Header
  header: {
    alignItems:    'center',
    marginBottom:  spacing.xl,
    paddingHorizontal: spacing.md,
  },
  headerIconBox: {
    width:          64,
    height:         64,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.md,
  },
  title: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.sm,
  },
  subtitle: {
    fontFamily:  typography.fontFamily.regular,
    fontSize:    typography.fontSize.sm,
    textAlign:   'center',
    lineHeight:  20,
  },

  // Form
  form: {
    width: '100%',
    gap:   spacing.lg,
  },

  // Error
  errorBanner: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               spacing.sm,
    padding:           spacing.md,
    borderRadius:      radius.lg,
    borderWidth:       1,
  },
  errorText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
    flex:       1,
    lineHeight: 18,
  },

  // Strength
  strengthBlock: { gap: spacing.sm },
  strengthTrack: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  strengthFill: {
    height:       '100%',
    borderRadius: 2,
  },
  rulesList: {
    gap:          spacing.xs,
    paddingLeft:  spacing.xs,
  },

  // Match
  matchRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginTop:     -spacing.sm,
  },
  matchText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  // CTA
  ctaBtn: {
    borderRadius:    radius.lg,
    paddingVertical: spacing.md,
    alignItems:      'center',
    justifyContent:  'center',
    minHeight:       52,
    ...shadows.md,
  },
  ctaBtnText: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});