import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Card from '@/components/Card';
import ArchivedResourcesModal from '@/components/ArchivedResourcesModal';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import {
  ChevronLeft,
  Crown,
  Building2,
  Users,
  MessageSquare,
  Check,
  Lock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Trash2,
  Power,
} from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { subscriptionService } from '@/services/apiClient';
import type { Subscription, Usage, ArchivedResourcesResponse, PlanMetadata } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';
import UpgradeModal from '@/components/UpgradeModal';

interface SubscriptionCachePayload {
  activeSubscription: Subscription | null;
  allSubscriptions: Subscription[];
  usage: Usage;
  allPlans: PlanMetadata[];
}

const SUBSCRIPTION_CACHE_STALE_MS = 2 * 60 * 1000;

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
  const [allPlans, setAllPlans] = useState<PlanMetadata[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showArchivedResources, setShowArchivedResources] = useState(false);
  const [archivedResources, setArchivedResources] = useState<ArchivedResourcesResponse | null>(null);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [autoRenewal, setAutoRenewal] = useState(true);
  const [togglingRenewal, setTogglingRenewal] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<{ [key: string]: number }>({});
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const lastFocusRefreshRef = useRef<number>(0);

  const formatPrice = (paise: number) => {
    if (paise === 0) return 'Free';
    const rupees = paise / 100;
    return `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getPeriodLabel = (period: number) => {
    if (period === 0) return 'Forever';
    if (period === 1) return '1 Month';
    return `${period} Months`;
  };

  const formatLimit = (value: number) => {
    return value === 999 ? 'Unlimited' : `${value}`;
  };

  const fetchSubscriptionData = async () => {
    if (isFetchingRef.current) {
      return;
    }

    const cacheKey = cacheKeys.subscription();
    const cachedData = getScreenCache<SubscriptionCachePayload>(cacheKey, SUBSCRIPTION_CACHE_STALE_MS);
    if (cachedData) {
      setActiveSubscription(cachedData.activeSubscription);
      setAllSubscriptions(cachedData.allSubscriptions);
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

      const [allSubsRes, usageRes, plansRes] = await Promise.all([
        subscriptionService.getAllSubscriptions(),
        subscriptionService.getUsage(),
        subscriptionService.getPlans(),
      ]);

      const allSubs = allSubsRes.data.subscriptions;
      const usageData = usageRes.data;
      const plans = plansRes.data.plans;

      // Find the active subscription
      const active = allSubs.find(sub => sub.status === 'active');
      
      setActiveSubscription(active || null);
      setAllSubscriptions(allSubs);
      setUsage(usageData);
      setAllPlans(plans);
      
      // Set auto-renewal status from active subscription
      if (active) {
        setAutoRenewal(active.autoRenewal !== false);
      }
      
      // Initialize selected periods for each plan (default to first period)
      const periods: { [key: string]: number } = {};
      plans.forEach(plan => {
        if (plan.periods && plan.periods.length > 0) {
          periods[plan.name] = plan.periods[0].period;
        }
      });
      setSelectedPeriods(periods);

      setScreenCache(cacheKey, {
        activeSubscription: active || null,
        allSubscriptions: allSubs,
        usage: usageData,
        allPlans: plans,
      });
    } catch (err: any) {
      console.error('Subscription fetch error:', err);
      const errorMessage = err?.message || 'Failed to load subscription data. Please try again.';
      setError(errorMessage);
      
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.status === 402) {
        setShowUpgradeModal(true);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastFocusRefreshRef.current;
      const shouldRefresh = timeSinceLastRefresh > SUBSCRIPTION_CACHE_STALE_MS;

      if (lastFocusRefreshRef.current === 0 || shouldRefresh) {
        lastFocusRefreshRef.current = now;
        fetchSubscriptionData();
      }
    }, [])
  );

  const handleRetry = () => {
    fetchSubscriptionData();
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSubscriptionData();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchArchivedResources = async () => {
    try {
      setLoadingArchived(true);
      const response = await subscriptionService.getArchivedResources();
      setArchivedResources(response.data);
      setShowArchivedResources(true);
    } catch (err: any) {
      console.error('Failed to fetch archived resources:', err);
      setError('Could not load archived resources');
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleSelectPlan = async (_planName: string) => {
    try {
      setLoading(true);

      setScreenCache(cacheKeys.subscription(), null);
      await fetchSubscriptionData();
      setError(null);

      await fetchArchivedResources();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to refresh subscription. Please try again.';
      setError(errorMessage);
      console.error('Failed to refresh subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoRenewal = async (enabled: boolean) => {
    try {
      setTogglingRenewal(true);
      const endpoint = enabled ? 'auto-renewal/enable' : 'auto-renewal/disable';
      await subscriptionService[enabled ? 'enableAutoRenewal' : 'disableAutoRenewal']();
      setAutoRenewal(enabled);
      Alert.alert(
        'Success',
        enabled 
          ? 'Auto-renewal enabled. Your subscription will renew automatically.'
          : 'Auto-renewal disabled. Your current subscription will expire after the period ends.'
      );
    } catch (err: any) {
      const errorMessage = err?.message || `Failed to ${enabled ? 'enable' : 'disable'} auto-renewal.`;
      Alert.alert('Error', errorMessage);
      setAutoRenewal(!enabled);
    } finally {
      setTogglingRenewal(false);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription?',
      'You will lose access to Pro/Premium features and downgrade to the free plan. This action cannot be undone.',
      [
        { text: 'Keep My Plan', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingSubscription(true);
              await subscriptionService.cancelSubscription();
              
              // Refresh subscription data
              setScreenCache(cacheKeys.subscription(), null);
              await fetchSubscriptionData();
              
              Alert.alert('Success', 'Subscription cancelled. You have been downgraded to the free plan.');
            } catch (err: any) {
              const errorMessage = err?.message || 'Failed to cancel subscription. Please try again.';
              Alert.alert('Error', errorMessage);
            } finally {
              setCancellingSubscription(false);
            }
          }
        }
      ]
    );
  };

  const handlePeriodChange = (planName: string, period: number) => {
    setSelectedPeriods(prev => ({ ...prev, [planName]: period }));
  };

  const handleUpgradePlan = async (planName: string) => {
    setUpgradingPlan(planName);
    setShowUpgradeModal(true);
    // The UpgradeModal will handle the actual upgrade
  };

  const currentPlan = activeSubscription?.plan || 'free';
  const isLocked = !!activeSubscription && !!usage && (
    usage.properties >= activeSubscription.propertyLimit ||
    usage.tenants >= activeSubscription.tenantLimit ||
    usage.rooms >= activeSubscription.roomLimit ||
    (usage.staff ?? 0) >= activeSubscription.staffLimit
  );

  const calculateProgressPercentage = (used: number, limit: number) => {
    if (limit === 999) return 10;
    return Math.min((used / limit) * 100, 100);
  };

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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Subscription & Billing</Text>
        <View style={styles.placeholder} />
      </View>

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
        {loading ? (
          <>
            <Skeleton height={120} count={1} />
            <View style={{ marginTop: spacing.lg }}>
              <Skeleton height={100} count={3} />
            </View>
          </>
        ) : error ? (
          <ApiErrorCard error={error} onRetry={handleRetry} />
        ) : activeSubscription && usage ? (
          <>
            <Card style={[styles.currentPlanCard, { borderColor: colors.primary[500], backgroundColor: colors.background.tertiary }]}>
              <View style={[styles.planBadge, { backgroundColor: colors.primary[500] }]}>
                <Crown size={20} color={colors.white} />
                <Text style={[styles.planBadgeText, { color: colors.white, fontWeight: typography.fontWeight.bold }]}>Current Plan</Text>
              </View>
              <Text style={[styles.currentPlanName, { color: colors.text.primary }]}>
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
              </Text>
              <Text style={[styles.currentPlanStatus, { color: colors.text.secondary }]}>
                Status: {activeSubscription.status}
              </Text>
              {activeSubscription.currentPeriodStart && activeSubscription.currentPeriodEnd && (
                <Text style={[styles.currentPlanPeriod, { color: colors.text.tertiary }]}>
                  Period: {new Date(activeSubscription.currentPeriodStart).toLocaleDateString()} - {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}
                </Text>
              )}
              <Text style={[styles.currentPlanPrice, { color: colors.text.primary }]}>
                {formatPrice(activeSubscription.price)}/month
              </Text>
            </Card>

            {currentPlan !== 'free' && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Subscription Settings</Text>

                <Card style={styles.settingsCard}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingContent}>
                      <View style={styles.settingHeader}>
                        <RefreshCw size={18} color={colors.primary[500]} />
                        <Text style={[styles.settingLabel, { color: colors.text.primary }]}>Auto-Renewal</Text>
                      </View>
                      <Text style={[styles.settingDescription, { color: colors.text.tertiary }]}>
                        {autoRenewal ? 'Your subscription will renew automatically' : 'Your subscription will expire after this period'}
                      </Text>
                    </View>
                    <Switch
                      value={autoRenewal}
                      onValueChange={handleToggleAutoRenewal}
                      disabled={togglingRenewal}
                      trackColor={{ false: colors.border.light, true: colors.primary[400] }}
                      thumbColor={autoRenewal ? colors.primary[500] : colors.neutral[400]}
                    />
                  </View>
                </Card>

                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: colors.danger[200], backgroundColor: colors.danger[50] }]}
                  onPress={handleCancelSubscription}
                  disabled={cancellingSubscription}
                  activeOpacity={0.7}>
                  {cancellingSubscription ? (
                    <ActivityIndicator size="small" color={colors.danger[600]} />
                  ) : (
                    <>
                      <Trash2 size={18} color={colors.danger[600]} />
                      <Text style={[styles.cancelButtonText, { color: colors.danger[600] }]}>Cancel Subscription</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Usage Limits</Text>

              <Card style={styles.limitCard}>
                <View style={styles.limitHeader}>
                  <View style={[styles.limitIcon, { backgroundColor: colors.background.tertiary }]}>
                    <Building2 size={20} color={colors.primary[500]} />
                  </View>
                  <View style={styles.limitInfo}>
                    <Text style={[styles.limitLabel, { color: colors.text.secondary }]}>Properties</Text>
                    <Text style={[styles.limitValue, { color: colors.text.primary }]}>
                      {usage.properties} / {formatLimit(activeSubscription.propertyLimit)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.neutral[200] }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${calculateProgressPercentage(usage.properties, activeSubscription.propertyLimit)}%`,
                        backgroundColor:
                          usage.properties > activeSubscription.propertyLimit
                            ? colors.danger[500]
                            : colors.primary[500],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.limitDescription, { color: colors.text.tertiary, display: 'none' }]}>
                  Total number of properties you can create
                </Text>
              </Card>

              <Card style={styles.limitCard}>
                <View style={styles.limitHeader}>
                  <View style={[styles.limitIcon, { backgroundColor: colors.background.tertiary }]}>
                    <Users size={20} color={colors.success[500]} />
                  </View>
                  <View style={styles.limitInfo}>
                    <Text style={[styles.limitLabel, { color: colors.text.secondary }]}>Tenants (per property)</Text>
                    <Text style={[styles.limitValue, { color: colors.text.primary }]}>
                      Max {formatLimit(activeSubscription.tenantLimit)} per property
                    </Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.neutral[200] }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${calculateProgressPercentage(usage.tenants, activeSubscription.tenantLimit)}%`,
                        backgroundColor:
                          usage.tenants > activeSubscription.tenantLimit
                            ? colors.danger[500]
                            : colors.success[500],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.limitDescription, { color: colors.text.tertiary, display: 'none' }]}>
                  Maximum tenants allowed per property (not total)
                </Text>
              </Card>

              <Card style={styles.limitCard}>
                <View style={styles.limitHeader}>
                  <View style={[styles.limitIcon, { backgroundColor: colors.background.tertiary }]}>
                    <MessageSquare size={20} color={colors.warning[500]} />
                  </View>
                  <View style={styles.limitInfo}>
                    <Text style={[styles.limitLabel, { color: colors.text.secondary }]}>Rooms (per property)</Text>
                    <Text style={[styles.limitValue, { color: colors.text.primary }]}>
                      Max {formatLimit(activeSubscription.roomLimit)} per property
                    </Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.neutral[200] }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${calculateProgressPercentage(usage.rooms, activeSubscription.roomLimit)}%`,
                        backgroundColor: colors.warning[500],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.limitDescription, { color: colors.text.tertiary, display: 'none' }]}>
                  Maximum rooms allowed per property (not total)
                </Text>
              </Card>

              <Card style={styles.limitCard}>
                <View style={styles.limitHeader}>
                  <View style={[styles.limitIcon, { backgroundColor: colors.background.tertiary }]}>
                    <Users size={20} color={colors.primary[500]} />
                  </View>
                  <View style={styles.limitInfo}>
                    <Text style={[styles.limitLabel, { color: colors.text.secondary }]}>Staff (per property)</Text>
                    <Text style={[styles.limitValue, { color: colors.text.primary }]}>
                      Max {formatLimit(activeSubscription.staffLimit)} per property
                    </Text>
                  </View>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.neutral[200] }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${calculateProgressPercentage(usage.staff ?? 0, activeSubscription.staffLimit)}%`,
                        backgroundColor: colors.primary[500],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.limitDescription, { color: colors.text.tertiary, display: 'none' }]}>
                  Maximum staff members allowed per property (not total)
                </Text>
              </Card>

              {isLocked && (
                <TouchableOpacity
                  style={[styles.upgradeButton, { backgroundColor: colors.primary[500] }]}
                  onPress={() => setShowUpgradeModal(true)}
                  activeOpacity={0.7}>
                  <Lock size={20} color={colors.white} />
                  <Text style={[styles.upgradeButtonText, { color: colors.white }]}>
                    Upgrade to Add More
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {currentPlan !== 'free' && archivedResources && (archivedResources.properties.length > 0 || archivedResources.rooms.length > 0 || archivedResources.tenants.length > 0) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Archived Resources</Text>
                <Card style={[styles.archivedCard, { borderLeftColor: colors.warning[500] }] as any}>
                  <View style={styles.archivedCardContent}>
                    <View style={styles.archivedInfo}>
                      <AlertTriangle size={20} color={colors.warning[500]} />
                      <View style={styles.archivedText}>
                        <Text style={[styles.archivedCount, { color: colors.text.primary }]}>
                          {archivedResources.total_archived} resource{archivedResources.total_archived !== 1 ? 's' : ''} archived
                        </Text>
                        <Text style={[styles.archivedSubtext, { color: colors.text.secondary }]}>
                          Recovery available for {archivedResources.grace_period_days} days
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={fetchArchivedResources}
                      activeOpacity={0.7}>
                      <ChevronRight size={20} color={colors.primary[500]} />
                    </TouchableOpacity>
                  </View>
                </Card>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Available Plans</Text>

              {allPlans.filter((plan) => plan.name !== currentPlan).map((plan) => {
                const selectedPeriod = selectedPeriods[plan.name] || (plan.periods && plan.periods.length > 0 ? plan.periods[0].period : 1);
                const periodData = plan.periods?.find(p => p.period === selectedPeriod);
                const price = periodData?.price || 0;
                
                return (
                  <Card key={plan.name} style={[styles.planCard, { borderColor: colors.border.light }]}>
                    <View style={styles.planHeader}>
                      <View style={styles.planNameContainer}>
                        <Text style={[styles.planName, { color: colors.text.primary }]}>
                          {plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}
                        </Text>
                        <View style={styles.planLimitsCompact}>
                          <Text style={[styles.limitBadge, { color: colors.text.tertiary }]}>
                            {plan.properties} {plan.properties === 1 ? 'property' : 'properties'}
                          </Text>
                          <Text style={[styles.limitSeparator, { color: colors.text.tertiary }]}>•</Text>
                          <Text style={[styles.limitBadge, { color: colors.text.tertiary }]}>
                            {plan.tenants} tenants
                          </Text>
                        </View>
                      </View>
                      
                      {plan.periods && plan.periods.length > 0 && (
                        <View style={styles.planPricing}>
                          <View style={[styles.periodSelector, { borderColor: colors.border.medium, backgroundColor: colors.background.tertiary }]}>
                            <TouchableOpacity
                              style={styles.periodDropdown}
                              onPress={() => {
                                // Show period selector modal or action sheet
                                const currentIndex = plan.periods.findIndex(p => p.period === selectedPeriod);
                                const nextIndex = (currentIndex + 1) % plan.periods.length;
                                handlePeriodChange(plan.name, plan.periods[nextIndex].period);
                              }}
                              activeOpacity={0.7}>
                              <Text style={[styles.periodText, { color: colors.text.primary }]}>
                                {getPeriodLabel(selectedPeriod)}
                              </Text>
                              <ChevronDown size={16} color={colors.text.secondary} />
                            </TouchableOpacity>
                          </View>
                          <Text style={[styles.planPrice, { color: colors.primary[500] }]}>
                            {formatPrice(price)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.upgradeButton, { backgroundColor: colors.primary[500] }]}
                      onPress={() => handleUpgradePlan(plan.name)}
                      activeOpacity={0.8}>
                      <Text style={[styles.upgradeButtonText, { color: colors.white }]}>Upgrade Now</Text>
                      <ChevronRight size={18} color={colors.white} />
                    </TouchableOpacity>
                  </Card>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => {
          setShowUpgradeModal(false);
          setUpgradingPlan(null);
        }}
        onSelectPlan={handleSelectPlan}
        subscriptions={allSubscriptions}
      />

      <ArchivedResourcesModal
        visible={showArchivedResources}
        archivedData={archivedResources}
        loading={loadingArchived}
        onClose={() => setShowArchivedResources(false)}
        onUpgrade={() => {
          setShowArchivedResources(false);
          setShowUpgradeModal(true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  placeholder: {
    width: 40,
  },
  currentPlanCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.lg,
  },
  planBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  currentPlanName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  currentPlanStatus: {
    fontSize: typography.fontSize.md,
    marginBottom: spacing.xs,
  },
  currentPlanPeriod: {
    fontSize: typography.fontSize.sm,
  },
  currentPlanPrice: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  limitCard: {
    marginBottom: spacing.sm,
  },
  limitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    height: 44,
  },
  limitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  limitInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  limitLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  limitValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  progressBar: {
    height: 8,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  limitDescription: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    ...shadows.md,
  },
  upgradeButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginRight: spacing.xs,
  },
  planCard: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  planHeader: {
    marginBottom: spacing.md,
  },
  planNameContainer: {
    marginBottom: spacing.md,
  },
  planName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  planLimitsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  limitBadge: {
    fontSize: typography.fontSize.xs,
  },
  limitSeparator: {
    fontSize: typography.fontSize.xs,
    marginHorizontal: spacing.xs,
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodSelector: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  periodDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  periodText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  planPrice: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  comparisonCardWrapper: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  comparisonCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  comparisonCardBlurred: {
    opacity: 0.4,
  },
  comparisonCardPopular: {
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  lockedContent: {
    alignItems: 'center',
  },
  lockedText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  popularBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  comparisonPlanName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  comparisonPrice: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
  },
  featuresContainer: {
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    height: 24,
  },
  featureText: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  currentBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  currentBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  archivedCard: {
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  archivedCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  archivedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 32,
  },
  archivedText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  archivedCount: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  archivedSubtext: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  pricingContainer: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  pricingTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.md,
  },
  pricingGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  priceCard: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  priceCardPeriod: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs,
  },
  priceCardPrice: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  priceCardMonthly: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  settingsCard: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  settingLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.sm,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    lineHeight: 16,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cancelButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});