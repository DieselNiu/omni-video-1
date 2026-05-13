import { GenerationsPageClient } from '@/components/admin/generations-page';

/**
 * Generations page
 *
 * This page is used to monitor generation requests for the admin,
 * it is protected and only accessible to the admin role
 */
export default function GenerationsPage() {
  return <GenerationsPageClient />;
}
