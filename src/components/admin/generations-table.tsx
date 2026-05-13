'use client';

import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
  ChevronRightIcon as ChevronRightSmallIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment, useState } from 'react';

export interface GenerationItem {
  id: string;
  type: string;
  status: string;
  modelId: string | null;
  channel: string | null;
  mode: string | null;
  prompt: string | null;
  optimizedPrompt: string | null;
  errorMessage: string | null;
  creditsUsed: number | null;
  inputImageUrls: string[] | null;
  outputImageUrls: string[] | null;
  outputImageUrlsR2: string[] | null;
  outputVideoUrl: string | null;
  outputVideoUrlR2: string | null;
  thumbnailUrl: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  metadata: any;
  logs: any;
  metrics: any;
  providerRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  userName: string | null;
  userEmail: string | null;
}

interface DataTableColumnHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  column: any;
  title: string;
}

function DataTableColumnHeader({
  column,
  title,
  className,
}: DataTableColumnHeaderProps) {
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

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  SAVED_TO_R2:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  IN_QUEUE:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  IN_PROGRESS:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

const CHANNEL_OPTIONS = [
  'all',
  'kie',
  'apicore',
  'google',
  'vertex',
  'byteplus',
  'volcano',
  'ali',
  'fal',
  'flow',
  'jimeng',
];

function ExpandedRow({ item }: { item: GenerationItem }) {
  const t = useTranslations('Dashboard.admin.generations.detail');
  const meta = item.metadata as Record<string, unknown> | null;
  const channel: string | null =
    item.channel ||
    (meta
      ? (meta.channel as string) || (meta.provider as string) || null
      : null);

  const imageUrl =
    item.outputImageUrlsR2?.[0] ||
    item.outputImageUrls?.[0] ||
    item.thumbnailUrl;
  const videoUrl = item.outputVideoUrlR2 || item.outputVideoUrl;

  return (
    <TableRow>
      <TableCell colSpan={100} className="bg-muted/30 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {item.prompt && (
              <div>
                <p className="mb-1 text-sm font-medium">{t('prompt')}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {item.prompt}
                </pre>
              </div>
            )}
            {item.optimizedPrompt && (
              <div>
                <p className="mb-1 text-sm font-medium">
                  {t('optimizedPrompt')}
                </p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {item.optimizedPrompt}
                </pre>
              </div>
            )}
            {item.errorMessage && (
              <div>
                <p className="mb-1 text-sm font-medium">{t('error')}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
                  {item.errorMessage}
                </pre>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {item.mode && (
                <div>
                  <span className="text-muted-foreground">{t('mode')}:</span>{' '}
                  {item.mode}
                </div>
              )}
              {item.aspectRatio && (
                <div>
                  <span className="text-muted-foreground">
                    {t('aspectRatio')}:
                  </span>{' '}
                  {item.aspectRatio}
                </div>
              )}
              {item.resolution && (
                <div>
                  <span className="text-muted-foreground">
                    {t('resolution')}:
                  </span>{' '}
                  {item.resolution}
                </div>
              )}
              {item.durationSeconds != null && (
                <div>
                  <span className="text-muted-foreground">
                    {t('duration')}:
                  </span>{' '}
                  {item.durationSeconds}s
                </div>
              )}
              {item.creditsUsed != null && (
                <div>
                  <span className="text-muted-foreground">{t('credits')}:</span>{' '}
                  {item.creditsUsed}
                </div>
              )}
              {item.providerRequestId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    {t('providerRequestId')}:
                  </span>{' '}
                  <code className="text-xs">{item.providerRequestId}</code>
                </div>
              )}
              {channel && (
                <div>
                  <span className="text-muted-foreground">{t('channel')}:</span>{' '}
                  {channel}
                </div>
              )}
            </div>
            {item.logs && (
              <div>
                <p className="mb-1 text-sm font-medium">{t('logs')}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(item.logs, null, 2)}
                </pre>
              </div>
            )}
            {item.metrics && (
              <div>
                <p className="mb-1 text-sm font-medium">{t('metrics')}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(item.metrics, null, 2)}
                </pre>
              </div>
            )}
          </div>
          <div className="flex flex-col items-start justify-center gap-4">
            {item.inputImageUrls && item.inputImageUrls.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t('inputImages')}</p>
                <div className="flex flex-wrap gap-2">
                  {item.inputImageUrls.map((url, index) => (
                    <Image
                      key={index}
                      src={url}
                      alt={`Input image ${index + 1}`}
                      width={120}
                      height={120}
                      className="h-24 w-auto rounded-lg border object-contain"
                      unoptimized
                    />
                  ))}
                </div>
              </div>
            )}
            {videoUrl ? (
              <video src={videoUrl} controls className="max-h-80 rounded-lg">
                <track kind="captions" />
              </video>
            ) : imageUrl ? (
              <Image
                src={imageUrl}
                alt="Generation output"
                width={400}
                height={400}
                className="max-h-80 w-auto rounded-lg object-contain"
                unoptimized
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                {t('noPreview')}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface GenerationsTableProps {
  data: GenerationItem[];
  total: number;
  pageIndex: number;
  pageSize: number;
  search: string;
  modelId: string;
  status: string;
  type: string;
  channel: string;
  sorting?: SortingState;
  loading?: boolean;
  onSearch: (search: string) => void;
  onModelChange: (model: string) => void;
  onStatusChange: (status: string) => void;
  onTypeChange: (type: string) => void;
  onChannelChange: (channel: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortingChange?: (sorting: SortingState) => void;
}

export function GenerationsTable({
  data,
  total,
  pageIndex,
  pageSize,
  search,
  modelId,
  status,
  type,
  channel,
  sorting = [{ id: 'createdAt', desc: true }],
  loading,
  onSearch,
  onModelChange,
  onStatusChange,
  onTypeChange,
  onChannelChange,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
}: GenerationsTableProps) {
  const t = useTranslations('Dashboard.admin.generations');
  const tTable = useTranslations('Common.table');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const columnIdToTranslationKey = {
    createdAt: 'columns.time' as const,
    user: 'columns.user' as const,
    type: 'columns.type' as const,
    modelId: 'columns.model' as const,
    channel: 'columns.channel' as const,
    status: 'columns.status' as const,
    creditsUsed: 'columns.credits' as const,
    prompt: 'columns.prompt' as const,
    errorMessage: 'columns.error' as const,
    thumbnail: 'columns.thumbnail' as const,
  } as const;

  const columns: ColumnDef<GenerationItem>[] = [
    {
      id: 'expand',
      header: () => null,
      cell: ({ row }) => {
        const isExpanded = expandedRows.has(row.original.id);
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-[24px] sm:min-w-[24px]"
            onClick={() => toggleRow(row.original.id)}
            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
            aria-expanded={isExpanded}
          >
            <ChevronRightSmallIcon
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </Button>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.time')} />
      ),
      cell: ({ row }) => (
        <div className="pl-3 text-sm">{formatDate(row.original.createdAt)}</div>
      ),
      minSize: 120,
      size: 140,
    },
    {
      accessorKey: 'user',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.user')} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex flex-col gap-1 pl-3">
            <span className="font-medium">{item.userName || '-'}</span>
            <span className="text-xs text-muted-foreground">
              {item.userEmail || '-'}
            </span>
          </div>
        );
      },
      enableSorting: false,
      minSize: 140,
      size: 160,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.type')} />
      ),
      cell: ({ row }) => {
        const isImage = row.original.type === 'image';
        return (
          <div className="pl-3">
            <Badge
              variant="outline"
              className={
                isImage
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
              }
            >
              {isImage ? t('type.image') : t('type.video')}
            </Badge>
          </div>
        );
      },
      enableSorting: false,
      minSize: 80,
      size: 100,
    },
    {
      accessorKey: 'modelId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.model')} />
      ),
      cell: ({ row }) => (
        <div className="pl-3 text-sm">{row.original.modelId || '-'}</div>
      ),
      enableSorting: false,
      minSize: 120,
      size: 160,
    },
    {
      accessorKey: 'channel',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.channel')} />
      ),
      cell: ({ row }) => (
        <div className="pl-3 text-sm">
          {row.original.channel ? (
            <Badge variant="outline" className="font-mono text-xs">
              {row.original.channel}
            </Badge>
          ) : (
            '-'
          )}
        </div>
      ),
      enableSorting: false,
      minSize: 80,
      size: 100,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.status')} />
      ),
      cell: ({ row }) => {
        const s = row.original.status;
        const colorClass = STATUS_COLORS[s] || '';
        return (
          <div className="pl-3">
            <Badge variant="outline" className={colorClass}>
              {s}
            </Badge>
          </div>
        );
      },
      enableSorting: false,
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: 'creditsUsed',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.credits')} />
      ),
      cell: ({ row }) => (
        <div className="pl-3 text-sm">{row.original.creditsUsed ?? '-'}</div>
      ),
      minSize: 80,
      size: 100,
    },
    {
      accessorKey: 'prompt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.prompt')} />
      ),
      cell: ({ row }) => {
        const prompt = row.original.prompt;
        if (!prompt) return <div className="pl-3">-</div>;
        const truncated =
          prompt.length > 50 ? `${prompt.substring(0, 50)}...` : prompt;
        return (
          <div className="pl-3 text-sm" title={prompt}>
            {truncated}
          </div>
        );
      },
      enableSorting: false,
      minSize: 160,
      size: 200,
    },
    {
      accessorKey: 'errorMessage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.error')} />
      ),
      cell: ({ row }) => {
        const err = row.original.errorMessage;
        if (!err) return <div className="pl-3">-</div>;
        const truncated = err.length > 50 ? `${err.substring(0, 50)}...` : err;
        return (
          <div className="pl-3 text-sm text-red-600" title={err}>
            {truncated}
          </div>
        );
      },
      enableSorting: false,
      minSize: 120,
      size: 160,
    },
    {
      id: 'thumbnail',
      header: () => <div className="pl-3">{t('columns.thumbnail')}</div>,
      cell: ({ row }) => {
        const item = row.original;
        const url =
          item.thumbnailUrl ||
          item.outputImageUrlsR2?.[0] ||
          item.outputImageUrls?.[0];
        if (!url) return <div className="pl-3">-</div>;
        return (
          <div className="pl-3">
            <Image
              src={url}
              alt="Thumbnail"
              width={32}
              height={32}
              className="h-8 w-8 rounded object-cover"
              unoptimized
            />
          </div>
        );
      },
      enableSorting: false,
      minSize: 60,
      size: 60,
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
            placeholder={t('filters.search')}
            value={search}
            onChange={(event) => {
              onSearch(event.target.value);
              onPageChange(0);
            }}
            className="max-w-xs"
          />
          <Select
            value={type}
            onValueChange={(value) => {
              onTypeChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-32 cursor-pointer">
              <SelectValue placeholder={t('filters.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="image">{t('type.image')}</SelectItem>
              <SelectItem value="video">{t('type.video')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              onStatusChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-36 cursor-pointer">
              <SelectValue placeholder={t('filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="succeeded">{t('status.succeeded')}</SelectItem>
              <SelectItem value="failed">{t('status.failed')}</SelectItem>
              <SelectItem value="in_progress">
                {t('status.inProgress')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={channel}
            onValueChange={(value) => {
              onChannelChange(value);
              onPageChange(0);
            }}
          >
            <SelectTrigger className="w-32 cursor-pointer">
              <SelectValue placeholder={t('filters.channel')} />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch === 'all' ? t('filters.all') : ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t('filters.model')}
            value={modelId === 'all' ? '' : modelId}
            onChange={(event) => {
              onModelChange(event.target.value || 'all');
              onPageChange(0);
            }}
            className="max-w-[200px]"
          />
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
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() && 'selected'}
                      className="h-14 cursor-pointer"
                      onClick={() => toggleRow(row.original.id)}
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
                    {expandedRows.has(row.original.id) && (
                      <ExpandedRow item={row.original} />
                    )}
                  </Fragment>
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
                  {[10, 20, 30, 40, 50].map((ps) => (
                    <SelectItem key={ps} value={`${ps}`}>
                      {ps}
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
