import { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Building2, Eye, EyeOff, ArrowRight, Lock } from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { authService } from '@/services/apiClient';
import { encryptedTokenStorage } from '@/services/encryptedTokenStorage';
import { deviceIdService } from '@/services/deviceId';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function formatLockout(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login } = useAuth();
  const router = useRouter();
  const { isTablet, contentMaxWidth, formMaxWidth } = useResponsiveLayout();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [passwordSuggestion, setPasswordSuggestion] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);

  const isDisabled = loading || isLockedOut;

  // ── Lockout countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!lockoutTimer || lockoutTimer <= 0) {
      setIsLockedOut(false);
      return;
    }
    const interval = setInterval(() => {
      setLockoutTimer((prev) => {
        if (prev && prev > 1) return prev - 1;
        setIsLockedOut(false);
        return null;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  // ── Handler ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setEmailSuggestion(null);
    setPasswordSuggestion(null);
    setError(null);

    if (!email.trim()) { setEmailSuggestion('Email is required'); return; }
    if (!validateEmail(email.trim())) { setEmailSuggestion('Enter a valid email address'); return; }
    if (!password.trim()) { setPasswordSuggestion('Password is required'); return; }

    try {
      setLoading(true);
      const response = await authService.login({ email: email.trim(), password });

      if (response?.data?.tokens) {
        const deviceId = await deviceIdService.getOrCreateDeviceId();
        await Promise.all([
          encryptedTokenStorage.setAccessToken(response.data.tokens.accessToken),
          encryptedTokenStorage.setRefreshToken(response.data.tokens.refreshToken),
          encryptedTokenStorage.setTokenExpiry(response.data.tokens.expiresAt),
          encryptedTokenStorage.setDeviceIdForTokens(deviceId),
        ]);
        login(response.data.user);
        return;
      }
      setError('Login failed. Please try again.');
    } catch (err: any) {
      const msg = err?.message || 'Login failed. Please try again.';
      setError(msg);
      const status = err?.details?.status || err?.status;
      if (status === 429 || msg.includes('Too many failed')) {
        setIsLockedOut(true);
        const minutesMatch = msg.match(/(\d+)\s*minutes?/);
        const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 10;
        setLockoutTimer(minutes * 60);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Derived error colors ───────────────────────────────────────────────────
  const errorBg = isLockedOut
    ? (isDark ? colors.danger[900]  : colors.danger[50])
    : (isDark ? colors.warning[900] : colors.warning[50]);
  const errorBorder = isLockedOut
    ? (isDark ? colors.danger[700]  : colors.danger[200])
    : (isDark ? colors.warning[700] : colors.warning[200]);
  const errorText = isLockedOut
    ? (isDark ? colors.danger[200]  : colors.danger[700])
    : (isDark ? colors.warning[200] : colors.warning[700]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: isDark ? colors.background.primary : colors.background.tertiary },
      ]}
      edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View
            style={[
              styles.contentContainer,
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
            ]}>

            {/* ── Logo / Brand ── */}
            <View style={styles.logoBlock}>
              <View style={[
                styles.logoCircle,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
              ]}>
                <Building2
                  size={36}
                  color={isDark ? colors.primary[300] : colors.primary[500]}
                  strokeWidth={1.5}
                />
              </View>
              <Text style={[styles.appName, { color: colors.text.primary }]}>
                Hostel Manager
              </Text>
              <View style={[
                styles.pill,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
              ]}>
                <Text style={[
                  styles.pillText,
                  { color: isDark ? colors.primary[300] : colors.primary[600] },
                ]}>
                  Owner Dashboard
                </Text>
              </View>
            </View>

            {/* ── Form Card ── */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                },
                isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
              ]}>

              {/* Card header */}
              <View style={[styles.cardHeader, { borderBottomColor: colors.border.light }]}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  Welcome back
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.text.secondary }]}>
                  Sign in to your account
                </Text>
              </View>

              <View style={styles.cardBody}>

                {/* Error / Lockout banner */}
                {error && (
                  <View style={[
                    styles.errorBanner,
                    { backgroundColor: errorBg, borderColor: errorBorder },
                  ]}>
                    {isLockedOut && (
                      <View style={styles.lockRow}>
                        <Lock size={13} color={errorText} strokeWidth={2} />
                        <Text style={[styles.errorTitle, { color: errorText }]}>
                          Account temporarily locked
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.errorBody, { color: errorText }]}>
                      {isLockedOut && lockoutTimer
                        ? `Try again in ${formatLockout(lockoutTimer)}`
                        : error}
                    </Text>
                  </View>
                )}

                {/* Email */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>
                    EMAIL ADDRESS
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark
                          ? colors.background.tertiary
                          : colors.background.primary,
                        color: colors.text.primary,
                        borderColor: emailSuggestion
                          ? colors.danger[400]
                          : colors.border.medium,
                      },
                    ]}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (emailSuggestion && (!t.trim() || validateEmail(t.trim())))
                        setEmailSuggestion(null);
                    }}
                    onBlur={() => {
                      if (email.trim() && !validateEmail(email.trim()))
                        setEmailSuggestion('Enter a valid email address');
                    }}
                    editable={!isDisabled}
                  />
                  {emailSuggestion && (
                    <Text style={[styles.hint, { color: colors.danger[500] }]}>
                      {emailSuggestion}
                    </Text>
                  )}
                </View>

                {/* Password */}
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>
                      PASSWORD
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push('/forgot-password' as any)}
                      disabled={isDisabled}>
                      <Text style={[styles.forgotText, { color: colors.primary[500] }]}>
                        Forgot password?
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.passWrap}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.passInput,
                        {
                          backgroundColor: isDark
                            ? colors.background.tertiary
                            : colors.background.primary,
                          color: colors.text.primary,
                          borderColor: passwordSuggestion
                            ? colors.danger[400]
                            : colors.border.medium,
                        },
                      ]}
                      placeholder="Enter your password"
                      placeholderTextColor={colors.text.tertiary}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (passwordSuggestion && t.trim()) setPasswordSuggestion(null);
                      }}
                      onBlur={() => {
                        if (!password.trim()) setPasswordSuggestion('Password is required');
                      }}
                      editable={!isDisabled}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                      disabled={isDisabled}>
                      {showPassword
                        ? <EyeOff size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                        : <Eye    size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                      }
                    </TouchableOpacity>
                  </View>
                  {passwordSuggestion && (
                    <Text style={[styles.hint, { color: colors.danger[500] }]}>
                      {passwordSuggestion}
                    </Text>
                  )}
                </View>

                {/* Login button */}
                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    {
                      backgroundColor: isLockedOut
                        ? colors.danger[500]
                        : colors.primary[500],
                      opacity: isDisabled ? 0.65 : 1,
                    },
                  ]}
                  onPress={handleLogin}
                  activeOpacity={0.85}
                  disabled={isDisabled}>
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : isLockedOut ? (
                    <View style={styles.btnRow}>
                      <Lock size={15} color={colors.white} strokeWidth={2} />
                      <Text style={[styles.btnText, { color: colors.white }]}>
                        Account locked
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.btnRow}>
                      <Text style={[styles.btnText, { color: colors.white }]}>Sign in</Text>
                      <ArrowRight size={16} color={colors.white} strokeWidth={2} />
                    </View>
                  )}
                </TouchableOpacity>

              </View>
            </View>

            {/* Register link — outside card */}
            <TouchableOpacity
              style={styles.registerRow}
              onPress={() => router.push('/register' as any)}
              activeOpacity={0.7}
              disabled={isDisabled}>
              <Text style={[styles.registerText, { color: colors.text.secondary }]}>
                Don't have an account?{' '}
                <Text style={{
                  color: colors.primary[500],
                  fontFamily: typography.fontFamily.semiBold,
                }}>
                  Create one
                </Text>
              </Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboardView: { flex: 1 },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },

  contentContainer: { width: '100%' },

  // ── Logo Block ───────────────────────────────────────────────────────────
  logoBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },

  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  appName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: spacing.sm,
  },

  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },

  pillText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.xl ?? 20,
    borderWidth: 0.5,
    overflow: 'hidden',
    ...shadows.md,
  },

  cardHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 0.5,
  },

  cardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: 2,
  },

  cardSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },

  cardBody: {
    padding: spacing.xl,
  },

  // ── Error Banner ─────────────────────────────────────────────────────────
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },

  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },

  errorTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },

  errorBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  // ── Fields ───────────────────────────────────────────────────────────────
  field: {
    marginBottom: spacing.lg,
  },

  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.sm,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  forgotText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 0.5,
    paddingHorizontal: spacing.md,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },

  hint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 5,
    lineHeight: typography.fontSize.xs * typography.lineHeight.relaxed,
  },

  // ── Password ─────────────────────────────────────────────────────────────
  passWrap: { position: 'relative' },
  passInput: { paddingRight: 44 },

  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },

  // ── Button ───────────────────────────────────────────────────────────────
  btnPrimary: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  btnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },

  // ── Register Link ─────────────────────────────────────────────────────────
  registerRow: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },

  registerText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
});