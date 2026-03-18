import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import StatusBadge from '@/components/StatusBadge';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import FAB from '@/components/FAB';
import UpgradeModal from '@/components/UpgradeModal';
import {
  Filter,
  CheckCircle,
  Clock,
  Calendar,
  Wallet,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  Check,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService } from '@/services/apiClient';
import type { Payment, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

const PAYMENTS_CACHE_STALE_MS = 30 * 1000;
const PAYMENTS_PAGE_SIZE      = 50;
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
  const [statusFilter,     setStatusFilter]     = useState<'all' | 'paid' | 'due'>('all');
  const [methodFilter,     setMethodFilter]     = useState<'all' | 'Cash' | 'Online' | 'Bank Transfer' | 'UPI' | 'Cheque'>('all');

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

  const isFetchingRef        = useRef(false);
  const lastFocusRefreshRef  = useRef<number>(Date.now());

  const fetchPayments = useCallback(async (forceNetwork: boolean = false) => {
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

  const handleFabPress = () => router.push('/manual-payment');

  const getStatusIcon = (status: string) => {
    if (status === 'paid') return <CheckCircle size={18} color={colors.success[500]} strokeWidth={1.5} />;
    return <Clock size={18} color={colors.warning[500]} strokeWidth={1.5} />;
  };

  const isLoadingState = isRefreshing && payments.length === 0;

  const filteredPayments = useMemo(() =>
    payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      return true;
    }),
    [payments, statusFilter, methodFilter]
  );

  const hasActiveFilters = statusFilter !== 'all' || methodFilter !== 'all';
  const totalPages       = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const clearFilters     = () => { setStatusFilter('all'); setMethodFilter('all'); };

  return (
    <ScreenContainer edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Payments</Text>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            {
              backgroundColor: hasActiveFilters
                ? colors.primary[500]
                : isDark ? colors.background.tertiary : colors.primary[50],
              borderColor: hasActiveFilters ? colors.primary[500] : colors.border.medium,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => setShowFilterModal(true)}>
          <Filter
            size={18}
            color={hasActiveFilters ? colors.white : colors.primary[500]}
            strokeWidth={1.5}
          />
        </TouchableOpacity>
      </View>

      {/* ── Month Navigator ── */}
      <View style={[
        styles.monthNav,
        { backgroundColor: colors.background.secondary, borderColor: colors.border.medium },
      ]}>
        <TouchableOpacity style={styles.monthNavBtn} onPress={handlePreviousMonth} activeOpacity={0.7}>
          <ChevronLeft size={20} color={colors.text.secondary} strokeWidth={1.5} />
        </TouchableOpacity>
        <View style={styles.monthDisplay}>
          <Calendar size={14} color={colors.primary[500]} strokeWidth={1.5} />
          <Text style={[styles.monthText, { color: colors.text.primary }]}>{monthYearString}</Text>
        </View>
        <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth} activeOpacity={0.7}>
          <ChevronRight size={20} color={colors.text.secondary} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }>

        {isLoadingState ? (
          <Skeleton height={150} count={2} />
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
          <View style={{ opacity: isRefreshing ? 0.5 : 1 }}>

            {/* Active filter summary */}
            {hasActiveFilters && (
              <View style={[
                styles.filterSummary,
                {
                  backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                  borderColor:     isDark ? colors.primary[700] : colors.primary[200],
                },
              ]}>
                <Text style={[styles.filterSummaryText, {
                  color: isDark ? colors.primary[300] : colors.primary[700],
                }]}>
                  {filteredPayments.length} of {payments.length} payments
                </Text>
                <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
                  <Text style={[styles.clearFiltersText, { color: colors.primary[500] }]}>
                    Clear filters
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Payment cards */}
            {filteredPayments.map((payment) => (
              <TouchableOpacity
                key={payment.id}
                activeOpacity={0.7}
                onPress={() => router.push(`/edit-payment?paymentId=${payment.id}`)}>
                <Card style={styles.paymentCard}>

                  {/* Card header */}
                  <View style={styles.paymentHeader}>
                    <View style={styles.statusIcon}>{getStatusIcon(payment.status)}</View>
                    <View style={styles.paymentInfo}>
                      <View style={styles.tenantNameRow}>
                        <Text style={[styles.tenantName, { color: colors.text.primary }]}
                          numberOfLines={1} ellipsizeMode="tail">
                          {payment.tenantName || 'Unknown Tenant'}
                        </Text>
                        {payment.tenantStatus === 'vacated' && (
                          <View style={[styles.badge, {
                            backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                            borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                          }]}>
                            <LogOut size={10} color={isDark ? colors.danger[300] : colors.danger[600]} strokeWidth={2} />
                            <Text style={[styles.badgeText, {
                              color: isDark ? colors.danger[300] : colors.danger[700],
                            }]}>
                              Vacated
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.roomText, { color: colors.text.tertiary }]}
                        numberOfLines={1} ellipsizeMode="tail">
                        Room: {payment.roomNumber || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.amountBlock}>
                      <Text style={[styles.amount, { color: colors.text.primary }]}
                        numberOfLines={1} ellipsizeMode="tail">
                        {payment.amount}
                      </Text>
                      <StatusBadge status={payment.status} />
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                  {/* Card footer */}
                  <View style={styles.paymentFooter}>
                    <View style={styles.footerRow}>
                      <Calendar size={13} color={colors.text.tertiary} strokeWidth={1.5} />
                      <Text style={[styles.footerLabel, { color: colors.text.secondary }]}>
                        {payment.status === 'paid' ? 'Paid on:' : 'Due:'}
                      </Text>
                      <Text style={[styles.footerValue, { color: colors.text.primary }]}
                        numberOfLines={1} ellipsizeMode="tail">
                        {payment.status === 'paid'
                          ? (payment.paidDate || payment.dueDate || '—')
                          : (payment.dueDate || '—')}
                      </Text>
                    </View>
                    {payment.method && (
                      <View style={styles.footerRow}>
                        <Text style={[styles.footerLabel, { color: colors.text.secondary }]}>Method:</Text>
                        <Text style={[styles.footerValue, { color: colors.primary[500] }]}
                          numberOfLines={1} ellipsizeMode="tail">
                          {payment.method}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            ))}

            {/* Pagination */}
            {total > PAYMENTS_PAGE_SIZE && (
              <View style={[
                styles.paginationRow,
                { backgroundColor: colors.background.secondary, borderTopColor: colors.border.light },
              ]}>
                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage === 1 ? colors.background.tertiary : colors.primary[500],
                    borderColor:     currentPage === 1 ? colors.border.medium       : colors.primary[500],
                  }]}
                  onPress={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  disabled={currentPage === 1 || isRefreshing}
                  activeOpacity={0.7}>
                  <ChevronLeft size={16} color={currentPage === 1 ? colors.text.tertiary : colors.white} strokeWidth={2} />
                  <Text style={[styles.pageBtnText, { color: currentPage === 1 ? colors.text.tertiary : colors.white }]}>
                    Prev
                  </Text>
                </TouchableOpacity>

                <View style={styles.pageInfo}>
                  <Text style={[styles.pageInfoText, { color: colors.text.primary }]}>
                    {currentPage} / {totalPages}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage >= totalPages ? colors.background.tertiary : colors.primary[500],
                    borderColor:     currentPage >= totalPages ? colors.border.medium       : colors.primary[500],
                  }]}
                  onPress={() => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  disabled={currentPage >= totalPages || isRefreshing}
                  activeOpacity={0.7}>
                  <Text style={[styles.pageBtnText, { color: currentPage >= totalPages ? colors.text.tertiary : colors.white }]}>
                    Next
                  </Text>
                  <ChevronRight size={16} color={currentPage >= totalPages ? colors.text.tertiary : colors.white} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {selectedProperty && !isLoadingState && <FAB onPress={handleFabPress} />}

      {/* ── Filter Modal ── */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}>
        <View style={[
          styles.modalOverlay,
          isTablet && styles.modalOverlayTablet,
          { backgroundColor: colors.modal.overlay },
        ]}>
          <View style={[
            styles.modalSheet,
            isTablet && styles.modalSheetTablet,
            { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
          ]}>

            {/* Modal header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Filter payments</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={colors.text.secondary} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>

              {/* Status */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.text.primary }]}>
                  Payment status
                </Text>
                <View style={styles.filterOptions}>
                  {(['all', 'paid', 'due'] as const).map((s) => {
                    const active = statusFilter === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.filterOption, {
                          backgroundColor: active
                            ? (isDark ? colors.primary[900] : colors.primary[50])
                            : colors.background.primary,
                          borderColor: active ? colors.primary[400] : colors.border.medium,
                        }]}
                        onPress={() => setStatusFilter(s)}
                        activeOpacity={0.7}>
                        <Text style={[styles.filterOptionText, {
                          color:      active ? colors.primary[isDark ? 300 : 700] : colors.text.primary,
                          fontFamily: active ? typography.fontFamily.semiBold : typography.fontFamily.regular,
                        }]}>
                          {s === 'all' ? 'All payments' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                        {active && <Check size={16} color={colors.primary[500]} strokeWidth={2.5} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Method */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.text.primary }]}>
                  Payment method
                </Text>
                <View style={styles.filterOptions}>
                  {(['all', 'Cash', 'Online', 'Bank Transfer', 'UPI', 'Cheque'] as const).map((m) => {
                    const active = methodFilter === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.filterOption, {
                          backgroundColor: active
                            ? (isDark ? colors.primary[900] : colors.primary[50])
                            : colors.background.primary,
                          borderColor: active ? colors.primary[400] : colors.border.medium,
                        }]}
                        onPress={() => setMethodFilter(m)}
                        activeOpacity={0.7}>
                        <Text style={[styles.filterOptionText, {
                          color:      active ? colors.primary[isDark ? 300 : 700] : colors.text.primary,
                          fontFamily: active ? typography.fontFamily.semiBold : typography.fontFamily.regular,
                        }]}>
                          {m === 'all' ? 'All methods' : m}
                        </Text>
                        {active && <Check size={16} color={colors.primary[500]} strokeWidth={2.5} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Modal footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border.light }]}>
              <TouchableOpacity
                style={[styles.clearBtn, {
                  backgroundColor: colors.background.primary,
                  borderColor:     colors.border.medium,
                }]}
                onPress={clearFilters}
                activeOpacity={0.7}>
                <Text style={[styles.clearBtnText, { color: colors.text.primary }]}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: colors.primary[500] }]}
                onPress={() => setShowFilterModal(false)}
                activeOpacity={0.85}>
                <Text style={[styles.applyBtnText, { color: colors.white }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },

  headerTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  filterBtn: {
    width:          40,
    height:         40,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    0.5,
  },

  // ── Month Nav ────────────────────────────────────────────────────────────
  monthNav: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    marginHorizontal:  spacing.md,
    marginBottom:      spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       0.5,
  },

  monthNavBtn: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },

  monthDisplay: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },

  monthText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: 0,
    minWidth:      130,
    textAlign:     'center',
  },

  // ── Scroll ───────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // ── Filter summary ───────────────────────────────────────────────────────
  filterSummary: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    marginBottom:      spacing.md,
  },

  filterSummaryText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  clearFiltersText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  // ── Payment card ─────────────────────────────────────────────────────────
  paymentCard: { marginBottom: spacing.xs },

  paymentHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  spacing.md,
    minHeight:     40,
  },

  statusIcon: { marginRight: spacing.sm },

  paymentInfo: { flex: 1 },

  tenantNameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    flexWrap:      'wrap',
  },

  tenantName: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
    flexShrink:   1,
  },

  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: spacing.xs,
    paddingVertical:   2,
    borderRadius:      radius.full,
    borderWidth:       0.5,
  },

  badgeText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  roomText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  amountBlock: { alignItems: 'flex-end' },

  amount: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  2,
  },

  divider: { height: 0.5, marginBottom: spacing.sm },

  paymentFooter: { gap: spacing.xs },

  footerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    height:        20,
  },

  footerLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  footerValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  // ── Pagination ───────────────────────────────────────────────────────────
  paginationRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    marginTop:         spacing.md,
    borderTopWidth:    0.5,
    borderRadius:      radius.md,
  },

  pageBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    minWidth:          80,
    justifyContent:    'center',
  },

  pageBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  pageInfo:     { flex: 1, alignItems: 'center' },

  pageInfoText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Filter Modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },

  modalOverlayTablet: {
    justifyContent:    'center',
    paddingHorizontal: spacing.lg,
  },

  modalSheet: {
    borderTopLeftRadius:  radius.xl ?? 20,
    borderTopRightRadius: radius.xl ?? 20,
    maxHeight:            '85%',
    ...shadows.xl,
  },

  modalSheetTablet: {
    width:                   '100%',
    alignSelf:               'center',
    borderBottomLeftRadius:  radius.xl ?? 20,
    borderBottomRightRadius: radius.xl ?? 20,
  },

  modalHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderBottomWidth: 0.5,
  },

  modalTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },

  modalBody: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
  },

  filterSection: { marginBottom: spacing.xl },

  filterSectionTitle: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  filterOptions: { gap: spacing.sm },

  filterOption: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderRadius:      radius.md,
    borderWidth:       0.5,
  },

  filterOptionText: { fontSize: typography.fontSize.md },

  modalFooter: {
    flexDirection:     'row',
    gap:               spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderTopWidth:    0.5,
  },

  clearBtn: {
    flex:           1,
    paddingVertical: spacing.md,
    borderRadius:   radius.md,
    alignItems:     'center',
    borderWidth:    0.5,
  },

  clearBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },

  applyBtn: {
    flex:            1,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
  },

  applyBtnText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});