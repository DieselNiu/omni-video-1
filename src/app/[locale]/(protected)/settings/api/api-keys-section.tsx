'use client';

import { createApiKeyAction } from '@/actions/create-api-key';
import { listApiKeysAction } from '@/actions/list-api-keys';
import { revokeApiKeyAction } from '@/actions/revoke-api-key';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | Date | null;
  revokedAt: string | Date | null;
  createdAt: string | Date;
}

interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string;
  keyPrefix: string;
  createdAt: string | Date;
}

const apiKeysQueryKey = ['api-keys'] as const;

function unwrap<T>(result: unknown): T {
  const r = result as
    | {
        data?: T & { success?: boolean; error?: string };
        serverError?: string;
      }
    | undefined;
  if (r?.serverError) {
    throw new Error(r.serverError);
  }
  const data = r?.data;
  if (data && typeof data === 'object' && 'success' in data) {
    const wrapped = data as { success?: boolean; error?: string } & T;
    if (wrapped.success === false) {
      throw new Error(wrapped.error || 'Request failed');
    }
  }
  if (data === undefined || data === null) {
    throw new Error('Empty response');
  }
  return data as T;
}

function formatDate(
  value: string | Date | null | undefined,
  fallback: string
): string {
  if (!value) {
    return fallback;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return fallback;
  }
  return d.toLocaleString();
}

export function ApiKeysSection() {
  const t = useTranslations('Dashboard.settings.api');
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyEntry | null>(null);

  const keysQuery = useQuery({
    queryKey: apiKeysQueryKey,
    queryFn: async () => {
      const result = await listApiKeysAction();
      const data = unwrap<ApiKeyEntry[] | { keys: ApiKeyEntry[] }>(result);
      if (Array.isArray(data)) {
        return data;
      }
      return data.keys ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const result = await createApiKeyAction(payload);
      return unwrap<CreatedApiKey>(result);
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setName('');
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (payload: { keyId: string }) => {
      const result = await revokeApiKeyAction(payload);
      return unwrap<{ revoked: boolean }>(result);
    },
    onSuccess: () => {
      toast.success(t('list.revokeSuccess'));
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setRevokeTarget(null);
    },
  });

  const trimmed = name.trim();
  const nameTooLong = trimmed.length > 64;
  const canSubmit =
    trimmed.length > 0 && !nameTooLong && !createMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createMutation.mutate({ name: trimmed });
  };

  const handleCopy = async () => {
    if (!createdKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdKey.plaintext);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('copy error:', error);
      toast.error(t('copyFailed'));
    }
  };

  const handleCloseReveal = (open: boolean) => {
    if (!open) {
      setCreatedKey(null);
      setCopied(false);
    }
  };

  const keys = keysQuery.data ?? [];

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('create.title')}
          </CardTitle>
          <CardDescription>{t('create.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="api-key-name">{t('create.nameLabel')}</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('create.namePlaceholder')}
                maxLength={128}
                disabled={createMutation.isPending}
              />
              {nameTooLong && (
                <p className="text-sm text-destructive">
                  {t('create.nameTooLong')}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="cursor-pointer"
            >
              {createMutation.isPending
                ? t('create.submitting')
                : t('create.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('list.title')}
          </CardTitle>
          <CardDescription>{t('list.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {keysQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : keysQuery.isError ? (
            <p className="py-6 text-sm text-destructive">
              {(keysQuery.error as Error)?.message || t('list.loadError')}
            </p>
          ) : keys.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t('list.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.header.name')}</TableHead>
                  <TableHead>{t('list.header.prefix')}</TableHead>
                  <TableHead>{t('list.header.lastUsed')}</TableHead>
                  <TableHead>{t('list.header.created')}</TableHead>
                  <TableHead className="text-right">
                    {t('list.header.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const revoked = !!key.revokedAt;
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{key.name}</span>
                          {revoked && (
                            <Badge variant="secondary">
                              {t('list.revoked')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {key.keyPrefix}
                        ****
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(key.lastUsedAt, t('list.never'))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(key.createdAt, '-')}
                      </TableCell>
                      <TableCell className="text-right">
                        {!revoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="cursor-pointer text-destructive hover:text-destructive"
                            onClick={() => setRevokeTarget(key)}
                            disabled={revokeMutation.isPending}
                          >
                            {t('list.revoke')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!createdKey} onOpenChange={handleCloseReveal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('create.successTitle')}</DialogTitle>
            <DialogDescription>{t('create.successHint')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <p>{t('create.warning')}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">
              {t('create.keyLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                {createdKey?.plaintext}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="cursor-pointer"
              >
                {copied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => handleCloseReveal(false)}
              className="cursor-pointer"
            >
              {t('create.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('list.revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('list.revokeConfirm', { name: revokeTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('list.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (revokeTarget) {
                  revokeMutation.mutate({ keyId: revokeTarget.id });
                }
              }}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? t('list.revoking') : t('list.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
