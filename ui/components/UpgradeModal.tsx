import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Animated,
} from 'react-native';
import { Check, X, AlertCircle, Tag, ChevronRight, Zap } from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography, textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { subscriptionService, couponService } from '@/services/apiClient';
import { openRazorpayCheckout, RazorpaySuccessResponse, RazorpayErrorResponse } from '@/services/razorpayService';
import { clearScreenCache } from '@/services/screenCache';
import type { Subscription, PlanMetadata } from '@/services/apiTypes';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan?: (plan: string) => void;
  subscriptions?: Subscription[];
  currentPlan?: string;
}

function getPlanRank(planName?: string): number {
  const plan = String(planName || '').toLowerCase();
  if (plan.includes('free'))    return 0;
  if (plan.includes('pro'))     return 1;
  if (plan.includes('premium')) return 2;
  return -1;
}

export default function UpgradeModal({
  visible,
  onClose,
  onSelectPlan = () => {},
  subscriptions = [],
  currentPlan,
}: UpgradeModalProps) {
  const { colors, isDark } = useTheme();
  const { user }           = useAuth();
  const { isTablet, modalMaxWidth } = useResponsiveLayout();

  const [processing,      setProcessing]      = useState(false);
  const [loadingPlans,    setLoadingPlans]    = useState(false);
  const [availablePlans,  setAvailablePlans]  = useState<PlanMetadata[]>([]);
  const [error,           setError]           = useState<string | null>(null);
  const [resolvedActivePlan, setResolvedActivePlan] = useState<string>('');
  const [selectedPlan,    setSelectedPlan]    = useState<string>('');
  const [selectedPeriod,  setSelectedPeriod]  = useState<number>(1);
  const [couponCode,      setCouponCode]      = useState('');
  const [couponValidating,setCouponValidating]= useState(false);
  const [couponApplied,   setCouponApplied]   = useState<{
    originalAmount: number; discountAmount: number; finalAmount: number; message?: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Sheet animation
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const inputBg       = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  // ── Resolved current plan ─────────────────────────────────────────────────
  const resolvedCurrentPlan = useMemo(() => {
    if (currentPlan) return currentPlan;
    return subscriptions.find(s => s.status === 'active')?.plan || '';
  }, [currentPlan, subscriptions]);

  useEffect(() => { setResolvedActivePlan(resolvedCurrentPlan); }, [resolvedCurrentPlan]);

  // ── Fetch plans ───────────────────────────────────────────────────────────
  const fetchAvailablePlans = useCallback(async () => {
    try {
      setLoadingPlans(true); setError(null);
      const [plansResult, subsResult] = await Promise.allSettled([
        subscriptionService.getPlans(),
        subscriptionService.getAllSubscriptions(),
      ]);
      if (plansResult.status !== 'fulfilled') throw plansResult.reason;

      const plans = plansResult.value.data.plans || [];
      setAvailablePlans(plans);

      const activeFromServer = subsResult.status === 'fulfilled'
        ? subsResult.value.data.subscriptions.find((s: Subscription) => s.status === 'active')?.plan || ''
        : '';
      const effective = (resolvedCurrentPlan || activeFromServer || '').toLowerCase();
      setResolvedActivePlan(effective);

      const currentRank = getPlanRank(effective);
      const candidates  = plans.filter(p => getPlanRank(p.name) > currentRank);
      const first       = candidates[0] || null;
      if (first) {
        setSelectedPlan(first.name);
        const fp = first.periods?.[0]?.period;
        setSelectedPeriod(typeof fp === 'number' ? fp : Number(fp) || 1);
      } else {
        setSelectedPlan('');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscription plans');
    } finally {
      setLoadingPlans(false);
    }
  }, [resolvedCurrentPlan]);

  useEffect(() => {
    if (!visible) return;
    setError(null); setCouponApplied(null); setCouponCode(''); setCouponError(null);
    fetchAvailablePlans();
  }, [visible, fetchAvailablePlans]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredPlans = useMemo(() => {
    const currentRank = getPlanRank(resolvedActivePlan);
    return availablePlans.filter(p => getPlanRank(p.name) > currentRank);
  }, [availablePlans, resolvedActivePlan]);

  const selectedPlanData = useMemo(() =>
    filteredPlans.find(p => p.name === selectedPlan) || null, [filteredPlans, selectedPlan]);

  const selectedPeriodData = useMemo(() => {
    if (!selectedPlanData?.periods) return null;
    return selectedPlanData.periods.find(p => Number(p.period) === Number(selectedPeriod))
      || selectedPlanData.periods[0] || null;
  }, [selectedPlanData, selectedPeriod]);

  const formatPrice = (paise: number) => {
    if (paise === 0) return 'Free';
    return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getPeriodLabel = (period: number) => {
    if (period === 0) return 'Forever';
    if (period === 1) return '1 Month';
    return `${period} Months`;
  };

  const formatLimit = (value: number) => value === 999 ? 'Unlimited' : `Up to ${value}`;

  // ── Coupon ────────────────────────────────────────────────────────────────
  const validateCoupon = async () => {
    if (!couponCode.trim()) { setCouponError('Please enter a coupon code'); return; }
    if (!selectedPlanData || !selectedPeriodData) { setCouponError('Plan data not available'); return; }
    try {
      setCouponValidating(true); setCouponError(null);
      const response = await couponService.validateCoupon(
        couponCode.trim().toUpperCase(), selectedPeriodData.price, selectedPlanData.name
      );
      if (response.data.isValid) {
        setCouponApplied({
          originalAmount: response.data.originalAmount || selectedPeriodData.price,
          discountAmount: response.data.discountAmount || 0,
          finalAmount:    response.data.finalAmount    || selectedPeriodData.price,
          message:        response.data.message,
        });
      } else {
        setCouponApplied(null);
        setCouponError(response.data.message || 'Invalid coupon code');
      }
    } catch (err: any) {
      setCouponApplied(null);
      setCouponError(err?.message || 'Failed to validate coupon');
    } finally {
      setCouponValidating(false);
    }
  };

  // ── Payment ───────────────────────────────────────────────────────────────
  const handlePaymentError = (paymentError: RazorpayErrorResponse) => {
    if (paymentError.code === 0 && paymentError.description === 'Payment Cancelled') {
      setProcessing(false); return;
    }
    setError(paymentError.description || 'Payment could not be completed. Please try again.');
    setProcessing(false);
  };

  const handlePaymentSuccess = async (response: RazorpaySuccessResponse) => {
    try {
      const verifyResponse = await subscriptionService.verifyPayment({
        payment_id: response.razorpay_payment_id,
        order_id:   response.razorpay_order_id,
        signature:  response.razorpay_signature,
      });
      if (!verifyResponse.data.success) throw new Error('Payment verification incomplete');
      clearScreenCache('subscription:'); clearScreenCache('dashboard:');
      const confirmedPlan = verifyResponse.data.subscription;
      if (!confirmedPlan) throw new Error('No subscription plan returned from server');
      onSelectPlan(confirmedPlan); onClose();
      Alert.alert('Success', 'Your subscription has been updated successfully.');
    } catch (err: any) {
      onClose();
      Alert.alert('Payment Successful', 'Your plan will be active automatically in a few minutes.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePlanUpgrade = async () => {
    if (!selectedPlan) { setError('Please select a plan'); return; }
    if (selectedPlan === 'free') {
      try {
        setProcessing(true); setError(null);
        const res = await subscriptionService.cancelSubscription();
        if (!res.data?.plan) throw new Error('Server did not return updated subscription plan');
        onSelectPlan(res.data.plan); onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to downgrade subscription');
      } finally {
        setProcessing(false);
      }
      return;
    }
    if (!selectedPlanData || !selectedPeriodData) { setError('Please select a valid plan and billing period'); return; }
    if (!user) { setError('User information not available'); return; }
    try {
      setProcessing(true); setError(null);
      const sessionResponse = await subscriptionService.createCheckoutSession(
        selectedPlanData.name,
        Number(selectedPeriodData.period),
        couponCode.trim() ? couponCode.trim().toUpperCase() : undefined
      );
      openRazorpayCheckout(
        sessionResponse.data, user.name, user.email,
        `${selectedPlanData.name} (${getPeriodLabel(Number(selectedPeriodData.period))})`,
        async (r: RazorpaySuccessResponse)   => { await handlePaymentSuccess(r); },
        (e: RazorpayErrorResponse)           => { handlePaymentError(e); }
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate checkout');
      setProcessing(false);
    }
  };

  const totalAmount = couponApplied ? couponApplied.finalAmount : (selectedPeriodData?.price ?? 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={processing ? undefined : onClose}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet, { backgroundColor: colors.modal.overlay }]}>
        {/* Tap backdrop to close */}
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={processing ? undefined : onClose} activeOpacity={1} />

        <Animated.View style={[
          styles.sheet,
          { backgroundColor: cardBg, transform: [{ translateY: slideAnim }] },
          isTablet && { maxWidth: modalMaxWidth, width: '100%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
        ]}>

          {/* Handle */}
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIconBox, { backgroundColor: brandLight }]}>
                <Zap size={16} color={brandColor} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: textPrimary }]}>Upgrade Plan</Text>
                <Text style={[styles.headerSub, { color: textSecondary }]}>Unlock more features</Text>
              </View>
            </View>
            {!processing && (
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.background.tertiary }]}
                onPress={onClose} activeOpacity={0.75}>
                <X size={16} color={textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {loadingPlans ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={brandColor} />
            </View>
          ) : (
            <>
              {/* Error banner */}
              {error && (
                <View style={[styles.errorBanner, {
                  backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                  borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                }]}>
                  <AlertCircle size={15} color={isDark ? colors.danger[300] : colors.danger[500]} strokeWidth={2} />
                  <Text style={[styles.errorBannerText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                    {error}
                  </Text>
                </View>
              )}

              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}>

                {/* ── Plan selection ─────────────────────────────────── */}
                <View style={styles.block}>
                  <Text style={[styles.blockLabel, { color: textTertiary }]}>SELECT PLAN</Text>
                  {filteredPlans.length === 0 ? (
                    <Text style={[styles.emptyText, { color: textSecondary }]}>
                      No higher plans available for your current plan.
                    </Text>
                  ) : (
                    filteredPlans.map(plan => {
                      const active = selectedPlan === plan.name;
                      const displayName = plan.display_name || plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
                      const lowestPrice = plan.periods?.[0]?.price || 0;
                      return (
                        <TouchableOpacity
                          key={plan.name}
                          style={[
                            styles.planRow,
                            {
                              backgroundColor: active ? brandLight : inputBg,
                              borderColor:     active ? brandColor : cardBorder,
                              borderWidth:     active ? 1.5 : 1,
                            },
                          ]}
                          onPress={() => {
                            setSelectedPlan(plan.name);
                            const fp = plan.periods?.[0]?.period;
                            setSelectedPeriod(typeof fp === 'number' ? fp : Number(fp) || 1);
                            setCouponCode(''); setCouponApplied(null); setCouponError(null);
                          }}
                          activeOpacity={0.75}>
                          <View style={styles.planRowLeft}>
                            <Text style={[styles.planRowName, { color: textPrimary }]}>{displayName}</Text>
                            <Text style={[styles.planRowDesc, { color: textTertiary }]}>
                              {formatLimit(plan.properties)} properties · from {formatPrice(lowestPrice)}/mo
                            </Text>
                          </View>
                          <View style={[styles.planRadio, {
                            borderColor: active ? brandColor : cardBorder,
                            backgroundColor: active ? brandColor : 'transparent',
                          }]}>
                            {active && <Check size={12} color={colors.white} strokeWidth={3} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* ── Billing period ─────────────────────────────────── */}
                {selectedPlanData?.periods && selectedPlanData.periods.length > 0 && (
                  <View style={styles.block}>
                    <Text style={[styles.blockLabel, { color: textTertiary }]}>BILLING PERIOD</Text>
                    <View style={styles.periodRow}>
                      {selectedPlanData.periods.map(periodOption => {
                        const num    = Number(periodOption.period);
                        const active = num === Number(selectedPeriod);
                        return (
                          <TouchableOpacity
                            key={`${selectedPlanData.name}-${num}`}
                            style={[
                              styles.periodCard,
                              {
                                backgroundColor: active ? brandColor : inputBg,
                                borderColor:     active ? brandColor : cardBorder,
                              },
                            ]}
                            onPress={() => {
                              setSelectedPeriod(num);
                              setCouponCode(''); setCouponApplied(null); setCouponError(null);
                            }}
                            activeOpacity={0.8}>
                            <Text style={[styles.periodCardLabel, { color: active ? colors.white : textSecondary }]}>
                              {getPeriodLabel(num)}
                            </Text>
                            <Text style={[styles.periodCardPrice, { color: active ? colors.white : textPrimary }]}>
                              {formatPrice(periodOption.price)}
                            </Text>
                            {num > 1 && (
                              <View style={[styles.periodSavingChip, {
                                backgroundColor: active ? 'rgba(255,255,255,0.2)' : (isDark ? colors.success[900] : colors.success[50]),
                              }]}>
                                <Text style={[styles.periodSavingText, { color: active ? colors.white : colors.success[500] }]}>
                                  ₹{Math.round(periodOption.price / (num * 100))}/mo
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* ── Coupon ─────────────────────────────────────────── */}
                {selectedPlan && selectedPlan !== 'free' && (
                  <View style={styles.block}>
                    <Text style={[styles.blockLabel, { color: textTertiary }]}>COUPON CODE</Text>
                    <View style={[styles.couponRow, { backgroundColor: inputBg, borderColor: couponApplied ? colors.success[400] : cardBorder }]}>
                      <Tag size={15} color={couponApplied ? colors.success[500] : textTertiary} strokeWidth={2} />
                      <TextInput
                        style={[styles.couponInput, { color: textPrimary }]}
                        placeholder="Enter coupon code"
                        placeholderTextColor={textTertiary}
                        value={couponCode}
                        onChangeText={v => { setCouponCode(v); if (couponApplied) { setCouponApplied(null); setCouponError(null); } }}
                        editable={!couponValidating && !couponApplied}
                        autoCapitalize="characters"
                      />
                      {couponApplied ? (
                        <TouchableOpacity
                          onPress={() => { setCouponApplied(null); setCouponCode(''); setCouponError(null); }}
                          style={[styles.couponActionBtn, { backgroundColor: isDark ? colors.danger[900] : colors.danger[50] }]}
                          activeOpacity={0.75}>
                          <X size={13} color={colors.danger[500]} strokeWidth={2.5} />
                        </TouchableOpacity>
                      ) : couponCode.trim() ? (
                        <TouchableOpacity
                          onPress={validateCoupon}
                          disabled={couponValidating}
                          style={[styles.couponActionBtn, { backgroundColor: brandLight }]}
                          activeOpacity={0.75}>
                          {couponValidating
                            ? <ActivityIndicator size="small" color={brandColor} />
                            : <ChevronRight size={15} color={brandColor} strokeWidth={2.5} />}
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {couponError && (
                      <Text style={[styles.couponErrText, { color: colors.danger[500] }]}>{couponError}</Text>
                    )}

                    {couponApplied && (
                      <View style={[styles.couponResult, {
                        backgroundColor: isDark ? colors.success[900] : colors.success[50],
                        borderColor:     isDark ? colors.success[700] : colors.success[200],
                      }]}>
                        <Check size={14} color={colors.success[500]} strokeWidth={2.5} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.couponResultLabel, { color: colors.success[500] }]}>
                            Coupon applied — saving {formatPrice(couponApplied.discountAmount)}
                          </Text>
                          {couponApplied.message && (
                            <Text style={[styles.couponResultMsg, { color: textSecondary }]}>{couponApplied.message}</Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* ── Order summary ──────────────────────────────────── */}
                {selectedPeriodData && (
                  <View style={[styles.summary, { backgroundColor: inputBg, borderColor: cardBorder }]}>
                    <Text style={[styles.blockLabel, { color: textTertiary, marginBottom: spacing.md }]}>ORDER SUMMARY</Text>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: textSecondary }]}>Subtotal</Text>
                      <Text style={[styles.summaryValue, { color: textPrimary }]}>{formatPrice(selectedPeriodData.price)}</Text>
                    </View>

                    {couponApplied && (
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: textSecondary }]}>Discount</Text>
                        <Text style={[styles.summaryValue, { color: colors.success[500] }]}>
                          − {formatPrice(couponApplied.discountAmount)}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.summaryDivider, { backgroundColor: colors.border.light }]} />

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryTotal, { color: textPrimary }]}>Total</Text>
                      <Text style={[styles.summaryTotalValue, { color: brandColor }]}>
                        {formatPrice(totalAmount)}
                      </Text>
                    </View>
                  </View>
                )}

              </ScrollView>

              {/* ── Footer CTA ──────────────────────────────────────────── */}
              <View style={[styles.footer, { borderTopColor: colors.border.light }]}>
                <TouchableOpacity
                  style={[styles.ctaBtn, { backgroundColor: brandColor, opacity: (processing || !selectedPlan) ? 0.55 : 1 }]}
                  onPress={handlePlanUpgrade}
                  disabled={processing || !selectedPlan}
                  activeOpacity={0.85}>
                  {processing
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : (
                      <>
                        <Text style={[styles.ctaBtnText, { color: colors.white }]}>
                          {totalAmount > 0 ? `Pay ${formatPrice(totalAmount)}` : 'Proceed'}
                        </Text>
                        <ChevronRight size={18} color={colors.white} strokeWidth={2.5} />
                      </>
                    )}
                </TouchableOpacity>

                {!processing && (
                  <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.cancelBtn}>
                    <Text style={[styles.cancelText, { color: textTertiary }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Overlay
  overlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  overlayTablet: {
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
  },

  // Sheet
  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    width:                '100%',
    maxHeight:            '92%',
    ...shadows.xl,
  },

  // Handle
  handle: {
    alignItems:    'center',
    paddingTop:    spacing.sm,
    paddingBottom: spacing.xs,
  },
  handleBar: {
    width:        38,
    height:       4,
    borderRadius: 2,
    opacity:      0.35,
  },

  // Header
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  headerIconBox: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  headerSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
    marginTop:  1,
  },
  closeBtn: {
    width:          32,
    height:         32,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },

  loadingBox: {
    paddingVertical: spacing.xxxl,
    alignItems:      'center',
  },

  // Error banner
  errorBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    marginHorizontal:  spacing.lg,
    marginTop:         spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  errorBannerText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
    flex:       1,
  },

  // Body
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.md,
    gap:               spacing.lg,
  },

  // Block (section)
  block: { gap: spacing.sm },
  blockLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
  },
  emptyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
    paddingVertical: spacing.sm,
  },

  // Plan row
  planRow: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    gap:               spacing.sm,
  },
  planRowLeft: { flex: 1 },
  planRowName: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
    letterSpacing: typography.letterSpacing.tight,
  },
  planRowDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },
  planRadio: {
    width:          20,
    height:         20,
    borderRadius:   10,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Period cards
  periodRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  periodCard: {
    flex:          1,
    borderRadius:  radius.lg,
    borderWidth:   1,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems:    'center',
    gap:           4,
  },
  periodCardLabel: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  periodCardPrice: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
  },
  periodSavingChip: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.full,
  },
  periodSavingText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   9,
  },

  // Coupon
  couponRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    borderWidth:       1,
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    height:            48,
  },
  couponInput: {
    flex:       1,
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wider,
    padding:    0,
  },
  couponActionBtn: {
    width:          30,
    height:         30,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  couponErrText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },
  couponResult: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  couponResultLabel: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.sm,
    marginBottom: 2,
  },
  couponResultMsg: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  // Summary
  summary: {
    borderRadius:      radius.xl,
    borderWidth:       1,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
  },
  summaryRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },
  summaryValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },
  summaryDivider: {
    height:          1,
    marginVertical:  spacing.sm,
  },
  summaryTotal: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },
  summaryTotalValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderTopWidth:    1,
    gap:               spacing.sm,
  },
  ctaBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.xs,
    borderRadius:   radius.lg,
    paddingVertical: spacing.md,
    minHeight:       52,
    ...shadows.md,
  },
  ctaBtnText: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },
});