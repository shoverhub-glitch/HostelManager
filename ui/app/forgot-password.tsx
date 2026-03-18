import { useRef, useState, useEffect } from 'react';
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
import { KeyRound, Eye, EyeOff, ArrowLeft, ArrowRight, Check } from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { authService } from '@/services/apiClient';

// ─── Validation ───────────────────────────────────────────────────────────────
const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function getPasswordStrength(v: string): number {
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^\w\s]/.test(v)) s++;
  return s;
}

function validatePasswordStrength(v: string): string | null {
  if (v.length < 8) return 'Min 8 characters';
  if (!/[A-Z]/.test(v)) return 'Add uppercase letter';
  if (!/[a-z]/.test(v)) return 'Add lowercase letter';
  if (!/\d/.test(v)) return 'Add a number';
  if (!/[^\w\s]/.test(v)) return 'Add special character';
  return null;
}

const STRENGTH_COLORS = ['#F43F5E', '#F59E0B', '#10B981', '#059669'];
const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Strong', 'Very strong'];

type StepKey = 'email' | 'otp' | 'password';

const STEP_MAP: Record<StepKey, number> = { email: 1, otp: 2, password: 3 };

const STEP_META: Record<StepKey, { heading: string; accent: string; subtitle: string }> = {
  email:    { heading: 'Reset your',   accent: 'password', subtitle: 'Enter your email to receive a reset code'  },
  otp:      { heading: 'Verify your',  accent: 'identity', subtitle: 'Enter the 6-digit code we sent to your email' },
  password: { heading: 'New',          accent: 'password', subtitle: 'Create a strong new password'              },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepPills({ step, colors }: { step: number; colors: any }) {
  return (
    <View style={styles.pillsRow}>
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          style={[
            styles.stepPill,
            {
              backgroundColor:
                n < step   ? colors.primary[200] :
                n === step ? colors.primary[500] :
                colors.border.medium,
            },
          ]}
        />
      ))}
    </View>
  );
}

function FieldLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>
      {label.toUpperCase()}
    </Text>
  );
}

function Hint({ text, type = 'err', colors }: { text: string; type?: 'err' | 'warn' | 'ok'; colors: any }) {
  const color =
    type === 'ok'   ? colors.success[500] :
    type === 'warn' ? colors.warning[500] :
    colors.danger[500];
  return <Text style={[styles.hint, { color }]}>{text}</Text>;
}

function StrengthBar({ strength, colors }: { strength: number; colors: any }) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={styles.strengthRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthSeg,
              { backgroundColor: i < strength ? STRENGTH_COLORS[strength - 1] : colors.border.medium },
            ]}
          />
        ))}
      </View>
      {strength > 0 && (
        <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[strength - 1] }]}>
          {STRENGTH_LABELS[strength]}
        </Text>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ForgotPasswordScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isTablet, contentMaxWidth, formMaxWidth } = useResponsiveLayout();
  const otpInputRefs = useRef<Array<TextInput | null>>([]);

  const [email,           setEmail]           = useState('');
  const [otp,             setOtp]             = useState(['', '', '', '', '', '']);
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [step,            setStep]            = useState<StepKey>('email');
  const [loading,         setLoading]         = useState(false);
  const [resendCooldown,  setResendCooldown]  = useState(0);

  // Inline feedback
  const [emailHint,   setEmailHint]   = useState<string | null>(null);
  const [otpHint,     setOtpHint]     = useState<string | null>(null);
  const [passHint,    setPassHint]    = useState<string | null>(null);
  const [confirmHint, setConfirmHint] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(password);
  const currentStep = STEP_MAP[step];
  const meta = STEP_META[step];

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((p) => (p > 1 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSendOTP = async () => {
    setEmailHint(null); setGlobalError(null);
    if (!email.trim()) { setEmailHint('Email is required'); return; }
    if (!validateEmail(email.trim())) { setEmailHint('Enter a valid email address'); return; }
    try {
      setLoading(true);
      await authService.forgotPassword({ email: email.trim() });
      setStep('otp');
      setResendCooldown(60);
    } catch (err: any) {
      setGlobalError(err?.message || 'Failed to send code. Please try again.');
    } finally { setLoading(false); }
  };

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) return;
    const next = [...otp]; next[index] = value; setOtp(next);
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (event: any, index: number) => {
    if (event.nativeEvent.key === 'Backspace' && !otp[index] && index > 0)
      otpInputRefs.current[index - 1]?.focus();
  };

  const handleVerifyOTP = async () => {
    const code = otp.join('');
    setOtpHint(null); setGlobalError(null);
    if (code.length !== 6) { setOtpHint('Enter all 6 digits'); return; }
    try {
      setLoading(true);
      await authService.verifyResetOTP({ email: email.trim(), otp: code });
      setStep('password');
    } catch (err: any) {
      setGlobalError(err?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    setPassHint(null); setConfirmHint(null); setGlobalError(null);
    const pe = validatePasswordStrength(password);
    if (pe) { setPassHint(pe); return; }
    if (password !== confirmPassword) {
      setConfirmHint({ text: 'Passwords do not match', type: 'err' });
      return;
    }
    try {
      setLoading(true);
      await authService.resetPassword({
        email: email.trim(),
        otp: otp.join(''),
        newPassword: password,
      });
      Alert.alert(
        'Password reset',
        'Your password has been updated successfully.',
        [{ text: 'Sign in', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      setGlobalError(err?.message || 'Failed to reset password. Please try again.');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    setGlobalError(null);
    if (step === 'email') router.back();
    else if (step === 'otp') setStep('email');
    else setStep('otp');
  };

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
                <KeyRound
                  size={32}
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
                  Account Recovery
                </Text>
              </View>
            </View>

            {/* ── Form Card ── */}
            <View
              style={[
                styles.card,
                { backgroundColor: colors.background.secondary, borderColor: colors.border.medium },
                isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
              ]}>

              {/* Card header */}
              <View style={[styles.cardHeader, { borderBottomColor: colors.border.light }]}>
                {/* Back button */}
                <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={loading}>
                  <ArrowLeft size={18} color={colors.text.secondary} strokeWidth={2} />
                  <Text style={[styles.backText, { color: colors.text.secondary }]}>Back</Text>
                </TouchableOpacity>

                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  {meta.heading}{' '}
                  <Text style={{ color: colors.primary[500] }}>{meta.accent}</Text>
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.text.secondary }]}>
                  {meta.subtitle}
                </Text>
                <StepPills step={currentStep} colors={colors} />
              </View>

              {/* Card body */}
              <View
                style={[
                  styles.cardBody,
                  isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
                ]}>

                {/* Global error */}
                {globalError && (
                  <View style={[
                    styles.errorBanner,
                    {
                      backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                      borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                    },
                  ]}>
                    <Text style={[styles.errorText, {
                      color: isDark ? colors.danger[200] : colors.danger[700],
                    }]}>
                      {globalError}
                    </Text>
                  </View>
                )}

                {/* ── STEP 1: Email ── */}
                {step === 'email' && (
                  <>
                    <View style={styles.field}>
                      <FieldLabel label="Email address" colors={colors} />
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                          color: colors.text.primary,
                          borderColor: emailHint ? colors.danger[400] : colors.border.medium,
                        }]}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.text.tertiary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={(t) => { setEmail(t); if (emailHint) setEmailHint(null); }}
                        onBlur={() => {
                          if (email.trim() && !validateEmail(email.trim()))
                            setEmailHint('Enter a valid email address');
                        }}
                        editable={!loading}
                      />
                      {emailHint && <Hint text={emailHint} colors={colors} />}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, {
                        backgroundColor: colors.primary[500],
                        opacity: loading ? 0.6 : 1,
                      }]}
                      onPress={handleSendOTP}
                      activeOpacity={0.85}
                      disabled={loading}>
                      {loading
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <View style={styles.btnRow}>
                            <Text style={[styles.btnText, { color: colors.white }]}>
                              Send reset code
                            </Text>
                            <ArrowRight size={16} color={colors.white} strokeWidth={2} />
                          </View>
                        )
                      }
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STEP 2: OTP ── */}
                {step === 'otp' && (
                  <>
                    <Text style={[styles.description, { color: colors.text.secondary }]}>
                      Code sent to{' '}
                      <Text style={{ color: colors.primary[500], fontFamily: typography.fontFamily.semiBold }}>
                        {email}
                      </Text>
                    </Text>

                    <View style={styles.field}>
                      <FieldLabel label="Verification code" colors={colors} />
                      <View style={[
                        styles.otpRow,
                        isTablet && { maxWidth: 400, alignSelf: 'center', width: '100%' },
                      ]}>
                        {otp.map((digit, i) => (
                          <TextInput
                            key={i}
                            ref={(r) => { otpInputRefs.current[i] = r; }}
                            style={[styles.otpBox, {
                              backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                              color: colors.text.primary,
                              borderColor: digit ? colors.primary[400] : colors.border.medium,
                            }]}
                            value={digit}
                            onChangeText={(v) => handleOtpChange(v, i)}
                            onKeyPress={(e) => handleOtpKeyPress(e, i)}
                            keyboardType="number-pad"
                            maxLength={1}
                            textAlign="center"
                            editable={!loading}
                          />
                        ))}
                      </View>
                      {otpHint && <Hint text={otpHint} colors={colors} />}
                    </View>

                    {/* Resend row */}
                    <View style={styles.resendRow}>
                      <Text style={[styles.resendLabel, { color: colors.text.secondary }]}>
                        Didn't get it?
                      </Text>
                      <TouchableOpacity onPress={handleSendOTP} disabled={loading || resendCooldown > 0}>
                        <Text style={[styles.resendBtn, {
                          color: resendCooldown > 0 ? colors.text.tertiary : colors.primary[500],
                        }]}>
                          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, {
                        backgroundColor: colors.primary[500],
                        opacity: loading ? 0.6 : 1,
                        marginTop: spacing.md,
                      }]}
                      onPress={handleVerifyOTP}
                      activeOpacity={0.85}
                      disabled={loading}>
                      {loading
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <View style={styles.btnRow}>
                            <Text style={[styles.btnText, { color: colors.white }]}>
                              Verify code
                            </Text>
                            <ArrowRight size={16} color={colors.white} strokeWidth={2} />
                          </View>
                        )
                      }
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STEP 3: New Password ── */}
                {step === 'password' && (
                  <>
                    <View style={styles.field}>
                      <FieldLabel label="New password" colors={colors} />
                      <View style={styles.passWrap}>
                        <TextInput
                          style={[styles.input, styles.passInput, {
                            backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                            color: colors.text.primary,
                            borderColor: passHint ? colors.danger[400] : colors.border.medium,
                          }]}
                          placeholder="Min. 8 characters"
                          placeholderTextColor={colors.text.tertiary}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          value={password}
                          onChangeText={(t) => {
                            setPassword(t);
                            if (passHint && !validatePasswordStrength(t)) setPassHint(null);
                            if (confirmHint && confirmPassword === t) setConfirmHint(null);
                          }}
                          onBlur={() => password
                            ? setPassHint(validatePasswordStrength(password))
                            : setPassHint(null)
                          }
                          editable={!loading}
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowPassword(!showPassword)}
                          disabled={loading}>
                          {showPassword
                            ? <EyeOff size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                            : <Eye    size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                          }
                        </TouchableOpacity>
                      </View>
                      {password.length > 0 && <StrengthBar strength={passwordStrength} colors={colors} />}
                      {passHint && <Hint text={passHint} type="warn" colors={colors} />}
                    </View>

                    <View style={styles.field}>
                      <FieldLabel label="Confirm password" colors={colors} />
                      <View style={styles.passWrap}>
                        <TextInput
                          style={[styles.input, styles.passInput, {
                            backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                            color: colors.text.primary,
                            borderColor: confirmHint?.type === 'err'
                              ? colors.danger[400]
                              : confirmHint?.type === 'ok'
                              ? colors.success[400]
                              : colors.border.medium,
                          }]}
                          placeholder="Re-enter new password"
                          placeholderTextColor={colors.text.tertiary}
                          secureTextEntry={!showConfirm}
                          autoCapitalize="none"
                          value={confirmPassword}
                          onChangeText={(t) => {
                            setConfirmPassword(t);
                            if (!t) { setConfirmHint(null); return; }
                            setConfirmHint(t === password
                              ? { text: 'Passwords match', type: 'ok' }
                              : { text: 'Does not match',  type: 'err' }
                            );
                          }}
                          onBlur={() => {
                            if (confirmPassword && confirmPassword !== password)
                              setConfirmHint({ text: 'Must match password', type: 'err' });
                          }}
                          editable={!loading}
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowConfirm(!showConfirm)}
                          disabled={loading}>
                          {showConfirm
                            ? <EyeOff size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                            : <Eye    size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                          }
                        </TouchableOpacity>
                      </View>
                      {confirmHint && (
                        <Hint text={confirmHint.text} type={confirmHint.type} colors={colors} />
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, {
                        backgroundColor: colors.primary[500],
                        opacity: loading ? 0.6 : 1,
                      }]}
                      onPress={handleResetPassword}
                      activeOpacity={0.85}
                      disabled={loading}>
                      {loading
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <View style={styles.btnRow}>
                            <Check size={16} color={colors.white} strokeWidth={2.5} />
                            <Text style={[styles.btnText, { color: colors.white }]}>
                              Reset password
                            </Text>
                          </View>
                        )
                      }
                    </TouchableOpacity>
                  </>
                )}

              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:         { flex: 1 },
  keyboardView: { flex: 1 },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xl,
    justifyContent:    'center',
  },

  contentContainer: { width: '100%' },

  // ── Logo ─────────────────────────────────────────────────────────────────
  logoBlock: {
    alignItems:   'center',
    marginBottom: spacing.xl,
  },

  logoCircle: {
    width:          72,
    height:         72,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.md,
  },

  appName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.sm,
  },

  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical:   4,
    borderRadius:      radius.full,
  },

  pillText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.xl ?? 20,
    borderWidth:  0.5,
    overflow:     'hidden',
    ...shadows.md,
  },

  cardHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.lg,
    borderBottomWidth: 0.5,
  },

  backBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.xs,
    marginBottom:   spacing.md,
    alignSelf:      'flex-start',
  },

  backText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  cardTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  2,
  },

  cardSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
    marginTop:  2,
  },

  pillsRow: {
    flexDirection: 'row',
    gap:           spacing.xs,
    marginTop:     spacing.lg,
  },

  stepPill: {
    flex:         1,
    height:       3,
    borderRadius: radius.full,
  },

  cardBody: { padding: spacing.xl },

  // ── Error ────────────────────────────────────────────────────────────────
  errorBanner: {
    borderRadius:  radius.md,
    borderWidth:   1,
    padding:       spacing.md,
    marginBottom:  spacing.lg,
  },

  errorText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  // ── Fields ───────────────────────────────────────────────────────────────
  field: { marginBottom: spacing.lg },

  fieldLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.sm,
  },

  input: {
    height:            46,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    paddingHorizontal: spacing.md,
    fontFamily:        typography.fontFamily.regular,
    fontSize:          typography.fontSize.md,
  },

  hint: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
    marginTop:  5,
    lineHeight: typography.fontSize.xs * typography.lineHeight.relaxed,
  },

  description: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.sm,
    lineHeight:   typography.fontSize.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },

  // ── OTP ──────────────────────────────────────────────────────────────────
  otpRow: { flexDirection: 'row', gap: spacing.sm },

  otpBox: {
    flex:         1,
    height:       52,
    borderRadius: radius.md,
    borderWidth:  0.5,
    fontFamily:   typography.fontFamily.bold,
    fontSize:     typography.fontSize.lg,
  },

  resendRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      spacing.md,
  },

  resendLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  resendBtn: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  // ── Strength ─────────────────────────────────────────────────────────────
  strengthRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: 4 },

  strengthSeg: { flex: 1, height: 2, borderRadius: radius.full },

  strengthLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   11,
  },

  // ── Password ─────────────────────────────────────────────────────────────
  passWrap:  { position: 'relative' },
  passInput: { paddingRight: 44 },

  eyeBtn: {
    position:       'absolute',
    right:          12,
    top:            0,
    bottom:         0,
    justifyContent: 'center',
    alignItems:     'center',
    padding:        4,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  btnPrimary: {
    height:         48,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      spacing.sm,
  },

  btnText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },

  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});