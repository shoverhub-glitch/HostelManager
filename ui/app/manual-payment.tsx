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
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
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
      amount: `₹${amountNum.toLocaleString('en-IN')}`,
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
        <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manual Payment</Text>
          <View style={styles.placeholder} />
        </View>
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
        <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manual Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manual Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary[50] }]}>
              <Wallet size={32} color={colors.primary[500]} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>Create Manual Payment</Text>
          </View>

          <View style={styles.formContainer}>
            {fetchError && <ApiErrorCard error={fetchError} onRetry={fetchFormData} />}

            {submitError && (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor: colors.danger[50],
                    borderColor: colors.danger[200],
                  },
                ]}>
                <Text style={[styles.errorText, { color: colors.danger[700] }]}>{submitError}</Text>
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
                  <Text style={[styles.label, { color: colors.text.primary }]}>Tenant *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                    onPress={() => setShowTenantPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: selectedTenant ? colors.text.primary : colors.text.tertiary }]}> 
                      {selectedTenant ? `${selectedTenant.name} • Room ${selectedTenant.roomNumber || 'N/A'}` : 'Select Tenant'}
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Amount *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                      backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., 5000"
                    keyboardType="numeric"
                    placeholderTextColor={colors.text.tertiary}
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

                <Text style={[styles.helperText, { color: colors.text.secondary }]}> 
                  {status === 'paid'
                    ? 'Paid date is saved as the payment date for this entry.'
                    : 'Due date can be set from today up to the next 30 days.'}
                </Text>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Status *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                    onPress={() => setShowStatusPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: colors.text.primary }]}> 
                      {PAYMENT_STATUSES.find((item) => item.value === status)?.label || 'Select Status'}
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Payment Method *</Text>
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                    onPress={() => setShowMethodPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: colors.text.primary }]}>{method}</Text>
                    <ChevronDown size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>

                {!isOnline && (
                  <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                    <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>📡 Offline - You cannot create payments without internet</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: colors.primary[500],
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
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}> 
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
                        fontWeight:
                          selectedTenantId === tenant.id
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    {tenant.name}
                  </Text>
                  <Text style={[styles.modalOptionSubtext, { color: colors.text.secondary }]}>Room {tenant.roomNumber || 'N/A'} • Rent {tenant.rent || '-'}</Text>
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
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}> 
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
                        fontWeight:
                          status === item.value
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
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
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}> 
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
                        fontWeight:
                          method === item
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  placeholder: {
    width: 40,
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 0,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  pickerButtonText: {
    fontSize: typography.fontSize.md,
    flex: 1,
    marginRight: spacing.sm,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    marginTop: -spacing.lg,
    marginBottom: spacing.xl,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadows.xl,
  },
  modalHeader: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
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
    fontSize: typography.fontSize.md,
  },
  modalOptionSubtext: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  modalCloseButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
