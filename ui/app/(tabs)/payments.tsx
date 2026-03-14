import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import {
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Wallet,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
} from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { paymentService } from '@/services/apiClient';
import type { Payment, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';
import UpgradeModal from '@/components/UpgradeModal';

const PAYMENTS_CACHE_STALE_MS = 30 * 1000;

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();
  
  // Initialize with cached data synchronously to avoid glitch
  const { initialPayments, initialTotal } = (() => {
    if (!selectedPropertyId) return { initialPayments: [], initialTotal: 0 };
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cacheKey = cacheKeys.payments(selectedPropertyId, monthKey);
    const cachedResponse = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
    return {
      initialPayments: cachedResponse?.data || [],
      initialTotal: cachedResponse?.meta?.total || 0
    };
  })();
  
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(initialTotal);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Month navigation state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filter state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'Cash' | 'Online' | 'Bank Transfer' | 'UPI' | 'Cheque'>('all');

  // Get month/year display string
  const monthYearString = useMemo(() => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  // Get start and end dates for current month
  const dateRange = useMemo(() => {
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [selectedDate]);

  const monthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedDate]);

  const isFetchingRef = useRef(false);
  const lastFocusRefreshRef = useRef<number>(Date.now());

  const fetchPayments = useCallback(async (forceNetwork: boolean = false) => {
    if (!selectedPropertyId) {
      setPayments([]);
      setTotal(0);
      setError(null);
      setIsRefreshing(false);
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

    const cacheKey = cacheKeys.payments(selectedPropertyId, monthKey);
    if (!forceNetwork) {
      const cachedResponse = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
      if (cachedResponse) {
        const cachedData = cachedResponse.data || [];
        setPayments(cachedData);
        setTotal(cachedResponse.meta?.total || cachedData.length);
        setError(null);
        setIsRefreshing(false);
        return;
      }
    }

    try {
      isFetchingRef.current = true;
      // Only show loading if we don't already have data
      if (!payments.length) {
        setIsRefreshing(true);
      }
      setError(null);

      const response = await paymentService.getPayments(selectedPropertyId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        page: currentPage,
        pageSize: 50,
      });
      const data = response.data || [];
      setPayments(data);
      setTotal(response.meta?.total || data.length);
      setScreenCache(cacheKey, response);
    } catch (err: any) {
      console.error('Error fetching payments:', err);
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(err?.message || 'Failed to load payments');
      }
      if (!payments.length) {
        setPayments([]);
      }
    } finally {
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId, monthKey, dateRange.startDate, dateRange.endDate, currentPage, payments.length]);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const cacheKey = cacheKeys.payments(selectedPropertyId, monthKey);
        const hasFreshCache = !!getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
        const now = Date.now();
        const timeSinceLastRefresh = now - lastFocusRefreshRef.current;
        const shouldRefreshBecauseCacheMissing = !hasFreshCache;
        const shouldRefreshByThrottle = timeSinceLastRefresh > PAYMENTS_CACHE_STALE_MS;

        if (shouldRefreshBecauseCacheMissing || shouldRefreshByThrottle) {
          lastFocusRefreshRef.current = now;
          fetchPayments(shouldRefreshBecauseCacheMissing);
        }
      }
    }, [selectedPropertyId, propertyLoading, monthKey, fetchPayments])
  );

  // Refetch payments when month changes
  useEffect(() => {
    if (!propertyLoading && selectedPropertyId) {
      // Check cache synchronously first to avoid skeleton flash
      const cacheKey = cacheKeys.payments(selectedPropertyId, monthKey);
      const cachedResponse = getScreenCache<PaginatedResponse<Payment>>(cacheKey, PAYMENTS_CACHE_STALE_MS);
      
      if (cachedResponse) {
        // Use cached data immediately
        setPayments(cachedResponse.data || []);
        setTotal(cachedResponse.meta?.total || 0);
        setError(null);
        setIsRefreshing(false);
      } else {
        // Fetch latest data for selected month when cache is missing
        if (!payments.length) {
          setIsRefreshing(true);
        }
        fetchPayments(true);
      }
    } else if (!selectedPropertyId && !propertyLoading) {
      setPayments([]);
      setTotal(0);
      setError(null);
      setIsRefreshing(false);
    }
  }, [monthKey, selectedPropertyId, propertyLoading, payments.length, fetchPayments]);

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

  const handleRetry = () => {
    fetchPayments(true);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    // Clear only payments cache
    clearScreenCache('payments:');

    // Reset to current month / first page
    const now = new Date();
    const isAlreadyCurrentMonth =
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth();
    const isAlreadyFirstPage = currentPage === 1;

    setSelectedDate(now);
    setCurrentPage(1);

    try {
      // Avoid duplicate network calls when month/page state changes will trigger fetch via effect
      if (isAlreadyCurrentMonth && isAlreadyFirstPage) {
        await fetchPayments(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedDate, currentPage, fetchPayments]);

  const handleFabPress = () => {
    router.push('/manual-payment');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={20} color={colors.success[500]} />;
      case 'due':
        return <Clock size={20} color={colors.primary[500]} />;
    }
  };

  const isLoadingState = isRefreshing && payments.length === 0;

  // Apply filters
  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      // Status filter
      if (statusFilter !== 'all' && payment.status !== statusFilter) {
        return false;
      }
      // Method filter
      if (methodFilter !== 'all' && payment.method !== methodFilter) {
        return false;
      }
      return true;
    });
  }, [payments, statusFilter, methodFilter]);

  const hasActiveFilters = statusFilter !== 'all' || methodFilter !== 'all';

  const clearFilters = () => {
    setStatusFilter('all');
    setMethodFilter('all');
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Payments</Text>
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: hasActiveFilters ? colors.primary[500] : colors.primary[50], borderColor: hasActiveFilters ? colors.primary[500] : colors.primary[100] }]} 
          activeOpacity={0.7}
          onPress={() => setShowFilterModal(true)}>
          <Filter size={20} color={hasActiveFilters ? colors.white : colors.primary[500]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
            {hasActiveFilters && (
              <View style={[styles.filterSummary, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                <Text style={[styles.filterSummaryText, { color: colors.primary[700] }]}>
                  {filteredPayments.length} of {payments.length} payments
                </Text>
                <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
                  <Text style={[styles.clearFiltersText, { color: colors.primary[500] }]}>Clear Filters</Text>
                </TouchableOpacity>
              </View>
            )}
            {filteredPayments.map((payment, index) => (
                <TouchableOpacity key={index} activeOpacity={0.7} onPress={() => router.push(`/edit-payment?paymentId=${payment.id}`)}>
                  <Card style={styles.paymentCard}>
                    <View style={styles.paymentHeader}>
                      <View style={styles.statusIconContainer}>
                        {getStatusIcon(payment.status)}
                      </View>
                      <View style={styles.paymentInfo}>
                        <View style={styles.tenantNameRow}>
                          <Text style={[styles.tenantName, { color: colors.text.primary }]}>
                            {payment.tenantName || 'Unknown Tenant'}
                          </Text>
                          {payment.tenantStatus === 'vacated' && (
                            <View style={[styles.vacatedBadge, { backgroundColor: colors.danger[100] }]}>
                              <LogOut size={12} color={colors.danger[600]} />
                              <Text style={[styles.vacatedBadgeText, { color: colors.danger[600] }]}>Vacated</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.bedNumber, { color: colors.text.tertiary }]}>Room: {payment.roomNumber || 'N/A'}</Text>
                      </View>
                      <View style={styles.amountContainer}>
                        <Text style={[styles.amount, { color: colors.text.primary }]}>{payment.amount}</Text>
                        <StatusBadge status={payment.status} />
                      </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                    <View style={styles.paymentFooter}>
                      <View style={styles.dateRow}>
                        <Calendar size={14} color={colors.text.secondary} />
                        {payment.status === 'paid' ? (
                          <>
                            <Text style={[styles.dateLabel, { color: colors.text.secondary }]}>Paid On:</Text>
                            <Text style={[styles.dateValue, { color: colors.text.primary }]}>{payment.paidDate || payment.dueDate || '-'}</Text>
                          </>
                        ) : (
                          <>
                            <Text style={[styles.dateLabel, { color: colors.text.secondary }]}>Due:</Text>
                            <Text style={[styles.dateValue, { color: colors.text.primary }]}>{payment.dueDate || '-'}</Text>
                          </>
                        )}
                      </View>
                      {/* Show payment method if present */}
                      {payment.method && (
                        <View style={styles.methodRow}>
                          <Text style={[styles.methodLabel, { color: colors.text.secondary }]}>Method:</Text>
                          <Text style={[styles.methodValue, { color: colors.primary[500] }]}>{payment.method}</Text>
                        </View>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </ScrollView>
      {selectedProperty && !isLoadingState && <FAB onPress={handleFabPress} />}
      
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}>
        <View style={[styles.filterModalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.filterModalContent, { backgroundColor: colors.background.primary }]}>
            <View style={[styles.filterModalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.filterModalTitle, { color: colors.text.primary }]}>Filter Payments</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} activeOpacity={0.7}>
                <X size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalBody}>
              {/* Status Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.text.primary }]}>Payment Status</Text>
                <View style={styles.filterOptions}>
                  {['all', 'paid', 'due'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.filterOption,
                        {
                          backgroundColor: statusFilter === status ? colors.primary[100] : colors.background.secondary,
                          borderColor: statusFilter === status ? colors.primary[500] : colors.border.medium,
                        },
                      ]}
                      onPress={() => setStatusFilter(status as any)}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.filterOptionText,
                          {
                            color: statusFilter === status ? colors.primary[700] : colors.text.primary,
                            fontWeight: statusFilter === status ? typography.fontWeight.semibold : typography.fontWeight.regular,
                          },
                        ]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                      {statusFilter === status && (
                        <CheckCircle size={18} color={colors.primary[500]} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Payment Method Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.text.primary }]}>Payment Method</Text>
                <View style={styles.filterOptions}>
                  {['all', 'Cash', 'Online', 'Bank Transfer', 'UPI', 'Cheque'].map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.filterOption,
                        {
                          backgroundColor: methodFilter === method ? colors.primary[100] : colors.background.secondary,
                          borderColor: methodFilter === method ? colors.primary[500] : colors.border.medium,
                        },
                      ]}
                      onPress={() => setMethodFilter(method as any)}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.filterOptionText,
                          {
                            color: methodFilter === method ? colors.primary[700] : colors.text.primary,
                            fontWeight: methodFilter === method ? typography.fontWeight.semibold : typography.fontWeight.regular,
                          },
                        ]}>
                        {method.charAt(0).toUpperCase() + method.slice(1)}
                      </Text>
                      {methodFilter === method && (
                        <CheckCircle size={18} color={colors.primary[500]} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.filterModalFooter, { borderTopColor: colors.border.light }]}>
              <TouchableOpacity
                style={[styles.clearFiltersButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                onPress={clearFilters}
                activeOpacity={0.7}>
                <Text style={[styles.clearFiltersButtonText, { color: colors.text.primary }]}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyFiltersButton, { backgroundColor: colors.primary[500] }]}
                onPress={() => setShowFilterModal(false)}
                activeOpacity={0.7}>
                <Text style={[styles.applyFiltersButtonText, { color: colors.white }]}>Apply Filters</Text>
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

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
    fontWeight: typography.fontWeight.semibold,
  },
  statAmount: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  paymentsSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  paymentCard: {
    marginBottom: spacing.xs,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: 40,
  },
  statusIconContainer: {
    marginRight: spacing.sm,
  },
  paymentInfo: {
    flex: 1,
  },
  tenantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tenantName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  vacatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  vacatedBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  propertyName: {
    fontSize: typography.fontSize.sm,
    marginBottom: 2,
  },
  bedNumber: {
    fontSize: typography.fontSize.xs,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    marginBottom: spacing.sm,
  },
  paymentFooter: {
    gap: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  dateLabel: {
    fontSize: typography.fontSize.xs,
    marginLeft: spacing.xs,
    marginRight: 2,
  },
  dateValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  methodLabel: {
    fontSize: typography.fontSize.xs,
    marginRight: 2,
  },
  methodValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  monthNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...shadows.sm,
  },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  monthYearText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    minWidth: 100,
    textAlign: 'center',
  },
  monthLoader: {
    marginLeft: spacing.sm,
  },
  filterSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
  },
  filterSummaryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  clearFiltersText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  filterModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '80%',
    ...shadows.xl,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  filterModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  filterModalBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  filterSection: {
    marginBottom: spacing.xl,
  },
  filterSectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  filterOptions: {
    gap: spacing.sm,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  filterOptionText: {
    fontSize: typography.fontSize.md,
  },
  filterModalFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  clearFiltersButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    ...shadows.md,
  },
  applyFiltersButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});