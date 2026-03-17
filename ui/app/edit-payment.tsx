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
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, ChevronLeft, ChevronDown, AlertTriangle } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService } from '@/services/apiClient';
import type { Payment } from '@/services/apiTypes';
import ApiErrorCard from '@/components/ApiErrorCard';
import DatePicker from '@/components/DatePicker';
import { cacheKeys, clearScreenCache, getScreenCache, setScreenCache } from '@/services/screenCache';

const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' },
];

const DEFAULT_PAYMENT_METHODS = ['Cash', 'Online', 'Bank Transfer', 'UPI', 'Cheque'];

const PAYMENT_DETAIL_CACHE_STALE_MS = 60 * 1000;

export default function EditPaymentScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { isTablet, contentMaxWidth, modalMaxWidth, formMaxWidth } = useResponsiveLayout();
  const isOnline = useNetworkStatus();

  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [method, setMethod] = useState('Cash');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [status, setStatus] = useState<'paid' | 'due'>('paid');
  const [pendingStatus, setPendingStatus] = useState<'paid' | 'due' | null>(null);
  const [enablePaidDateEdit, setEnablePaidDateEdit] = useState(false);
  const [enableDueDateEdit, setEnableDueDateEdit] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fetchingPayment, setFetchingPayment] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);

  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    if (paymentId) {
      fetchPayment();
    }
  }, [paymentId]);

  const getEffectiveStatus = (paymentStatus: Payment['status']): 'paid' | 'due' => {
    return paymentStatus === 'paid' ? 'paid' : 'due';
  };

  const getAmountNumberString = (amountValue?: string) => {
    if (!amountValue) return '';
    return amountValue.replace(/[^0-9]/g, '');
  };

  const applyPaymentToForm = (payment: Payment) => {
    setSelectedPaymentId(payment.id);
    setAmount(getAmountNumberString(payment.amount));
    setDueDate(payment.dueDate || '');
    setPaidDate(payment.paidDate || '');
    setMethod(payment.method || 'Cash');
    setStatus(getEffectiveStatus(payment.status));
    setTenantName(payment.tenantName || '');
    setEnablePaidDateEdit(false);
    setEnableDueDateEdit(false);
  };

  const fetchPayment = async () => {
    if (!paymentId) return;

    const paymentCacheKey = cacheKeys.paymentDetail(paymentId);
    const cachedPayment = getScreenCache<any>(paymentCacheKey, PAYMENT_DETAIL_CACHE_STALE_MS);

    try {
      setFetchingPayment(true);
      setError(null);

      const initialPayment: Payment = cachedPayment
        ? cachedPayment
        : (await paymentService.getPaymentById(paymentId)).data;

      if (!cachedPayment) {
        setScreenCache(paymentCacheKey, initialPayment);
      }

      // Use default payment methods or fetch from backend if API is available
      // For now, use the predefined list from backend enum
      setPaymentMethods(DEFAULT_PAYMENT_METHODS);

      setPaymentHistory([initialPayment]);
      applyPaymentToForm(initialPayment);
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment');
    } finally {
      setFetchingPayment(false);
    }
  };

  const handleRetry = () => {
    fetchPayment();
  };

  const handleStatusSelection = (newStatus: 'paid' | 'due') => {
    // If status is changing, show confirmation
    if (newStatus !== status) {
      setPendingStatus(newStatus);
      setShowStatusPicker(false);
      setShowStatusConfirmModal(true);
    } else {
      setShowStatusPicker(false);
    }
  };

  const handleConfirmStatusChange = () => {
    if (pendingStatus) {
      setStatus(pendingStatus);
      setPendingStatus(null);
    }
    setShowStatusConfirmModal(false);
  };

  const handleCancelStatusChange = () => {
    setPendingStatus(null);
    setShowStatusConfirmModal(false);
  };

  const getStatusConfirmationMessage = () => {
    if (!pendingStatus) return '';
    
    if (pendingStatus === 'paid') {
      return 'Mark this payment as Paid? The payment date will be recorded as today. This action should only be confirmed once payment is received.';
    } else if (status === 'paid' && pendingStatus === 'due') {
      return 'Change status from Paid to Due? This will remove the paid record.';
    } else {
      return `Change payment status to ${PAYMENT_STATUSES.find(s => s.value === pendingStatus)?.label}?`;
    }
  };

  const handleSubmit = async () => {
    if (!selectedPaymentId) {
      setError('Payment is missing');
      return;
    }

    if (!amount || !status || (status === 'paid' && !method)) {
      setError(status === 'paid' ? 'Amount, status, and payment method are required' : 'Amount and status are required');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    // Validate date if editing is enabled
    if (status === 'paid' && enablePaidDateEdit && !paidDate) {
      setError('Paid date is required when editing');
      return;
    }

    if (status === 'due' && enableDueDateEdit && !dueDate) {
      setError('Due date is required when editing');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const updateData: any = {
        status,
        amount: `₹${amountNum.toLocaleString()}`,
      };

      if (status === 'paid') {
        updateData.method = method;
      }

      // Only include date if editing is enabled
      if (status === 'paid' && enablePaidDateEdit && paidDate) {
        updateData.paidDate = paidDate;
      }

      if (status === 'due' && enableDueDateEdit && dueDate) {
        updateData.dueDate = dueDate;
      }

      await paymentService.updatePayment(selectedPaymentId, updateData);

      clearScreenCache('payments:');
      clearScreenCache('dashboard:');
      clearScreenCache('tenant-detail:');
      clearScreenCache(`payment-detail:${selectedPaymentId}`);

      router.back();
    } catch (err: any) {
      setError(err?.message || 'Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (!status || !selectedPaymentId || !amount) return false;
    if (status === 'paid' && !method) return false;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return false;

    // Validate date if editing is enabled
    if (status === 'paid' && enablePaidDateEdit && !paidDate) return false;
    if (status === 'due' && enableDueDateEdit && !dueDate) return false;

    return true;
  };

  if (fetchingPayment) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit Payment</Text>
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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}>
              <Wallet size={48} color={isDark ? colors.primary[300] : colors.primary[500]} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>Edit Payment</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Update payment details
            </Text>
          </View>

          <View
            style={[
              styles.formContainer,
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>
            {error && <ApiErrorCard error={error} onRetry={handleRetry} />}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Tenant Name</Text>
              <View
                style={[
                  styles.disabledInput,
                  {
                    backgroundColor: colors.background.tertiary,
                    borderColor: colors.border.medium,
                  },
                ]}>
                <Text style={[styles.disabledText, { color: colors.text.secondary }]}>
                  {tenantName}
                </Text>
              </View>
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

            {status === 'paid' && (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.text.primary }]}>Payment Method *</Text>
                <TouchableOpacity
                  style={[
                    styles.pickerButton,
                    {
                      backgroundColor: colors.background.secondary,
                      borderColor: colors.border.medium,
                    },
                  ]}
                  onPress={() => setShowMethodPicker(true)}
                  activeOpacity={0.7}
                  disabled={loading}>
                  <Text
                    style={[
                      styles.pickerButtonText,
                      {
                        color: method ? colors.text.primary : colors.text.tertiary,
                      },
                    ]}>
                    {method || 'Select Method'}
                  </Text>
                  <ChevronDown size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Status *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                  },
                ]}
                onPress={() => setShowStatusPicker(true)}
                activeOpacity={0.7}
                disabled={loading}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                      color: status ? colors.text.primary : colors.text.tertiary,
                    },
                  ]}>
                  {PAYMENT_STATUSES.find(s => s.value === status)?.label || 'Select Status'}
                </Text>
                <ChevronDown size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {status === 'paid' && (
              <View style={styles.inputContainer}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.label, { color: colors.text.primary, marginBottom: 0 }]}>Edit Paid Date</Text>
                    <Text style={[styles.toggleHint, { color: colors.text.secondary }]}>
                      {paidDate ? `Current: ${new Date(paidDate).toLocaleDateString('en-IN')}` : 'No date set'}
                    </Text>
                  </View>
                  <Switch
                    value={enablePaidDateEdit}
                    onValueChange={setEnablePaidDateEdit}
                    disabled={loading}
                    thumbColor={enablePaidDateEdit ? colors.primary[500] : colors.text.tertiary}
                    trackColor={{ false: colors.border.medium, true: colors.primary[100] }}
                  />
                </View>
                {enablePaidDateEdit && (
                  <View style={[styles.inputContainer, { marginTop: spacing.sm, marginBottom: 0 }]}>
                    <DatePicker
                      value={paidDate}
                      onChange={setPaidDate}
                      label="Paid Date"
                      disabled={loading}
                      required
                    />
                  </View>
                )}
              </View>
            )}

            {status === 'due' && (
              <View style={styles.inputContainer}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.label, { color: colors.text.primary, marginBottom: 0 }]}>Edit Due Date</Text>
                    <Text style={[styles.toggleHint, { color: colors.text.secondary }]}>
                      {dueDate ? `Current: ${new Date(dueDate).toLocaleDateString('en-IN')}` : 'No date set'}
                    </Text>
                  </View>
                  <Switch
                    value={enableDueDateEdit}
                    onValueChange={setEnableDueDateEdit}
                    disabled={loading}
                    thumbColor={enableDueDateEdit ? colors.primary[500] : colors.text.tertiary}
                    trackColor={{ false: colors.border.medium, true: colors.primary[100] }}
                  />
                </View>
                {enableDueDateEdit && (
                  <View style={[styles.inputContainer, { marginTop: spacing.sm, marginBottom: 0 }]}>
                    <DatePicker
                      value={dueDate}
                      onChange={setDueDate}
                      label="Due Date"
                      disabled={loading}
                      required
                    />
                  </View>
                )}
              </View>
            )}

            {!isOnline && (
              <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                  📡 Offline - You cannot update payments without internet connection
                </Text>
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
                <Text style={[styles.submitButtonText, { color: colors.white }]}>
                  {isOnline ? 'Update Payment' : 'Offline'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Payment Method
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {paymentMethods.map((m, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setMethod(m);
                    setShowMethodPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          method === m ? colors.primary[500] : colors.text.primary,
                        fontWeight:
                          method === m
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowMethodPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
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
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Payment Status
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {PAYMENT_STATUSES.map((s, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => handleStatusSelection(s.value as 'paid' | 'due')}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          status === s.value ? colors.primary[500] : colors.text.primary,
                        fontWeight:
                          status === s.value
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Status Change Confirmation Modal */}
      <Modal
        visible={showStatusConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelStatusChange}>
        <View style={[styles.modalOverlay, styles.confirmModalOverlay, isTablet && styles.modalOverlayTablet, { backgroundColor: colors.modal.overlay }]}>
          <View
            style={[
              styles.confirmModalContainer,
              { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
            ]}>
            <View style={styles.confirmIconContainer}>
              <View style={[styles.confirmIcon, { backgroundColor: pendingStatus === 'paid' ? (isDark ? colors.success[900] : colors.success[50]) : (isDark ? colors.warning[900] : colors.warning[50]) }]}>
                <AlertTriangle size={32} color={pendingStatus === 'paid' ? colors.success[500] : colors.warning[500]} />
              </View>
            </View>

            <Text style={[styles.confirmTitle, { color: colors.text.primary }]}>
              Confirm Status Change
            </Text>
            <Text style={[styles.confirmMessage, { color: colors.text.secondary }]}>
              {getStatusConfirmationMessage()}
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                onPress={handleCancelStatusChange}
                activeOpacity={0.7}>
                <Text style={[styles.cancelButtonText, { color: colors.text.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmButtonPrimary, { backgroundColor: pendingStatus === 'paid' ? colors.success[500] : colors.warning[500] }]}
                onPress={handleConfirmStatusChange}
                activeOpacity={0.7}>
                <Text style={[styles.confirmButtonText, { color: colors.white }]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: spacing.xxxl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
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
  disabledInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  disabledText: {
    fontSize: typography.fontSize.md,
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
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
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
  modalOverlayTablet: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmModalOverlay: {
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
  modalCloseButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  confirmModalContainer: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.xl,
  },
  confirmIconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  confirmMessage: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  confirmButtonPrimary: {
    ...shadows.md,
  },
  confirmButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
