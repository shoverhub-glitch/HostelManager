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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, ArrowRight, ArrowLeft, Check, UserPlus } from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { authService } from '@/services/apiClient';
import { encryptedTokenStorage } from '@/services/encryptedTokenStorage';
import { deviceIdService } from '@/services/deviceId';

// ─── Validation ───────────────────────────────────────────────────────────────
const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validatePhone = (v: string) => /^\+91[6-9]\d{9}$/.test(v.trim());
const PHONE_HINT    = 'Use +91XXXXXXXXXX';

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

type HintType = 'default' | 'ok' | 'warn' | 'err';

function Hint({ text, type = 'default', colors }: { text: string; type?: HintType; colors: any }) {
  const color =
    type === 'ok'   ? colors.success[500] :
    type === 'warn' ? colors.warning[500] :
    type === 'err'  ? colors.danger[500]  :
    colors.text.tertiary;
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
export default function RegisterScreen() {
  const { colors, isDark } = useTheme();
  const { login } = useAuth();
  const router = useRouter();
  const { isTablet, contentMaxWidth, formMaxWidth } = useResponsiveLayout();
  const otpInputRefs = useRef<Array<TextInput | null>>([]);

  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [phone,           setPhone]           = useState('+91');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [otp,             setOtp]             = useState(['', '', '', '', '', '']);
  const [emailVerified,   setEmailVerified]   = useState(false);
  const [otpSent,         setOtpSent]         = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [registered,      setRegistered]      = useState(false);
  const [resendCooldown,  setResendCooldown]  = useState(0);

  const [globalError,  setGlobalError]  = useState<string | null>(null);
  const [emailHint,    setEmailHint]    = useState<{ text: string; type: HintType } | null>(null);
  const [phoneHint,    setPhoneHint]    = useState<string | null>(null);
  const [passHint,     setPassHint]     = useState<string | null>(null);
  const [confirmHint,  setConfirmHint]  = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const passwordStrength = getPasswordStrength(password);
  const step = registered ? 3 : emailVerified ? 2 : 1;

  const STEP_HEADINGS = [
    { normal: 'Create your', accent: 'account' },
    { normal: 'Almost',      accent: 'done'    },
    { normal: "You're",      accent: 'in!'     },
  ];
  const STEP_SUBTITLES = [
    'Step 1 of 3 — Verify your email',
    'Step 2 of 3 — Set your password',
    'Account created successfully',
  ];

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((p) => (p > 1 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSendOTP = async () => {
    setGlobalError(null);
    if (!name.trim()) { setEmailHint({ text: 'Enter your name first', type: 'err' }); return; }
    if (!validateEmail(email.trim())) { setEmailHint({ text: 'Enter a valid email address', type: 'err' }); return; }
    if (resendCooldown > 0) { setEmailHint({ text: `Wait ${resendCooldown}s before resending`, type: 'warn' }); return; }
    try {
      setLoading(true);
      setEmailHint({ text: 'Sending code…', type: 'default' });
      await authService.sendEmailOTP({ email: email.trim() });
      setOtpSent(true);
      setResendCooldown(45);
      setEmailHint({ text: `Code sent to ${email.trim()}`, type: 'ok' });
    } catch (err: any) {
      if (err?.code === 'TOO_MANY_REQUESTS') {
        const match = err?.message?.match(/(\d+)\s*seconds?/);
        const secs  = match ? parseInt(match[1]) : 45;
        setResendCooldown(secs);
        setEmailHint({ text: `Wait ${secs}s before resending`, type: 'warn' });
      } else if (err?.code === 'CONFLICT' || err?.details?.status === 409) {
        setEmailHint({ text: 'Email already registered', type: 'err' });
      } else {
        setEmailHint({ text: err?.message || 'Failed to send code', type: 'err' });
      }
    } finally { setLoading(false); }
  };

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) return;
    const next = [...otp]; next[index] = value; setOtp(next);
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (event: any, index: number) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (otp[index] === '' && index > 0) { otpInputRefs.current[index - 1]?.focus(); }
      else { const next = [...otp]; next[index] = ''; setOtp(next); }
    }
  };

  const handleVerifyEmail = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setEmailHint({ text: 'Enter all 6 digits', type: 'err' }); return; }
    try {
      setLoading(true); setGlobalError(null);
      await authService.verifyEmailOTP({ email: email.trim(), otp: code });
      setEmailVerified(true);
    } catch (err: any) {
      setEmailHint({ text: err?.message || 'Verification failed', type: 'err' });
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setPhoneHint(null); setPassHint(null); setConfirmHint(null); setGlobalError(null);
    if (!validatePhone(phone)) { setPhoneHint(PHONE_HINT); return; }
    const pe = validatePasswordStrength(password);
    if (pe) { setPassHint(pe); return; }
    if (password !== confirmPassword) { setConfirmHint({ text: 'Passwords do not match', type: 'err' }); return; }
    try {
      setLoading(true);
      const response = await authService.register({
        name: name.trim(), email: email.trim(), phone: phone.trim(), password,
      });
      if (response?.data?.tokens) {
        const deviceId = await deviceIdService.getOrCreateDeviceId();
        await Promise.all([
          encryptedTokenStorage.setAccessToken(response.data.tokens.accessToken),
          encryptedTokenStorage.setRefreshToken(response.data.tokens.refreshToken),
          encryptedTokenStorage.setTokenExpiry(response.data.tokens.expiresAt),
          encryptedTokenStorage.setDeviceIdForTokens(deviceId),
        ]);
        setRegistered(true);
        setTimeout(() => login(response.data.user), 1000);
        return;
      }
      setGlobalError('Registration failed. Please try again.');
    } catch (err: any) {
      if (err?.code === 'CONFLICT' || err?.details?.status === 409) {
        setGlobalError('Email already exists');
      } else {
        setGlobalError(err?.message || 'Registration failed. Please try again.');
      }
    } finally { setLoading(false); }
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

            {/* ── Brand Header ── */}
            <View style={styles.logoBlock}>
              <View style={[
                styles.logoCircle,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
              ]}>
                <UserPlus
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
                  New Account
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
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  {STEP_HEADINGS[step - 1].normal}{' '}
                  <Text style={{ color: colors.primary[500] }}>
                    {STEP_HEADINGS[step - 1].accent}
                  </Text>
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.text.secondary }]}>
                  {STEP_SUBTITLES[step - 1]}
                </Text>
                <StepPills step={step} colors={colors} />
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

                {/* ── STEP 1 ── */}
                {step === 1 && (
                  <>
                    <View style={styles.field}>
                      <FieldLabel label="Full name" colors={colors} />
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                          color: colors.text.primary,
                          borderColor: colors.border.medium,
                        }]}
                        placeholder="Ravi Kumar"
                        placeholderTextColor={colors.text.tertiary}
                        value={name}
                        onChangeText={setName}
                        editable={!loading}
                      />
                    </View>

                    <View style={styles.field}>
                      <FieldLabel label="Email address" colors={colors} />
                      <View>
                        <TextInput
                          style={[styles.input, {
                            backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                            color: colors.text.primary,
                            borderColor: emailVerified
                              ? colors.success[400]
                              : emailHint?.type === 'err'
                              ? colors.danger[400]
                              : colors.border.medium,
                            paddingRight: emailVerified ? 42 : 14,
                          }]}
                          placeholder="you@example.com"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          value={email}
                          onChangeText={(t) => { setEmail(t); setEmailHint(null); }}
                          editable={!loading && !emailVerified}
                        />
                        {emailVerified && (
                          <View style={styles.verifiedIcon}>
                            <Check size={14} color={colors.success[500]} strokeWidth={2.5} />
                          </View>
                        )}
                      </View>
                      {emailHint && <Hint text={emailHint.text} type={emailHint.type} colors={colors} />}
                    </View>

                    {!otpSent && (
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
                          : <Text style={[styles.btnText, { color: colors.white }]}>
                              Send verification code
                            </Text>
                        }
                      </TouchableOpacity>
                    )}

                    {otpSent && (
                      <>
                        <View style={styles.field}>
                          <FieldLabel label="Enter 6-digit code" colors={colors} />
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
                        </View>

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
                          onPress={handleVerifyEmail}
                          activeOpacity={0.85}
                          disabled={loading}>
                          {loading
                            ? <ActivityIndicator color={colors.white} size="small" />
                            : (
                              <View style={styles.btnRow}>
                                <Text style={[styles.btnText, { color: colors.white }]}>
                                  Confirm & continue
                                </Text>
                                <ArrowRight size={16} color={colors.white} strokeWidth={2} />
                              </View>
                            )
                          }
                        </TouchableOpacity>
                      </>
                    )}

                    <View style={styles.dividerRow}>
                      <View style={[styles.dividerLine, { backgroundColor: colors.border.light }]} />
                      <Text style={[styles.dividerText, { color: colors.text.tertiary }]}>or</Text>
                      <View style={[styles.dividerLine, { backgroundColor: colors.border.light }]} />
                    </View>

                    <TouchableOpacity style={styles.loginRow} onPress={() => router.replace('/')} disabled={loading}>
                      <Text style={[styles.loginText, { color: colors.text.secondary }]}>
                        Already have an account?{' '}
                        <Text style={{ color: colors.primary[500], fontFamily: typography.fontFamily.semiBold }}>
                          Sign in
                        </Text>
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STEP 2 ── */}
                {step === 2 && (
                  <>
                    <View style={styles.field}>
                      <FieldLabel label="Phone number" colors={colors} />
                      <View style={styles.phoneRow}>
                        <View style={[styles.phonePrefix, {
                          backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                          borderColor: colors.border.medium,
                        }]}>
                          <Text style={styles.phoneFlag}>🇮🇳</Text>
                          <Text style={[styles.phonePrefixText, { color: colors.text.secondary }]}>+91</Text>
                        </View>
                        <TextInput
                          style={[styles.input, styles.phoneInput, {
                            backgroundColor: isDark ? colors.background.tertiary : colors.background.primary,
                            color: colors.text.primary,
                            borderColor: phoneHint ? colors.danger[400] : colors.border.medium,
                          }]}
                          placeholder="98765 43210"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="phone-pad"
                          value={phone.replace('+91', '')}
                          onChangeText={(t) => {
                            const digits = t.replace(/\D/g, '').slice(0, 10);
                            setPhone('+91' + digits);
                            if (phoneHint && digits.length === 10) setPhoneHint(null);
                          }}
                          onBlur={() => {
                            if (phone !== '+91' && !validatePhone(phone)) setPhoneHint(PHONE_HINT);
                            else setPhoneHint(null);
                          }}
                          editable={!loading}
                          maxLength={10}
                        />
                      </View>
                      {phoneHint && <Hint text={phoneHint} type="err" colors={colors} />}
                    </View>

                    <View style={styles.field}>
                      <FieldLabel label="Password" colors={colors} />
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
                          placeholder="Re-enter password"
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
                      {confirmHint && <Hint text={confirmHint.text} type={confirmHint.type} colors={colors} />}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, {
                        backgroundColor: colors.primary[500],
                        opacity: loading ? 0.6 : 1,
                      }]}
                      onPress={handleRegister}
                      activeOpacity={0.85}
                      disabled={loading}>
                      {loading
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <View style={styles.btnRow}>
                            <Text style={[styles.btnText, { color: colors.white }]}>Create account</Text>
                            <ArrowRight size={16} color={colors.white} strokeWidth={2} />
                          </View>
                        )
                      }
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnGhost, { borderColor: colors.border.medium }]}
                      onPress={() => setEmailVerified(false)}
                      disabled={loading}>
                      <View style={styles.btnRow}>
                        <ArrowLeft size={14} color={colors.text.secondary} strokeWidth={2} />
                        <Text style={[styles.btnGhostText, { color: colors.text.secondary }]}>Back</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STEP 3 ── */}
                {step === 3 && (
                  <View style={styles.successBlock}>
                    <View style={[styles.successCircle, { backgroundColor: colors.success[50] }]}>
                      <Check size={30} color={colors.success[500]} strokeWidth={2.5} />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.text.primary }]}>
                      Welcome aboard!
                    </Text>
                    <Text style={[styles.successSub, { color: colors.text.secondary }]}>
                      Your account has been created.{'\n'}Taking you in…
                    </Text>
                    <ActivityIndicator
                      color={colors.primary[400]}
                      size="small"
                      style={{ marginTop: spacing.xl }}
                    />
                  </View>
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
    alignItems:    'center',
    marginBottom:  spacing.xl,
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
    paddingTop:        spacing.xl,
    paddingBottom:     spacing.lg,
    borderBottomWidth: 0.5,
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

  verifiedIcon: {
    position:       'absolute',
    right:          12,
    top:            0,
    bottom:         0,
    justifyContent: 'center',
    alignItems:     'center',
  },

  // ── OTP ──────────────────────────────────────────────────────────────────
  otpRow:  { flexDirection: 'row', gap: spacing.sm },

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

  strengthLabel: { fontFamily: typography.fontFamily.regular, fontSize: 11 },

  // ── Phone ────────────────────────────────────────────────────────────────
  phoneRow: { flexDirection: 'row', gap: spacing.sm },

  phonePrefix: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    height:            46,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.md,
    borderWidth:       0.5,
  },

  phoneFlag: { fontSize: 18 },

  phonePrefixText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  phoneInput: { flex: 1 },

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

  btnGhost: {
    height:         44,
    borderRadius:   radius.md,
    borderWidth:    0.5,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      spacing.sm,
  },

  btnGhostText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Divider ──────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
    marginVertical: spacing.xl,
  },

  dividerLine: { flex: 1, height: 0.5 },

  dividerText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  loginRow: { alignItems: 'center' },

  loginText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // ── Success ──────────────────────────────────────────────────────────────
  successBlock: { alignItems: 'center', paddingVertical: spacing.xl },

  successCircle: {
    width:          68,
    height:         68,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.xl,
  },

  successTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.sm,
  },

  successSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
    textAlign:  'center',
    lineHeight: typography.fontSize.sm * typography.lineHeight.relaxed,
  },
});