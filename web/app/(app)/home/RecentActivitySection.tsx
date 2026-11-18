'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  ClipboardList,
  FileText,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import Button from '@/app/components/ui/Button';
import Card from '@/app/components/ui/Card';
import Section from '@/app/components/ui/layout/Section';
import { api } from '@/services/api';

export type RecentActivity = {
  type: 'QUOTE' | 'SALE' | 'PURCHASE' | 'RECEIPT';
  id: string;
  folio: string;
  createdAt: string;
};

type ActivityKind = {
  label: string;
  icon: LucideIcon;
  className: string;
  listHref: string;
};

const kinds: Record<RecentActivity['type'], ActivityKind> = {
  QUOTE: {
    label: 'Cotización registrada',
    icon: FileText,
    className: 'bg-blue-50 text-blue-700',
    listHref: '/quotes',
  },
  SALE: {
    label: 'Venta registrada',
    icon: ShoppingCart,
    className: 'bg-emerald-50 text-emerald-700',
    listHref: '/sales',
  },
  PURCHASE: {
    label: 'Compra registrada',
    icon: ClipboardList,
    className: 'bg-violet-50 text-violet-700',
    listHref: '/purchases',
  },
  RECEIPT: {
    label: 'Recepción registrada',
    icon: PackageCheck,
    className: 'bg-amber-50 text-amber-700',
    listHref: '/purchase-receipts',
  },
};

export function getRecentActivityHref(item: RecentActivity): string {
  // The three document lists do not yet have URL-addressable detail pages.
  // Receipts do have an authorized, tenant-scoped detail route.
  return item.type === 'RECEIPT'
    ? '/purchase-receipts/' + encodeURIComponent(item.id)
    : kinds[item.type].listHref;
}

export function formatRecentActivityDate(
  timestamp: string,
  timezone: string,
): string {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) {
    return 'Fecha no disponible';
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(value);
  } catch {
    return 'Fecha no disponible';
  }
}

type ActivityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; items: RecentActivity[] };

export default function RecentActivitySection({
  companyId,
  timezone,
}: {
  companyId: string;
  timezone: string;
}) {
  const [state, setState] = useState<ActivityState>({ status: 'loading' });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setState({ status: 'loading' });

      try {
        const response = await api.get<RecentActivity[]>(
          '/dashboard/recent-activity',
        );
        if (!cancelled) {
          setState({
            status: 'success',
            items: Array.isArray(response.data) ? response.data : [],
          });
        }
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, retryVersion]);

  if (!companyId) return null;

  return (
    <Section
      title="Actividad reciente"
      description="Últimos documentos registrados en tu empresa."
    >
      <Card className="border border-border shadow-subtle">
        {state.status === 'loading' ? (
          <p role="status" className="text-sm text-text-muted">
            Cargando actividad reciente...
          </p>
        ) : state.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              No fue posible consultar la actividad reciente.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRetryVersion((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" size={16} />
              Reintentar actividad
            </Button>
          </div>
        ) : state.items.length === 0 ? (
          <p className="text-sm text-text-muted">
            Aún no hay documentos registrados para mostrar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {state.items.map((item) => {
              const kind = kinds[item.type];
              const Icon = kind.icon;
              return (
                <li key={item.type + '-' + item.id}>
                  <Link
                    href={getRecentActivityHref(item)}
                    className="group flex min-w-0 items-center gap-3 rounded-ui-md py-3 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring first:pt-0 last:pb-0"
                  >
                    <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ' + kind.className}>
                      <Icon aria-hidden="true" size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text group-hover:text-primary">
                        {kind.label}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        Folio {item.folio}
                      </span>
                    </span>
                    <time
                      dateTime={item.createdAt}
                      className="hidden shrink-0 text-right text-xs tabular-nums text-text-muted sm:block"
                    >
                      {formatRecentActivityDate(item.createdAt, timezone)}
                    </time>
                    <ArrowUpRight aria-hidden="true" size={17} className="shrink-0 text-text-muted group-hover:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Section>
  );
}
