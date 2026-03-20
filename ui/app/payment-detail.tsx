import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Calendar,
  CheckCircle,
  Clock,
  Building2,
  CreditCard,
  AlertTriangle,
  Check,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService } from '@/services/apiClient';
import { clearScreenCache } from '@/services/screenCache';
import type { Payment } from '@/services/apiTypes';

// ─── Animated Toggle ──────────────────────────────────────────────────────────
function StatusToggle({
  isPaid,
  onToggle,
  disabled,
}: {
  isPaid: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const { colors, isDark } = useTheme();
  const translateX = useRef(new Animated.Value(isPaid ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: isPaid ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [isPaid]);

  const thumbTranslate = translateX.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 23],
  });

  const trackColor = isPaid ? colors.success[500] : colors.warning[400];

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.toggleTrack,
        { backgroundColor: trackColor, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Animated.View
        style={[
          styles.toggleThumb,
          { transform: [{ translateX: thumbTranslate }] },
        ]}
      />
    </Pressable>
  );
}

// ─── Tenant Avatar ────────────────────────────────────────────────────────────
function TenantAvatar({ name, colors, isDark }: { name: string; colors: any; isDark: boolean }) {
  const initials = name
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: isDark ? colors.primary[900] : colors.primary[100],
        },
      ]}>
      <Text
        style={[
          styles.avatarText,
          { color: isDark ? colors.primary[300] : colors.primary[700] },
        ]}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PaymentDetailScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { contentMaxWidth } = useResponsiveLayout();
  const isOnline = useNetworkStatus();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'paid' | 'due' | null>(null);

  // ── Semantic color tokens ────────────────────────────────────────────────
  const C = {
    brand:       colors.primary[500],
    brandLight:  isDark ? colors.primary[900] : colors.primary[50],
    brandBorder: isDark ? colors.primary[700] : colors.primary[200],
    brandText:   isDark ? colors.primary[300] : colors.primary[700],

    danger:       colors.danger[500],
    dangerLight:  isDark ? colors.danger[900] : colors.danger[50],
    dangerBorder: isDark ? colors.danger[700] : colors.danger[200],
    dangerText:   isDark ? colors.danger[300] : colors.danger[600],

    success:       colors.success[500],
    successLight:  isDark ? colors.success[900] : colors.success[50],
    successBorder: isDark ? colors.success[700] : colors.success[200],
    successText:   isDark ? colors.success[300] : colors.success[700],

    warning:       colors.warning[500],
    warningLight:  isDark ? colors.warning[900] : colors.warning[50],
    warningBorder: isDark ? colors.warning[700] : colors.warning[200],
    warningText:   isDark ? colors.warning[300] : colors.warning[700],

    card:      colors.background.secondary,
    border:    colors.border.medium,
    borderL:   colors.border.light,
    bgSubtle:  isDark ? colors.neutral[800] : colors.neutral[100],
    textP:     colors.text.primary,
    textS:     colors.text.secondary,
    textT:     colors.text.tertiary,
    white:     colors.white,
  };

  useEffect(() => { fetchPayment(); }, [paymentId]);

  const fetchPayment = async () => {
    if (!paymentId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await paymentService.getPaymentById(paymentId);
      if (response?.data) setPayment(response.data);
      else setError('Payment not found');
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!paymentId) return;
    try {
      setDeleting(true);
      await paymentService.deletePayment(paymentId);
      clearScreenCache('payments:');
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to delete payment');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleToggleStatus = () => {
    if (!payment) return;
    setPendingStatus(payment.status === 'paid' ? 'due' : 'paid');
    setShowStatusConfirmModal(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!paymentId || !pendingStatus || !payment) return;
    try {
      setUpdatingStatus(true);
      const updateData: any = { status: pendingStatus };
      updateData.paidDate =
        pendingStatus === 'paid' ? new Date().toISOString().split('T')[0] : null;
      await paymentService.updatePayment(paymentId, updateData);
      clearScreenCache('payments:');
      setShowStatusConfirmModal(false);
      setPendingStatus(null);
      await fetchPayment();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update payment status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isPaid = payment?.status === 'paid';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top', 'bottom']}>
        <NavBar C={C} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.brand} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !payment) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top', 'bottom']}>
        <NavBar C={C} onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: C.danger }]}>{error || 'Payment not found'}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: C.brand }]} onPress={fetchPayment}>
            <Text style={[styles.retryBtnText, { color: C.white }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top', 'bottom']}>

      {/* ── Navigation ── */}
      <View style={[styles.navBar, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          style={[styles.navBack, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={() => router.back()}
          activeOpacity={0.75}>
          <ChevronLeft size={20} color={C.textP} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: C.textP }]}>Payment Details</Text>
        <View style={styles.navActions}>
          <TouchableOpacity
            style={[styles.navAction, { backgroundColor: C.brandLight, borderColor: C.brandBorder }]}
            onPress={() => router.push(`/edit-payment?paymentId=${payment.id}`)}
            activeOpacity={0.7}
            disabled={!isOnline}>
            <Pencil size={14} color={C.brandText} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navAction, { backgroundColor: C.dangerLight, borderColor: C.dangerBorder }]}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.7}
            disabled={!isOnline || deleting}>
            <Trash2 size={14} color={C.dangerText} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Hero Card ── */}
        <View style={[styles.heroCard, { backgroundColor: C.card, borderColor: C.border }]}>

          {/* Status pill */}
          <View style={[
            styles.statusPill,
            isPaid
              ? { backgroundColor: C.successLight, borderColor: C.successBorder }
              : { backgroundColor: C.warningLight, borderColor: C.warningBorder },
          ]}>
            <View style={[
              styles.pillDot,
              { backgroundColor: isPaid ? C.success : C.warning },
            ]} />
            <Text style={[
              styles.pillText,
              { color: isPaid ? C.successText : C.warningText },
            ]}>
              {isPaid ? 'Paid' : 'Due'}
            </Text>
          </View>

          {/* Amount */}
          <View style={styles.amountRow}>
            <Text style={[styles.amountCurrency, { color: C.textS }]}>₹</Text>
            <Text style={[styles.amountValue, { color: C.textP }]}>
              {payment.amount}
            </Text>
          </View>
          <Text style={[styles.amountLabel, { color: C.textT }]}>Payment Amount</Text>

          {/* Toggle row */}
          <View style={[styles.toggleRow, { backgroundColor: C.bgSubtle, borderColor: C.borderL }]}>
            <View>
              <Text style={[styles.toggleLabel, { color: C.textP }]}>
                {isPaid ? 'Paid' : 'Due'}
              </Text>
              <Text style={[styles.toggleHint, { color: C.textT }]}>
                Tap to change status
              </Text>
            </View>
            <StatusToggle
              isPaid={isPaid}
              onToggle={handleToggleStatus}
              disabled={updatingStatus || !isOnline}
            />
          </View>
        </View>

        {/* ── Details Card ── */}
        <View style={[styles.detailsCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textT }]}>DETAILS</Text>

          {/* Tenant */}
          <View style={[styles.row, { borderBottomColor: C.borderL }]}>
            <Text style={[styles.rowLabel, { color: C.textS }]}>Tenant</Text>
            <View style={styles.rowValue}>
              <TenantAvatar name={payment.tenantName || 'Unknown'} colors={colors} isDark={isDark} />
              <Text style={[styles.rowValueText, { color: C.textP }]}>
                {payment.tenantName || 'Unknown'}
              </Text>
            </View>
          </View>

          {/* Property */}
          <View style={[styles.row, { borderBottomColor: C.borderL }]}>
            <Text style={[styles.rowLabel, { color: C.textS }]}>Property</Text>
            <View style={styles.rowValue}>
              <Building2 size={13} color={C.textT} strokeWidth={1.8} />
              <Text style={[styles.rowValueText, { color: C.textP }]}>
                Room {payment.roomNumber || 'N/A'}
              </Text>
            </View>
          </View>

          {/* Due date */}
          <View style={[styles.row, { borderBottomColor: C.borderL }]}>
            <Text style={[styles.rowLabel, { color: C.textS }]}>Due Date</Text>
            <View style={styles.rowValue}>
              <Calendar size={13} color={C.textT} strokeWidth={1.8} />
              <Text style={[styles.rowValueText, { color: C.textP }]}>
                {formatDate(payment.dueDate)}
              </Text>
            </View>
          </View>

          {/* Paid date (only when paid) */}
          {isPaid && (
            <View style={[styles.row, { borderBottomColor: C.borderL }]}>
              <Text style={[styles.rowLabel, { color: C.textS }]}>Paid Date</Text>
              <View style={[
                styles.paidChip,
                { backgroundColor: C.successLight, borderColor: C.successBorder },
              ]}>
                <Check size={11} color={C.successText} strokeWidth={2.5} />
                <Text style={[styles.paidChipText, { color: C.successText }]}>
                  {formatDate(payment.paidDate)}
                </Text>
              </View>
            </View>
          )}

          {/* Method */}
          {payment.method && (
            <View style={[styles.row, { borderBottomColor: C.borderL }]}>
              <Text style={[styles.rowLabel, { color: C.textS }]}>Method</Text>
              <View style={[
                styles.methodBadge,
                { backgroundColor: C.brandLight, borderColor: C.brandBorder },
              ]}>
                <CreditCard size={11} color={C.brandText} strokeWidth={2} />
                <Text style={[styles.methodBadgeText, { color: C.brandText }]}>
                  {payment.method}
                </Text>
              </View>
            </View>
          )}

          {/* Created */}
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: C.textS }]}>Created</Text>
            <Text style={[styles.rowValueText, { color: C.textT }]}>
              {formatDate(payment.createdAt?.split('T')[0])}
            </Text>
          </View>
        </View>

        {/* ── Danger Zone ── */}
        <TouchableOpacity
          style={[styles.dangerRow, { backgroundColor: C.dangerLight, borderColor: C.dangerBorder }]}
          onPress={() => setShowDeleteModal(true)}
          activeOpacity={0.8}
          disabled={!isOnline || deleting}>
          <View>
            <Text style={[styles.dangerTitle, { color: C.dangerText }]}>Delete Payment</Text>
            <Text style={[styles.dangerHint, { color: isDark ? colors.danger[500] : colors.danger[400] }]}>
              This action cannot be undone
            </Text>
          </View>
          <View style={[styles.dangerIcon, { backgroundColor: isDark ? colors.danger[800] : colors.danger[100] }]}>
            <Trash2 size={15} color={C.danger} strokeWidth={2} />
          </View>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Delete Modal ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setShowDeleteModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(2,6,23,0.75)' : 'rgba(15,23,42,0.5)' }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => !deleting && setShowDeleteModal(false)}
            activeOpacity={1}
          />
          <View style={[styles.modal, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: C.dangerLight }]}>
              <Trash2 size={26} color={C.danger} strokeWidth={1.8} />
            </View>
            <Text style={[styles.modalTitle, { color: C.textP }]}>Delete Payment?</Text>
            <Text style={[styles.modalMsg, { color: C.textS }]}>
              This will permanently remove the{' '}
              <Text style={{ fontFamily: typography.fontFamily.semiBold, color: C.textP }}>
                {payment.amount}
              </Text>{' '}
              payment record for{' '}
              <Text style={{ fontFamily: typography.fontFamily.semiBold, color: C.textP }}>
                {payment.tenantName}
              </Text>
              . This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background.primary, borderColor: C.border }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                activeOpacity={0.75}>
                <Text style={[styles.modalBtnText, { color: C.textP }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.danger, borderColor: C.danger }]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.8}>
                {deleting
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={[styles.modalBtnText, { color: C.white }]}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Status Change Modal ── */}
      <Modal
        visible={showStatusConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setPendingStatus(null); setShowStatusConfirmModal(false); }}>
        <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(2,6,23,0.75)' : 'rgba(15,23,42,0.5)' }]}>
          <View style={[styles.modal, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[
              styles.modalIconWrap,
              {
                backgroundColor: pendingStatus === 'paid' ? C.successLight : C.warningLight,
              },
            ]}>
              {pendingStatus === 'paid'
                ? <CheckCircle size={26} color={C.success} strokeWidth={1.8} />
                : <Clock size={26} color={C.warning} strokeWidth={1.8} />}
            </View>

            <Text style={[styles.modalTitle, { color: C.textP }]}>
              {pendingStatus === 'paid' ? 'Mark as Paid?' : 'Change to Due?'}
            </Text>
            <Text style={[styles.modalMsg, { color: C.textS }]}>
              {pendingStatus === 'paid'
                ? 'The payment date will be recorded as today. Only confirm once payment has been received.'
                : 'This will change the status from Paid to Due and remove the paid date record.'}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background.primary, borderColor: C.border }]}
                onPress={() => { setPendingStatus(null); setShowStatusConfirmModal(false); }}
                activeOpacity={0.75}>
                <Text style={[styles.modalBtnText, { color: C.textP }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: pendingStatus === 'paid' ? C.success : C.warning,
                    borderColor: pendingStatus === 'paid' ? C.success : C.warning,
                  },
                ]}
                onPress={handleConfirmStatusChange}
                disabled={updatingStatus}
                activeOpacity={0.8}>
                {updatingStatus
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={[styles.modalBtnText, { color: C.white }]}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── NavBar sub-component ─────────────────────────────────────────────────────
function NavBar({ C, onBack }: { C: any; onBack: () => void }) {
  return (
    <View style={[styles.navBar, { borderBottomColor: C.border }]}>
      <TouchableOpacity
        style={[styles.navBack, { backgroundColor: C.card, borderColor: C.border }]}
        onPress={onBack}
        activeOpacity={0.75}>
        <ChevronLeft size={20} color={C.textP} strokeWidth={2.4} />
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: C.textP }]}>Payment Details</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  navBack: {
    width: 36, height: 36,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  navTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.lg,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.tight,
  },
  navActions: { flexDirection: 'row', gap: spacing.xs },
  navAction: {
    width: 32, height: 32,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.sm },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.md, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md },
  retryBtnText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },

  // Hero
  heroCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 100, borderWidth: 1,
    marginBottom: spacing.lg,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginBottom: 4 },
  amountCurrency: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.lg,
    marginTop: 8,
  },
  amountValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 48,
    letterSpacing: -2,
    lineHeight: 56,
  },
  amountLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.lg,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 13, borderWidth: 1,
  },
  toggleLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.md,
  },
  toggleHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  toggleTrack: {
    width: 46, height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    ...shadows.sm,
  },

  // Details card
  detailsCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowValueText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },

  // Chips / badges
  paidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  paidChipText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12 },
  methodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  methodBadgeText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12 },

  // Avatar
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: typography.fontFamily.bold, fontSize: 10 },

  // Danger zone
  dangerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16, borderWidth: 1,
  },
  dangerTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.md },
  dangerHint:  { fontFamily: typography.fontFamily.regular, fontSize: 11, marginTop: 1 },
  dangerIcon:  { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  // Modals
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modal: {
    width: '100%', maxWidth: 340,
    borderRadius: 22, borderWidth: 1,
    padding: 28, alignItems: 'center',
    ...shadows.lg,
  },
  modalIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalMsg: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  modalBtn: {
    flex: 1, paddingVertical: 13,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 46,
  },
  modalBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.md,
  },
});