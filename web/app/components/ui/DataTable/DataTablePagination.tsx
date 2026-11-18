'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import Button from '../Button';

import type { DataTablePaginationState } from './DataTable.types';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type DataTablePaginationProps = DataTablePaginationState;

export default function DataTablePagination({
  pageIndex,
  pageSize,
  totalRows,
  compact = false,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps) {
  const pageCount = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
  const lastPageIndex = Math.max(pageCount - 1, 0);
  const firstRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, totalRows);
  const availablePageSizes = Array.from(
    new Set([...pageSizeOptions, pageSize]),
  )
    .filter((option) => option > 0)
    .sort((first, second) => first - second);
  const previousDisabled = totalRows === 0 || pageIndex === 0;
  const nextDisabled = totalRows === 0 || pageIndex >= lastPageIndex;

  return (
    <nav
      aria-label="Paginación de tabla"
      className="flex flex-col gap-4 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-text-secondary">
        Mostrando {firstRow}-{lastRow} de {totalRows}
      </p>

      {!compact ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Filas por página
            <select
              aria-label="Filas por página"
              value={pageSize}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {availablePageSizes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <span className="min-w-24 text-center text-sm text-text-secondary">
            Página {pageCount === 0 ? 0 : pageIndex + 1} de {pageCount}
          </span>

          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 p-0"
              aria-label="Página anterior"
              title="Página anterior"
              disabled={previousDisabled}
              onClick={() => onPageChange(pageIndex - 1)}
            >
              <ChevronLeft aria-hidden="true" size={17} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 p-0"
              aria-label="Página siguiente"
              title="Página siguiente"
              disabled={nextDisabled}
              onClick={() => onPageChange(pageIndex + 1)}
            >
              <ChevronRight aria-hidden="true" size={17} />
            </Button>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
