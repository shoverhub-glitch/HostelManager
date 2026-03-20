import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, ChevronLeft, ChevronDown } from 'lucide-react-native';
import { spacing, radius, shadows, colors } from '@/theme';
import { typography,textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService, tenantService } from '@/services/apiClient';
import type { Tenant } from '@/services/apiTypes';
import EmptyState from '@/components/EmptyState';
import DatePicker from '@/components/DatePicker';
import ApiErrorCard from '@/components/ApiErrorCard';
import { clearScreenCache } from '@/services/screenCache';

const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' },
] as const;

type PaymentStatus = (typeof PAYMENT_STATUSES)[number]['value'];

export default function ManualPaymentScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tenantId?: string }>();
  const { selectedPropertyId } = useProperty();
  const { isTablet, contentMaxWidth, modalMaxWidth, formMaxWidth } = useResponsiveLayout();
  const isOnline = useNetworkStatus();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString());
  const [status, setStatus] = useState<PaymentStatus>('due');
  const [method, setMethod] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetchingTenants, setFetchingTenants] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showTenantPicker, setShowTenantPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  const fetchManualTenants = useCallback(async () => {
    if (!selectedPropertyId) {
      setTenants([]);
      setFetchingTenants(false);
      return;
    }

    try {
      setFetchingTenants(true);
      setFetchError(null);

      const allTenants: Tenant[] = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const res = await tenantService.getTenants(selectedPropertyId, undefined, undefined, page, pageSize);
        allTenants.push(...(res.data || []));
        hasMore = !!res.meta?.hasMore;
        page += 1;
      }

      const tenantList = allTenants
        .filter(
        (tenant) =>
          !tenant.autoGeneratePayments &&
          !tenant.archived &&
          tenant.tenantStatus !== 'vacated'
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      setTenants(tenantList);

      const requestedTenantId = typeof params.tenantId === 'string' ? params.tenantId : '';
      if (requestedTenantId && tenantList.some((tenant) => tenant.id === requestedTenantId)) {
        const matchedTenant = tenantList.find((tenant) => tenant.id === requestedTenantId)!;
        setSelectedTenantId(matchedTenant.id);
        const rentAmount = parseFloat((matchedTenant.rent || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(rentAmount) && rentAmount > 0) {
          setAmount(String(rentAmount));
        }
      } else if (requestedTenantId) {
        setSubmitError('Selected tenant is not eligible for manual payments. Manual payment is available only for active tenants with auto-generate disabled.');
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load tenants');
    } finally {
      setFetchingTenants(false);
    }
  }, [params.tenantId, selectedPropertyId]);

  const fetchPaymentMethods = useCallback(async () => {
    const res = await paymentService.getPaymentMethods();
    const methods = Array.isArray(res.data) ? res.data : [];
    setPaymentMethods(methods);
    setMethod((currentMethod) => {
      if (currentMethod && methods.includes(currentMethod)) {
        return currentMethod;
      }
      return methods[0] || '';
    });
  }, []);

  const fetchFormData = useCallback(async () => {
    if (!selectedPropertyId) {
      setTenants([]);
      setPaymentMethods([]);
      return;
    }

    try {
      setSubmitError(null);
      await Promise.all([fetchManualTenants(), fetchPaymentMethods()]);
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load payment form data');
    }
  }, [fetchManualTenants, fetchPaymentMethods, selectedPropertyId]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  const handleTenantSelect = (tenant: Tenant) => {
    setSelectedTenantId(tenant.id);
    setSubmitError(null);
    const rentAmount = parseFloat((tenant.rent || '').replace(/[^0-9.]/g, ''));
    if (!isNaN(rentAmount) && rentAmount > 0) {
      setAmount(String(rentAmount));
    }
    setShowTenantPicker(false);
  };

  const isFormValid = () => {
    const amountNum = parseFloat(amount);
    return !!selectedTenantId && !!dueDate && !!method && !!status && !isNaN(amountNum) && amountNum > 0;
  };

  const brandColor = colors.primary[500];
  const brandLight = isDark ? colors.primary[900] : colors.primary[50];
  const cardBg = colors.background.secondary;
  const cardBorder = colors.border.medium;
  const textPrimary = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary = colors.text.tertiary;

  const renderNavBar = () => (
    <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
      <TouchableOpacity
        style={[styles.navBack, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
        onPress={() => router.back()}
        activeOpacity={0.75}>
        <ChevronLeft size={20} color={textPrimary} strokeWidth={2.4} />
      </TouchableOpacity>

      <View style={styles.navCenter}>
        <Text style={[styles.navEyebrow, { color: textTertiary }]}>PAYMENTS</Text>
        <Text style={[styles.navTitle, { color: textPrimary }]}>Manual Payment</Text>
      </View>

      <View style={styles.navSpacer} />
    </View>
  );

  const handleSubmit = async () => {
    if (!selectedTenant || !selectedPropertyId) {
      setSubmitError('Please select a tenant');
      return;
    }

    if (!selectedTenant.bedId) {
      setSubmitError('Selected tenant does not have an assigned bed');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setSubmitError('Please enter a valid amount greater than 0');
      return;
    }

    const selectedDateOnly = dueDate.split('T')[0];
    const payload: any = {
      tenantId: selectedTenant.id,
      propertyId: selectedPropertyId,
      bed: selectedTenant.bedId,
      amount: `G�${amountNum.toLocaleString('en-IN')}`,
      status,
      dueDate: selectedDateOnly,
      method,
    };

    if (status === 'paid') {
      payload.paidDate = selectedDateOnly;
    }

    try {
      setLoading(true);
      setSubmitError(null);

      await paymentService.recordPayment(payload);

      clearScreenCache('payments:');
      clearScreenCache('dashboard:');
      clearScreenCache('tenant-detail:');

      router.back();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to create manual payment');
    } finally {
      setLoading(false);
    }
  };

  if (!selectedPropertyId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        {renderNavBar()}
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={Wallet}
            title="No Property Selected"
            subtitle="Please select a property first"
            actionLabel="Go Back"
            onActionPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (fetchingTenants) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        {renderNavBar()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={brandColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      {renderNavBar()}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.heroIconWrap, { backgroundColor: brandLight }]}>
              <Wallet size={30} color={isDark ? colors.primary[300] : brandColor} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: textTertiary }]}>ONE-TIME ENTRY</Text>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>Create manual payment</Text>
              <Text style={[styles.heroSubtitle, { color: textSecondary }]}>For active tenants with auto-generate billing turned off.</Text>
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: cardBg, borderColor: cardBorder },
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>
            {fetchError && <ApiErrorCard error={fetchError} onRetry={fetchFormData} />}

            {submitError && (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                    borderColor: isDark ? colors.danger[700] : colors.danger[200],
                  },
                ]}>
                <Text style={[styles.errorText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>{submitError}</Text>
              </View>
            )}

            {tenants.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No Eligible Tenants"
                subtitle="Manual payment is available only for active tenants with auto-generate disabled"
              />
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Text style={[styles.fieldLabel, { color: textSecondary }]}>Tenant *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
                    onPress={() => setShowTenantPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: selectedTenant ? textPrimary : textTertiary }]}> 
                      {selectedTenant ? `${selectedTenant.name} G�� Room ${selectedTenant.roomNumber || 'N/A'}` : 'Select Tenant'}
                    </Text>
                    <ChevronDown size={18} color={selectedTenant ? brandColor : textTertiary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.fieldLabel, { color: textSecondary }]}>Amount *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.primary,
                        color: textPrimary,
                        borderColor: cardBorder,
                      },
                    ]}
                    placeholder="e.g., 5000"
                    keyboardType="numeric"
                    placeholderTextColor={textTertiary}
                    value={amount}
                    onChangeText={setAmount}
                    editable={!loading}
                  />
                </View>

                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  label={status === 'paid' ? 'Paid Date' : 'Due Date'}
                  disabled={loading}
                  required
                  restrictToLast30Days={status === 'paid'}
                  restrictToNext30Days={status === 'due'}
                />

                <Text style={[styles.helperText, { color: textSecondary }]}> 
                  {status === 'paid'
                    ? 'Paid date is saved as the payment date for this entry.'
                    : 'Due date can be set from today up to the next 30 days.'}
                </Text>

                <View style={styles.inputContainer}>
                  <Text style={[styles.fieldLabel, { color: textSecondary }]}>Status *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
                    onPress={() => setShowStatusPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: textPrimary }]}> 
                      {PAYMENT_STATUSES.find((item) => item.value === status)?.label || 'Select Status'}
                    </Text>
                    <ChevronDown size={18} color={brandColor} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.fieldLabel, { color: textSecondary }]}>Payment Method *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
                    onPress={() => setShowMethodPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: textPrimary }]}>{method}</Text>
                    <ChevronDown size={18} color={brandColor} />
                  </TouchableOpacity>
                </View>

                {!isOnline && (
                  <View style={[styles.offlineWarning, {
                    backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
                    borderColor: isDark ? colors.warning[700] : colors.warning[200],
                  }]}>
                    <Text style={[styles.offlineWarningText, { color: isDark ? colors.warning[300] : colors.warning[900] }]}>Offline: internet connection is required to create payments.</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: brandColor,
                      opacity: loading || !isFormValid() || !isOnline ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSubmit}
                  activeOpacity={0.8}
                  disabled={loading || !isFormValid() || !isOnline}>
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: colors.white }]}>Create One-Time Payment</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showTenantPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTenantPicker(false)}>
        <View style={[styles.modalOverlay, isTablet && styles.modalOverlayTablet, { backgroundColor: colors.modal.overlay }]}>
          <View
            style={[
              styles.modalContainer,
              isTablet && styles.modalContainerTablet,
              { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
            ]}> 
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}> 
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Select Tenant</Text>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {tenants.map((tenant) => (
                <TouchableOpacity
                  key={tenant.id}
                  style={[styles.modalOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => handleTenantSelect(tenant)}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color: selectedTenantId === tenant.id ? colors.primary[500] : colors.text.primary,
                      },
                    ]}>
                    {tenant.name}
                  </Text>
                  <Text style={[styles.modalOptionSubtext, { color: colors.text.secondary }]}>Room {tenant.roomNumber || 'N/A'} G�� Rent {tenant.rent || '-'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowTenantPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}>
        <View style={[styles.modalOverlay, isTablet && styles.modalOverlayTablet, { backgroundColor: colors.modal.overlay }]}>
          <View
            style={[
              styles.modalContainer,
              isTablet && styles.modalContainerTablet,
              { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
            ]}> 
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}> 
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Select Payment Status</Text>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {PAYMENT_STATUSES.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.modalOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setStatus(item.value);
                    setSubmitError(null);
                    setShowStatusPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color: status === item.value ? colors.primary[500] : colors.text.primary,
                      },
                    ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMethodPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMethodPicker(false)}>
        <View style={[styles.modalOverlay, isTablet && styles.modalOverlayTablet, { backgroundColor: colors.modal.overlay }]}>
          <View
            style={[
              styles.modalContainer,
              isTablet && styles.modalContainerTablet,
              { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
            ]}> 
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}> 
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Select Payment Method</Text>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {paymentMethods.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.modalOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setMethod(item);
                    setShowMethodPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color: method === item ? colors.primary[500] : colors.text.primary,
                      },
                    ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowMethodPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  navBack: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navEyebrow: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: 1,
  },
  navTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  navSpacer: {
    width: 36,
    height: 36,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroEyebrow: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: 3,
  },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: 19,
  },
  formCard: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  errorContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  pickerButtonText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    flex: 1,
  },
  helperText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
  },
  submitButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.md,
  },
  submitButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
  offlineWarning: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  offlineWarningText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayTablet: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadows.xl,
  },
  modalContainerTablet: {
    width: '100%',
    alignSelf: 'center',
    maxHeight: '85%',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  modalHeader: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    ...textPresets.h4,
    color: colors.text.primary,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  modalOptionSubtext: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginTop: spacing.xs,
  },
  modalCloseButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
});
