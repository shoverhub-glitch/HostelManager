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
import { Building2, Eye, EyeOff, Chrome } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { spacing, typography, radius, shadows } from '@/theme';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/apiClient';
import { encryptedTokenStorage } from '@/services/encryptedTokenStorage';
import { deviceIdService } from '@/services/deviceId';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { colors } = useTheme();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    // Web client ID is required when running in Expo Go (development)
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    // Native client IDs are used in production standalone builds
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    // openid scope is required to receive idToken from Google
    scopes: ['profile', 'email', 'openid'],
  });

  useEffect(() => {
    if (!lockoutTimer || lockoutTimer <= 0) {
      setIsLockedOut(false);
      return;
    }

    const interval = setInterval(() => {
      setLockoutTimer((prev) => {
        if (prev && prev > 1) {
          return prev - 1;
        } else {
          setIsLockedOut(false);
          return null;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutTimer]);

  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleAuthResponse(response);
    }
  }, [response]);

  const handleGoogleAuthResponse = async (authResponse: any) => {
    const { accessToken, idToken } = authResponse.authentication ?? {};
    if (!accessToken || !idToken) {
      setError('Failed to authenticate with Google. Please try again.');
      return;
    }

    try {
      setGoogleLoading(true);
      setError(null);

      const response = await authService.googleSignIn({ idToken });

      if (response?.data?.tokens) {
        // Store tokens with device ID binding
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

      setError('Google sign-in failed. Please try again.');
    } catch (err: any) {
      const errorMessage = err?.message || 'Google sign-in failed. Please try again.';
      setError(errorMessage);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      const result = await promptAsync();
      if (result?.type !== 'success') {
        setError('Google sign-in was cancelled.');
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Google sign-in failed. Please try again.';
      setError(errorMessage);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await authService.login({ email: email.trim(), password });
      if (response?.data?.tokens) {
        // Store tokens with device ID binding
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
      const errorMessage = err?.message || 'Login failed. Please try again.';
      setError(errorMessage);

      // Check if it's a rate limit error (429)
      const status = err?.details?.status || err?.status;
      if (status === 429 || errorMessage.includes('Too many failed')) {
        setIsLockedOut(true);
        // Extract minutes from error message or default to 10
        const minutesMatch = errorMessage.match(/(\d+)\s*minutes?/);
        const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 10;
        setLockoutTimer(minutes * 60);
      }
    } finally {
      setLoading(false);
    }
  };

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
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary[50] }]}>
              <Building2 size={48} color={colors.primary[500]} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>Hostel Manager</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Owner Dashboard</Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View style={[styles.errorContainer, { backgroundColor: isLockedOut ? colors.danger[50] : colors.warning[50], borderColor: isLockedOut ? colors.danger[200] : colors.warning[200] }]}>
                <Text style={[styles.errorText, { color: isLockedOut ? colors.danger[700] : colors.warning[700] }]}>
                  {error}
                </Text>
                {lockoutTimer && (
                  <Text style={[styles.errorText, { color: isLockedOut ? colors.danger[700] : colors.warning[700], marginTop: 4 }]}>
                    Try again in {Math.floor(lockoutTimer / 60)}:{(lockoutTimer % 60).toString().padStart(2, '0')} minutes
                  </Text>
                )}
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background.secondary, color: colors.text.primary, borderColor: colors.border.medium }]}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                editable={!loading && !isLockedOut}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.passwordInput, { backgroundColor: colors.background.secondary, color: colors.text.primary, borderColor: colors.border.medium }]}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.text.tertiary}
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading && !isLockedOut}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading || isLockedOut}>
                  {showPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} />
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.forgotPasswordLink}
                onPress={() => router.push('/forgot-password' as any)}
                disabled={loading || isLockedOut}>
                <Text style={[styles.forgotPasswordText, { color: colors.primary[500] }]}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary[500], opacity: loading || isLockedOut ? 0.6 : 1 }]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={loading || isLockedOut || googleLoading}>
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.actionButtonText, { color: colors.white }]}>
                  {isLockedOut ? 'Account Locked' : 'Login'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: colors.border.medium }]} />
              <Text style={[styles.dividerText, { color: colors.text.secondary, backgroundColor: colors.background.primary }]}>Or continue with</Text>
              <View style={[styles.divider, { backgroundColor: colors.border.medium }]} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.8}
              disabled={loading || isLockedOut || googleLoading || !request}>
              {googleLoading ? (
                <ActivityIndicator color={colors.primary[500]} size="small" />
              ) : (
                <>
                  <Chrome size={20} color={colors.primary[500]} />
                  <Text style={[styles.googleButtonText, { color: colors.text.primary }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push('/register' as any)}
              activeOpacity={0.7}
              disabled={loading || isLockedOut}>
              <Text style={[styles.registerLinkText, { color: colors.text.secondary }]}>
                Don{`'`}t have an account?{' '}
                <Text style={[styles.registerLinkBold, { color: colors.primary[500] }]}>Register</Text>
              </Text>
            </TouchableOpacity>
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
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
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
  },
  formContainer: {
    width: '100%',
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingRight: 50,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.lg,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  forgotPasswordText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    position: 'absolute',
    top: -10,
    left: '50%',
    transform: [{ translateX: -15 }],
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
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
  actionButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: spacing.md,
    ...shadows.lg,
  },
  actionButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  googleButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  googleButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  registerLink: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  registerLinkText: {
    fontSize: typography.fontSize.sm,
  },
  registerLinkBold: {
    fontWeight: typography.fontWeight.semibold,
  },
});
