import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
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
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  Zap,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography, textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { subscriptionService } from '@/services/apiClient';
import type { Subscription, Usage, PlanMetadata } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';
import UpgradeModal from '@/components/UpgradeModal';

interface SubscriptionCachePayload {
  activeSubscription: Subscription | null;
  usage: Usage;
  allPlans: PlanMetadata[];
}

const SUBSCRIPTION_CACHE_STALE_MS = 2 * 60 * 1000;

// Plan tier config — all colors resolved at runtime from theme
type PlanTier = 'free' | 'pro' | 'premium';
function getPlanTier(name: string): PlanTier {
  const n = name.toLowerCase();
  if (n.includes('premium')) return 'premium';
  if (n.includes('pro'))     return 'pro';
  return 'free';
}
function getPlanIcon(tier: PlanTier) {
  if (tier === 'premium') return Gem;
  if (tier === 'pro')     return Trophy;
  return Crown;
}

// ── Animated progress bar ─────────────────────────────────────────────────────
function ProgressBar({ used, limit, fillColor, trackColor }: {
  used: number; limit: number; fillColor: string; trackColor: string;
}) {
  const pct = limit === 999 ? 12 : Math.min((used / limit) * 100, 100);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 800, delay: 200, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={[pbStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[pbStyles.fill, {
          backgroundColor: fillColor,
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }]}
      />
    </View>
  );
}
const pbStyles = StyleSheet.create({
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 6, marginBottom: 4 },
  fill:  { height: '100%', borderRadius: 2 },
});

export default function SubscriptionScreen() {
  const { colors, isDark } = useTheme();
  const { isTablet, contentMaxWidth } = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();

  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null);
  const [allPlans,  setAllPlans]  = useState<PlanMetadata[]>([]);
  const [usage,     setUsage]     = useState<Usage | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isFetchingRef       = useRef(false);
  const lastFocusRefreshRef = useRef<number>(0);

  // ── Color aliases ──────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const purpleColor   = colors.purple[500];
  const purpleLight   = isDark ? colors.purple[900] : colors.purple[50];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const pageBg        = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  function tierColors(tier: PlanTier) {
    if (tier === 'premium') return {
      accent: isDark ? colors.purple[300] : colors.purple[500],
      light:  isDark ? colors.purple[900] : colors.purple[50],
      border: isDark ? colors.purple[700] : colors.purple[200],
    };
    if (tier === 'pro') return {
      accent: isDark ? colors.primary[300] : colors.primary[500],
      light:  isDark ? colors.primary[900] : colors.primary[50],
      border: isDark ? colors.primary[700] : colors.primary[200],
    };
    return {
      accent: isDark ? colors.neutral[300] : colors.neutral[500],
      light:  isDark ? colors.neutral[800] : colors.neutral[100],
      border: isDark ? colors.neutral[600] : colors.neutral[300],
    };
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  const fetchSubscriptionData = async (forceRefresh = false) => {
    if (isFetchingRef.current) return;
    const cacheKey = cacheKeys.subscription();
    if (!forceRefresh) {
      const cached = getScreenCache<SubscriptionCachePayload>(cacheKey, SUBSCRIPTION_CACHE_STALE_MS);
      if (cached) {
        setActiveSubscription(cached.activeSubscription);
        setUsage(cached.usage);
        setAllPlans(cached.allPlans);
        setError(null); setLoading(false); return;
      }
    } else {
      clearScreenCache('subscription:');
    }
    try {
      isFetchingRef.current = true;
      setLoading(true); setError(null);
      const [subRes, usageRes, plansRes] = await Promise.all([
        subscriptionService.getAllSubscriptions(),
        subscriptionService.getUsage(),
        subscriptionService.getPlans(),
      ]);
      const active = subRes.data.subscriptions.find((s: Subscription) => s.status === 'active');
      setActiveSubscription(active || null);
      setUsage(usageRes.data);
      setAllPlans(plansRes.data.plans);
      setScreenCache(cacheKey, { activeSubscription: active || null, usage: usageRes.data, allPlans: plansRes.data.plans });
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscription');
    } finally {
      setLoading(false); isFetchingRef.current = false;
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
    await fetchSubscriptionData(true);
    setRefreshing(false);
  };

  const currentPlan    = activeSubscription?.plan || allPlans[0]?.name || '';
  const activePlanMeta = allPlans.find(p => p.name.toLowerCase() === currentPlan.toLowerCase());
  const propertyLimit  = activePlanMeta?.properties ?? activeSubscription?.propertyLimit ?? 0;
  const tenantLimit    = activePlanMeta?.tenants    ?? activeSubscription?.tenantLimit   ?? 0;
  const roomLimit      = activePlanMeta?.rooms      ?? activeSubscription?.roomLimit     ?? 0;
  const staffLimit     = activePlanMeta?.staff      ?? activeSubscription?.staffLimit    ?? 0;

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

  const getProgressTrack = (used: number, limit: number) => {
    if (limit === 999) return isDark ? colors.success[900] : colors.success[50];
    const pct = (used / limit) * 100;
    if (pct >= 90) return isDark ? colors.danger[900] : colors.danger[50];
    if (pct >= 70) return isDark ? colors.warning[900] : colors.warning[50];
    return isDark ? colors.success[900] : colors.success[50];
  };

  // ── Plan card ──────────────────────────────────────────────────────────────
  const renderPlanCard = (plan: PlanMetadata) => {
    const tier        = getPlanTier(plan.name);
    const tc          = tierColors(tier);
    const isCurrent   = plan.name.toLowerCase() === currentPlan.toLowerCase();
    const PlanIcon    = getPlanIcon(tier);
    const displayName = plan.display_name || plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
    const price       = plan.periods?.[0]?.price || 0;

    return (
      <View
        key={plan.name}
        style={[
          styles.planCard,
          { backgroundColor: cardBg, borderColor: isCurrent ? tc.accent : cardBorder, borderWidth: isCurrent ? 1.5 : 1 },
        ]}>

        {/* Top accent strip */}
        <View style={[styles.planStrip, { backgroundColor: tc.accent }]} />

        <View style={styles.planCardBody}>
          {/* Icon + name row */}
          <View style={styles.planNameRow}>
            <View style={[styles.planIconBox, { backgroundColor: tc.light }]}>
              <PlanIcon size={18} color={tc.accent} strokeWidth={2} />
            </View>
            <Text style={[styles.planName, { color: textPrimary }]}>{displayName}</Text>
            {isCurrent && (
              <View style={[styles.currentChip, { backgroundColor: tc.light, borderColor: tc.border }]}>
                <View style={[styles.currentDot, { backgroundColor: tc.accent }]} />
                <Text style={[styles.currentChipText, { color: tc.accent }]}>Active</Text>
              </View>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={[styles.priceMain, { color: tc.accent }]}>{formatPrice(price)}</Text>
            {price > 0 && <Text style={[styles.priceSub, { color: textTertiary }]}>/mo</Text>}
          </View>

          {/* Feature list */}
          <View style={[styles.featureList, { borderTopColor: colors.border.light }]}>
            {[
              { icon: Building2, label: `${plan.properties} ${plan.properties === 1 ? 'Property' : 'Properties'}` },
              { icon: Users,     label: `${plan.tenants} Tenants / property` },
              { icon: Bed,       label: `${plan.rooms} Rooms / property` },
              { icon: CreditCard,label: `${plan.staff} Staff / property` },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <f.icon size={14} color={tc.accent} strokeWidth={2} />
                <Text style={[styles.featureText, { color: textSecondary }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          {isCurrent ? (
            <View style={[styles.currentBtn, { backgroundColor: tc.light, borderColor: tc.border }]}>
              <CheckCircle size={14} color={tc.accent} strokeWidth={2.5} />
              <Text style={[styles.currentBtnText, { color: tc.accent }]}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: tc.accent }]}
              onPress={() => setShowUpgradeModal(true)}
              activeOpacity={0.82}>
              <Text style={[styles.upgradeBtnText, { color: colors.white }]}>
                {price > 0 ? 'Upgrade' : 'Select'}
              </Text>
              <ArrowUpRight size={15} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Usage stat card ────────────────────────────────────────────────────────
  const UsageStat = ({
    icon: Icon, label, used, limit, accentColor,
  }: { icon: any; label: string; used: number; limit: number; accentColor: string }) => {
    const fillColor  = getProgressColor(used, limit);
    const trackColor = getProgressTrack(used, limit);
    const pct        = limit === 999 ? null : Math.round((used / limit) * 100);

    return (
      <View style={[styles.usageStat, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={styles.usageStatTop}>
          <View style={[styles.usageIconBox, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
            <Icon size={14} color={accentColor} strokeWidth={2} />
          </View>
          <Text style={[styles.usageStatLabel, { color: textTertiary }]}>{label.toUpperCase()}</Text>
          {pct !== null && (
            <View style={[styles.usagePctChip, {
              backgroundColor: fillColor === colors.danger[500]
                ? (isDark ? colors.danger[900] : colors.danger[50])
                : (isDark ? colors.success[900] : colors.success[50]),
            }]}>
              <Text style={[styles.usagePctText, { color: fillColor }]}>{pct}%</Text>
            </View>
          )}
        </View>
        <Text style={[styles.usageValue, { color: textPrimary }]}>{used}</Text>
        <ProgressBar used={used} limit={limit} fillColor={fillColor} trackColor={trackColor} />
        <Text style={[styles.usageLimitText, { color: textTertiary }]}>
          {limit === 999 ? 'Unlimited' : `of ${limit}`}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>

      {/* ── Nav bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: textPrimary }]}>Subscription</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[brandColor]} tintColor={brandColor} />
        }>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={brandColor} />
          </View>
        ) : error ? (
          <TouchableOpacity
            style={[styles.errorCard, { backgroundColor: isDark ? colors.danger[900] : colors.danger[50], borderColor: isDark ? colors.danger[700] : colors.danger[200] }]}
            onPress={() => fetchSubscriptionData(true)}
            activeOpacity={0.8}>
            <AlertCircle size={18} color={isDark ? colors.danger[300] : colors.danger[500]} strokeWidth={2} />
            <Text style={[styles.errorText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>{error}</Text>
            <Text style={[styles.errorRetry, { color: isDark ? colors.danger[300] : colors.danger[500] }]}>Tap to retry</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* ── Current plan banner ──────────────────────────────────── */}
            {currentPlan ? (() => {
              const tier = getPlanTier(currentPlan);
              const tc   = tierColors(tier);
              const Icon = getPlanIcon(tier);
              return (
                <View style={[styles.bannerCard, { backgroundColor: tc.light, borderColor: tc.border }]}>
                  <View style={[styles.bannerIconBox, { backgroundColor: tc.accent }]}>
                    <Icon size={20} color={colors.white} strokeWidth={2} />
                  </View>
                  <View style={styles.bannerInfo}>
                    <Text style={[styles.bannerLabel, { color: tc.accent }]}>CURRENT PLAN</Text>
                    <Text style={[styles.bannerPlan, { color: textPrimary }]}>
                      {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                    </Text>
                  </View>
                  {activeSubscription?.currentPeriodEnd && (
                    <Text style={[styles.bannerExpiry, { color: textTertiary }]}>
                      Renews {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  )}
                </View>
              );
            })() : null}

            {/* ── Plans ─────────────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Zap size={14} color={brandColor} strokeWidth={2} />
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Choose a Plan</Text>
              </View>
            </View>

            {/* Horizontal scroll for plans */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.plansScroll}
              decelerationRate="fast"
              snapToInterval={PLAN_CARD_WIDTH + spacing.sm}
              snapToAlignment="start">
              {allPlans.map(plan => renderPlanCard(plan))}
            </ScrollView>

            {/* ── Usage ─────────────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Building2 size={14} color={brandColor} strokeWidth={2} />
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Current Usage</Text>
              </View>
            </View>

            <View style={styles.usageGrid}>
              <UsageStat
                icon={Building2} label="Properties"
                used={usage?.properties || 0} limit={propertyLimit}
                accentColor={brandColor}
              />
              <UsageStat
                icon={Users} label="Tenants"
                used={usage?.tenants || 0} limit={tenantLimit}
                accentColor={colors.success[500]}
              />
              <UsageStat
                icon={Bed} label="Rooms"
                used={usage?.rooms || 0} limit={roomLimit}
                accentColor={colors.warning[500]}
              />
              <UsageStat
                icon={CreditCard} label="Staff"
                used={usage?.staff || 0} limit={staffLimit}
                accentColor={purpleColor}
              />
            </View>
          </>
        )}
      </ScrollView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => { setShowUpgradeModal(false); fetchSubscriptionData(true); }}
      />
    </SafeAreaView>
  );
}

const PLAN_CARD_WIDTH = 260;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  navBack:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle:   { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  navSpacer:  { width: 36 },

  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  loadingBox: {
    paddingVertical: spacing.xxxl,
    alignItems:      'center',
  },

  // Error
  errorCard: {
    flexDirection:     'row',
    alignItems:        'center',
    padding:           spacing.md,
    borderRadius:      radius.lg,
    borderWidth:       1,
    gap:               spacing.sm,
  },
  errorText:  { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, flex: 1 },
  errorRetry: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.xs },

  // Current plan banner
  bannerCard: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   radius.xl,
    borderWidth:    1,
    padding:        spacing.md,
    gap:            spacing.md,
    marginBottom:   spacing.lg,
  },
  bannerIconBox: {
    width:          40,
    height:         40,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bannerInfo:   { flex: 1 },
  bannerLabel:  {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  2,
  },
  bannerPlan: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  bannerExpiry: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  // Section header
  sectionHeader:   { marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle:    {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.normal,
  },

  // Plans horizontal scroll
  plansScroll: {
    paddingRight:  spacing.md,
    gap:           spacing.sm,
    marginBottom:  spacing.xl,
  },

  // Plan card
  planCard: {
    width:        PLAN_CARD_WIDTH,
    borderRadius: radius.xl,
    overflow:     'hidden',
    ...shadows.sm,
  },
  planStrip: {
    height: 3,
  },
  planCardBody: {
    padding: spacing.md,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  planIconBox: {
    width:          32,
    height:         32,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  planName: {
    flex:          1,
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },
  currentChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  currentDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },
  currentChipText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Price
  priceRow: {
    flexDirection:  'row',
    alignItems:     'baseline',
    marginBottom:   spacing.md,
    gap:            4,
  },
  priceMain: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },
  priceSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // Features
  featureList: {
    borderTopWidth: 1,
    paddingTop:     spacing.sm,
    marginBottom:   spacing.md,
    gap:            spacing.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    paddingVertical: 2,
  },
  featureText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // CTA buttons
  currentBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  currentBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },
  upgradeBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
  },
  upgradeBtnText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Usage grid
  usageGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
    marginBottom:  spacing.xl,
  },
  usageStat: {
    width:         '48%',
    borderRadius:  radius.lg,
    borderWidth:   1,
    padding:       spacing.md,
  },
  usageStatTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    marginBottom:  spacing.xs,
  },
  usageIconBox: {
    width:          24,
    height:         24,
    borderRadius:   radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
  },
  usageStatLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    flex:          1,
  },
  usagePctChip: {
    paddingHorizontal: 5,
    paddingVertical:   2,
    borderRadius:      radius.sm,
  },
  usagePctText: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   9,
  },
  usageValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },
  usageLimitText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   9,
    letterSpacing: typography.letterSpacing.wide,
  },
});