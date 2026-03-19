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
  LogIn,
  Wrench,
  ArrowRight,
} from 'lucide-react-native';
import { spacing, radius } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useAuth } from '@/context/AuthContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { paymentService, dashboardService } from '@/services/apiClient';
import type { Payment, DashboardStats } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

interface DashboardData {
  stats: DashboardStats;
  duePayments: Payment[];
}

const DASHBOARD_CACHE_STALE_MS  = 60 * 1000;
const MAX_ERROR_MESSAGE_LENGTH  = 220;

function normalizeErrorMessage(message?: string): string {
  if (!message) return 'Failed to load dashboard data';
  const normalized = String(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Failed to load dashboard data';
  return normalized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : normalized;
}

function formatINRCurrency(value?: number): string {
  if (!value || Number.isNaN(value)) return '₹0';
  return `₹${value.toLocaleString('en-IN')}`;
}

function toDateOnly(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { isTablet, isLandscape, contentMaxWidth } = useResponsiveLayout();
  const isTabletLandscape = isTablet && isLandscape;
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();

  const initialDashboardData = (() => {
    if (!selectedPropertyId) return null;
    const cacheKey = cacheKeys.dashboard(selectedPropertyId);
    return getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS);
  })();

  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(initialDashboardData);

  const lastFocusRefreshRef  = useRef<number>(Date.now());
  const isFetchingRef        = useRef(false);
  const hasDashboardDataRef  = useRef(Boolean(initialDashboardData));

  useEffect(() => {
    hasDashboardDataRef.current = Boolean(dashboardData);
  }, [dashboardData]);

  const fetchDashboardData = useCallback(async () => {
    if (!selectedPropertyId) { setLoading(false); return; }
    if (isFetchingRef.current) return;

    const cacheKey   = cacheKeys.dashboard(selectedPropertyId);
    const cachedData = getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS);
    if (cachedData) { setDashboardData(cachedData); setError(null); return; }

    try {
      isFetchingRef.current = true;
      if (!hasDashboardDataRef.current) setLoading(true);
      setError(null);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 5);
      const overdueCutoff = toDateOnly(cutoff);

      const [statsRes, dueRes] = await Promise.all([
        dashboardService.getStats(selectedPropertyId),
        paymentService.getPayments(selectedPropertyId, {
          status: 'due',
          page: 1,
          pageSize: 5,
          endDate: overdueCutoff,
        }),
      ]);

      const stats = statsRes.data || {
        totalTenants: 0, activeTenants: 0, vacatedTenants: 0,
        totalBeds: 0, occupiedBeds: 0, availableBeds: 0, occupancyRate: 0,
        monthlyRevenue: 0, monthlyRevenueFormatted: '₹0',
        pendingPayments: 0, duePaymentAmount: 0, duePaymentAmountFormatted: '₹0',
        paidThisMonth: 0, paidThisMonthFormatted: '₹0',
        checkInsToday: 0, upcomingCheckIns: 0,
        totalStaff: 0, availableStaff: 0,
        maintenanceAlerts: 0, urgentAlerts: 0,
      };
      const duePayments = dueRes.data || [];
      const data = { stats, duePayments };
      setDashboardData(data);
      setScreenCache(cacheKey, data);
    } catch (err: any) {
      setError(normalizeErrorMessage(err?.message));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId]);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const now = Date.now();
        if (now - lastFocusRefreshRef.current > DASHBOARD_CACHE_STALE_MS) {
          lastFocusRefreshRef.current = now;
          fetchDashboardData();
        }
      } else if (!propertyLoading && !selectedPropertyId) {
        setLoading(false);
      }
    }, [selectedPropertyId, propertyLoading, fetchDashboardData])
  );

  useEffect(() => {
    if (!propertyLoading && selectedPropertyId && !hasDashboardDataRef.current) {
      const cacheKey = cacheKeys.dashboard(selectedPropertyId);
      if (!getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS)) {
        fetchDashboardData();
      }
    }
  }, [selectedPropertyId, propertyLoading, fetchDashboardData]);

  const handleRetry = () => fetchDashboardData();

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

  const occupancyRate = dashboardData?.stats.occupancyRate || 0;
  const monthlyRevenueText = dashboardData?.stats.monthlyRevenueFormatted
    || formatINRCurrency(dashboardData?.stats.monthlyRevenue);
  const pendingAmountText = dashboardData?.stats.duePaymentAmountFormatted
    || formatINRCurrency(dashboardData?.stats.duePaymentAmount);

  const mainStats = [
    {
      icon: Bed,
      label: 'Total Beds',
      value: String(dashboardData?.stats.totalBeds || 0),
      color: colors.purple[500],
      bg:    isDark ? colors.purple[900] : colors.purple[50],
    },
    {
      icon: Users,
      label: 'Tenants',
      value: String(dashboardData?.stats.totalTenants || 0),
      color: colors.success[500],
      bg:    isDark ? colors.success[900] : colors.success[50],
    },
    {
      icon: TrendingUp,
      label: 'Occupancy',
      value: `${occupancyRate}%`,
      color: colors.primary[500],
      bg:    isDark ? colors.primary[900] : colors.primary[50],
    },
  ];

  const quickActions = [
    { icon: Users,      label: 'Add Tenant',   route: '/add-tenant'    },
    { icon: IndianRupee,label: 'Add Payment',  route: '/manual-payment'},
    { icon: Building2,  label: 'Manage Rooms', route: '/manage-rooms'  },
    { icon: Wrench,     label: 'Manage Staff', route: '/manage-staff'  },
  ];

  const HeaderBlock = () => (
    <View style={styles.header}>
      <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
      <Text style={[styles.ownerName, { color: colors.text.primary }]}>
        {user?.name || 'Property Owner'}
      </Text>
    </View>
  );

  return (
    <ScreenContainer edges={['top']}>
      <PropertySwitcher />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
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
            <HeaderBlock />
            <Skeleton height={120} count={3} />
          </>
        ) : error ? (
          <>
            <HeaderBlock />
            <ApiErrorCard error={error} onRetry={handleRetry} />
          </>
        ) : (
          <>
            <HeaderBlock />

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
                {/* ── Main Stats ── */}
                <View style={styles.statsGrid}>
                  {mainStats.map((stat, i) => (
                    <Card key={i} style={[styles.statCard, isTabletLandscape && styles.statCardTablet]}>
                      <View style={[styles.statIconWrap, { backgroundColor: stat.bg }]}>
                        <stat.icon size={20} color={stat.color} />
                      </View>
                      <Text style={[styles.statValue, { color: colors.text.primary }]}>
                        {stat.value}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.text.secondary }]}>
                        {stat.label}
                      </Text>
                    </Card>
                  ))}
                </View>

                {/* ── Revenue + Quick Stats ── */}
                <View style={[styles.overviewColumns, isTabletLandscape && styles.overviewColumnsTablet]}>

                  {/* Revenue card */}
                  <View style={[styles.overviewColumn, isTabletLandscape && styles.overviewColumnTablet]}>
                    <Card style={styles.revenueCard}>
                      <View style={styles.revenueHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}> 
                          Monthly Revenue
                        </Text>
                        <View style={[styles.revenueIconWrap, {
                          backgroundColor: isDark ? colors.success[900] : colors.success[50],
                        }]}>
                          <IndianRupee size={16} color={colors.success[500]} />
                        </View>
                      </View>
                      <View style={styles.revenueRow}>
                        <View style={styles.revenueItem}>
                          <Text style={[styles.revenueLabel, { color: colors.text.secondary }]}> 
                            Total Earned
                          </Text>
                          <Text style={[styles.revenueValue, { color: colors.success[500] }]}> 
                            {monthlyRevenueText}
                          </Text>
                        </View>
                        <View style={[styles.revenueDivider, { backgroundColor: colors.border.medium }]} />
                        <View style={styles.revenueItem}>
                          <Text style={[styles.revenueLabel, { color: colors.text.secondary }]}> 
                            Pending
                          </Text>
                          <Text style={[styles.revenueValue, { color: colors.warning[500] }]}> 
                            {pendingAmountText}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  </View>

                  {/* Quick stats */}
                  <View style={[styles.overviewColumn, isTabletLandscape && styles.overviewColumnTablet]}>
                    <View style={styles.quickStatsContainer}>

                      <TouchableOpacity onPress={() => router.push('/payments')} activeOpacity={0.7}>
                        <Card style={styles.quickStatCard}>
                          <View style={[styles.quickStatIcon, {
                            backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                          }]}>
                            <AlertCircle size={18} color={isDark ? colors.primary[300] : colors.primary[500]} />
                          </View>
                          <View style={styles.quickStatText}>
                            <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}> 
                              Due Payments
                            </Text>
                            <Text style={[styles.quickStatValue, { color: colors.text.primary }]}> 
                              {dashboardData?.stats.pendingPayments || 0}
                            </Text>
                          </View>
                          <ArrowRight size={14} color={colors.text.tertiary} style={styles.quickStatArrow} />
                        </Card>
                      </TouchableOpacity>

                      <Card style={styles.quickStatCard}>
                        <View style={[styles.quickStatIcon, {
                          backgroundColor: isDark ? colors.success[900] : colors.success[50],
                        }]}>
                          <LogIn size={18} color={isDark ? colors.success[300] : colors.success[500]} />
                        </View>
                        <View style={styles.quickStatText}>
                          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}> 
                            Check-ins Today
                          </Text>
                          <Text style={[styles.quickStatValue, { color: colors.text.primary }]}> 
                            {dashboardData?.stats.checkInsToday || 0}
                          </Text>
                        </View>
                      </Card>

                      <Card style={styles.quickStatCard}>
                        <View style={[styles.quickStatIcon, {
                          backgroundColor: isDark ? colors.purple[900] : colors.purple[50],
                        }]}>
                          <Users size={18} color={isDark ? colors.purple[300] : colors.purple[500]} />
                        </View>
                        <View style={styles.quickStatText}>
                          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}> 
                            Staff Available
                          </Text>
                          <Text style={[styles.quickStatValue, { color: colors.text.primary }]}> 
                            {dashboardData?.stats.availableStaff || 0}/{dashboardData?.stats.totalStaff || 0}
                          </Text>
                        </View>
                      </Card>

                      <TouchableOpacity onPress={() => router.push('/tenants')} activeOpacity={0.7}>
                        <Card style={styles.quickStatCard}>
                          <View style={[styles.quickStatIcon, {
                            backgroundColor: isDark ? colors.success[900] : colors.success[50],
                          }]}>
                            <Users size={18} color={isDark ? colors.success[300] : colors.success[500]} />
                          </View>
                          <View style={styles.quickStatText}>
                            <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}> 
                              Tenant Status
                            </Text>
                            <Text style={[styles.quickStatValue, { color: colors.text.primary }]}> 
                              {dashboardData?.stats.activeTenants || 0} Active
                              {(dashboardData?.stats.vacatedTenants || 0) > 0
                                ? `, ${dashboardData?.stats.vacatedTenants || 0} Vacated`
                                : ''}
                            </Text>
                          </View>
                          <ArrowRight size={14} color={colors.text.tertiary} style={styles.quickStatArrow} />
                        </Card>
                      </TouchableOpacity>

                    </View>
                  </View>
                </View>

                {/* ── Quick Actions ── */}
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    Quick Actions
                  </Text>
                  <View style={styles.quickActionsGrid}>
                    {quickActions.map((action, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.quickActionButton, isTabletLandscape && styles.quickActionButtonTablet]}
                        onPress={() => router.push(action.route as any)}
                        activeOpacity={0.7}>
                        <Card style={styles.actionCard}>
                          <View style={[styles.actionIconWrap, {
                            backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                          }]}>
                            <action.icon size={22} color={isDark ? colors.primary[300] : colors.primary[500]} />
                          </View>
                          <Text style={[styles.actionLabel, { color: colors.text.primary }]}>
                            {action.label}
                          </Text>
                        </Card>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Due Payments ── */}
                {dashboardData && dashboardData.duePayments.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <SectionHeader
                        icon={Clock}
                        iconColor={isDark ? colors.warning[300] : colors.warning[500]}
                        title="Overdue (5+ days)"
                      />
                      <TouchableOpacity onPress={() => router.push('/payments')} activeOpacity={0.7}>
                        <View style={styles.seeAllBtn}>
                          <Text style={[styles.seeAllText, { color: colors.primary[500] }]}>See all</Text>
                          <ArrowRight size={14} color={colors.primary[500]} />
                        </View>
                      </TouchableOpacity>
                    </View>
                    {dashboardData.duePayments.map((payment) => (
                      <Card key={payment.id} style={styles.paymentCard}>
                        <View style={styles.paymentRow}>
                          <View style={[styles.paymentDot, { backgroundColor: colors.warning[400] }]} />
                          <View style={styles.paymentInfo}>
                            <Text style={[styles.paymentName, { color: colors.text.primary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              {payment.tenantName || 'Unknown Tenant'}
                            </Text>
                            <Text style={[styles.paymentRoom, { color: colors.text.secondary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              Room {payment.roomNumber || 'N/A'}
                            </Text>
                          </View>
                          <View style={styles.paymentRight}>
                            <Text style={[styles.paymentAmount, { color: colors.text.primary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              {payment.amount}
                            </Text>
                            <Text style={[styles.paymentDate, { color: colors.warning[500] }]}
                              numberOfLines={1} ellipsizeMode="tail">
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    paddingVertical:   spacing.lg,
    paddingHorizontal: spacing.sm,
    marginBottom:      spacing.sm,
  },

  greeting: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.sm,
    marginBottom: spacing.xs,
  },

  ownerName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  // ── Stats Grid ───────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
    marginBottom:  spacing.lg,
  },

  statCard: {
    flex:           1,
    minWidth:       '30%',
    alignItems:     'center',
    paddingVertical:   spacing.lg,
    paddingHorizontal: spacing.sm,
  },

  statCardTablet: {
    minWidth: '32%',
    flexGrow:  0,
  },

  statIconWrap: {
    width:          44,
    height:         44,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.md,
  },

  statValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.xs,
  },

  statLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // ── Overview ─────────────────────────────────────────────────────────────
  overviewColumns: {
    marginBottom: spacing.lg,
  },

  overviewColumnsTablet: {
    flexDirection:  'row',
    gap:            spacing.md,
    alignItems:     'flex-start',
  },

  overviewColumn:       { width: '100%' },
  overviewColumnTablet: { flex: 1 },

  // ── Revenue Card ─────────────────────────────────────────────────────────
  revenueCard: {
    marginBottom: spacing.lg,
  },

  revenueHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.md,
  },

  revenueIconWrap: {
    width:          32,
    height:         32,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
  },

  sectionTitle: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: 0,
  },

  revenueRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },

  revenueItem:  { flex: 1 },

  revenueLabel: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.sm,
    marginBottom: spacing.xs,
  },

  revenueValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },

  revenueDivider: {
    width:   0.5,
    height:  44,
    opacity: 0.4,
  },

  // ── Quick Stats ──────────────────────────────────────────────────────────
  quickStatsContainer: {
    gap:          spacing.sm,
    marginBottom: spacing.lg,
  },

  quickStatCard: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },

  quickStatIcon: {
    width:          40,
    height:         40,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    spacing.md,
  },

  quickStatText: { flex: 1 },

  quickStatLabel: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.xs,
    marginBottom: 2,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  quickStatValue: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
  },

  quickStatArrow: { marginLeft: spacing.sm },

  // ── Section ──────────────────────────────────────────────────────────────
  section: { marginBottom: spacing.lg },

  sectionHeaderRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.md,
  },

  seeAllBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },

  seeAllText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  // ── Quick Actions ─────────────────────────────────────────────────────────
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
    marginTop:     spacing.sm,
  },

  quickActionButton:       { width: '48%'    },
  quickActionButtonTablet: { width: '23.5%'  },

  actionCard: {
    alignItems:      'center',
    paddingVertical: spacing.lg,
  },

  actionIconWrap: {
    width:          50,
    height:         50,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.md,
  },

  actionLabel: {
    fontFamily:  typography.fontFamily.semiBold,
    fontSize:    typography.fontSize.sm,
    textAlign:   'center',
    letterSpacing: typography.letterSpacing.wide,
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  paymentCard:   { marginBottom: spacing.sm },

  paymentRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },

  paymentDot: {
    width:        6,
    height:       6,
    borderRadius: radius.full,
    marginRight:  spacing.md,
    alignSelf:    'center',
  },

  paymentInfo:  { flex: 1 },

  paymentName: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: spacing.xs,
  },

  paymentRoom: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  paymentRight: { alignItems: 'flex-end' },

  paymentAmount: {
    fontFamily:   typography.fontFamily.bold,
    fontSize:     typography.fontSize.md,
    marginBottom: spacing.xs,
    letterSpacing: typography.letterSpacing.tight,
  },

  paymentDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },
});