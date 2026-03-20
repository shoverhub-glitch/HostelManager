import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import FAB from '@/components/FAB';
import UpgradeModal from '@/components/UpgradeModal';
import {
  SlidersHorizontal,
  CheckCircle,
  Clock,
  Calendar,
  Wallet,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  ArrowRight,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService } from '@/services/apiClient';
import type { Payment, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

const PAYMENTS_CACHE_STALE_MS  = 30 * 1000;
const PAYMENTS_PAGE_SIZE       = 50;
const MAX_ERROR_MESSAGE_LENGTH = 220;

function normalizeErrorMessage(message?: string): string {
  if (!message) return 'Failed to load payments';
  const normalized = String(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Failed to load payments';
  return normalized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : normalized;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

type StatusFilter = 'all' | 'paid' | 'due';
type MethodFilter = 'all' | 'Cash' | 'Online' | 'Bank Transfer' | 'UPI' | 'Cheque';

// ── Pill Selector ─────────────────────────────────────────────────────────────
// Compact horizontal pill group — single selection
function PillGroup<T extends string>({
  options,
  value,
  onChange,
  activeColor,
  activeBg,
  inactiveBg,
  inactiveBorder,
  activeText,
  inactiveText,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  activeColor: string;
  activeBg: string;
  inactiveBg: string;
  inactiveBorder: string;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <View style={pillStyles.row}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              pillStyles.pill,
              {
                backgroundColor: active ? activeBg    : inactiveBg,
                borderColor:     active ? activeColor : inactiveBorder,
              },
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}>
            <Text style={[
              pillStyles.pillText,
              {
                color:      active ? activeText : inactiveText,
                fontFamily: active
                  ? typography.fontFamily.semiBold
                  : typography.fontFamily.regular,
              },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const pillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical:   7,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  pillText: {
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function PaymentsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isTablet, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();

  const { initialPayments, initialTotal } = (() => {
    if (!selectedPropertyId) return { initialPayments: [], initialTotal: 0 };
    const now      = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cacheKey = cacheKeys.payments(selectedPropertyId, `${monthKey}:page:1`);
    const cached   = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
    return { initialPayments: cached?.data || [], initialTotal: cached?.meta?.total || 0 };
  })();

  const [payments,         setPayments]         = useState<Payment[]>(initialPayments);
  const [isRefreshing,     setIsRefreshing]     = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [total,            setTotal]            = useState(initialTotal);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedDate,     setSelectedDate]     = useState(new Date());
  const [currentPage,      setCurrentPage]      = useState(1);
  const [showFilterModal,  setShowFilterModal]  = useState(false);
  const [statusFilter,     setStatusFilter]     = useState<StatusFilter>('all');
  const [methodFilter,     setMethodFilter]     = useState<MethodFilter>('all');

  // Modal slide animation
  const slideAnim = useRef(new Animated.Value(400)).current;

  const openModal = () => {
    setShowFilterModal(true);
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
    }).start();
  };
  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: 400, duration: 220, useNativeDriver: true,
    }).start(() => setShowFilterModal(false));
  };

  const getPaymentsCacheKey = useCallback(
    (propertyId: string, keyMonth: string, page: number) =>
      cacheKeys.payments(propertyId, `${keyMonth}:page:${page}`),
    []
  );

  const monthYearString = useMemo(() =>
    `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`,
    [selectedDate]
  );

  const dateRange = useMemo(() => {
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endDate   = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }, [selectedDate]);

  const monthKey = useMemo(() =>
    `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`,
    [selectedDate]
  );

  const isFetchingRef       = useRef(false);
  const lastFocusRefreshRef = useRef<number>(Date.now());

  const fetchPayments = useCallback(async (forceNetwork = false) => {
    if (!selectedPropertyId) {
      setPayments([]); setTotal(0); setError(null); setIsRefreshing(false); return;
    }
    if (isFetchingRef.current) return;

    const cacheKey = getPaymentsCacheKey(selectedPropertyId, monthKey, currentPage);
    if (!forceNetwork) {
      const cached = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
      if (cached) {
        setPayments(cached.data || []); setTotal(cached.meta?.total || 0);
        setError(null); setIsRefreshing(false); return;
      }
    }

    try {
      isFetchingRef.current = true;
      if (!payments.length) setIsRefreshing(true);
      setError(null);

      const response = await paymentService.getPayments(selectedPropertyId, {
        startDate: dateRange.startDate,
        endDate:   dateRange.endDate,
        page:      currentPage,
        pageSize:  PAYMENTS_PAGE_SIZE,
      });
      const data = response.data || [];
      setPayments(data);
      setTotal(response.meta?.total || data.length);
      setScreenCache(cacheKey, response);
    } catch (err: any) {
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(normalizeErrorMessage(err?.message));
      }
      if (!payments.length) setPayments([]);
    } finally {
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId, monthKey, dateRange, currentPage, payments.length, getPaymentsCacheKey]);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const cacheKey      = getPaymentsCacheKey(selectedPropertyId, monthKey, currentPage);
        const hasFreshCache = !!getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
        const now           = Date.now();
        if (!hasFreshCache || now - lastFocusRefreshRef.current > PAYMENTS_CACHE_STALE_MS) {
          lastFocusRefreshRef.current = now;
          fetchPayments(!hasFreshCache);
        }
      }
    }, [selectedPropertyId, propertyLoading, monthKey, currentPage, fetchPayments, getPaymentsCacheKey])
  );

  useEffect(() => {
    if (!propertyLoading && selectedPropertyId) {
      const cacheKey = getPaymentsCacheKey(selectedPropertyId, monthKey, currentPage);
      const cached   = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
      if (cached) {
        setPayments(cached.data || []); setTotal(cached.meta?.total || 0);
        setError(null); setIsRefreshing(false);
      } else {
        if (!payments.length) setIsRefreshing(true);
        fetchPayments(true);
      }
    } else if (!selectedPropertyId && !propertyLoading) {
      setPayments([]); setTotal(0); setError(null); setIsRefreshing(false);
    }
  }, [monthKey, currentPage, selectedPropertyId, propertyLoading]);

  const handlePreviousMonth = () => {
    clearScreenCache('payments:');
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
    setCurrentPage(1);
  };
  const handleNextMonth = () => {
    clearScreenCache('payments:');
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
    setCurrentPage(1);
  };
  const handleRetry = () => fetchPayments(true);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true); setError(null);
    clearScreenCache('payments:');
    const now = new Date();
    const isCurrentMonth = selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() === now.getMonth();
    const isFirstPage    = currentPage === 1;
    setSelectedDate(now); setCurrentPage(1);
    try { if (isCurrentMonth && isFirstPage) await fetchPayments(true); }
    finally { setIsRefreshing(false); }
  }, [selectedDate, currentPage, fetchPayments]);

  const isLoadingState     = isRefreshing && payments.length === 0;
  const hasActiveFilters   = statusFilter !== 'all' || methodFilter !== 'all';
  const totalPages         = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const clearFilters       = () => { setStatusFilter('all'); setMethodFilter('all'); };

  const filteredPayments = useMemo(() =>
    payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      return true;
    }),
    [payments, statusFilter, methodFilter]
  );

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor     = colors.primary[500];
  const brandLight     = isDark ? colors.primary[900] : colors.primary[50];
  const brandText      = isDark ? colors.primary[300] : colors.primary[700];
  const cardBg         = colors.background.secondary;
  const cardBorder     = colors.border.medium;
  const pageBg         = colors.background.primary;
  const textPrimary    = colors.text.primary;
  const textSecondary  = colors.text.secondary;
  const textTertiary   = colors.text.tertiary;

  // ── Status options for filter ─────────────────────────────────────────────
  const statusOptions: { label: string; value: StatusFilter }[] = [
    { label: 'All',  value: 'all'  },
    { label: 'Paid', value: 'paid' },
    { label: 'Due',  value: 'due'  },
  ];
  const methodOptions: { label: string; value: MethodFilter }[] = [
    { label: 'All',           value: 'all'           },
    { label: 'Cash',          value: 'Cash'          },
    { label: 'UPI',           value: 'UPI'           },
    { label: 'Online',        value: 'Online'        },
    { label: 'Bank Transfer', value: 'Bank Transfer' },
    { label: 'Cheque',        value: 'Cheque'        },
  ];

  return (
    <ScreenContainer edges={['top']}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Month navigator embedded in header */}
        <View style={styles.monthRow}>
          <TouchableOpacity
            style={[styles.monthArrow, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={handlePreviousMonth}
            activeOpacity={0.7}>
            <ChevronLeft size={18} color={textSecondary} strokeWidth={2} />
          </TouchableOpacity>

          <View style={styles.monthCenter}>
            <Text style={[styles.monthLabel, { color: textTertiary }]}>PAYMENTS</Text>
            <Text style={[styles.monthValue, { color: textPrimary }]}>{monthYearString}</Text>
          </View>

          <TouchableOpacity
            style={[styles.monthArrow, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={handleNextMonth}
            activeOpacity={0.7}>
            <ChevronRight size={18} color={textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Filter trigger */}
        <TouchableOpacity
          style={[
            styles.filterTrigger,
            {
              backgroundColor: hasActiveFilters ? brandColor : cardBg,
              borderColor:     hasActiveFilters ? brandColor : cardBorder,
            },
          ]}
          onPress={openModal}
          activeOpacity={0.75}>
          <SlidersHorizontal
            size={16}
            color={hasActiveFilters ? colors.white : brandColor}
            strokeWidth={2}
          />
          {hasActiveFilters && (
            <View style={[styles.filterDot, { backgroundColor: colors.warning[400] }]} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Active filter chips ──────────────────────────────────────────── */}
      {hasActiveFilters && (
        <View style={styles.activeFilters}>
          {statusFilter !== 'all' && (
            <View style={[styles.activeChip, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200] }]}>
              <Text style={[styles.activeChipText, { color: brandText }]}>
                {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              </Text>
              <TouchableOpacity onPress={() => setStatusFilter('all')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={12} color={brandText} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
          {methodFilter !== 'all' && (
            <View style={[styles.activeChip, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200] }]}>
              <Text style={[styles.activeChipText, { color: brandText }]}>{methodFilter}</Text>
              <TouchableOpacity onPress={() => setMethodFilter('all')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={12} color={brandText} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={clearFilters} style={styles.clearAllBtn}>
            <Text style={[styles.clearAllText, { color: textTertiary }]}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { backgroundColor: pageBg },
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[brandColor]}
            tintColor={brandColor}
          />
        }>

        {isLoadingState ? (
          <Skeleton height={110} count={4} />
        ) : !selectedProperty ? (
          <EmptyState
            icon={Building2}
            title="No Properties Found"
            subtitle="Create your first property to start tracking payments"
            actionLabel="Create Property"
            onActionPress={() => router.push('/property-form')}
          />
        ) : error ? (
          <ApiErrorCard error={error} onRetry={handleRetry} />
        ) : payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No Payments Yet"
            subtitle="Payment history will appear here once tenants start making payments"
          />
        ) : (
          <View style={{ opacity: isRefreshing ? 0.45 : 1 }}>

            {/* Count bar */}
            <View style={styles.countBar}>
              <Text style={[styles.countText, { color: textSecondary }]}>
                {hasActiveFilters
                  ? `${filteredPayments.length} of ${payments.length} payments`
                  : `${payments.length} payment${payments.length !== 1 ? 's' : ''}`}
              </Text>
            </View>

            {/* Payment cards */}
            {filteredPayments.map((payment) => {
              const isPaid = payment.status === 'paid';
              const statusColor  = isPaid ? colors.success[500] : colors.warning[500];
              const statusBg     = isPaid
                ? (isDark ? colors.success[900] : colors.success[50])
                : (isDark ? colors.warning[900] : colors.warning[50]);
              const statusBorder = isPaid
                ? (isDark ? colors.success[700] : colors.success[200])
                : (isDark ? colors.warning[700] : colors.warning[200]);

              return (
                <TouchableOpacity
                  key={payment.id}
                  activeOpacity={0.72}
                  onPress={() => router.push(`/edit-payment?paymentId=${payment.id}`)}>

                  <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    {/* Status strip on left */}
                    <View style={[styles.cardStrip, { backgroundColor: statusColor }]} />

                    <View style={styles.cardBody}>
                      {/* Row 1 — name + amount */}
                      <View style={styles.cardTop}>
                        <View style={styles.cardLeft}>
                          <View style={styles.nameRow}>
                            <Text
                              style={[styles.tenantName, { color: textPrimary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              {payment.tenantName || 'Unknown Tenant'}
                            </Text>
                            {payment.tenantStatus === 'vacated' && (
                              <View style={[styles.vacatedBadge, {
                                backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                                borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                              }]}>
                                <LogOut size={9} color={isDark ? colors.danger[300] : colors.danger[600]} strokeWidth={2.5} />
                                <Text style={[styles.vacatedText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                                  Vacated
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.roomText, { color: textTertiary }]}>
                            Room {payment.roomNumber || 'N/A'}
                          </Text>
                        </View>

                        <View style={styles.cardRight}>
                          <Text style={[styles.amount, { color: textPrimary }]} numberOfLines={1}>
                            {payment.amount}
                          </Text>
                          <View style={[styles.statusPill, { backgroundColor: statusBg, borderColor: statusBorder }]}>
                            {isPaid
                              ? <CheckCircle size={10} color={statusColor} strokeWidth={2.5} />
                              : <Clock size={10} color={statusColor} strokeWidth={2.5} />
                            }
                            <Text style={[styles.statusPillText, { color: statusColor }]}>
                              {isPaid ? 'Paid' : 'Due'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Row 2 — meta */}
                      <View style={[styles.cardMeta, { borderTopColor: colors.border.light }]}>
                        <View style={styles.metaItem}>
                          <Calendar size={11} color={textTertiary} strokeWidth={1.5} />
                          <Text style={[styles.metaText, { color: textSecondary }]}>
                            {isPaid
                              ? (payment.paidDate || payment.dueDate || '—')
                              : (payment.dueDate || '—')}
                          </Text>
                        </View>
                        {payment.method && (
                          <View style={[styles.methodChip, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100], borderColor: cardBorder }]}>
                            <Text style={[styles.methodText, { color: textSecondary }]}>
                              {payment.method}
                            </Text>
                          </View>
                        )}
                        <ArrowRight size={13} color={textTertiary} strokeWidth={1.5} style={styles.cardArrow} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Pagination */}
            {total > PAYMENTS_PAGE_SIZE && (
              <View style={[styles.pagination, { borderTopColor: colors.border.light }]}>
                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: currentPage === 1 ? colors.background.tertiary : brandColor,
                      borderColor:     currentPage === 1 ? cardBorder               : brandColor,
                    },
                  ]}
                  onPress={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  disabled={currentPage === 1 || isRefreshing}
                  activeOpacity={0.75}>
                  <ChevronLeft
                    size={15}
                    color={currentPage === 1 ? textTertiary : colors.white}
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.pageBtnText, { color: currentPage === 1 ? textTertiary : colors.white }]}>
                    Prev
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.pageCount, { color: textSecondary }]}>
                  {currentPage} / {totalPages}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: currentPage >= totalPages ? colors.background.tertiary : brandColor,
                      borderColor:     currentPage >= totalPages ? cardBorder               : brandColor,
                    },
                  ]}
                  onPress={() => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  disabled={currentPage >= totalPages || isRefreshing}
                  activeOpacity={0.75}>
                  <Text style={[styles.pageBtnText, { color: currentPage >= totalPages ? textTertiary : colors.white }]}>
                    Next
                  </Text>
                  <ChevronRight
                    size={15}
                    color={currentPage >= totalPages ? textTertiary : colors.white}
                    strokeWidth={2.5}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {selectedProperty && !isLoadingState && <FAB onPress={() => router.push('/manual-payment')} />}

      {/* ── Filter Bottom Sheet ──────────────────────────────────────────── */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}
          // tap outside to close
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} activeOpacity={1} />

          <Animated.View
            style={[
              styles.sheet,
              isTablet && styles.sheetTablet,
              {
                backgroundColor: colors.background.secondary,
                maxWidth:        isTablet ? modalMaxWidth : undefined,
                transform:       [{ translateY: slideAnim }],
              },
            ]}>

            {/* Sheet handle */}
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            {/* Sheet header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <View>
                <Text style={[styles.sheetTitle, { color: textPrimary }]}>Filter Payments</Text>
                {hasActiveFilters && (
                  <Text style={[styles.sheetSubtitle, { color: brandColor }]}>
                    {filteredPayments.length} result{filteredPayments.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={closeModal}
                style={[styles.sheetCloseBtn, { backgroundColor: colors.background.tertiary }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetBody}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing.lg }}>

              {/* ── Status filter ── */}
              <View style={styles.filterBlock}>
                <Text style={[styles.filterBlockLabel, { color: textTertiary }]}>STATUS</Text>
                <PillGroup
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  activeColor={brandColor}
                  activeBg={isDark ? colors.primary[900] : colors.primary[50]}
                  inactiveBg={colors.background.primary}
                  inactiveBorder={cardBorder}
                  activeText={isDark ? colors.primary[300] : colors.primary[700]}
                  inactiveText={textPrimary}
                />
              </View>

              {/* ── Method filter ── */}
              <View style={styles.filterBlock}>
                <Text style={[styles.filterBlockLabel, { color: textTertiary }]}>METHOD</Text>
                <PillGroup
                  options={methodOptions}
                  value={methodFilter}
                  onChange={setMethodFilter}
                  activeColor={brandColor}
                  activeBg={isDark ? colors.primary[900] : colors.primary[50]}
                  inactiveBg={colors.background.primary}
                  inactiveBorder={cardBorder}
                  activeText={isDark ? colors.primary[300] : colors.primary[700]}
                  inactiveText={textPrimary}
                />
              </View>

            </ScrollView>

            {/* Sheet footer */}
            <View style={[styles.sheetFooter, { borderTopColor: colors.border.light }]}>
              <TouchableOpacity
                style={[styles.footerClearBtn, {
                  backgroundColor: colors.background.primary,
                  borderColor:     cardBorder,
                  opacity: hasActiveFilters ? 1 : 0.4,
                }]}
                onPress={clearFilters}
                disabled={!hasActiveFilters}
                activeOpacity={0.75}>
                <Text style={[styles.footerClearText, { color: textPrimary }]}>Clear all</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.footerApplyBtn, { backgroundColor: brandColor }]}
                onPress={closeModal}
                activeOpacity={0.85}>
                <Text style={[styles.footerApplyText, { color: colors.white }]}>
                  {hasActiveFilters ? `Show ${filteredPayments.length} results` : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </View>
      </Modal>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => setShowUpgradeModal(false)}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    gap:               spacing.sm,
  },

  monthRow: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing.sm,
  },

  monthArrow: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },

  monthCenter: {
    flex:      1,
    alignItems: 'center',
  },

  monthLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  1,
  },

  monthValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },

  filterTrigger: {
    width:          40,
    height:         40,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    position:       'relative',
  },

  filterDot: {
    position:     'absolute',
    top:    6,
    right:  6,
    width:  7,
    height: 7,
    borderRadius: radius.full,
  },

  // ── Active filter chips ───────────────────────────────────────────────────
  activeFilters: {
    flexDirection:     'row',
    alignItems:        'center',
    flexWrap:          'wrap',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.sm,
  },

  activeChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.sm,
    paddingVertical:   5,
    borderRadius:      radius.full,
    borderWidth:       1,
  },

  activeChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  clearAllBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical:   5,
  },

  clearAllText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
    textDecorationLine: 'underline',
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // ── Count bar ─────────────────────────────────────────────────────────────
  countBar: {
    marginBottom: spacing.sm,
  },

  countText: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // ── Payment card ──────────────────────────────────────────────────────────
  card: {
    flexDirection:  'row',
    borderRadius:   radius.lg,
    borderWidth:    1,
    marginBottom:   spacing.sm,
    overflow:       'hidden',
  },

  cardStrip: {
    width: 3,
  },

  cardBody: {
    flex:    1,
    padding: spacing.md,
  },

  cardTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   spacing.sm,
  },

  cardLeft:  { flex: 1, paddingRight: spacing.sm },

  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           spacing.xs,
    marginBottom:  2,
  },

  tenantName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
    flexShrink: 1,
  },

  vacatedBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.full,
    borderWidth:       1,
  },

  vacatedText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   9,
  },

  roomText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  cardRight: {
    alignItems: 'flex-end',
    gap:         4,
  },

  amount: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },

  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      radius.full,
    borderWidth:       1,
  },

  statusPillText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  cardMeta: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingTop:     spacing.sm,
    borderTopWidth: 1,
    gap:            spacing.xs,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    flex:          1,
  },

  metaText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  methodChip: {
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      radius.sm,
    borderWidth:       1,
  },

  methodText: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  cardArrow: { marginLeft: 'auto' },

  // ── Pagination ────────────────────────────────────────────────────────────
  pagination: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingVertical:   spacing.lg,
    borderTopWidth:    1,
    marginTop:         spacing.sm,
  },

  pageBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
    minWidth:          80,
    justifyContent:    'center',
  },

  pageBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  pageCount: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Bottom sheet ──────────────────────────────────────────────────────────
  modalOverlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },

  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    maxHeight:            '80%',
    ...shadows.xl,
  },

  sheetTablet: {
    width:                   '100%',
    alignSelf:               'center',
    borderBottomLeftRadius:  24,
    borderBottomRightRadius: 24,
  },

  sheetHandle: {
    alignItems:    'center',
    paddingTop:    spacing.sm,
    paddingBottom: spacing.xs,
  },

  handleBar: {
    width:        40,
    height:       4,
    borderRadius: 2,
    opacity:      0.4,
  },

  sheetHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
  },

  sheetTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },

  sheetSubtitle: {
    fontFamily:   typography.fontFamily.medium,
    fontSize:     typography.fontSize.sm,
    marginTop:    2,
  },

  sheetCloseBtn: {
    width:          32,
    height:         32,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },

  sheetBody: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
  },

  // ── Filter blocks (pills layout) ──────────────────────────────────────────
  filterBlock: {
    marginBottom: spacing.xl,
  },

  filterBlockLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.md,
  },

  // ── Sheet footer ──────────────────────────────────────────────────────────
  sheetFooter: {
    flexDirection:     'row',
    gap:               spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderTopWidth:    1,
  },

  footerClearBtn: {
    flex:            1,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
    borderWidth:     1,
  },

  footerClearText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },

  footerApplyBtn: {
    flex:            1.8,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
  },

  footerApplyText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});