import { UserCreditsPageClient } from '@/components/admin/user-credits-page';

interface UserCreditsPageProps {
  params: Promise<{ userId: string }>;
}

/**
 * User Credits page
 *
 * This page displays the credit transactions for a specific user,
 * it is protected and only accessible to the admin role
 */
export default async function UserCreditsPage({
  params,
}: UserCreditsPageProps) {
  const { userId } = await params;
  return <UserCreditsPageClient userId={userId} />;
}
