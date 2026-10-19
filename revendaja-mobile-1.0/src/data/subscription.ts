import type { SubscriptionPayment } from '../types';

export const billingInfo = {
  cardBrand: 'Mastercard',
  cardLast4: '8842',
  nextPaymentDate: '2026-10-12',
};

export const paymentHistory: SubscriptionPayment[] = [
  { id: 'pay1', date: '2026-09-12', planName: 'Pro', amount: 49.9, status: 'Pago' },
  { id: 'pay2', date: '2026-08-12', planName: 'Pro', amount: 49.9, status: 'Pago' },
  { id: 'pay3', date: '2026-07-12', planName: 'Pro', amount: 49.9, status: 'Falhou' },
  { id: 'pay4', date: '2026-07-13', planName: 'Pro', amount: 49.9, status: 'Pago' },
  { id: 'pay5', date: '2026-06-12', planName: 'Gratuito', amount: 0, status: 'Pago' },
];
