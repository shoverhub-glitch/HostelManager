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
    order_id: string;
    payment_id: string;
  };
}

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

  RazorpayCheckout.open(options)
    .then((data: RazorpaySuccessResponse) => {
      onSuccess(data);
    })
    .catch((error: RazorpayErrorResponse) => {
      onError(error);
    });
};
