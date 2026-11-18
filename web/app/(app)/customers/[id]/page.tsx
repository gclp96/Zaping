'use client';

import axios from 'axios';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import StatusBadge from '@/app/components/business/StatusBadge';
import Button from '@/app/components/ui/Button';
import ForbiddenState from '@/app/components/ui/ForbiddenState';
import Loading from '@/app/components/ui/Loading';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import { COMMERCIAL_ROLES, hasRole } from '@/app/erp-role-access';
import { getQuoteStatusDescriptor } from '@/app/(app)/quotes/quote-status';
import { getSaleStatusDescriptor } from '@/app/(app)/sales/sale-status';
import type { QuoteStatus } from '@/app/(app)/quotes/types';
import type { SaleStatus } from '@/app/(app)/sales/types';
import {
  customerLocationLabel,
  customerTypeLabel,
} from '../customer-classification';
import { api } from '@/services/api';
import { getApiErrorMessage, isForbiddenError } from '@/services/errors';

type CustomerDetail = {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type RelatedDocument<Status extends string> = {
  id: string;
  folio: string;
  status: Status;
  total: number;
  createdAt: string;
};

export type CustomerOverview = {
  customer: CustomerDetail;
  counts: { quotes: number; sales: number };
  recentQuotes: RelatedDocument<QuoteStatus>[];
  recentSales: RelatedDocument<SaleStatus>[];
};

type OverviewState =
  | { status: 'loading'; key: string }
  | { status: 'success'; key: string; data: CustomerOverview }
  | { status: 'not-found'; key: string }
  | { status: 'forbidden'; key: string }
  | { status: 'error'; key: string; message: string };

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function formatMoney(value: number): string {
  return Number.isFinite(value) ? currencyFormatter.format(value) : '—';
}

export function formatCustomerDocumentDate(
  timestamp: string,
  timezone: string,
): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';

  try {
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(date);
  } catch {
    return 'Fecha no disponible';
  }
}

function DetailField({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  const clean = value?.trim();
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-words font-medium text-text">
        {clean ? (
          href ? (
            <a href={href} className="text-primary hover:underline">
              {clean}
            </a>
          ) : (
            clean
          )
        ) : (
          <span className="font-normal text-text-muted">Sin registrar</span>
        )}
      </dd>
    </div>
  );
}

function DocumentList<Status extends QuoteStatus | SaleStatus>({
  title,
  description,
  count,
  items,
  listHref,
  isSale,
  timezone,
}: {
  title: string;
  description: string;
  count: number;
  items: RelatedDocument<Status>[];
  listHref: string;
  isSale: boolean;
  timezone: string;
}) {
  const Icon = isSale ? ShoppingCart : FileText;
  return (
    <Section
      title={title}
      description={description}
      action={
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver {isSale ? 'ventas' : 'cotizaciones'}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-surface p-4 shadow-subtle">
        <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Icon aria-hidden="true" size={19} />
          </span>
          <span className="text-sm font-semibold text-text">
            {count} {count === 1 ? 'documento registrado' : 'documentos registrados'}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No hay {isSale ? 'ventas' : 'cotizaciones'} registradas para este cliente.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const status = isSale
                ? getSaleStatusDescriptor(item.status as SaleStatus)
                : getQuoteStatusDescriptor(item.status as QuoteStatus);
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text">{item.folio}</p>
                    <time
                      dateTime={item.createdAt}
                      className="block text-xs text-text-muted"
                    >
                      {formatCustomerDocumentDate(item.createdAt, timezone)}
                    </time>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge label={status.label} tone={status.tone} />
                    <span className="text-sm font-medium tabular-nums text-text">
                      {formatMoney(item.total)}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  {isSale ? (
                    <Link
                      href={'/sales?saleId=' + encodeURIComponent(item.id)}
                      className="flex min-w-0 gap-3 rounded-md p-1 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      aria-label={'Ver venta ' + item.folio}
                    >
                      {body}
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-text-muted"
                        size={16}
                      />
                    </Link>
                  ) : (
                    <div className="flex min-w-0 gap-3 p-1">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {count > items.length ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
            Mostrando {items.length} de {count} registros.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

const backLink = (
  <Link
    href="/customers"
    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
  >
    <ArrowLeft aria-hidden="true" size={17} />
    Volver a clientes
  </Link>
);

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const sessionState = useAuthenticatedSession();
  const role =
    sessionState.status === 'success' ? sessionState.user.role : null;
  const companyId =
    sessionState.status === 'success' ? sessionState.user.companyId : '';
  const timezone =
    sessionState.status === 'success'
      ? sessionState.user.companyTimezone
      : 'UTC';
  const authorized = hasRole(role, COMMERCIAL_ROLES);
  const requestKey = companyId + ':' + customerId;

  const [state, setState] = useState<OverviewState>({
    status: 'loading',
    key: '',
  });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!companyId || !customerId || !authorized) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setState({ status: 'loading', key: requestKey });
      try {
        const response = await api.get<CustomerOverview>(
          '/customers/' + encodeURIComponent(customerId) + '/overview',
        );
        if (!cancelled) {
          setState({ status: 'success', key: requestKey, data: response.data });
        }
      } catch (error: unknown) {
        if (cancelled) return;
        if (isForbiddenError(error)) {
          setState({ status: 'forbidden', key: requestKey });
        } else if (
          axios.isAxiosError(error) &&
          error.response?.status === 404
        ) {
          setState({ status: 'not-found', key: requestKey });
        } else {
          setState({
            status: 'error',
            key: requestKey,
            message: getApiErrorMessage(
              error,
              'No fue posible consultar la ficha del cliente.',
            ),
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authorized, companyId, customerId, requestKey, retry]);

  if (sessionState.status === 'loading' || sessionState.status === 'unauthenticated') {
    return <Loading message="Cargando ficha del cliente..." />;
  }

  if (sessionState.status === 'error') {
    return (
      <PageContainer>
        {backLink}
        <div role="alert" className="mt-6 text-red-700">
          No fue posible validar tu sesión.
        </div>
      </PageContainer>
    );
  }

  if (!authorized) return <ForbiddenState />;

  const currentState =
    state.key === requestKey
      ? state
      : ({ status: 'loading', key: requestKey } as const);

  if (currentState.status === 'forbidden') return <ForbiddenState />;

  return (
    <PageContainer>
      <div className="mb-5">{backLink}</div>
      {currentState.status === 'loading' ? (
        <Loading message="Cargando ficha del cliente..." />
      ) : currentState.status === 'not-found' ? (
        <div role="alert" className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-xl font-semibold text-text">
            Cliente no encontrado
          </h1>
          <p className="mt-2 text-text-muted">
            El cliente no existe o no está disponible para tu empresa.
          </p>
        </div>
      ) : currentState.status === 'error' ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-5"
        >
          <p className="text-sm text-red-700">{currentState.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <PageHeader
            title={currentState.data.customer.name}
            description="Ficha comercial del cliente y sus documentos recientes."
            action={
              <StatusBadge
                label={currentState.data.customer.isActive ? 'Activo' : 'Inactivo'}
                tone={currentState.data.customer.isActive ? 'success' : 'neutral'}
              />
            }
          />

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm text-text-muted">Cotizaciones registradas</span>
              <p className="mt-2 text-3xl font-bold tabular-nums text-text">
                {currentState.data.counts.quotes}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm text-text-muted">Ventas registradas</span>
              <p className="mt-2 text-3xl font-bold tabular-nums text-text">
                {currentState.data.counts.sales}
              </p>
            </div>
          </div>

          <Section title="Información del cliente">
            <div className="rounded-xl border border-border bg-surface p-5 shadow-subtle">
              <div className="mb-5 flex items-center gap-2">
                <Building2 aria-hidden="true" className="text-primary" size={20} />
                <h3 className="font-semibold text-text">Datos generales y contacto</h3>
              </div>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField
                  label="Tipo"
                  value={customerTypeLabel(currentState.data.customer.type)}
                />
                <DetailField
                  label="Correo"
                  value={currentState.data.customer.email}
                  href={
                    currentState.data.customer.email
                      ? 'mailto:' + currentState.data.customer.email
                      : undefined
                  }
                />
                <DetailField
                  label="Teléfono"
                  value={currentState.data.customer.phone}
                  href={
                    currentState.data.customer.phone
                      ? 'tel:' + currentState.data.customer.phone
                      : undefined
                  }
                />
                <DetailField
                  label="Persona de contacto"
                  value={currentState.data.customer.contactName}
                />
                <DetailField
                  label="Ubicación"
                  value={customerLocationLabel(currentState.data.customer)}
                />
                <DetailField
                  label="Dirección"
                  value={currentState.data.customer.address}
                />
                <DetailField
                  label="Fecha de registro"
                  value={formatCustomerDocumentDate(
                    currentState.data.customer.createdAt,
                    timezone,
                  )}
                />
              </dl>
              {currentState.data.customer.notes?.trim() ? (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-1 flex items-center gap-2 text-sm font-medium text-text-muted">
                    <UserRound aria-hidden="true" size={15} />
                    Notas internas
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-text">
                    {currentState.data.customer.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </Section>

          <div className="mt-8 grid items-start gap-8 2xl:grid-cols-2">
            <DocumentList
              title="Cotizaciones recientes"
              description="Últimas cinco cotizaciones de este cliente."
              count={currentState.data.counts.quotes}
              items={currentState.data.recentQuotes}
              listHref="/quotes"
              isSale={false}
              timezone={timezone}
            />
            <DocumentList
              title="Ventas recientes"
              description="Últimas cinco ventas de este cliente."
              count={currentState.data.counts.sales}
              items={currentState.data.recentSales}
              listHref="/sales"
              isSale
              timezone={timezone}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
