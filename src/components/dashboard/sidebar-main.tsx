'use client';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { NestedMenuItem } from '@/types';

/**
 * Main navigation for the dashboard sidebar
 */
export function SidebarMain({ items }: { items: NestedMenuItem[] }) {
  const pathname = useLocalePathname();

  const isActive = (href: string | undefined): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Separate grouped items (with sub-items) from flat items
  const groupedItems = items.filter(
    (item) => item.items && item.items.length > 0
  );
  const flatItems = items.filter(
    (item) => !item.items || item.items.length === 0
  );

  const renderItem = (item: NestedMenuItem) => {
    const active = isActive(item.href);
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={active}>
          <LocaleLink
            href={item.href || ''}
            className={cn(
              active
                ? 'text-blue-600 [&_svg]:text-blue-600'
                : 'text-foreground/70 [&_svg]:text-foreground/40'
            )}
          >
            {item.icon ? item.icon : null}
            <span className="truncate font-medium text-sm">{item.title}</span>
          </LocaleLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {/* Render all flat items in a single group */}
      {flatItems.length > 0 && (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{flatItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* Render grouped items */}
      {groupedItems.map((item) => (
        <SidebarGroup key={item.title}>
          <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{item.items!.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
