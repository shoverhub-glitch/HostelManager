import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import Card from '@/components/Card';
import Skeleton from '@/components/Skeleton';
import { Crown, Building2, Users, ArrowRight } from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { subscriptionService } from '@/services/apiClient';
import type { Subscription, Usage } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';

const SUBSCRIPTION_CACHE_STALE_MS = 60 * 1000;

interface SubscriptionCardCachePayload {
  activeSubscription: Subscription | null;
  usage: Usage;
}

export default function SubscriptionSummaryCard() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(false);

  // Lazy load when component is likely to be visible
  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 500); // Delay load by 500ms to let critical content render first

    return () => clearTimeout(timer);
  }, []);

  // Fetch subscription data only when shouldLoad is true
  useEffect(() => {
    if (!shouldLoad) return;

    fetchSubscriptionData();
  }, [shouldLoad]);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);

      const cacheKey = cacheKeys.subscription();
      const cachedData = getScreenCache<SubscriptionCardCachePayload>(cacheKey, SUBSCRIPTION_CACHE_STALE_MS);

      if (cachedData) {
        setSubscription(cachedData.activeSubscription);
        setUsage(cachedData.usage);
        setLoading(false);
        return;
      }

      const [allSubsRes, usageRes] = await Promise.all([
        subscriptionService.getAllSubscriptions(),
        subscriptionService.getUsage(),
      ]);

      const activeSubscription =
        allSubsRes.data.subscriptions.find((sub) => sub.status === 'active') || null;

      setSubscription(activeSubscription);
      setUsage(usageRes.data);

      // Cache the result
      setScreenCache(cacheKey, {
        activeSubscription,
        usage: usageRes.data,
      });
    } catch (error) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const formatPlanName = (plan: string) => {
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const formatPrice = (paise: number) => {
    if (paise === 0) return 'Free';
    const rupees = paise / 100;
    return `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatLimit = (value: number) => {
    return value === 999 ? '∞' : value;
  };

  const calculateProgressPercentage = (used: number, limit: number) => {
    if (limit === 999) return 10;
    return Math.min((used / limit) * 100, 100);
  };

  if (loading || !subscription || !usage) {
    return (
      <Card style={styles.card}>
        <View style={styles.skeletonContainer}>
          <Skeleton height={80} count={3} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.planBadge, { backgroundColor: isDark ? colors.warning[900] : colors.warning[50] }]}>
          <Crown size={16} color={isDark ? colors.warning[400] : colors.warning[600]} />
          <Text style={[styles.planText, { color: isDark ? colors.warning[200] : colors.warning[700] }]}>
            {formatPlanName(subscription.plan)} Plan
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/subscription')}
          activeOpacity={0.7}
          style={styles.viewButton}>
          <Text style={[styles.viewButtonText, { color: colors.primary[600] }]}>View</Text>
          <ArrowRight size={14} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.planMetaText, { color: colors.text.primary }]}>
        {formatPrice(subscription.price)}{subscription.price > 0 ? '/month' : ''}
      </Text>
      {subscription.currentPeriodStart && subscription.currentPeriodEnd && (
        <Text style={[styles.planPeriodText, { color: colors.text.secondary }]}>
          {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </Text>
      )}

      <View style={styles.usageSection}>
        <View style={styles.usageItem}>
          <View style={styles.usageHeader}>
            <Building2 size={16} color={colors.primary[500]} />
            <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Properties</Text>
            <Text style={[styles.usageValue, { color: colors.text.primary }]}>
              {usage.properties} / {formatLimit(subscription.propertyLimit)}
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: isDark ? colors.neutral[700] : colors.neutral[200] }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${calculateProgressPercentage(usage.properties, subscription.propertyLimit)}%`,
                  backgroundColor:
                    usage.properties > subscription.propertyLimit
                      ? colors.danger[500]
                      : colors.primary[500],
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.usageItem}>
          <View style={styles.usageHeader}>
            <Users size={16} color={colors.success[500]} />
            <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Tenants</Text>
            <Text style={[styles.usageValue, { color: colors.text.primary }]}>
              {usage.tenants} / {formatLimit(subscription.tenantLimit)}
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: isDark ? colors.neutral[700] : colors.neutral[200] }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${calculateProgressPercentage(usage.tenants, subscription.tenantLimit)}%`,
                  backgroundColor:
                    usage.tenants > subscription.tenantLimit
                      ? colors.danger[500]
                      : colors.success[500],
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.usageItem}>
          <View style={styles.usageHeader}>
            <Building2 size={16} color={colors.warning[500]} />
            <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Rooms</Text>
            <Text style={[styles.usageValue, { color: colors.text.primary }]}>
              {usage.rooms} / {formatLimit(subscription.roomLimit)}
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: isDark ? colors.neutral[700] : colors.neutral[200] }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${calculateProgressPercentage(usage.rooms, subscription.roomLimit)}%`,
                  backgroundColor:
                    usage.rooms > subscription.roomLimit
                      ? colors.danger[500]
                      : colors.warning[500],
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.usageItem}>
          <View style={styles.usageHeader}>
            <Users size={16} color={colors.primary[500]} />
            <Text style={[styles.usageLabel, { color: colors.text.secondary }]}>Staff</Text>
            <Text style={[styles.usageValue, { color: colors.text.primary }]}>
              {usage.staff ?? 0} / {formatLimit(subscription.staffLimit)}
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: isDark ? colors.neutral[700] : colors.neutral[200] }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${calculateProgressPercentage(usage.staff ?? 0, subscription.staffLimit)}%`,
                  backgroundColor:
                    (usage.staff ?? 0) > subscription.staffLimit
                      ? colors.danger[500]
                      : colors.primary[500],
                },
              ]}
            />
          </View>
        </View>
      </View>

      {subscription.plan === 'free' && (
        <TouchableOpacity
          style={[styles.upgradeButton, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50], borderColor: isDark ? colors.primary[700] : colors.primary[200] }]}
          onPress={() => router.push('/subscription')}
          activeOpacity={0.7}>
          <Text style={[styles.upgradeButtonText, { color: isDark ? colors.primary[300] : colors.primary[700] }]}>Upgrade for More</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonContainer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  planText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  planMetaText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
    fontFamily: 'System',
    letterSpacing: -0.3,
  },
  planPeriodText: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  usageSection: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  usageItem: {
    gap: spacing.sm,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
  },
  usageLabel: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  usageValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  progressBar: {
    height: 6,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  upgradeButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  upgradeButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
