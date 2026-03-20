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
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
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
        <Text style={[styles.navTitle, { color: textPrimary }]}>Edit Payment</Text>
      </View>

      <View style={styles.navSpacer} />
    </View>
  );

  if (fetchingPayment) {
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
              <Text style={[styles.heroEyebrow, { color: textTertiary }]}>UPDATE ENTRY</Text>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>Edit payment</Text>
              <Text style={[styles.heroSubtitle, { color: textSecondary }]}>Adjust status, amount, method, and relevant dates.</Text>
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: cardBg, borderColor: cardBorder },
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>
            {error && <ApiErrorCard error={error} onRetry={handleRetry} />}

            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Tenant Name</Text>
              <View
                style={[
                  styles.disabledInput,
                  {
                    backgroundColor: colors.background.primary,
                    borderColor: cardBorder,
                  },
                ]}>
                <Text style={[styles.disabledText, { color: textSecondary }]}>
                  {tenantName}
                </Text>
              </View>
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

            {status === 'paid' && (
              <View style={styles.inputContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Payment Method *</Text>
                <TouchableOpacity
                  style={[
                    styles.pickerButton,
                    {
                      backgroundColor: colors.background.primary,
                      borderColor: cardBorder,
                    },
                  ]}
                  onPress={() => setShowMethodPicker(true)}
                  activeOpacity={0.7}
                  disabled={loading}>
                  <Text
                    style={[
                      styles.pickerButtonText,
                      {
                        color: method ? textPrimary : textTertiary,
                      },
                    ]}>
                    {method || 'Select Method'}
                  </Text>
                  <ChevronDown size={18} color={method ? brandColor : textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Status *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.primary,
                    borderColor: cardBorder,
                  },
                ]}
                onPress={() => setShowStatusPicker(true)}
                activeOpacity={0.7}
                disabled={loading}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                        color: status ? textPrimary : textTertiary,
                    },
                  ]}>
                  {PAYMENT_STATUSES.find(s => s.value === status)?.label || 'Select Status'}
                </Text>
                <ChevronDown size={18} color={brandColor} />
              </TouchableOpacity>
            </View>

            {status === 'paid' && (
              <View style={styles.inputContainer}>
                <View style={[styles.toggleRow, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.fieldLabel, { color: textSecondary, marginBottom: 0 }]}>Edit Paid Date</Text>
                    <Text style={[styles.toggleHint, { color: textSecondary }]}>
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
                <View style={[styles.toggleRow, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.fieldLabel, { color: textSecondary, marginBottom: 0 }]}>Edit Due Date</Text>
                    <Text style={[styles.toggleHint, { color: textSecondary }]}>
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
              <View style={[styles.offlineWarning, {
                backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
                borderColor: isDark ? colors.warning[700] : colors.warning[200],
              }]}>
                <Text style={[styles.offlineWarningText, { color: isDark ? colors.warning[300] : colors.warning[900] }]}>
                  Offline: internet connection is required to update payments.
                </Text>
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
  heroCopy: {
    flex: 1,
  },
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
  disabledInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  disabledText: {
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
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  helperText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginTop: spacing.xs,
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
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
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
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  confirmMessage: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.xl,
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
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
  confirmButtonPrimary: {
    ...shadows.md,
  },
  confirmButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});
