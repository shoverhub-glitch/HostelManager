import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { Check, X, AlertCircle, Tag } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { subscriptionService, couponService } from '@/services/apiClient';
import { openRazorpayCheckout, RazorpaySuccessResponse, RazorpayErrorResponse } from '@/services/razorpayService';
import type { Subscription, PlanMetadata } from '@/services/apiTypes';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan?: (plan: string) => void;
  subscriptions?: Subscription[];
  currentPlan?: string;
}

export default function UpgradeModal({
  visible,
  onClose,
  onSelectPlan = () => {},
  subscriptions = [],
  currentPlan,
}: UpgradeModalProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isTablet, modalMaxWidth } = useResponsiveLayout();

  const [processing, setProcessing] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<PlanMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);

  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{
    originalAmount: number;
    discountAmount: number;
    finalAmount: number;
    message?: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const resolvedCurrentPlan = useMemo(() => {
    if (currentPlan) return currentPlan;
    const active = subscriptions.find((sub) => sub.status === 'active');
    return active?.plan || 'free';
  }, [currentPlan, subscriptions]);

  const fetchAvailablePlans = useCallback(async () => {
    try {
      setLoadingPlans(true);
      setError(null);
      const response = await subscriptionService.getPlans();
      const plans = response.data.plans || [];
      setAvailablePlans(plans);

      const firstSelectable = plans.find((plan) => plan.name !== resolvedCurrentPlan) || plans[0];
      if (firstSelectable) {
        setSelectedPlan(firstSelectable.name);
        const firstPeriod = firstSelectable.periods?.[0]?.period;
        setSelectedPeriod(typeof firstPeriod === 'number' ? firstPeriod : Number(firstPeriod) || 1);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscription plans');
    } finally {
      setLoadingPlans(false);
    }
  }, [resolvedCurrentPlan]);

  useEffect(() => {
    if (!visible) return;

    setError(null);
    setCouponApplied(null);
    setCouponCode('');
    setCouponError(null);
    fetchAvailablePlans();
  }, [visible, fetchAvailablePlans]);

  const formatLimit = (value: number) => {
    return value === 999 ? 'Unlimited' : `Up to ${value}`;
  };

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

  const filteredPlans = useMemo(() => {
    return availablePlans.filter((plan) => plan.name !== resolvedCurrentPlan);
  }, [availablePlans, resolvedCurrentPlan]);

  const selectedPlanData = useMemo(() => {
    return filteredPlans.find((plan) => plan.name === selectedPlan) || null;
  }, [filteredPlans, selectedPlan]);

  const selectedPeriodData = useMemo(() => {
    if (!selectedPlanData?.periods) return null;
    return (
      selectedPlanData.periods.find((period) => Number(period.period) === Number(selectedPeriod)) ||
      selectedPlanData.periods[0] ||
      null
    );
  }, [selectedPlanData, selectedPeriod]);

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }

    if (!selectedPlanData || !selectedPeriodData) {
      setCouponError('Plan data not available');
      return;
    }

    try {
      setCouponValidating(true);
      setCouponError(null);

      const response = await couponService.validateCoupon(
        couponCode.trim().toUpperCase(),
        selectedPeriodData.price,
        selectedPlanData.name
      );

      if (response.data.isValid) {
        setCouponApplied({
          originalAmount: response.data.originalAmount || selectedPeriodData.price,
          discountAmount: response.data.discountAmount || 0,
          finalAmount: response.data.finalAmount || selectedPeriodData.price,
          message: response.data.message,
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

  const handlePaymentError = (paymentError: RazorpayErrorResponse) => {
    setError(paymentError.description || 'Payment failed. Please try again.');
    setProcessing(false);
  };

  const handlePaymentSuccess = async (response: RazorpaySuccessResponse, fallbackPlan: string) => {
    try {
      const verifyResponse = await subscriptionService.verifyPayment({
        payment_id: response.razorpay_payment_id,
        order_id: response.razorpay_order_id,
        signature: response.razorpay_signature,
      });

      if (!verifyResponse.data.success) {
        throw new Error('Payment verification failed');
      }

      const confirmedPlan = verifyResponse.data.subscription || fallbackPlan;
      onSelectPlan(confirmedPlan);
      onClose();

      Alert.alert('Success', 'Your subscription has been updated successfully.');
    } catch (err: any) {
      setError(err?.message || 'Payment verification failed. Please contact support.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePlanUpgrade = async () => {
    if (!selectedPlan) {
      setError('Please select a plan');
      return;
    }

    if (selectedPlan === 'free') {
      try {
        setProcessing(true);
        setError(null);
        // Free plan downgrade must go through cancel endpoint to trigger archival lifecycle
        // This ensures excess resources are archived with 30-day recovery grace period
        await subscriptionService.cancelSubscription();
        onSelectPlan('free');
        onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to downgrade subscription');
      } finally {
        setProcessing(false);
      }
      return;
    }

    if (!selectedPlanData || !selectedPeriodData) {
      setError('Please select a valid plan and billing period');
      return;
    }

    if (!user) {
      setError('User information not available');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const sessionResponse = await subscriptionService.createCheckoutSession(
        selectedPlanData.name,
        Number(selectedPeriodData.period),
        couponCode.trim() ? couponCode.trim().toUpperCase() : undefined
      );

      openRazorpayCheckout(
        sessionResponse.data,
        user.name,
        user.email,
        `${selectedPlanData.name} (${getPeriodLabel(Number(selectedPeriodData.period))})`,
        async (response: RazorpaySuccessResponse) => {
          await handlePaymentSuccess(response, selectedPlanData.name);
        },
        (paymentError: RazorpayErrorResponse) => {
          handlePaymentError(paymentError);
        }
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate checkout');
      setProcessing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onClose}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <View style={[
          styles.modalContainer,
          { backgroundColor: colors.background.secondary },
          isTablet && { maxWidth: modalMaxWidth, width: '100%', borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
        ]}>
          <View style={[styles.header, { borderBottomColor: colors.border.light }]}> 
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Choose Your Plan</Text>
            {!processing && (
              <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                <X size={24} color={colors.text.primary} />
              </TouchableOpacity>
            )}
          </View>

          {loadingPlans ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <>
              {error && (
                <View style={[styles.errorContainer, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
                  <AlertCircle size={16} color={colors.danger[600]} />
                  <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
                </View>
              )}

              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.text.primary }]}>Select Plan</Text>
                  {filteredPlans.map((plan) => (
                    <TouchableOpacity
                      key={plan.name}
                      style={[
                        styles.planOption,
                        {
                          backgroundColor: colors.background.tertiary,
                          borderColor: selectedPlan === plan.name ? colors.primary[500] : colors.border.light,
                          borderWidth: selectedPlan === plan.name ? 2 : 1,
                        },
                      ]}
                      onPress={() => {
                        setSelectedPlan(plan.name);
                        const firstPeriod = plan.periods?.[0]?.period;
                        setSelectedPeriod(typeof firstPeriod === 'number' ? firstPeriod : Number(firstPeriod) || 1);
                        setCouponCode('');
                        setCouponApplied(null);
                        setCouponError(null);
                      }}
                      activeOpacity={0.7}>
                      <View style={styles.planOptionContent}>
                        <Text style={[styles.planOptionName, { color: colors.text.primary }]}>
                          {plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}
                        </Text>
                        <Text style={[styles.planOptionDesc, { color: colors.text.secondary }]}>
                          {formatLimit(plan.properties)} properties
                        </Text>
                      </View>
                      {selectedPlan === plan.name && <Check size={20} color={colors.primary[500]} />}
                    </TouchableOpacity>
                  ))}

                  {!filteredPlans.length && (
                    <Text style={[styles.helperText, { color: colors.text.secondary }]}>No upgrade plans available right now.</Text>
                  )}
                </View>

                {selectedPlanData?.periods && selectedPlanData.periods.length > 0 && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.text.primary }]}>Billing Period</Text>
                    <View style={styles.periodGrid}>
                      {selectedPlanData.periods.map((periodOption) => {
                        const numericPeriod = Number(periodOption.period);
                        const isSelected = numericPeriod === Number(selectedPeriod);

                        return (
                          <TouchableOpacity
                            key={`${selectedPlanData.name}-${numericPeriod}`}
                            style={[
                              styles.periodOption,
                              {
                                backgroundColor: isSelected ? colors.primary[500] : colors.background.tertiary,
                                borderColor: colors.border.light,
                                borderWidth: 1,
                              },
                            ]}
                            onPress={() => {
                              setSelectedPeriod(numericPeriod);
                              setCouponCode('');
                              setCouponApplied(null);
                              setCouponError(null);
                            }}
                            activeOpacity={0.7}>
                            <Text style={[styles.periodLabel, { color: isSelected ? colors.white : colors.text.primary }]}>
                              {getPeriodLabel(numericPeriod)}
                            </Text>
                            <Text style={[styles.periodPrice, { color: isSelected ? colors.white : colors.primary[500] }]}>
                              {formatPrice(periodOption.price)}
                            </Text>
                            {numericPeriod > 1 && (
                              <Text style={[styles.periodMonthly, { color: isSelected ? colors.white : colors.text.secondary }]}>
                                ₹{Math.round(periodOption.price / (numericPeriod * 100))}/mo
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {selectedPlan && selectedPlan !== 'free' && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.text.primary }]}>Apply Coupon (Optional)</Text>
                    <View style={[styles.couponInputContainer, { borderColor: colors.border.light, backgroundColor: colors.background.secondary }]}> 
                      <Tag size={18} color={colors.text.tertiary} style={styles.couponIcon} />
                      <TextInput
                        style={[styles.couponInput, { color: colors.text.primary }]}
                        placeholder="Enter coupon code"
                        placeholderTextColor={colors.text.tertiary}
                        value={couponCode}
                        onChangeText={setCouponCode}
                        editable={!couponValidating && !couponApplied}
                        autoCapitalize="characters"
                      />
                      {!!couponCode && (
                        <TouchableOpacity
                          onPress={validateCoupon}
                          disabled={couponValidating || !!couponApplied}
                          style={[
                            styles.couponButton,
                            { backgroundColor: couponApplied ? colors.success[500] : colors.primary[500] },
                          ]}
                          activeOpacity={0.7}>
                          {couponValidating ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <Text style={[styles.couponButtonText, { color: colors.white }]}>{couponApplied ? 'Applied' : 'Check'}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>

                    {!!couponError && <Text style={[styles.couponErrorText, { color: colors.danger[600] }]}>{couponError}</Text>}

                    {!!couponApplied && (
                      <View style={[styles.couponResultCard, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
                        <Text style={[styles.couponResultLabel, { color: colors.success[700] }]}>Discount Applied</Text>
                        <Text style={[styles.discountText, { color: colors.text.secondary }]}>Original: {formatPrice(couponApplied.originalAmount)}</Text>
                        <Text style={[styles.discountText, { color: colors.danger[600] }]}>-{formatPrice(couponApplied.discountAmount)}</Text>
                        <Text style={[styles.discountFinal, { color: colors.text.primary }]}>Final: {formatPrice(couponApplied.finalAmount)}</Text>
                      </View>
                    )}
                  </View>
                )}

                {!!selectedPeriodData && (
                  <View style={[styles.summaryCard, { backgroundColor: colors.background.tertiary }]}> 
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Subtotal</Text>
                      <Text style={[styles.summaryValue, { color: colors.text.primary }]}>{formatPrice(selectedPeriodData.price)}</Text>
                    </View>
                    {!!couponApplied && (
                      <>
                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Discount</Text>
                          <Text style={[styles.summaryValue, { color: colors.danger[600] }]}>-{formatPrice(couponApplied.discountAmount)}</Text>
                        </View>
                        <View style={[styles.summaryDivider, { backgroundColor: colors.border.light }]} />
                      </>
                    )}
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryTotal, { color: colors.text.primary }]}>Total Amount</Text>
                      <Text style={[styles.summaryTotalValue, { color: colors.primary[500] }]}>
                        {couponApplied ? formatPrice(couponApplied.finalAmount) : formatPrice(selectedPeriodData.price)}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={[styles.footer, { borderTopColor: colors.border.light }]}> 
                <TouchableOpacity
                  style={[styles.upgradeButton, { backgroundColor: colors.primary[500], opacity: processing ? 0.5 : 1 }]}
                  onPress={handlePlanUpgrade}
                  disabled={processing || !selectedPlan}
                  activeOpacity={0.7}>
                  {processing ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={[styles.upgradeButtonText, { color: colors.white }]}>Proceed</Text>}
                </TouchableOpacity>

                {!processing && (
                  <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                    <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    maxHeight: '95%',
    ...shadows.xl,
  },
  loadingContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.5,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  scrollView: {
    paddingVertical: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  planOptionContent: {
    flex: 1,
  },
  planOptionName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
    textTransform: 'capitalize',
  },
  planOptionDesc: {
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  periodGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodOption: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
    minHeight: 100,
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  periodPrice: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  periodMonthly: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  couponSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  couponInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: 44,
  },
  couponIcon: {
    marginRight: spacing.sm,
  },
  couponInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    padding: 0,
  },
  couponButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginLeft: spacing.sm,
    height: 32,
    justifyContent: 'center',
  },
  couponButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  couponErrorText: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
  },
  couponResultCard: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  couponResultLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  discountText: {
    fontSize: typography.fontSize.md,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  discountFinal: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: 24,
  },
  summaryLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.3,
  },
  summaryDivider: {
    height: 1,
    marginVertical: spacing.md,
  },
  summaryTotal: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  summaryTotalValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
  },
  upgradeButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    ...shadows.md,
  },
  upgradeButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  cancelText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
