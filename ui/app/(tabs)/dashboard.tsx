import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import PropertySwitcher from '@/components/PropertySwitcher';
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
  ArrowUpRight,
  Zap,
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

const DASHBOARD_CACHE_STALE_MS = 60 * 1000;
const MAX_ERROR_MESSAGE_LENGTH = 220;

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

// ── Animated Occupancy Bar ────────────────────────────────────────────────────
function OccupancyBar({ rate, fillColor, trackColor }: {
  rate: number;
  fillColor: string;
  trackColor: string;
}) {
  const animWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: rate,
      duration: 900,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [rate]);

  return (
    <View style={[occStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          occStyles.fill,
          {
            backgroundColor: fillColor,
            width: animWidth.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}
const occStyles = StyleSheet.create({
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  fill:  { height: '100%', borderRadius: 2 },
});

// ── Pulse Dot ─────────────────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.7, duration: 850, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 850, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 10, height: 10, borderRadius: 5,
        backgroundColor: color, opacity, transform: [{ scale }],
      }} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { isTablet, isLandscape, contentMaxWidth } = useResponsiveLayout();
  const isTabletLandscape = isTablet && isLandscape;
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();

  const initialDashboardData = (() => {
    if (!selectedPropertyId) return null;
    return getScreenCache<DashboardData>(cacheKeys.dashboard(selectedPropertyId), DASHBOARD_CACHE_STALE_MS);
  })();

  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(initialDashboardData);

  const lastFocusRefreshRef = useRef<number>(Date.now());
  const isFetchingRef       = useRef(false);
  const hasDashboardDataRef = useRef(Boolean(initialDashboardData));

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

      const [statsRes, dueRes] = await Promise.all([
        dashboardService.getStats(selectedPropertyId),
        paymentService.getPayments(selectedPropertyId, {
          status: 'due', page: 1, pageSize: 5,
          endDate: toDateOnly(cutoff),
        }),
      ]);

      const stats = statsRes.data || {
        totalTenants: 0, activeTenants: 0, vacatedTenants: 0,
        totalBeds: 0, occupiedBeds: 0, availableBeds: 0, occupancyRate: 0,
        monthlyRevenue: 0, monthlyRevenueFormatted: '₹0',
        pendingPayments: 0, duePaymentAmount: 0, duePaymentAmountFormatted: '₹0',
        paidThisMonth: 0,
        checkInsToday: 0,
        totalStaff: 0, availableStaff: 0,
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
      if (!getScreenCache<DashboardData>(cacheKey, DASHBOARD_CACHE_STALE_MS)) fetchDashboardData();
    }
  }, [selectedPropertyId, propertyLoading, fetchDashboardData]);

  const handleRetry   = () => fetchDashboardData();
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

  // ── Derived values ──────────────────────────────────────────────────────
  const occupancyRate      = dashboardData?.stats.occupancyRate || 0;
  const monthlyRevenueText = dashboardData?.stats.monthlyRevenueFormatted
    || formatINRCurrency(dashboardData?.stats.monthlyRevenue);
  const pendingAmountText  = dashboardData?.stats.duePaymentAmountFormatted
    || formatINRCurrency(dashboardData?.stats.duePaymentAmount);
  // paidThisMonth is a number on DashboardStats — format it directly (no Formatted variant)
  const paidThisMonthText  = formatINRCurrency(dashboardData?.stats.paidThisMonth);

  // ── Semantic color aliases (all from theme — zero hardcoded hex) ─────────
  const brandColor       = colors.primary[500];
  const brandLight       = isDark ? colors.primary[900] : colors.primary[50];
  const brandIconColor   = isDark ? colors.primary[300] : colors.primary[500];

  const successColor      = colors.success[500];
  const successLight      = isDark ? colors.success[900] : colors.success[50];
  const successIconColor  = isDark ? colors.success[300] : colors.success[500];

  const warningColor      = colors.warning[500];
  const warningLight      = isDark ? colors.warning[900] : colors.warning[50];
  const warningIconColor  = isDark ? colors.warning[300] : colors.warning[500];

  const purpleLight       = isDark ? colors.purple[900]  : colors.purple[50];
  const purpleIconColor   = isDark ? colors.purple[300]  : colors.purple[500];

  const pageBg        = colors.background.primary;
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  // ── Quick actions config ─────────────────────────────────────────────────
  const quickActions = [
    { icon: Users,       label: 'Add Tenant',  route: '/add-tenant',     color: brandIconColor,   bg: brandLight   },
    { icon: IndianRupee, label: 'Add Payment', route: '/manual-payment', color: successIconColor, bg: successLight },
    { icon: Building2,   label: 'Rooms',       route: '/manage-rooms',   color: purpleIconColor,  bg: purpleLight  },
    { icon: Wrench,      label: 'Staff',       route: '/manage-staff',   color: warningIconColor, bg: warningLight },
  ];

  // ── Header block ─────────────────────────────────────────────────────────
  const HeaderBlock = () => (
    <View style={styles.header}>
      <View>
        <Text style={[styles.greeting, { color: textSecondary }]}>Good morning,</Text>
        <Text style={[styles.ownerName, { color: textPrimary }]}>
          {user?.name || 'Property Owner'}
        </Text>
      </View>
      <View style={[styles.liveChip, {
        backgroundColor: successLight,
        borderColor:     isDark ? colors.success[800] : colors.success[200],
      }]}>
        <PulseDot color={successColor} />
        <Text style={[styles.liveText, { color: successColor }]}>Live</Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={['top']}>
      <PropertySwitcher />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { backgroundColor: pageBg },
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[brandColor]}
            tintColor={brandColor}
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

                {/* ── Hero Revenue Card ─────────────────────────────────── */}
                <View style={[styles.heroCard, { backgroundColor: brandColor }]}>
                  <View style={styles.heroCircle1} />
                  <View style={styles.heroCircle2} />

                  <View style={styles.heroTop}>
                    <Text style={styles.heroLabel}>Monthly Revenue</Text>
                    <View style={styles.heroBadge}>
                      <TrendingUp size={12} color={colors.white} />
                      <Text style={styles.heroBadgeText}>This month</Text>
                    </View>
                  </View>

                  <Text style={styles.heroAmount}>{monthlyRevenueText}</Text>

                  <View style={[styles.heroDivider, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />

                  <View style={styles.heroRow}>
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatLabel}>Collected</Text>
                      <Text style={styles.heroStatValue}>{paidThisMonthText}</Text>
                    </View>
                    <View style={[styles.heroVertDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatLabel}>Pending</Text>
                      <Text style={[styles.heroStatValue, { color: colors.warning[200] }]}>
                        {pendingAmountText}
                      </Text>
                    </View>
                    <View style={[styles.heroVertDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatLabel}>Due Count</Text>
                      <Text style={[styles.heroStatValue, { color: colors.danger[200] }]}>
                        {dashboardData?.stats.pendingPayments || 0}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ── KPI Row ───────────────────────────────────────────── */}
                <View style={styles.kpiRow}>

                  {/* Occupancy */}
                  <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: cardBorder, flex: 1.2 }]}>
                    <View style={styles.kpiTop}>
                      <View style={[styles.kpiIconBox, { backgroundColor: brandLight }]}>
                        <Bed size={14} color={brandIconColor} />
                      </View>
                      <Text style={[styles.kpiSupLabel, { color: textSecondary }]}>Occupancy</Text>
                    </View>
                    <Text style={[styles.kpiValue, { color: textPrimary }]}>{occupancyRate}%</Text>
                    <OccupancyBar
                      rate={occupancyRate}
                      fillColor={brandColor}
                      trackColor={isDark ? colors.primary[800] : colors.primary[100]}
                    />
                    <Text style={[styles.kpiBed, { color: textTertiary }]}>
                      {dashboardData?.stats.occupiedBeds || 0}/{dashboardData?.stats.totalBeds || 0} beds
                    </Text>
                  </View>

                  {/* Active Tenants */}
                  <TouchableOpacity
                    style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
                    onPress={() => router.push('/tenants')}
                    activeOpacity={0.75}>
                    <View style={styles.kpiTop}>
                      <View style={[styles.kpiIconBox, { backgroundColor: successLight }]}>
                        <Users size={14} color={successIconColor} />
                      </View>
                      <ArrowUpRight size={13} color={textTertiary} />
                    </View>
                    <Text style={[styles.kpiValue, { color: textPrimary }]}>
                      {dashboardData?.stats.activeTenants || 0}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: textSecondary }]}>Active</Text>
                    {(dashboardData?.stats.vacatedTenants || 0) > 0 && (
                      <View style={[styles.kpiChip, { backgroundColor: warningLight }]}>
                        <Text style={[styles.kpiChipText, { color: warningColor }]}>
                          {dashboardData?.stats.vacatedTenants} vacated
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Due Payments */}
                  <TouchableOpacity
                    style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
                    onPress={() => router.push('/payments')}
                    activeOpacity={0.75}>
                    <View style={styles.kpiTop}>
                      <View style={[styles.kpiIconBox, { backgroundColor: warningLight }]}>
                        <AlertCircle size={14} color={warningIconColor} />
                      </View>
                      <ArrowUpRight size={13} color={textTertiary} />
                    </View>
                    <Text style={[styles.kpiValue, { color: textPrimary }]}>
                      {dashboardData?.stats.pendingPayments || 0}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: textSecondary }]}>Due</Text>
                  </TouchableOpacity>

                </View>

                {/* ── Secondary Stats Row ───────────────────────────────── */}
                <View style={styles.secondaryRow}>

                  <View style={[styles.secondaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={[styles.secondaryIconWrap, { backgroundColor: successLight }]}>
                      <LogIn size={15} color={successIconColor} />
                    </View>
                    <Text style={[styles.secondaryValue, { color: textPrimary }]}>
                      {dashboardData?.stats.checkInsToday || 0}
                    </Text>
                    <Text style={[styles.secondaryLabel, { color: textSecondary }]}>Check-ins{'\n'}Today</Text>
                  </View>

                  <View style={[styles.secondaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={[styles.secondaryIconWrap, { backgroundColor: purpleLight }]}>
                      <Users size={15} color={purpleIconColor} />
                    </View>
                    <Text style={[styles.secondaryValue, { color: textPrimary }]}>
                      {dashboardData?.stats.availableStaff || 0}
                      <Text style={[styles.secondaryDenom, { color: textTertiary }]}>
                        /{dashboardData?.stats.totalStaff || 0}
                      </Text>
                    </Text>
                    <Text style={[styles.secondaryLabel, { color: textSecondary }]}>Staff{'\n'}Available</Text>
                  </View>



                </View>

                {/* ── Quick Actions ─────────────────────────────────────── */}
                <View style={styles.section}>
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionTitleRow}>
                      <Zap size={14} color={brandColor} />
                      <Text style={[styles.sectionTitle, { color: textPrimary }]}>Quick Actions</Text>
                    </View>
                  </View>
                  <View style={styles.actionsGrid}>
                    {quickActions.map((action, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.actionBtn,
                          { backgroundColor: cardBg, borderColor: cardBorder },
                          isTabletLandscape && styles.actionBtnTablet,
                        ]}
                        onPress={() => router.push(action.route as any)}
                        activeOpacity={0.72}>
                        <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
                          <action.icon size={20} color={action.color} />
                        </View>
                        <Text style={[styles.actionLabel, { color: textPrimary }]}>{action.label}</Text>
                        <ArrowUpRight size={13} color={textTertiary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Overdue Payments ─────────────────────────────────── */}
                {dashboardData && dashboardData.duePayments.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionRow}>
                      <View style={styles.sectionTitleRow}>
                        <Clock size={14} color={warningColor} />
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Overdue (5+ days)</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push('/payments')}
                        activeOpacity={0.7}
                        style={styles.seeAllBtn}>
                        <Text style={[styles.seeAllText, { color: brandColor }]}>See all</Text>
                        <ArrowRight size={13} color={brandColor} />
                      </TouchableOpacity>
                    </View>

                    {dashboardData.duePayments.map((payment, idx) => (
                      <View
                        key={payment.id}
                        style={[
                          styles.paymentRow,
                          { backgroundColor: cardBg, borderColor: cardBorder },
                          idx === dashboardData.duePayments.length - 1 && { marginBottom: 0 },
                        ]}>
                        <View style={[styles.paymentAccent, { backgroundColor: warningColor }]} />
                        <View style={styles.paymentBody}>
                          <View style={styles.paymentLeft}>
                            <Text
                              style={[styles.paymentName, { color: textPrimary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              {payment.tenantName || 'Unknown Tenant'}
                            </Text>
                            <Text
                              style={[styles.paymentRoom, { color: textSecondary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              Room {payment.roomNumber || 'N/A'}
                            </Text>
                          </View>
                          <View style={styles.paymentRight}>
                            <Text
                              style={[styles.paymentAmount, { color: textPrimary }]}
                              numberOfLines={1} ellipsizeMode="tail">
                              {payment.amount}
                            </Text>
                            <View style={[styles.dueDateChip, { backgroundColor: warningLight }]}>
                              <Text
                                style={[styles.dueDateText, { color: warningColor }]}
                                numberOfLines={1}>
                                {payment.dueDate}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
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
    paddingTop:     spacing.lg,
    paddingBottom:  spacing.md,
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  greeting: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.sm,
    marginBottom: 2,
  },
  ownerName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },
  liveChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: spacing.sm,
    paddingVertical:   6,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  liveText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  // ── Hero Revenue Card ─────────────────────────────────────────────────────
  heroCard: {
    borderRadius: radius.xl,
    padding:      spacing.lg,
    marginBottom: spacing.md,
    overflow:     'hidden',
    position:     'relative',
  },
  heroCircle1: {
    position:        'absolute',
    width:           170,
    height:          170,
    borderRadius:    85,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top:    -50,
    right:  -35,
  },
  heroCircle2: {
    position:        'absolute',
    width:           110,
    height:          110,
    borderRadius:    55,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -25,
    left:    16,
  },
  heroTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.xs,
  },
  heroLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
    color:      'rgba(255,255,255,0.72)',
  },
  heroBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
  },
  heroBadgeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.xs,
    color:      'rgba(255,255,255,0.9)',
  },
  heroAmount: {
    fontFamily:     typography.fontFamily.bold,
    fontSize:       typography.fontSize.display,
    color:          '#FFFFFF',
    letterSpacing:  typography.letterSpacing.tight,
    marginVertical: spacing.sm,
  },
  heroDivider: {
    height:         1,
    marginVertical: spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  heroStat: { flex: 1 },
  heroStatLabel: {
    fontFamily:    typography.fontFamily.regular,
    fontSize:      typography.fontSize.xs,
    color:         'rgba(255,255,255,0.58)',
    marginBottom:  2,
    letterSpacing: typography.letterSpacing.wide,
  },
  heroStatValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    color:         '#FFFFFF',
    letterSpacing: typography.letterSpacing.tight,
  },
  heroVertDivider: {
    width:            1,
    height:           36,
    marginHorizontal: spacing.sm,
  },

  // ── KPI Row ───────────────────────────────────────────────────────────────
  kpiRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  kpiCard: {
    flex:          1,
    borderRadius:  radius.lg,
    borderWidth:   1,
    padding:       spacing.md,
  },
  kpiTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.sm,
  },
  kpiIconBox: {
    width:          30,
    height:         30,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  kpiSupLabel: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
  },
  kpiLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
    marginTop:  2,
  },
  kpiValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
  },
  kpiBed: {
    fontFamily:    typography.fontFamily.regular,
    fontSize:      10,
    marginTop:     4,
    letterSpacing: typography.letterSpacing.wide,
  },
  kpiChip: {
    alignSelf:         'flex-start',
    marginTop:         spacing.xs,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.sm,
  },
  kpiChipText: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      10,
    letterSpacing: typography.letterSpacing.wide,
  },

  // ── Secondary Row ─────────────────────────────────────────────────────────
  secondaryRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.lg,
    marginTop:     spacing.sm,
  },
  secondaryCard: {
    flex:              1,
    borderRadius:      radius.lg,
    borderWidth:       1,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems:        'center',
    position:          'relative',
  },
  secondaryIconWrap: {
    width:          34,
    height:         34,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.xs,
  },
  secondaryValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  secondaryDenom: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },
  secondaryLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   9,
    textAlign:  'center',
    marginTop:  2,
    lineHeight: 13,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: { marginBottom: spacing.lg },
  sectionRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  sectionTitle: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.normal,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
  },
  seeAllText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  // ── Quick Actions ─────────────────────────────────────────────────────────
  actionsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  actionBtn: {
    width:         '48%',
    borderRadius:  radius.lg,
    borderWidth:   1,
    padding:       spacing.md,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  actionBtnTablet: { width: '23.5%' },
  actionIcon: {
    width:          42,
    height:         42,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex:          1,
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.normal,
  },

  // ── Overdue Payment Rows ──────────────────────────────────────────────────
  paymentRow: {
    flexDirection:  'row',
    alignItems:     'stretch',
    borderRadius:   radius.lg,
    borderWidth:    1,
    marginBottom:   spacing.sm,
    overflow:       'hidden',
  },
  paymentAccent: { width: 3 },
  paymentBody: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },
  paymentLeft:  { flex: 1 },
  paymentName: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
  },
  paymentRoom: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },
  paymentRight: { alignItems: 'flex-end', gap: 4 },
  paymentAmount: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },
  dueDateChip: {
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderRadius:      radius.sm,
  },
  dueDateText: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      10,
    letterSpacing: typography.letterSpacing.wide,
  },
});