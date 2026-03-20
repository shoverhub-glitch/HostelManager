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
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { tenantService } from '@/services/apiClient';
import type { Tenant, Payment } from '@/services/apiTypes';
import EmptyState from '@/components/EmptyState';
import UpgradeModal from '@/components/UpgradeModal';
import { clearScreenCache } from '@/services/screenCache';

const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' },
];
const PAYMENT_METHODS = ['Cash', 'Online', 'Bank Transfer', 'UPI', 'Cheque'];

type JoinDateTiming = 'past' | 'today' | 'future';

const parseDateOnly = (value: string): Date | null => {
  if (!value) {
    return null;
  }

  const normalized = value.slice(0, 10);
  const parts = normalized.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

const getClampedDate = (year: number, monthIndex: number, day: number): Date => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, daysInMonth));
};

const getJoinDateTiming = (joinDateValue: string): JoinDateTiming => {
  const selectedJoinDate = parseDateOnly(joinDateValue);
  if (!selectedJoinDate) {
    return 'today';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedJoinDate < today) {
    return 'past';
  }
  if (selectedJoinDate > today) {
    return 'future';
  }
  return 'today';
};

const getAnchorTiming = (anchorDayValue: number): JoinDateTiming => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentMonthAnchor = getClampedDate(today.getFullYear(), today.getMonth(), anchorDayValue);

  if (currentMonthAnchor < today) {
    return 'past';
  }
  if (currentMonthAnchor > today) {
    return 'future';
  }
  return 'today';
};

const getScheduledDueDate = (anchorDayValue: number, joinTiming: JoinDateTiming): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentMonthAnchor = getClampedDate(today.getFullYear(), today.getMonth(), anchorDayValue);

  if (joinTiming === 'past') {
    return getClampedDate(today.getFullYear(), today.getMonth() + 1, anchorDayValue);
  }

  if (joinTiming === 'future') {
    if (currentMonthAnchor > today) {
      return currentMonthAnchor;
    }
    return getClampedDate(today.getFullYear(), today.getMonth() + 1, anchorDayValue);
  }

  if (currentMonthAnchor < today) {
    return getClampedDate(today.getFullYear(), today.getMonth() + 1, anchorDayValue);
  }

  return currentMonthAnchor;
};

const formatScheduleDate = (targetDate: Date): string =>
  targetDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

interface TenantWithLatestPayment extends Tenant {
  latestPayment?: Payment;
}

export default function AddPaymentScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { selectedPropertyId } = useProperty();
  const { isTablet, contentMaxWidth, modalMaxWidth, formMaxWidth } = useResponsiveLayout();
  const isOnline = useNetworkStatus();

  const [name, setName] = useState(typeof params.name === 'string' ? params.name : '');
  const [documentId, setDocumentId] = useState(typeof params.documentId === 'string' ? params.documentId : '');
  const [phone, setPhone] = useState(typeof params.phone === 'string' ? params.phone : '');
  const [address] = useState(typeof params.address === 'string' ? params.address : '');
  const [rent, setRent] = useState(typeof params.rent === 'string' ? params.rent : ''); // Rent remains unchanged
  const [joinDate] = useState(typeof params.joinDate === 'string' ? params.joinDate : '');
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

  const joinDateTiming = getJoinDateTiming(joinDate);
  const anchorTiming = getAnchorTiming(anchorDay);
  const shouldHideStatus = joinDateTiming !== 'today' || anchorTiming !== 'today';
  const effectiveStatus: 'paid' | 'due' = shouldHideStatus ? 'due' : status;
  const nextScheduledDueDate = getScheduledDueDate(anchorDay, joinDateTiming);
  const nextScheduledDueDateLabel = formatScheduleDate(nextScheduledDueDate);

  useEffect(() => {
    if (joinDate) {
      // Extract day of month from joinDate
      const joinDateObj = parseDateOnly(joinDate);
      if (joinDateObj) {
        setAnchorDay(joinDateObj.getDate());
      }
    }
  }, [joinDate]);

  useEffect(() => {
    if (shouldHideStatus && status !== 'due') {
      setStatus('due');
    }
  }, [shouldHideStatus, status]);

  const handleStatusChange = (newStatus: 'paid' | 'due') => {
    if (newStatus === 'paid' || newStatus === 'due') {
      setStatus(newStatus);
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
        status: effectiveStatus,
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
          status: effectiveStatus,
          billingCycle: 'monthly',
          anchorDay: anchorDay,
          method: paymentMethod,
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
      effectiveStatus && 
      !isNaN(parseFloat(rent)) && 
      parseFloat(rent) > 0;

    const isPaymentMethodValid = !autoGeneratePayments || effectiveStatus !== 'paid' || !!paymentMethod;
    return baseValid && isPaymentMethodValid;
  };

  const brandColor = colors.primary[500];
  const brandLight = isDark ? colors.primary[900] : colors.primary[50];
  const brandText = isDark ? colors.primary[300] : colors.primary[700];
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
        <Text style={[styles.navEyebrow, { color: textTertiary }]}>STEP 2</Text>
        <Text style={[styles.navTitle, { color: textPrimary }]}>Record Payment</Text>
      </View>

      <View style={styles.navSpacer} />
    </View>
  );

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
              <Text style={[styles.heroEyebrow, { color: textTertiary }]}>BILLING SETUP</Text>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>Record payment</Text>
              <Text style={[styles.heroSubtitle, { color: textSecondary }]}>Define current status and monthly due cycle for this tenant.</Text>
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: cardBg, borderColor: cardBorder },
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>
            {error && (
              <View style={[styles.errorContainer, {
                backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                borderColor: isDark ? colors.danger[700] : colors.danger[200],
              }]}>
                <Text style={[styles.errorText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>{error}</Text>
              </View>
            )}
            {!shouldHideStatus && (
              <View style={styles.inputContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Status *</Text>
                <TouchableOpacity
                  style={[
                    styles.pickerButton,
                    {
                      backgroundColor: !autoGeneratePayments ? colors.neutral[700] : colors.background.primary,
                      borderColor: !autoGeneratePayments ? colors.border.dark : cardBorder,
                    },
                  ]}
                  onPress={() => setShowStatusPicker(true)}
                  activeOpacity={0.7}
                  disabled={loading || !autoGeneratePayments}>
                  <Text style={[styles.pickerButtonText, { color: !autoGeneratePayments ? textTertiary : textPrimary }]}>
                    {status === 'paid' ? 'Paid' : 'Due'}
                  </Text>
                  <ChevronDown size={18} color={!autoGeneratePayments ? textTertiary : brandColor} />
                </TouchableOpacity>
              </View>
            )}

            {autoGeneratePayments && effectiveStatus === 'paid' && (
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
                        color: paymentMethod ? textPrimary : textTertiary,
                      },
                    ]}>
                    {paymentMethod || 'Select Payment Method'}
                  </Text>
                  <ChevronDown size={18} color={paymentMethod ? brandColor : textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Billing Configuration - Only show when auto-generate is ENABLED */}
            {autoGeneratePayments && (
              <>
                {/* Anchor Day */}
                <View style={styles.inputContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>When Is Rent Due? *</Text>
                {shouldHideStatus ? (
                  <>
                    <TouchableOpacity
                      style={[styles.pickerButton, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
                      onPress={() => setShowAnchorDayPicker(true)}
                      activeOpacity={0.7}
                      disabled={loading}>
                      <Text style={[styles.pickerButtonText, { color: colors.text.primary }]}> 
                        Day {anchorDay} • Every Month
                      </Text>
                      <ChevronDown size={18} color={brandColor} />
                    </TouchableOpacity>
                    <View style={[styles.scheduleHintBox, {
                      backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                      borderColor: isDark ? colors.primary[700] : colors.primary[200],
                    }]}>
                      <Text style={[styles.scheduleHintText, { color: brandText }]}>
                        Payment will be generated on {nextScheduledDueDateLabel}.
                      </Text>
                      <Text style={[styles.infoNote, { color: textSecondary }]}>
                        Status and method are set automatically.
                      </Text>
                    </View>
                  </>
                ) : status === 'due' ? (
                  // For monthly + due: lock to today (rent is due today)
                  <View style={[styles.infoBox, {
                    backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                    borderColor: isDark ? colors.primary[700] : colors.primary[200],
                  }]}>
                    <Text style={[styles.infoValue, { color: brandText }]}>
                      Day {anchorDay} • Every Month
                    </Text>
                    <Text style={[styles.infoNote, { color: textSecondary }]}>
                      Automatically set to today (rent is due today)
                    </Text>
                  </View>
                ) : (
                  // If status is 'paid', allow selection
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
                    onPress={() => setShowAnchorDayPicker(true)}
                    activeOpacity={0.7}
                    disabled={loading}>
                    <Text style={[styles.pickerButtonText, { color: textPrimary }]}>
                      Day {anchorDay} • Every Month
                    </Text>
                    <ChevronDown size={18} color={brandColor} />
                  </TouchableOpacity>
                )}
                {!shouldHideStatus && status !== 'due' && (
                  <Text style={[styles.helperText, { color: textSecondary, marginTop: spacing.sm }]}>
                    Same day each month
                  </Text>
                )}

                {!shouldHideStatus && status === 'due' && (
                  <Text style={[styles.helperText, { color: textSecondary, marginTop: spacing.sm }]}>
                    A due payment record is created immediately for this cycle.
                  </Text>
                )}
              </View>
              </>
            )}

            {/* Auto-generate Payments Toggle */}
            <View style={[styles.toggleContainer, {
              backgroundColor: colors.background.primary,
              borderColor: cardBorder,
            }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: textPrimary }]}>Auto-Generate Payments</Text>
                <Text style={[styles.toggleDescription, { color: textSecondary }]}>
                  Automatically create monthly payment records for this tenant
                </Text>
              </View>
              <Switch
                value={autoGeneratePayments}
                onValueChange={setAutoGeneratePayments}
                trackColor={{ false: colors.neutral[300], true: colors.primary[300] }}
                thumbColor={autoGeneratePayments ? brandColor : colors.neutral[400]}
                disabled={loading}
              />
            </View>


            {!isOnline && (
              <View style={[styles.offlineWarning, {
                backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
                borderColor: isDark ? colors.warning[700] : colors.warning[200],
              }]}>
                <Text style={[styles.offlineWarningText, { color: isDark ? colors.warning[300] : colors.warning[900] }]}>
                  Offline: internet connection is required to complete tenant creation.
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
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowStatusPicker(false)} activeOpacity={1} />
          <View
            style={[
              styles.sheet,
              styles.sheetTablet,
              {
                backgroundColor: cardBg,
                maxWidth: isTablet ? modalMaxWidth : undefined,
              },
            ]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>
                Select Payment Status
              </Text>
            </View>

            <ScrollView style={styles.sheetBody}>
              {PAYMENT_STATUSES.map((s, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.sheetOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    handleStatusChange(s.value as 'paid' | 'due');
                    setShowStatusPicker(false);
                  }}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.sheetOptionText,
                      {
                        color:
                          status === s.value ? brandText : textPrimary,
                      },
                    ]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetFooterBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusPicker(false)}
              activeOpacity={0.75}>
              <Text style={[styles.sheetFooterBtnText, { color: textSecondary }]}>
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
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowAnchorDayPicker(false)} activeOpacity={1} />
          <View
            style={[
              styles.sheet,
              styles.sheetTablet,
              {
                backgroundColor: cardBg,
                maxWidth: isTablet ? modalMaxWidth : undefined,
              },
            ]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>When is rent due?</Text>
            </View>

            <ScrollView style={styles.sheetBody}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.sheetOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setAnchorDay(day);
                    setShowAnchorDayPicker(false);
                  }}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.sheetOptionText,
                      {
                        color: anchorDay === day ? brandText : textPrimary,
                      },
                    ]}>
                    Day {day} • Every Month
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetFooterBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowAnchorDayPicker(false)}
              activeOpacity={0.75}>
              <Text style={[styles.sheetFooterBtnText, { color: textSecondary }]}>Cancel</Text>
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
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowMethodPicker(false)} activeOpacity={1} />
          <View
            style={[
              styles.sheet,
              styles.sheetTablet,
              {
                backgroundColor: cardBg,
                maxWidth: isTablet ? modalMaxWidth : undefined,
              },
            ]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>Select Payment Method</Text>
            </View>

            <ScrollView style={styles.sheetBody}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[styles.sheetOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setPaymentMethod(method);
                    setShowMethodPicker(false);
                  }}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.sheetOptionText,
                      {
                        color: paymentMethod === method ? brandText : textPrimary,
                      },
                    ]}>
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetFooterBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowMethodPicker(false)}
              activeOpacity={0.75}>
              <Text style={[styles.sheetFooterBtnText, { color: textSecondary }]}>Cancel</Text>
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
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
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
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
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
  sheet: {
    width: '100%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadows.xl,
  },
  sheetTablet: {
    alignSelf: 'center',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
  sheetHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
    textAlign: 'center',
  },
  sheetBody: {
    maxHeight: 380,
  },
  sheetOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  sheetOptionText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  sheetFooterBtn: {
    borderTopWidth: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  sheetFooterBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },

  helperText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },
  infoBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  scheduleHintBox: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  scheduleHintText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },
  infoValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  infoNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
});
