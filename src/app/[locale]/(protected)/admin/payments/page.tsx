import { PaymentsPageClient } from '@/components/admin/payments-page';

/**
 * Payments page
 *
 * This page is used to manage payments for the admin,
 * it is protected and only accessible to the admin role
 */
export default function PaymentsPage() {
  return <PaymentsPageClient />;
}
