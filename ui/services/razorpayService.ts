import RazorpayCheckout from 'react-native-razorpay';
import { RazorpayCheckoutSession } from './apiTypes';

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayErrorResponse {
  code: number;
  description: string;
  source: string;
  step: string;
  reason: string;
  metadata: {
    order_id?: string;
    payment_id?: string;
  };
}

export interface RazorpaySubscriptionSuccessResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export const openRazorpaySubscription = (
  subscriptionId: string,
  keyId: string,
  userName: string,
  userEmail: string,
  planDescription: string,
  onSuccess: (response: RazorpaySubscriptionSuccessResponse) => void,
  onError: (error: RazorpayErrorResponse) => void
): void => {
  const options = {
    key: keyId,
    subscription_id: subscriptionId,
    recurring: 1,
    name: 'Hostel Manager',
    description: planDescription,
    prefill: {
      name: userName,
      email: userEmail,
    },
    theme: {
      color: '#3B82F6',
    },
  };

  if (!RazorpayCheckout) {
    onError({ code: -1, description: 'Razorpay is not available. Please use the installed app (not Expo Go).', source: '', step: '', reason: '', metadata: { order_id: '', payment_id: '' } });
    return;
  }

  RazorpayCheckout.open(options as any)
    .then((data: any) => {
      if (!data?.razorpay_subscription_id) {
        onError({
          code: -2,
          description: 'Subscription id missing in Razorpay response.',
          source: 'razorpay',
          step: 'payment_authorization',
          reason: 'invalid_response',
          metadata: { payment_id: data?.razorpay_payment_id },
        });
        return;
      }

      onSuccess({
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_subscription_id: data.razorpay_subscription_id,
        razorpay_signature: data.razorpay_signature,
      });
    })
    .catch((error: RazorpayErrorResponse) => {
      onError(error);
    });
};

export const openRazorpayCheckout = (
  session: RazorpayCheckoutSession,
  userName: string,
  userEmail: string,
  planName: string,
  onSuccess: (response: RazorpaySuccessResponse) => void,
  onError: (error: RazorpayErrorResponse) => void
): void => {
  const options = {
    key: session.keyId,
    order_id: session.razorpayOrderId,
    amount: session.amount,
    currency: session.currency,
    name: 'Hostel Manager',
    description: `${planName} Plan Subscription`,
    prefill: {
      name: userName,
      email: userEmail,
    },
    theme: {
      color: '#3B82F6',
    },
  };

  if (!RazorpayCheckout) {
    onError({ code: -1, description: 'Razorpay is not available. Please use the installed app (not Expo Go).', source: '', step: '', reason: '', metadata: { order_id: '', payment_id: '' } });
    return;
  }

  RazorpayCheckout.open(options)
    .then((data: any) => {
      if (!data?.razorpay_order_id) {
        onError({
          code: -2,
          description: 'Order id missing in Razorpay response.',
          source: 'razorpay',
          step: 'payment_authorization',
          reason: 'invalid_response',
          metadata: { payment_id: data?.razorpay_payment_id },
        });
        return;
      }

      onSuccess({
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_order_id: data.razorpay_order_id,
        razorpay_signature: data.razorpay_signature,
      });
    })
    .catch((error: RazorpayErrorResponse) => {
      onError(error);
    });
};
