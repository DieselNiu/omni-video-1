import { adminGiftCreditsAction } from '@/actions/admin-gift-credits';
import { adminGrantProAction } from '@/actions/admin-grant-pro';
import { adminRevokeProAction } from '@/actions/admin-revoke-pro';
import { UserAvatar } from '@/components/layout/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBanUser, useUnbanUser, usersKeys } from '@/hooks/use-users';
import type { User } from '@/lib/auth-types';
import { isDemoWebsite } from '@/lib/demo';
import { formatDate } from '@/lib/formatter';
import { getStripeDashboardCustomerUrl } from '@/lib/urls/urls';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  CrownIcon,
  GiftIcon,
  Loader2Icon,
  MailCheckIcon,
  MailQuestionIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';

interface UserDetailViewerProps {
  user: User;
}

export function UserDetailViewer({ user }: UserDetailViewerProps) {
  const t = useTranslations('Dashboard.admin.users');
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();
  const [banReason, setBanReason] = useState(t('ban.defaultReason'));
  const [banExpiresAt, setBanExpiresAt] = useState<Date | undefined>();

  // Gift credits state
  const [giftAmount, setGiftAmount] = useState<string>('');
  const [giftExpireDays, setGiftExpireDays] = useState<string>('');
  const [giftNote, setGiftNote] = useState<string>('');

  // Grant Pro state
  const [proExpireDays, setProExpireDays] = useState<string>('');

  // TanStack Query mutations
  const banUserMutation = useBanUser();
  const unbanUserMutation = useUnbanUser();

  // Gift credits action
  const giftCreditsAction = useAction(adminGiftCreditsAction, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(
          t('gift.success', { amount: result.data.data?.amount ?? 0 })
        );
        setGiftAmount('');
        setGiftExpireDays('');
        setGiftNote('');
      } else {
        toast.error(result.data?.error || t('gift.error'));
      }
    },
    onError: (err) => {
      toast.error(
        typeof err.error.serverError === 'string'
          ? err.error.serverError
          : t('gift.error')
      );
    },
  });

  // Grant Pro action
  const grantProAction = useAction(adminGrantProAction, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(t('pro.grantSuccess'));
        setProExpireDays('');
        queryClient.invalidateQueries({ queryKey: usersKeys.all });
      } else {
        toast.error(result.data?.error || t('pro.error'));
      }
    },
    onError: (err) => {
      toast.error(
        typeof err.error.serverError === 'string'
          ? err.error.serverError
          : t('pro.error')
      );
    },
  });

  // Revoke Pro action
  const revokeProAction = useAction(adminRevokeProAction, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(t('pro.revokeSuccess'));
        queryClient.invalidateQueries({ queryKey: usersKeys.all });
      } else {
        toast.error(result.data?.error || t('pro.error'));
      }
    },
    onError: (err) => {
      toast.error(
        typeof err.error.serverError === 'string'
          ? err.error.serverError
          : t('pro.error')
      );
    },
  });

  // show fake data in demo website
  const isDemo = isDemoWebsite();

  const handleBan = async () => {
    if (!banReason) {
      setError(t('ban.error'));
      return;
    }

    if (!user.id) {
      setError('User ID is required');
      return;
    }

    setError('');

    try {
      await banUserMutation.mutateAsync({
        userId: user.id,
        banReason,
        banExpiresIn: banExpiresAt
          ? Math.floor((banExpiresAt.getTime() - Date.now()) / 1000)
          : undefined,
      });

      toast.success(t('ban.success'));
      // Reset form
      setBanReason('');
      setBanExpiresAt(undefined);
    } catch (err) {
      const error = err as Error;
      console.error('Failed to ban user:', error);
      setError(error.message || t('ban.error'));
      toast.error(error.message || t('ban.error'));
    }
  };

  const handleUnban = async () => {
    if (!user.id) {
      setError('User ID is required');
      return;
    }

    setError('');

    try {
      await unbanUserMutation.mutateAsync({
        userId: user.id,
      });

      toast.success(t('unban.success'));
    } catch (err) {
      const error = err as Error;
      console.error('Failed to unban user:', error);
      setError(error.message || t('unban.error'));
      toast.error(error.message || t('unban.error'));
    }
  };

  const handleGrantPro = () => {
    const expireDays = proExpireDays
      ? Number.parseInt(proExpireDays, 10)
      : undefined;

    grantProAction.execute({
      userId: user.id,
      expireDays,
    });
  };

  const handleRevokePro = () => {
    revokeProAction.execute({
      userId: user.id,
    });
  };

  const handleGiftCredits = () => {
    const amount = Number.parseInt(giftAmount, 10);
    if (!amount || amount <= 0) {
      toast.error(t('gift.invalidAmount'));
      return;
    }

    const expireDays = giftExpireDays
      ? Number.parseInt(giftExpireDays, 10)
      : undefined;

    giftCreditsAction.execute({
      userId: user.id,
      amount,
      expireDays,
      note: giftNote || undefined,
    });
  };

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="cursor-pointer text-foreground w-fit px-0 text-left"
        >
          <div className="flex items-center gap-2 pl-3">
            <UserAvatar
              name={user.name}
              image={user.image}
              className="size-8 border"
            />
            <span className="hover:underline hover:underline-offset-4">
              {user.name}
            </span>
          </div>
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <div className="flex items-center gap-4">
            <UserAvatar
              name={user.name}
              image={user.image}
              className="size-12 border"
            />
            <div>
              <DrawerTitle>{user.name}</DrawerTitle>
              {/* <DrawerDescription>{user.email}</DrawerDescription> */}
            </div>
          </div>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              {/* role */}
              <Badge
                variant={user.role === 'admin' ? 'default' : 'outline'}
                className="px-1.5"
              >
                {user.role === 'admin' ? t('admin') : t('user')}
              </Badge>
              {/* email verified */}
              {/* <Badge variant="outline" className="px-1.5 hover:bg-accent">
                {user.emailVerified ? (
                  <MailCheckIcon className="stroke-green-500 dark:stroke-green-400" />
                ) : (
                  <MailQuestionIcon className="stroke-red-500 dark:stroke-red-400" />
                )}
                {user.emailVerified
                  ? t('email.verified')
                  : t('email.unverified')}
              </Badge> */}

              {/* user banned */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-1.5 hover:bg-accent">
                  {user.banned ? (
                    <UserRoundXIcon className="stroke-red-500 dark:stroke-red-400" />
                  ) : (
                    <UserRoundCheckIcon className="stroke-green-500 dark:stroke-green-400" />
                  )}
                  {user.banned ? t('banned') : t('active')}
                </Badge>
              </div>
            </div>

            {/* email */}
            {user.email && (
              <div className="grid gap-3">
                <span className="text-muted-foreground text-xs">
                  {t('columns.email')}:
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-sm px-1.5 cursor-pointer hover:bg-accent"
                    onClick={() => {
                      navigator.clipboard.writeText(user.email);
                      toast.success(t('emailCopied'));
                    }}
                  >
                    {user.emailVerified ? (
                      <MailCheckIcon className="stroke-green-500 dark:stroke-green-400" />
                    ) : (
                      <MailQuestionIcon className="stroke-red-500 dark:stroke-red-400" />
                    )}
                    {user.email}
                  </Badge>
                </div>
              </div>
            )}

            {/* customerId */}
            {user.customerId && (
              <div className="grid gap-3">
                <span className="text-muted-foreground text-xs">
                  {t('columns.customerId')}:
                </span>
                <a
                  href={getStripeDashboardCustomerUrl(user.customerId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm hover:underline hover:underline-offset-4 rounded break-all"
                >
                  {user.customerId}
                </a>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="grid gap-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('joined')}:</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('updated')}:</span>
              <span>{formatDate(user.updatedAt)}</span>
            </div>
          </div>
          <Separator />

          {/* Grant Pro Section */}
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              <CrownIcon className="size-4" />
              <span className="font-medium">{t('pro.title')}</span>
            </div>
            {/* Current Pro Status */}
            <div className="flex items-center gap-2">
              <Badge
                variant={user.adminGrantedPro ? 'default' : 'outline'}
                className="px-1.5"
              >
                {user.adminGrantedPro ? (
                  <ShieldCheckIcon className="stroke-green-500 dark:stroke-green-400" />
                ) : (
                  <ShieldXIcon className="stroke-muted-foreground" />
                )}
                {user.adminGrantedPro ? t('pro.active') : t('pro.inactive')}
              </Badge>
              {user.adminGrantedPro && user.adminGrantedProExpiresAt && (
                <span className="text-xs text-muted-foreground">
                  {t('pro.expiresAt')}:{' '}
                  {formatDate(user.adminGrantedProExpiresAt)}
                </span>
              )}
              {user.adminGrantedPro && !user.adminGrantedProExpiresAt && (
                <span className="text-xs text-muted-foreground">
                  {t('pro.permanent')}
                </span>
              )}
            </div>
            {user.adminGrantedPro ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRevokePro}
                disabled={revokeProAction.isPending || isDemo}
                className="cursor-pointer"
              >
                {revokeProAction.isPending && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                <ShieldXIcon className="mr-2 size-4" />
                {t('pro.revokeButton')}
              </Button>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="pro-expire-days">
                    {t('pro.expireDays')}
                    <span className="text-muted-foreground ml-1">
                      ({t('pro.optional')})
                    </span>
                  </Label>
                  <Input
                    id="pro-expire-days"
                    type="number"
                    min="1"
                    value={proExpireDays}
                    onChange={(e) => setProExpireDays(e.target.value)}
                    placeholder={t('pro.expireDaysPlaceholder')}
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleGrantPro}
                  disabled={grantProAction.isPending || isDemo}
                  className="cursor-pointer"
                >
                  {grantProAction.isPending && (
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                  )}
                  <CrownIcon className="mr-2 size-4" />
                  {t('pro.grantButton')}
                </Button>
              </div>
            )}
          </div>
          <Separator />

          {/* Gift Credits Section */}
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              <GiftIcon className="size-4" />
              <span className="font-medium">{t('gift.title')}</span>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="gift-amount">{t('gift.amount')}</Label>
                <Input
                  id="gift-amount"
                  type="number"
                  min="1"
                  value={giftAmount}
                  onChange={(e) => setGiftAmount(e.target.value)}
                  placeholder={t('gift.amountPlaceholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gift-expire-days">
                  {t('gift.expireDays')}
                  <span className="text-muted-foreground ml-1">
                    ({t('gift.optional')})
                  </span>
                </Label>
                <Input
                  id="gift-expire-days"
                  type="number"
                  min="1"
                  value={giftExpireDays}
                  onChange={(e) => setGiftExpireDays(e.target.value)}
                  placeholder={t('gift.expireDaysPlaceholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gift-note">
                  {t('gift.note')}
                  <span className="text-muted-foreground ml-1">
                    ({t('gift.optional')})
                  </span>
                </Label>
                <Textarea
                  id="gift-note"
                  value={giftNote}
                  onChange={(e) => setGiftNote(e.target.value)}
                  placeholder={t('gift.notePlaceholder')}
                  rows={2}
                />
              </div>
              <Button
                type="button"
                onClick={handleGiftCredits}
                disabled={giftCreditsAction.isPending || !giftAmount || isDemo}
                className="cursor-pointer"
              >
                {giftCreditsAction.isPending && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                <GiftIcon className="mr-2 size-4" />
                {t('gift.button')}
              </Button>
            </div>
          </div>
          <Separator />

          {/* error */}
          {error && <div className="text-sm text-destructive">{error}</div>}

          {/* ban or unban user */}
          {user.banned ? (
            <div className="grid gap-4">
              <div className="">
                {t('ban.reason')}: {user.banReason}
              </div>
              <div className="">
                {t('ban.expires')}:{' '}
                {(user.banExpires && formatDate(user.banExpires)) ||
                  t('ban.never')}
              </div>
              <Button
                variant="destructive"
                onClick={handleUnban}
                disabled={unbanUserMutation.isPending || isDemo}
                className="mt-4 cursor-pointer"
              >
                {unbanUserMutation.isPending && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                {t('unban.button')}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleBan();
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="ban-reason">{t('ban.reason')}</Label>
                <Textarea
                  id="ban-reason"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder={t('ban.reasonPlaceholder')}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('ban.expires')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'justify-start text-left font-normal cursor-pointer',
                        !banExpiresAt && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon />
                      {banExpiresAt ? (
                        formatDate(banExpiresAt)
                      ) : (
                        <span>{t('ban.selectDate')}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={banExpiresAt}
                      onSelect={setBanExpiresAt}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="submit"
                variant="destructive"
                disabled={banUserMutation.isPending || !banReason || isDemo}
                className="mt-4 cursor-pointer"
              >
                {banUserMutation.isPending && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                {t('ban.button')}
              </Button>
            </form>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">{t('close')}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
