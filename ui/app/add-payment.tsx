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
import { Wallet, ChevronLeft, ChevronDown } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { paymentService, tenantService } from '@/services/apiClient';
import type { Tenant, Payment } from '@/services/apiTypes';
import EmptyState from '@/components/EmptyState';
import DatePicker from '@/components/DatePicker';
import UpgradeModal from '@/components/UpgradeModal';
import { clearScreenCache } from '@/services/screenCache';

const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' },
];
const PAYMENT_METHODS = ['Cash', 'Online', 'Bank Transfer', 'UPI', 'Cheque'];

interface TenantWithLatestPayment extends Tenant {
  latestPayment?: Payment;
}

export default function AddPaymentScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { selectedPropertyId } = useProperty();
  const isOnline = useNetworkStatus();

  const [name, setName] = useState(typeof params.name === 'string' ? params.name : '');
  const [documentId, setDocumentId] = useState(typeof params.documentId === 'string' ? params.documentId : '');
  const [phone, setPhone] = useState(typeof params.phone === 'string' ? params.phone : '');
  const [address] = useState(typeof params.address === 'string' ? params.address : '');
  const [rent, setRent] = useState(typeof params.rent === 'string' ? params.rent : ''); // Rent remains unchanged
  const [joinDate, setJoinDate] = useState(typeof params.joinDate === 'string' ? params.joinDate : '');
  const [roomId] = useState(typeof params.roomId === 'string' ? params.roomId : '');
  const [bedId] = useState(typeof params.bedId === 'string' ? params.bedId : '');
  const [propertyId] = useState(typeof params.propertyId === 'string' ? params.propertyId : selectedPropertyId);
  const [amount, setAmount] = useState(params.rent || '');
  const [status, setStatus] = useState<'paid' | 'due'>('paid');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  function getTodayDay() {
    return new Date().getDate();
  }
  const [anchorDay, setAnchorDay] = useState<number>(getTodayDay());
  const [autoGeneratePayments, setAutoGeneratePayments] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAnchorDayPicker, setShowAnchorDayPicker] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (joinDate) {
      // Extract day of month from joinDate
      const joinDateObj = new Date(joinDate);
      setAnchorDay(joinDateObj.getDate());
    }
  }, [joinDate]);

  const handleStatusChange = (newStatus: 'paid' | 'due') => {
    if (newStatus === 'paid' || newStatus === 'due') {
      setStatus(newStatus);
      
      // If status is 'due', set anchor day to today
      if (newStatus === 'due') {
        const today = new Date();
        setAnchorDay(today.getDate());
      }
    }
  };

  const handleSubmit = async () => {
    // Only require tenant + status
    if (!name || !phone || !rent || !joinDate || !roomId || !bedId || !propertyId) {
      setError('All required fields must be filled');
      return;
    }

    const rentNum = parseFloat(typeof rent === 'string' ? rent : '');
    if (isNaN(rentNum) || rentNum <= 0) {
      setError('Please enter a valid rent');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const payload = {
        tenant: {
          propertyId,
          roomId,
          bedId,
          name: typeof name === 'string' ? name.trim() : '',
          documentId: typeof documentId === 'string' ? documentId.trim() : '',
          phone: typeof phone === 'string' ? phone.trim() : '',
          address: typeof address === 'string' ? address.trim() : '',
          rent: rent,
          joinDate,
        },
        status,
        anchorDay,
      };
      // Call backend to create tenant (tenantStatus will default to 'active' in backend)
      const tenantPayload: any = {
        ...payload.tenant,
        autoGeneratePayments,
      };
      
      // Only include billingConfig if auto-generating payments
      if (autoGeneratePayments) {
        tenantPayload.billingConfig = {
          status,
          billingCycle: 'monthly',
          anchorDay: anchorDay,
          ...(status === 'paid' ? { method: paymentMethod } : {}),
        };
      }

      await tenantService.createTenant(tenantPayload);
      clearScreenCache('tenants:');
      clearScreenCache('dashboard:');
      clearScreenCache('payments:');
      clearScreenCache('manage-beds:');
      clearScreenCache('room-beds:');
      setLoading(false);
      router.replace('/tenants'); // Navigate to tenant list after success
    } catch (err: any) {
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(err?.message || 'Failed to create tenant');
      }
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    // Base tenant fields must always be filled
    const baseValid = 
      name && 
      phone && 
      rent && 
      joinDate && 
      roomId && 
      bedId && 
      status && 
      !isNaN(parseFloat(rent)) && 
      parseFloat(rent) > 0;

    const isPaymentMethodValid = !autoGeneratePayments || status !== 'paid' || !!paymentMethod;
    return baseValid && isPaymentMethodValid;
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Record Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={Wallet}
            title="No Property Selected"
            subtitle="Please create a property first to record payments"
            actionLabel="Go Back"
            onActionPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Removed fetchingTenants block

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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Record Payment</Text>
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
            <Text style={[styles.title, { color: colors.text.primary }]}>Record Payment</Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View style={[styles.errorContainer, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
                <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
              </View>
            )}
            {/* Status */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Status *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton, 
                  { 
                    backgroundColor: !autoGeneratePayments ? colors.neutral[700] : colors.background.secondary, 
                    borderColor: colors.border.medium 
                  }
                ]} 
                onPress={() => setShowStatusPicker(true)}
                activeOpacity={0.7}
                disabled={loading || !autoGeneratePayments}>
                <Text style={[styles.pickerButtonText, { color: !autoGeneratePayments ? colors.text.tertiary : colors.text.primary }]}> 
                  {status === 'paid' ? 'Paid' : 'Due'}
                </Text>
                <ChevronDown size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {autoGeneratePayments && status === 'paid' && (
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
                        color: paymentMethod ? colors.text.primary : colors.text.tertiary,
                      },
                    ]}>
                    {paymentMethod || 'Select Payment Method'}
                  </Text>
                  <ChevronDown size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Billing Configuration - Only show when auto-generate is ENABLED */}
            {autoGeneratePayments && (
              <>
                {/* Anchor Day */}
                <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.text.primary }]}>When is rent due? *</Text>
                {status === 'due' ? (
                  // For monthly + due: lock to today (rent is due today)
                  <View style={[styles.infoBox, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                    <Text style={[styles.infoValue, { color: colors.primary[700] }]}>
                      📅 Day {anchorDay} • Every Month
                    </Text>
                    <Text style={[styles.infoNote, { color: colors.text.secondary }]}>
                      Automatically set to today (rent is due today)
                    </Text>
                  </View>
                ) : (
                  // If status is 'paid', allow selection
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                    onPress={() => setShowAnchorDayPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: colors.text.primary }]}>
                      📅 Day {anchorDay} • Every Month
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                )}
                {status !== 'due' && (
                  <Text style={[styles.helperText, { color: colors.text.secondary, marginTop: spacing.sm }]}>
                    Same day each month
                  </Text>
                )}
              </View>
              </>
            )}

            {/* Auto-generate Payments Toggle */}
            <View style={[styles.toggleContainer, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[50], borderColor: colors.border.light }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: colors.text.primary }]}>Auto-Generate Payment</Text>
                <Text style={[styles.toggleDescription, { color: colors.text.secondary }]}>
                  Create an initial payment record for this tenant
                </Text>
              </View>
              <Switch
                value={autoGeneratePayments}
                onValueChange={setAutoGeneratePayments}
                trackColor={{ false: colors.neutral[300], true: colors.primary[200] }}
                thumbColor={autoGeneratePayments ? colors.primary[500] : colors.neutral[400]}
                disabled={loading}
              />
            </View>


            {!isOnline && (
              <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                  📡 Offline - You cannot add payments without internet connection
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
                  {isOnline ? 'Add Tenant' : 'Offline'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Tenant selection modal removed */}

      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
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
                  onPress={() => {
                    handleStatusChange(s.value as 'paid' | 'due');
                    setShowStatusPicker(false);
                  }}
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

        <Modal
          visible={showAnchorDayPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAnchorDayPicker(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
            <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>When is rent due?</Text>
              </View>
              <ScrollView style={styles.modalScrollView}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.modalOption, { borderBottomColor: colors.border.light }]}
                    onPress={() => {
                      setAnchorDay(day);
                      setShowAnchorDayPicker(false);
                    }}
                    activeOpacity={0.7}>
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color:
                            anchorDay === day ? colors.primary[500] : colors.text.primary,
                          fontWeight:
                            anchorDay === day
                              ? typography.fontWeight.semibold
                              : typography.fontWeight.regular,
                        },
                      ]}>
                      Day {day} • Every Month
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
                onPress={() => setShowAnchorDayPicker(false)}
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
                {PAYMENT_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[styles.modalOption, { borderBottomColor: colors.border.light }]}
                    onPress={() => {
                      setPaymentMethod(method);
                      setShowMethodPicker(false);
                    }}
                    activeOpacity={0.7}>
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color: paymentMethod === method ? colors.primary[500] : colors.text.primary,
                          fontWeight:
                            paymentMethod === method
                              ? typography.fontWeight.semibold
                              : typography.fontWeight.regular,
                        },
                      ]}>
                      {method}
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

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => {
          setShowUpgradeModal(false);
        }}
      />
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
  },
  infoContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  infoText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontSize: typography.fontSize.xs,
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
  modalOptionContent: {
    gap: spacing.xs,
  },
  modalOptionText: {
    fontSize: typography.fontSize.md,
  },
  modalOptionSubtext: {
    fontSize: typography.fontSize.sm,
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
  helperText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  infoBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoNote: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
