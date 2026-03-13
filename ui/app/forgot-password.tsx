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
import { KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { authService } from '@/services/apiClient';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const otpInputRefs = useRef<Array<TextInput | null>>([]);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendOTP = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await authService.forgotPassword({ email: email.trim() });
      setStep('otp');
      setResendCooldown(60);
    } catch (err: any) {
      setError(err?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (event: any, index: number) => {
    if (event.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Enter a valid 6-digit OTP');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await authService.verifyResetOTP({
        email: email.trim(),
        otp: otpCode,
      });
      setStep('password');
    } catch (err: any) {
      setError(err?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const otpCode = otp.join('');
      await authService.resetPassword({
        email: email.trim(),
        otp: otpCode,
        newPassword: password,
      });
      
      Alert.alert(
        'Success',
        'Your password has been reset successfully.',
        [{ text: 'Login', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderEmailStep = () => (
    <>
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.text.primary }]}>Email Address</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.background.secondary,
              color: colors.text.primary,
              borderColor: colors.border.medium,
            },
          ]}
          placeholder="Enter your registered email"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={colors.text.tertiary}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary[500], opacity: loading ? 0.6 : 1 },
        ]}
        onPress={handleSendOTP}
        activeOpacity={0.8}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.white }]}>
            Send Reset OTP
          </Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderOtpStep = () => (
    <>
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        We{`'`}ve sent a 6-digit verification code to {email}
      </Text>
      
      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(input) => { otpInputRefs.current[index] = input; }}
            style={[
              styles.otpInput,
              {
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                borderColor: colors.border.medium,
              },
            ]}
            value={digit}
            onChangeText={(value) => handleOtpChange(value, index)}
            onKeyPress={(event) => handleOtpKeyPress(event, index)}
            keyboardType="number-pad"
            maxLength={1}
            textAlign="center"
            editable={!loading}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary[500], opacity: loading ? 0.6 : 1 },
        ]}
        onPress={handleVerifyOTP}
        activeOpacity={0.8}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.white }]}>
            Verify OTP
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.linkButton, resendCooldown > 0 && { opacity: 0.5 }]}
        onPress={handleSendOTP}
        disabled={loading || resendCooldown > 0}>
        <Text style={[styles.linkText, { color: colors.primary[500] }]}>
          {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderPasswordStep = () => (
    <>
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.text.primary }]}>New Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[
              styles.passwordInput,
              {
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                borderColor: colors.border.medium,
              },
            ]}
            placeholder="Min 6 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            placeholderTextColor={colors.text.tertiary}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? (
              <EyeOff size={20} color={colors.text.tertiary} />
            ) : (
              <Eye size={20} color={colors.text.tertiary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.text.primary }]}>Confirm Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[
              styles.passwordInput,
              {
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                borderColor: colors.border.medium,
              },
            ]}
            placeholder="Confirm new password"
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            placeholderTextColor={colors.text.tertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
            {showConfirmPassword ? (
              <EyeOff size={20} color={colors.text.tertiary} />
            ) : (
              <Eye size={20} color={colors.text.tertiary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary[500], opacity: loading ? 0.6 : 1 },
        ]}
        onPress={handleResetPassword}
        activeOpacity={0.8}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.white }]}>
            Reset Password
          </Text>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => step === 'email' ? router.back() : setStep('email')}>
            <ArrowLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary[50] }]}>
              <KeyRound size={40} color={colors.primary[500]} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>Reset Password</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              {step === 'email' && 'Enter your email to receive a reset code'}
              {step === 'otp' && 'Enter the verification code'}
              {step === 'password' && 'Create a new secure password'}
            </Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: colors.danger[50], borderColor: colors.danger[200] },
                ]}>
                <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
              </View>
            )}

            {step === 'email' && renderEmailStep()}
            {step === 'otp' && renderOtpStep()}
            {step === 'password' && renderPasswordStep()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  description: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
  },
  errorContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: 40,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  otpInput: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  primaryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  linkText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});