import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  Crown,
  Building2,
  Users,
  Bed,
  CreditCard,
  Gem,
  Trophy,
  ArrowRight,
  AlertCircle,
} from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { subscriptionService } from '@/services/apiClient';
import type { Subscription, Usage, PlanMetadata } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';
import UpgradeModal from '@/components/UpgradeModal';

interface SubscriptionCachePayload {
  activeSubscription: Subscription | null;
  usage: Usage;
  allPlans: PlanMetadata[];
}

const SUBSCRIPTION_CACHE_STALE_MS = 2 * 60 * 1000;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PLAN_THEMES: Record<string, { borderColor: string; iconBg: string; accentColor: string; icon: any }> = {
  free: { borderColor: '#94A3B8', iconBg: '#E2E8F0', accentColor: '#64748B', icon: Crown },
  pro: { borderColor: '#6366F1', iconBg: '#EEF2FF', accentColor: '#6366F1', icon: Trophy },
  premium: { borderColor: '#8B5CF6', iconBg: '#F3E8FF', accentColor: '#8B5CF6', icon: Gem },
};

const getPlanTheme = (planName: string) => {
  const name = planName.toLowerCase();
  if (name.includes('premium')) return PLAN_THEMES.premium;
  if (name.includes('pro')) return PLAN_THEMES.pro;
  return PLAN_THEMES.free;
};

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<PlanMetadata[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isFetchingRef = useRef(false);
  const lastFocusRefreshRef = useRef<number>(0);

  const fetchSubscriptionData = async () => {
    if (isFetchingRef.current) return;

    const cacheKey = cacheKeys.subscription();
    const cachedData = getScreenCache<SubscriptionCachePayload>(cacheKey, SUBSCRIPTION_CACHE_STALE_MS);
    if (cachedData) {
      setActiveSubscription(cachedData.activeSubscription);
      setUsage(cachedData.usage);
      setAllPlans(cachedData.allPlans);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const [subRes, usageRes, plansRes] = await Promise.all([
        subscriptionService.getAllSubscriptions(),
        subscriptionService.getUsage(),
        subscriptionService.getPlans(),
      ]);

      const active = subRes.data.subscriptions.find(s => s.status === 'active');
      setActiveSubscription(active || null);
      setUsage(usageRes.data);
      setAllPlans(plansRes.data.plans);

      setScreenCache(cacheKey, {
        activeSubscription: active || null,
        usage: usageRes.data,
        allPlans: plansRes.data.plans,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (lastFocusRefreshRef.current === 0 || now - lastFocusRefreshRef.current > SUBSCRIPTION_CACHE_STALE_MS) {
        lastFocusRefreshRef.current = now;
        fetchSubscriptionData();
      }
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSubscriptionData();
    setRefreshing(false);
  };

  const currentPlan = activeSubscription?.plan || 'free';
  const isPaidPlan = currentPlan !== 'free';

  const formatPrice = (paise: number) => {
    if (paise === 0) return 'Free';
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const getProgressColor = (used: number, limit: number) => {
    if (limit === 999) return colors.success[500];
    const pct = (used / limit) * 100;
    if (pct >= 90) return colors.danger[500];
    if (pct >= 70) return colors.warning[500];
    return colors.success[500];
  };

  const getProgressWidth = (used: number, limit: number) => {
    if (limit === 999) return 15;
    return Math.min((used / limit) * 100, 100);
  };

  const renderPlanPage = (plan: PlanMetadata, index: number) => {
    const theme = getPlanTheme(plan.name);
    const isCurrent = plan.name.toLowerCase() === currentPlan.toLowerCase();
    const planDisplayName = plan.display_name || plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
    const PlanIcon = theme.icon;

    return (
      <View 
        key={plan.name} 
        style={[
          styles.pageContainer,
          { 
            backgroundColor: colors.background.secondary,
            borderColor: theme.borderColor,
            borderWidth: 2,
          },
        ]}
      >
        {/* Notebook binding holes */}
        <View style={styles.bindingHoles}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.bindingHole, { backgroundColor: colors.background.primary, borderColor: colors.neutral[400] }]} />
          ))}
        </View>

        {/* Page content */}
        <View style={styles.pageContent}>
          {/* Plan header */}
          <View style={styles.planHeaderSection}>
            <View style={[styles.planIconContainer, { backgroundColor: theme.iconBg }]}>
              <PlanIcon size={32} color={theme.borderColor} />
            </View>
            <Text style={[styles.planPageTitle, { color: colors.text.primary }]}>
              {planDisplayName}
            </Text>
            {isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: theme.borderColor }]}>
                <Text style={[styles.currentBadgeText, { color: colors.white }]}>Current</Text>
              </View>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceSection}>
            <Text style={[styles.priceLarge, { color: theme.borderColor }]}>
              {formatPrice(plan.periods?.[0]?.price || 0)}
            </Text>
            <Text style={[styles.pricePeriod, { color: colors.text.secondary }]}>
              /month
            </Text>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <View style={styles.featureRow}>
              <Building2 size={18} color={theme.borderColor} />
              <Text style={[styles.featureText, { color: colors.text.primary }]}>
                {plan.properties} {plan.properties === 1 ? 'Property' : 'Properties'}
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Users size={18} color={theme.borderColor} />
              <Text style={[styles.featureText, { color: colors.text.primary }]}>
                {plan.tenants} Tenants per property
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Bed size={18} color={theme.borderColor} />
              <Text style={[styles.featureText, { color: colors.text.primary }]}>
                {plan.rooms} Rooms per property
              </Text>
            </View>
            <View style={styles.featureRow}>
              <CreditCard size={18} color={theme.borderColor} />
              <Text style={[styles.featureText, { color: colors.text.primary }]}>
                {plan.staff} Staff per property
              </Text>
            </View>
          </View>

          {/* Action button */}
          {isCurrent ? (
            <View style={[styles.currentPlanButton, { backgroundColor: colors.neutral[100] }]}>
              <Text style={[styles.currentPlanButtonText, { color: colors.text.secondary }]}>
                Current Plan
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.selectButton, { backgroundColor: theme.borderColor }]}
              onPress={() => setShowUpgradeModal(true)}
              activeOpacity={0.8}>
              <Text style={[styles.selectButtonText, { color: colors.white }]}>
                {plan.periods?.[0]?.price ? 'Upgrade' : 'Select'}
              </Text>
              <ArrowRight size={18} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Subscription Plans</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary[500]]} />
        }>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[500]} />
          </View>
        ) : error ? (
          <TouchableOpacity style={[styles.errorCard, { backgroundColor: colors.danger[50] }]} onPress={fetchSubscriptionData}>
            <AlertCircle size={20} color={colors.danger[500]} />
            <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Notebook-style pages - side by side */}
            <View style={styles.notebookContainer}>
              {/* Pages side by side */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pagesScrollContent}
                pagingEnabled
                decelerationRate="fast"
                snapToInterval={SCREEN_WIDTH - 80}
              >
                {allPlans.map((plan, index) => renderPlanPage(plan, index))}
              </ScrollView>
            </View>

            {/* Usage Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Current Usage</Text>
              
              <View style={styles.usageGrid}>
                <View style={[styles.usageCard, { backgroundColor: colors.background.secondary }]}>
                  <Building2 size={20} color={colors.primary[500]} />
                  <Text style={[styles.usageValue, { color: colors.text.primary }]}>{usage?.properties || 0}</Text>
                  <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Properties</Text>
                  <View style={[styles.progressBg, { backgroundColor: colors.neutral[200] }]}>
                    <View style={[styles.progressFill, { 
                      width: `${getProgressWidth(usage?.properties || 0, activeSubscription?.propertyLimit || 0)}%`,
                      backgroundColor: getProgressColor(usage?.properties || 0, activeSubscription?.propertyLimit || 0),
                    }]} />
                  </View>
                  <Text style={[styles.usageLimit, { color: colors.text.tertiary }]}>
                    of {activeSubscription?.propertyLimit || 0}
                  </Text>
                </View>

                <View style={[styles.usageCard, { backgroundColor: colors.background.secondary }]}>
                  <Users size={20} color={colors.success[500]} />
                  <Text style={[styles.usageValue, { color: colors.text.primary }]}>{usage?.tenants || 0}</Text>
                  <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Tenants</Text>
                  <View style={[styles.progressBg, { backgroundColor: colors.neutral[200] }]}>
                    <View style={[styles.progressFill, { 
                      width: `${getProgressWidth(usage?.tenants || 0, activeSubscription?.tenantLimit || 0)}%`,
                      backgroundColor: getProgressColor(usage?.tenants || 0, activeSubscription?.tenantLimit || 0),
                    }]} />
                  </View>
                  <Text style={[styles.usageLimit, { color: colors.text.tertiary }]}>
                    of {activeSubscription?.tenantLimit || 0} per property
                  </Text>
                </View>

                <View style={[styles.usageCard, { backgroundColor: colors.background.secondary }]}>
                  <Bed size={20} color={colors.warning[500]} />
                  <Text style={[styles.usageValue, { color: colors.text.primary }]}>{usage?.rooms || 0}</Text>
                  <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Rooms</Text>
                  <View style={[styles.progressBg, { backgroundColor: colors.neutral[200] }]}>
                    <View style={[styles.progressFill, { 
                      width: `${getProgressWidth(usage?.rooms || 0, activeSubscription?.roomLimit || 0)}%`,
                      backgroundColor: getProgressColor(usage?.rooms || 0, activeSubscription?.roomLimit || 0),
                    }]} />
                  </View>
                  <Text style={[styles.usageLimit, { color: colors.text.tertiary }]}>
                    of {activeSubscription?.roomLimit || 0} per property
                  </Text>
                </View>

                <View style={[styles.usageCard, { backgroundColor: colors.background.secondary }]}>
                  <CreditCard size={20} color={colors.primary[500]} />
                  <Text style={[styles.usageValue, { color: colors.text.primary }]}>{usage?.staff || 0}</Text>
                  <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Staff</Text>
                  <View style={[styles.progressBg, { backgroundColor: colors.neutral[200] }]}>
                    <View style={[styles.progressFill, { 
                      width: `${getProgressWidth(usage?.staff || 0, activeSubscription?.staffLimit || 0)}%`,
                      backgroundColor: getProgressColor(usage?.staff || 0, activeSubscription?.staffLimit || 0),
                    }]} />
                  </View>
                  <Text style={[styles.usageLimit, { color: colors.text.tertiary }]}>
                    of {activeSubscription?.staffLimit || 0} per property
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => {
          setShowUpgradeModal(false);
          fetchSubscriptionData();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  
  // Notebook style
  notebookContainer: {
    marginBottom: spacing.xl,
  },
  pagesScrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  pageContainer: {
    width: SCREEN_WIDTH - 100,
    minHeight: 340,
    borderRadius: radius.lg,
    marginRight: spacing.md,
    ...shadows.md,
  },
  bindingHoles: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'space-evenly',
    paddingVertical: spacing.xl,
  },
  bindingHole: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  pageContent: {
    padding: spacing.lg,
    paddingLeft: spacing.xl,
  },
  planHeaderSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  planIconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  planPageTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  currentBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  currentBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  priceLarge: {
    fontSize: 36,
    fontWeight: typography.fontWeight.bold,
  },
  pricePeriod: {
    fontSize: typography.fontSize.md,
    marginLeft: spacing.xs,
  },
  featuresSection: {
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  featureText: {
    fontSize: typography.fontSize.sm,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  selectButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  currentPlanButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  currentPlanButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  
  // Usage Section
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  usageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  usageCard: {
    width: '48%',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  usageValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
  },
  usageLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.sm,
  },
  progressBg: {
    width: '100%',
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  usageLimit: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
