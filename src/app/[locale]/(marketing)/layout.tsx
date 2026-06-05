import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PromotionBadge } from '@/components/marketing/promotion-badge';
import type { ReactNode } from 'react';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky inset-x-0 top-0 z-40">
        <PromotionBadge />
        <Navbar scroll={true} sticky={false} />
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
