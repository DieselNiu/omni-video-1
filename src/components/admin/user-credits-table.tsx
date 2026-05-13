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
  CopyIcon,
  ImageIcon,
  VideoIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';

// Credit transaction type
export interface CreditTransaction {
  id: string;
  userId: string;
  type: string;
  description: string | null;
  amount: number;
  remainingAmount: number | null;
  paymentId: string | null;
  expirationDate: Date | null;
  createdAt: Date;
  assetId: string | null;
  assetType: string | null;
  assetStatus: string | null;
  outputImageUrls: string[] | null;
  outputImageUrlsR2: string[] | null;
  outputVideoUrl: string | null;
  outputVideoUrlR2: string | null;
}

// Credit transaction types
const CREDIT_TRANSACTION_TYPES = [
  'MONTHLY_REFRESH',
  'REGISTER_GIFT',
  'PURCHASE',
  'PURCHASE_PACKAGE',
  'USAGE',
  'EXPIRE',
  'SUBSCRIPTION_RENEWAL',
  'LIFETIME_MONTHLY',
  'VIDEO_GENERATION',
  'VIDEO_GENERATION_REFUND',
  'IMAGE_GENERATION',
  'IMAGE_GENERATION_REFUND',
  'REFUND',
  'GIFT',
] as const;

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

interface UserCreditsTableProps {
  data: CreditTransaction[];
  total: number;
  pageIndex: number;
  pageSize: number;
  type: string;
  sorting?: SortingState;
  loading?: boolean;
  onTypeChange: (type: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortingChange?: (sorting: SortingState) => void;
}

export function UserCreditsTable({
  data,
  total,
  pageIndex,
  pageSize,
  type,
  sorting = [{ id: 'createdAt', desc: true }],
  loading,
  onTypeChange,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
}: UserCreditsTableProps) {
  const t = useTranslations('Dashboard.admin.userCredits');
  const tTypes = useTranslations(
    'Dashboard.settings.credits.transactions.types'
  );
  const tTable = useTranslations('Common.table');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Map column IDs to translation keys
  const columnIdToTranslationKey = {
    type: 'columns.type' as const,
    description: 'columns.description' as const,
    amount: 'columns.amount' as const,
    remainingAmount: 'columns.remainingAmount' as const,
    paymentId: 'columns.paymentId' as const,
    expirationDate: 'columns.expirationDate' as const,
    createdAt: 'columns.createdAt' as const,
    assetUrl: 'columns.assetUrl' as const,
  } as const;

  // Get badge variant based on transaction type
  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'PURCHASE':
      case 'PURCHASE_PACKAGE':
      case 'SUBSCRIPTION_RENEWAL':
      case 'LIFETIME_MONTHLY':
      case 'VIDEO_GENERATION_REFUND':
      case 'IMAGE_GENERATION_REFUND':
      case 'REFUND':
        return 'default';
      case 'USAGE':
      case 'VIDEO_GENERATION':
      case 'IMAGE_GENERATION':
        return 'secondary';
      case 'EXPIRE':
        return 'destructive';
      case 'REGISTER_GIFT':
      case 'DAILY_CHECKIN':
      case 'MONTHLY_REFRESH':
        return 'outline';
      default:
        return 'outline';
    }
  };

  // Table columns definition
  const columns: ColumnDef<CreditTransaction>[] = [
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.type')} />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex items-center gap-2 pl-3">
            <Badge variant={getTypeBadgeVariant(transaction.type)}>
              {tTypes(
                transaction.type as
                  | 'MONTHLY_REFRESH'
                  | 'REGISTER_GIFT'
                  | 'PURCHASE'
                  | 'PURCHASE_PACKAGE'
                  | 'USAGE'
                  | 'EXPIRE'
                  | 'SUBSCRIPTION_RENEWAL'
                  | 'LIFETIME_MONTHLY'
                  | 'VIDEO_GENERATION'
                  | 'VIDEO_GENERATION_REFUND'
                  | 'IMAGE_GENERATION'
                  | 'IMAGE_GENERATION_REFUND'
                  | 'REFUND'
              )}
            </Badge>
          </div>
        );
      },
      minSize: 140,
      size: 160,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('columns.description')}
        />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex items-start gap-2 pl-3 max-w-[400px] break-words whitespace-normal py-1">
            {transaction.description || '-'}
          </div>
        );
      },
      minSize: 200,
      size: 300,
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.amount')} />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        const isPositive = transaction.amount > 0;
        return (
          <div className="flex items-center gap-2 pl-3">
            <span
              className={
                isPositive
                  ? 'text-green-600 dark:text-green-400 font-medium'
                  : 'text-red-600 dark:text-red-400 font-medium'
              }
            >
              {isPositive ? '+' : ''}
              {transaction.amount}
            </span>
          </div>
        );
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: 'remainingAmount',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('columns.remainingAmount')}
        />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex items-center gap-2 pl-3">
            {transaction.remainingAmount ?? '-'}
          </div>
        );
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: 'paymentId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.paymentId')} />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        if (!transaction.paymentId) {
          return <div className="flex items-center gap-2 pl-3">-</div>;
        }
        return (
          <div className="flex items-center gap-2 pl-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs cursor-pointer hover:bg-accent"
              onClick={() => {
                navigator.clipboard.writeText(transaction.paymentId!);
                toast.success(t('paymentIdCopied'));
              }}
            >
              <CopyIcon className="h-3 w-3 mr-1" />
              {transaction.paymentId.slice(0, 12)}...
            </Button>
          </div>
        );
      },
      minSize: 140,
      size: 160,
    },
    {
      accessorKey: 'expirationDate',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('columns.expirationDate')}
        />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        if (!transaction.expirationDate) {
          return <div className="flex items-center gap-2 pl-3">-</div>;
        }
        const isExpired = new Date(transaction.expirationDate) < new Date();
        return (
          <div className="flex items-center gap-2 pl-3">
            <span className={isExpired ? 'text-muted-foreground' : ''}>
              {formatDate(transaction.expirationDate)}
            </span>
            {isExpired && (
              <Badge variant="destructive" className="text-xs">
                {t('expired')}
              </Badge>
            )}
          </div>
        );
      },
      minSize: 160,
      size: 180,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.createdAt')} />
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex items-center gap-2 pl-3">
            {formatDate(transaction.createdAt)}
          </div>
        );
      },
      minSize: 140,
      size: 160,
    },
    {
      accessorKey: 'assetUrl',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.assetUrl')} />
      ),
      cell: ({ row }) => {
        const transaction = row.original;

        // Only show for generation types
        const isGenerationType = [
          'VIDEO_GENERATION',
          'IMAGE_GENERATION',
          'VIDEO_GENERATION_REFUND',
          'IMAGE_GENERATION_REFUND',
        ].includes(transaction.type);

        if (!isGenerationType) {
          return <div className="flex items-center gap-2 pl-3">-</div>;
        }

        // Determine URL (prefer R2 URLs)
        let displayUrl: string | null = null;
        let urlType: 'image' | 'video' | null = null;

        if (transaction.assetType === 'video') {
          displayUrl =
            transaction.outputVideoUrlR2 || transaction.outputVideoUrl;
          urlType = 'video';
        } else if (transaction.assetType === 'image') {
          const r2Urls = transaction.outputImageUrlsR2;
          const originalUrls = transaction.outputImageUrls;
          displayUrl = r2Urls?.[0] || originalUrls?.[0] || null;
          urlType = 'image';
        }

        if (!displayUrl) {
          // Asset exists but no output URL
          if (transaction.assetId) {
            return (
              <div className="flex items-center gap-2 pl-3">
                <Badge variant="outline" className="text-xs">
                  {transaction.assetStatus || 'No output'}
                </Badge>
              </div>
            );
          }
          // No asset linked (historical data)
          return (
            <div className="flex items-center gap-2 pl-3 text-muted-foreground text-xs">
              N/A
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 pl-3">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
            >
              {urlType === 'video' ? (
                <>
                  <VideoIcon className="h-3 w-3" />
                  View Video
                </>
              ) : (
                <>
                  <ImageIcon className="h-3 w-3" />
                  View Image
                </>
              )}
            </a>
            {transaction.outputImageUrls &&
              transaction.outputImageUrls.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  +{transaction.outputImageUrls.length - 1}
                </Badge>
              )}
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
      <div className="flex items-center justify-between px-4 lg:px-6 gap-4">
        <div className="flex flex-1 items-center gap-4">
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[180px] cursor-pointer">
              <SelectValue placeholder={t('filters.allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
              {CREDIT_TRANSACTION_TYPES.map((transactionType) => (
                <SelectItem key={transactionType} value={transactionType}>
                  {tTypes(transactionType)}
                </SelectItem>
              ))}
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
            {tTable('totalRecords', { count: total })}
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
                  {[10, 20, 30, 40, 50].map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
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
