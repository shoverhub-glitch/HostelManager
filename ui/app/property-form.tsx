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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Building2, ChevronLeft } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { propertyService } from '@/services/apiClient';
import { useAuth } from '@/context/AuthContext';
import UpgradeModal from '@/components/UpgradeModal';

export default function PropertyFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const { refreshProperties, switchProperty, properties } = useProperty();
  const { user } = useAuth();
  const isOnline = useNetworkStatus();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!propertyId);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isEdit = !!propertyId;

  useEffect(() => {
    if (isEdit && propertyId) {
      // Load property data if editing
      const property = properties.find(p => p.id === propertyId);
      if (property) {
        setName(property.name);
        setAddress(property.address);
        setInitialLoading(false);
      }
    }
  }, [isEdit, propertyId, properties]);

  const handleSubmit = async () => {
    if (!name || !address) {
      setError('Property name and address are required');
      return;
    }
    if (!user?.id) {
      setError('Owner not found. Please log in again.');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (isEdit && propertyId) {
        // Update existing property
        await propertyService.updateProperty(propertyId, {
          name,
          address,
        });
        await refreshProperties();
        router.back();
      } else {
        // Create new property
        const response = await propertyService.createProperty({
          name,
          address,
          ownerId: user.id,
          active: true,
        });
        
        // Get the newly created property ID
        const newPropertyId = response.data?.id;
        
        await refreshProperties();
        
        // Switch to the newly created property and go to My Property screen
        if (newPropertyId) {
          switchProperty(newPropertyId);
          router.replace('/my-property');
        } else {
          router.back();
        }
      }
    } catch (err: any) {
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(err?.message || `Failed to ${isEdit ? 'update' : 'create'} property`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          {isEdit ? 'Edit Property' : 'Add Property'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {initialLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <>
              <View style={styles.logoContainer}>
                {/* Do not show ownerId or property id in the form UI */}
                <View style={[styles.logoCircle, { backgroundColor: colors.primary[50] }]}>
                  <Building2 size={48} color={colors.primary[500]} />
                </View>
                <Text style={[styles.title, { color: colors.text.primary }]}>
                  {isEdit ? 'Update Property' : 'Create Property'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                  {isEdit
                    ? 'Update property details'
                    : 'Add a new property to your portfolio'}
                </Text>
              </View>

              <View style={styles.formContainer}>
                {error && (
                  <View
                    style={[
                      styles.errorContainer,
                      {
                        backgroundColor: colors.danger[50],
                        borderColor: colors.danger[200],
                      },
                    ]}>
                    <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Property Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., Sunshine Hostel"
                    placeholderTextColor={colors.text.tertiary}
                    value={name}
                    onChangeText={setName}
                    editable={!loading}
                    autoFocus
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Address</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., MG Road, Bangalore"
                    placeholderTextColor={colors.text.tertiary}
                    value={address}
                    onChangeText={setAddress}
                    editable={!loading}
                  />
                </View>

                {!isOnline && (
                  <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                    <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                      📡 Offline - You cannot {isEdit ? 'update' : 'create'} properties without internet connection
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: colors.primary[500],
                      opacity: loading || !isOnline ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSubmit}
                  activeOpacity={0.8}
                  disabled={loading || !isOnline}>
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: colors.white }]}>
                      {isOnline ? (isEdit ? 'Update Property' : 'Create Property') : 'Offline'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  placeholder: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
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
    fontSize: typography.fontSize.md,
    textAlign: 'center',
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
    marginBottom: spacing.xl,
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
  submitButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.lg,
  },
  submitButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  offlineWarning: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  offlineWarningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
