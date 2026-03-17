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
import { KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { authService } from '@/services/apiClient';

export default function ChangePasswordScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isTablet, contentMaxWidth, formMaxWidth } = useResponsiveLayout();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePasswordStrength = (value: string) => {
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter';
    if (!/\d/.test(value)) return 'Password must include at least one number';
    if (!/[^\w\s]/.test(value)) return 'Password must include at least one special character';
    return null;
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (oldPassword === newPassword) {
      setError('New password must be different from old password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authService.changePassword({
        oldPassword,
        newPassword,
      });

      Alert.alert('Success', 'Password updated successfully.', [
        {
          text: 'OK',
          onPress: () => {
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            router.back();
          },
        },
      ]);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Please try again.');
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.contentContainer,
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
            ]}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
              <ArrowLeft size={24} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}>
                <KeyRound size={40} color={isDark ? colors.primary[300] : colors.primary[500]} />
              </View>
              <Text style={[styles.title, { color: colors.text.primary }]}>Change Password</Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                Enter your current password, then set a new password.
              </Text>
            </View>

            <View
              style={[
                styles.formContainer,
                isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
              ]}>
              {error && (
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: colors.danger[50], borderColor: colors.danger[200] },
                  ]}>
                  <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
                </View>
              )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Old Password</Text>
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
                  placeholder="Enter old password"
                  secureTextEntry={!showOldPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.text.tertiary}
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowOldPassword(!showOldPassword)}
                  activeOpacity={0.7}>
                  {showOldPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

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
                  placeholder="At least 8 chars, upper/lower/number/symbol"
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.text.tertiary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  activeOpacity={0.7}>
                  {showNewPassword ? (
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
                  placeholder="Re-enter new password"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.text.tertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  activeOpacity={0.7}>
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
                onPress={handleChangePassword}
                activeOpacity={0.8}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.white }]}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
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
  contentContainer: {
    width: '100%',
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
  formContainer: {
    width: '100%',
    gap: spacing.md,
  },
  errorContainer: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
  },
  primaryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
