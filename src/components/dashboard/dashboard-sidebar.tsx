'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { SidebarMain } from '@/components/dashboard/sidebar-main';
import { SidebarUser } from '@/components/dashboard/sidebar-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useSidebarLinks } from '@/config/sidebar-config';
import { LocaleLink } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Logo } from '../layout/logo';
import { SidebarUpgradeButton } from './sidebar-upgrade-button';

/**
 * Dashboard sidebar
 */
export function DashboardSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const currentUser = session?.user;

  const sidebarLinks = useSidebarLinks();
  const filteredSidebarLinks = sidebarLinks.filter((link) => {
    if (link.authorizeOnly) {
      return link.authorizeOnly.includes(currentUser?.role || '');
    }
    return true;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <LocaleLink href={Routes.Root}>
                <Logo className="size-5" />
                <span className="truncate font-semibold text-base text-foreground">
                  {t('Metadata.name')}
                </span>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {!isPending && mounted && <SidebarMain items={filteredSidebarLinks} />}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-4 px-4">
        {/* Only show UI components when not in loading state */}
        {!isPending && mounted && currentUser && (
          <>
            <SidebarUpgradeButton />
            <SidebarUser user={currentUser} />
          </>
        )}
        {!isPending && mounted && !currentUser && (
          <LoginWrapper mode="modal" asChild>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
            >
              <LogIn className="size-4 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">
                {t('Common.login')}
              </span>
            </button>
          </LoginWrapper>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
