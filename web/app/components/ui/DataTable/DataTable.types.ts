import type { ReactNode } from 'react';

export type DataTableColumnPriority = 'primary' | 'secondary' | 'tertiary';

export type DataTableColumnAlignment = 'start' | 'center' | 'end';

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: DataTableColumnAlignment;
  priority?: DataTableColumnPriority;
  minWidth?: number;
};

export type SortState =
  | {
      columnId: string;
      direction: 'asc' | 'desc';
    }
  | null;

export type DataTableSorting = {
  state: SortState;
  onChange: (state: SortState) => void;
};

export type DataTableRowActionVariant = 'default' | 'destructive';

export type DataTableRowAction<T> = {
  id: string;
  label: string;
  onSelect: (row: T) => void;
  variant?: DataTableRowActionVariant;
  disabled?: boolean | ((row: T) => boolean);
};

export type DataTableRowActions<T> = {
  label: (row: T) => string;
  actions: readonly DataTableRowAction<T>[];
};

export type DataTableEmptyState = {
  title: string;
  description?: string;
};

export type DataTableErrorState = {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export type DataTablePaginationState = {
  pageIndex: number;
  pageSize: number;
  totalRows: number;
  compact?: boolean;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
};

export type DataTableSearchControl = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
};

export type DataTableFilterOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type DataTableSelectFilter = {
  id: string;
  label: string;
  value: string;
  options: readonly DataTableFilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
};
