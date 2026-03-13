import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import PropertySwitcher from '@/components/PropertySwitcher';
import SectionHeader from '@/components/SectionHeader';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import {
  Building2,
  Users,
  Bed,
  TrendingUp,
  AlertCircle,
  Clock,
  IndianRupee,
  CheckCircle,
  LogIn,
  LogOut,
  Wrench,
  ArrowRight,
} from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import {
  paymentService,
  dashboardService,
} from '@/services/apiClient';
import type { Payment, DashboardStats } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

interface DashboardData {
  stats: DashboardStats;
  duePayments: Payment[];
}

const DASHBOARD_CACHE_STALE_MS = 60 * 1000;

export default function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();
  
  // Initialize with cached data synchronously to avoid glitch
  const initialDashboardData = (() => {
    if (!selectedPropertyId) return null;
    const cacheKey = cacheKeys.dashboard(selectedPropertyId);
    return getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS);
  })();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(initialDashboardData);
  const lastFocusRefreshRef = useRef<number>(Date.now());
  const isFetchingRef = useRef(false);
  const hasDashboardDataRef = useRef(Boolean(initialDashboardData));

  useEffect(() => {
    hasDashboardDataRef.current = Boolean(dashboardData);
  }, [dashboardData]);

  const fetchDashboardData = useCallback(async () => {
    if (!selectedPropertyId) {
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

    const cacheKey = cacheKeys.dashboard(selectedPropertyId);
    const cachedData = getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS);
    if (cachedData) {
      setDashboardData(cachedData);
      setError(null);
      return;
    }

    try {
      isFetchingRef.current = true;
      // Only show loading if we don't already have data
      if (!hasDashboardDataRef.current) {
        setLoading(true);
      }
      setError(null);

      // Fetch aggregated stats and payments data
      const [statsRes, dueRes] = await Promise.all([
        dashboardService.getStats(selectedPropertyId),
        paymentService.getPayments(selectedPropertyId, { status: 'due', page: 1, pageSize: 5 }),
      ]);

      const stats = statsRes.data || {
        totalTenants: 0,
        activeTenants: 0,
        vacatedTenants: 0,
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        occupancyRate: 0,
        monthlyRevenue: 0,
        monthlyRevenueFormatted: '₹0',
        pendingPayments: 0,
        duePaymentAmount: 0,
        duePaymentAmountFormatted: '₹0',
        paidThisMonth: 0,
        paidThisMonthFormatted: '₹0',
        checkInsToday: 0,
        upcomingCheckIns: 0,
        totalStaff: 0,
        availableStaff: 0,
        maintenanceAlerts: 0,
        urgentAlerts: 0,
      };
      const duePayments = dueRes.data || [];

      setDashboardData({
        stats,
        duePayments,
      });
      setScreenCache(cacheKey, {
        stats,
        duePayments,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId]);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastFocusRefreshRef.current;
        const shouldRefresh = timeSinceLastRefresh > DASHBOARD_CACHE_STALE_MS;

        // Only fetch if data is stale
        if (shouldRefresh) {
          lastFocusRefreshRef.current = now;
          fetchDashboardData();
        }
      } else if (!propertyLoading && !selectedPropertyId) {
        // If property loading is done but there are no properties, set loading to false
        setLoading(false);
      }
    }, [selectedPropertyId, propertyLoading, fetchDashboardData])
  );

  // Fetch data on initial mount or when property changes
  useEffect(() => {
    if (!propertyLoading && selectedPropertyId && !hasDashboardDataRef.current) {
      // Only fetch if we don't have any data yet
      const cacheKey = cacheKeys.dashboard(selectedPropertyId);
      const cachedData = getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS);
      if (!cachedData) {
        fetchDashboardData();
      }
    }
  }, [selectedPropertyId, propertyLoading, fetchDashboardData]);

  const handleRetry = () => {
    fetchDashboardData();
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      if (selectedPropertyId) {
        clearScreenCache(cacheKeys.dashboard(selectedPropertyId));
        clearScreenCache(`payments:${selectedPropertyId}:`);
      } else {
        clearScreenCache('dashboard:');
      }
      await fetchDashboardData();
    } finally {
      setRefreshing(false);
    }
  }, [selectedPropertyId, fetchDashboardData]);

  const totalBeds = dashboardData?.stats.totalBeds || 0;
  const occupiedBeds = dashboardData?.stats.occupiedBeds || 0;
  const occupancyRate = dashboardData?.stats.occupancyRate || 0;

  const mainStats = [
    {
      icon: Bed,
      label: 'Total Beds',
      value: String(totalBeds),
      color: colors.purple[500],
    },
    {
      icon: Users,
      label: 'Tenants',
      value: String(dashboardData?.stats.totalTenants || 0),
      color: colors.success[500],
    },
    {
      icon: TrendingUp,
      label: 'Occupancy',
      value: `${occupancyRate}%`,
      color: colors.primary[500],
    },
  ];

  const quickActions = [
    { icon: Users, label: 'Add Tenant', route: '/add-tenant' },
    { icon: IndianRupee, label: 'Add Payment', route: '/manual-payment' },
    { icon: Building2, label: 'Manage Rooms', route: '/manage-rooms' },
    { icon: Wrench, label: 'Manage Staff', route: '/manage-staff' },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <PropertySwitcher />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }>
          {loading && !dashboardData ? (
          <>
            <View style={styles.header}>
              <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
              <Text style={[styles.ownerName, { color: colors.text.primary }]}>Property Owner</Text>
            </View>
            <Skeleton height={120} count={3} />
          </>
        ) : error ? (
          <>
            <View style={styles.header}>
              <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
              <Text style={[styles.ownerName, { color: colors.text.primary }]}>Property Owner</Text>
            </View>
            <ApiErrorCard error={error} onRetry={handleRetry} />
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
              <Text style={[styles.ownerName, { color: colors.text.primary }]}>Property Owner</Text>
            </View>

            {!selectedProperty ? (
              <EmptyState
                icon={Building2}
                title="No Properties Found"
                subtitle="Create your first property to start using dashboard features"
                actionLabel="Create Property"
                onActionPress={() => router.push('/property-form')}
              />
            ) : (
              <>
                {/* Main Stats */}
                <View style={styles.statsGrid}>
                  {mainStats.map((stat, index) => (
                    <Card key={index} style={styles.statCard}>
                      <View style={[styles.iconContainer, { backgroundColor: stat.color }]}>
                        <stat.icon size={20} color={colors.white} />
                      </View>
                      <Text style={[styles.statValue, { color: colors.text.primary }]}>{stat.value}</Text>
                      <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{stat.label}</Text>
                    </Card>
                  ))}
                </View>

                {/* Revenue Section */}
                {dashboardData?.stats.monthlyRevenue !== undefined && (
                  <Card style={styles.revenueCard}>
                    <View style={styles.revenueSectionHeader}>
                      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Monthly Revenue</Text>
                      <IndianRupee size={20} color={colors.success[500]} />
                    </View>
                    <View style={styles.revenueRow}>
                      <View style={styles.revenueItem}>
                        <Text style={[styles.revenueLabel, { color: colors.text.secondary }]}>Total Earned</Text>
                        <Text style={[styles.revenueValue, { color: colors.success[500] }]}>
                          {dashboardData.stats.monthlyRevenueFormatted || '₹0'}
                        </Text>
                      </View>
                      <View style={styles.revenueDivider} />
                      <View style={styles.revenueItem}>
                        <Text style={[styles.revenueLabel, { color: colors.text.secondary }]}>Pending</Text>
                        <Text style={[styles.revenueValue, { color: colors.primary[500] }]}>
                          {dashboardData.stats.duePaymentAmountFormatted || '₹0'}
                        </Text>
                      </View>
                    </View>
                  </Card>
                )}

                {/* Quick Stats */}
                <View style={styles.quickStatsContainer}>
                  {dashboardData?.stats.pendingPayments !== undefined && (
                    <TouchableOpacity 
                      onPress={() => router.push('/payments')}
                      activeOpacity={0.7}>
                      <Card style={styles.quickStatCard}>
                        <View style={[styles.quickStatIcon, { backgroundColor: colors.primary[50] }]}>
                          <AlertCircle size={18} color={colors.primary[500]} />
                        </View>
                        <View>
                          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>Due Payments</Text>
                          <Text style={[styles.quickStatValue, { color: colors.text.primary }]}>
                            {dashboardData.stats.pendingPayments}
                          </Text>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  )}

                  {dashboardData?.stats.checkInsToday !== undefined && (
                    <Card style={styles.quickStatCard}>
                      <View style={[styles.quickStatIcon, { backgroundColor: colors.success[50] }]}>
                        <LogIn size={18} color={colors.success[500]} />
                      </View>
                      <View>
                        <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>Check-ins Today</Text>
                        <Text style={[styles.quickStatValue, { color: colors.text.primary }]}>
                          {dashboardData.stats.checkInsToday}
                        </Text>
                      </View>
                    </Card>
                  )}

                  {dashboardData?.stats.totalStaff !== undefined && (
                    <Card style={styles.quickStatCard}>
                      <View style={[styles.quickStatIcon, { backgroundColor: colors.purple[50] }]}>
                        <Users size={18} color={colors.purple[500]} />
                      </View>
                      <View>
                        <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>Staff Available</Text>
                        <Text style={[styles.quickStatValue, { color: colors.text.primary }]}>
                          {dashboardData.stats.availableStaff || 0}/{dashboardData.stats.totalStaff}
                        </Text>
                      </View>
                    </Card>
                  )}

                  {dashboardData?.stats.activeTenants !== undefined && (
                    <TouchableOpacity 
                      onPress={() => router.push('/tenants')}
                      activeOpacity={0.7}>
                      <Card style={styles.quickStatCard}>
                        <View style={[styles.quickStatIcon, { backgroundColor: colors.success[50] }]}>
                          <Users size={18} color={colors.success[500]} />
                        </View>
                        <View>
                          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>Tenant Status</Text>
                          <Text style={[styles.quickStatValue, { color: colors.text.primary }]}>
                            {dashboardData.stats.activeTenants} Active{dashboardData.stats.vacatedTenants ? `, ${dashboardData.stats.vacatedTenants} Vacated` : ''}
                          </Text>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Quick Actions */}
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Quick Actions</Text>
                  <View style={styles.quickActionsGrid}>
                    {quickActions.map((action, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.quickActionButton}
                        onPress={() => router.push(action.route as any)}
                        activeOpacity={0.7}>
                        <Card style={styles.actionCard}>
                          <View style={[styles.actionIcon, { backgroundColor: colors.primary[50] }]}>
                            <action.icon size={24} color={colors.primary[500]} />
                          </View>
                          <Text style={[styles.actionLabel, { color: colors.text.primary }]}>
                            {action.label}
                          </Text>
                        </Card>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Due Payments Section */}
                {dashboardData && dashboardData.duePayments.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <SectionHeader icon={Clock} iconColor={colors.primary[500]} title="Due Soon" />
                      <TouchableOpacity onPress={() => router.push('/payments')} activeOpacity={0.7}>
                        <ArrowRight size={18} color={colors.primary[500]} />
                      </TouchableOpacity>
                    </View>
                    {dashboardData.duePayments.map((payment, index) => (
                      <Card key={index} style={styles.paymentCard}>
                        <View style={styles.paymentRow}>
                          <View style={styles.paymentInfo}>
                            <Text style={[styles.paymentName, { color: colors.text.primary }]}>
                              {payment.tenantName || 'Unknown Tenant'}
                            </Text>
                            <Text style={[styles.paymentRoom, { color: colors.text.secondary }]}>
                              Room {payment.bed}
                            </Text>
                          </View>
                          <View style={styles.paymentRight}>
                            <Text style={[styles.paymentAmount, { color: colors.text.primary }]}>
                              {payment.amount}
                            </Text>
                            <Text style={[styles.paymentDate, { color: colors.primary[500] }]}>
                              {payment.dueDate}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  greeting: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  ownerName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    marginBottom: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  statValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
  },
  revenueCard: {
    marginBottom: spacing.lg,
  },
  revenueSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  revenueItem: {
    flex: 1,
  },
  revenueLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  revenueValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  revenueDivider: {
    width: 1,
    height: 40,
    opacity: 0.2,
  },
  quickStatsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickStatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  quickStatIcon: {
    width: 40,
    height: 40,
    borderRadius: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  quickStatLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  quickStatValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionButton: {
    width: '48%',
  },
  actionCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  actionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  paymentCard: {
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  paymentRoom: {
    fontSize: typography.fontSize.sm,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  paymentDate: {
    fontSize: typography.fontSize.sm,
  },
});

