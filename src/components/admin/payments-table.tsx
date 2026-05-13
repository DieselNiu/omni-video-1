'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/formatter';
import { getStripeDashboardCustomerUrl } from '@/lib/urls/urls';
import { IconCaretDownFilled, IconCaretUpFilled } from '@tabler/icons-react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';

// Payment item type from the server action
export interface PaymentItem {
  id: string;
  priceId: string;
  type: string;
  scene: string | null;
  interval: string | null;
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  sessionId: string | null;
  invoiceId: string | null;
  status: string;
  paid: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
  provider: string;
  paypalSubscriptionId: string | null;
  paypalOrderId: string | null;
  userName: string | null;
  userEmail: string | null;
}

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: any;
  title: string;
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const tTable = useTranslations('Common.table');
  if (!column.getCanSort()) {
    return <div className={className}>{title}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="cursor-pointer flex items-center gap-2 h-8 data-[state=open]:bg-accent"
          >
            {title}
            {isSorted === 'asc' && <IconCaretUpFilled className="h-4 w-4" />}
            {isSorted === 'desc' && <IconCaretDownFilled className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup
            value={isSorted === false ? '' : isSorted}
            onValueChange={(value) => {
              if (value === 'asc') column.toggleSorting(false);
              else if (value === 'desc') column.toggleSorting(true);
            }}
          >
            <DropdownMenuRadioItem value="asc">
              <span className="flex items-center gap-2">
                {tTable('ascending')}
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc">
              <span className="flex items-center gap-2">
                {tTable('descending')}
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <TableRow className="h-14">
      {Array.from({ length: columns }).map((_, index) => (
        <TableCell key={index} className="py-3">
          <div className="flex items-center gap-2 pl-3">
            <Skeleton className="h-4 w-24" />
          </div>
        </TableCell>
      ))}
    </TableRow>
  );
}

interface PaymentsTableProps {
  data: PaymentItem[];
  total: number;
  pageIndex: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
  scene: string;
  provider: string;
  sorting?: SortingState;
  loading?: boolean;
  onSearch: (search: string) => void;
  onStatusChange: (status: string) => void;
  onTypeChange: (type: string) => void;
  onSceneChange: (scene: string) => void;
  onProviderChange: (provider: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortingChange?: (sorting: SortingState) => void;
}

export function PaymentsTable({
  data,
  total,
  pageIndex,
  pageSize,
  search,
  status,
  type,
  scene,
  provider,
  sorting = [{ id: 'createdAt', desc: true }],
  loading,
  onSearch,
  onStatusChange,
  onTypeChange,
  onSceneChange,
  onProviderChange,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
}: PaymentsTableProps) {
  const t = useTranslations('Dashboard.admin.payments');
  const tTable = useTranslations('Common.table');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Map column IDs to translation keys
  const columnIdToTranslationKey = {
    user: 'columns.user' as const,
    type: 'columns.type' as const,
    status: 'columns.status' as const,
    provider: 'columns.provider' as const,
    period: 'columns.period' as const,
    createdAt: 'columns.createdAt' as const,
  } as const;

  // Get status badge variant
  const getStatusBadgeVariant = (status: string, paid: boolean) => {
    if (paid) return 'default';
    switch (status) {
      case 'active':
        return 'default';
      case 'canceled':
      case 'failed':
        return 'destructive';
      case 'completed':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Table columns definition
  const columns: ColumnDef<PaymentItem>[] = [
    {
      accessorKey: 'user',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.user')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <div className="flex flex-col gap-1 pl-3">
            <span className="font-medium">{payment.userName || '-'}</span>
            <span className="text-xs text-muted-foreground">
              {payment.userEmail || '-'}
            </span>
          </div>
        );
      },
      enableSorting: false,
      minSize: 160,
      size: 180,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.type')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <div className="flex flex-col gap-1 pl-3">
            <Badge variant="outline" className="w-fit">
              {payment.type === 'subscription'
                ? t('type.subscription')
                : t('type.oneTime')}
            </Badge>
            {payment.scene && (
              <Badge variant="secondary" className="w-fit text-xs">
                {payment.scene === 'lifetime'
                  ? t('scene.lifetime')
                  : payment.scene === 'credit'
                    ? t('scene.credit')
                    : t('scene.subscription')}
              </Badge>
            )}
          </div>
        );
      },
      minSize: 120,
      size: 140,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.status')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <div className="flex flex-col gap-1 pl-3">
            <Badge
              variant={getStatusBadgeVariant(payment.status, payment.paid)}
              className="w-fit"
            >
              {payment.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {payment.paid ? t('paid') : t('unpaid')}
            </span>
          </div>
        );
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: 'provider',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.provider')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <div className="flex items-center gap-2 pl-3">
            <Badge variant="outline" className="capitalize">
              {payment.provider}
            </Badge>
          </div>
        );
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: 'period',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.period')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        if (!payment.periodStart && !payment.periodEnd) {
          return <div className="pl-3">-</div>;
        }
        return (
          <div className="flex flex-col gap-1 pl-3 text-sm">
            {payment.periodStart && (
              <span>{formatDate(payment.periodStart)}</span>
            )}
            {payment.periodEnd && (
              <span className="text-muted-foreground">
                ~ {formatDate(payment.periodEnd)}
              </span>
            )}
          </div>
        );
      },
      enableSorting: false,
      minSize: 140,
      size: 160,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.createdAt')} />
      ),
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <div className="flex items-center gap-2 pl-3">
            {formatDate(payment.createdAt)}
          </div>
        );
      },
      minSize: 140,
      size: 160,
    },
  ];

  const table = useReactTable({
    data,
    columns,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: { pageIndex, pageSize },
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange?.(next);
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize })
          : updater;
      if (next.pageIndex !== pageIndex) onPageChange(next.pageIndex);
      if (next.pageSize !== pageSize) onPageSizeChange(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div className="w-full flex-col justify-start gap-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between px-4 lg:px-6 gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(event) => {
              onSearch(event.target.value);
              onPageChange(0);
            }}
            className="max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(value) => {
              onStatusChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-32 cursor-pointer">
              <SelectValue placeholder={t('filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="canceled">{t('status.canceled')}</SelectItem>
              <SelectItem value="completed">{t('status.completed')}</SelectItem>
              <SelectItem value="failed">{t('status.failed')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(value) => {
              onTypeChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-36 cursor-pointer">
              <SelectValue placeholder={t('filters.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="subscription">
                {t('type.subscription')}
              </SelectItem>
              <SelectItem value="one_time">{t('type.oneTime')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scene}
            onValueChange={(value) => {
              onSceneChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-36 cursor-pointer">
              <SelectValue placeholder={t('filters.scene')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="lifetime">{t('scene.lifetime')}</SelectItem>
              <SelectItem value="credit">{t('scene.credit')}</SelectItem>
              <SelectItem value="subscription">
                {t('scene.subscription')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={provider}
            onValueChange={(value) => {
              onProviderChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-32 cursor-pointer">
              <SelectValue placeholder={t('filters.provider')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="cursor-pointer">
              <span className="inline">{t('columns.columns')}</span>
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize cursor-pointer"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {t(
                      columnIdToTranslationKey[
                        column.id as keyof typeof columnIdToTranslationKey
                      ] || 'columns.columns'
                    )}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <TableRowSkeleton key={index} columns={columns.length} />
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="h-14"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    {tTable('noResults')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {/* empty here for now */}
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                {tTable('rowsPerPage')}
              </Label>
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => {
                  onPageSizeChange(Number(value));
                  onPageChange(0);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-20 cursor-pointer"
                  id="rows-per-page"
                >
                  <SelectValue placeholder={pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              {tTable('page')} {pageIndex + 1} {' / '}
              {Math.max(1, Math.ceil(total / pageSize))}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="cursor-pointer hidden h-8 w-8 p-0 lg:flex"
                onClick={() => onPageChange(0)}
                disabled={pageIndex === 0}
              >
                <span className="sr-only">{tTable('firstPage')}</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="cursor-pointer size-8"
                size="icon"
                onClick={() => onPageChange(pageIndex - 1)}
                disabled={pageIndex === 0}
              >
                <span className="sr-only">{tTable('previousPage')}</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="cursor-pointer size-8"
                size="icon"
                onClick={() => onPageChange(pageIndex + 1)}
                disabled={pageIndex + 1 >= Math.ceil(total / pageSize)}
              >
                <span className="sr-only">{tTable('nextPage')}</span>
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                className="cursor-pointer hidden size-8 lg:flex"
                size="icon"
                onClick={() =>
                  onPageChange(Math.max(0, Math.ceil(total / pageSize) - 1))
                }
                disabled={pageIndex + 1 >= Math.ceil(total / pageSize)}
              >
                <span className="sr-only">{tTable('lastPage')}</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
