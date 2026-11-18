'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  ClipboardPlus,
  FilePlus2,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import Button from '@/app/components/ui/Button';
import { hasRole, COMMERCIAL_ROLES, WAREHOUSE_ROLES } from '@/app/erp-role-access';
import Card from '@/app/components/ui/Card';
import Loading from '@/app/components/ui/Loading';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';

import HomeAttentionSection from './HomeAttentionSection';
import RecentActivitySection from './RecentActivitySection';
import { useHomeData } from './useHomeData';

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  toneClass: string;
  iconClass: string;
  visibleForRoles: typeof COMMERCIAL_ROLES | typeof WAREHOUSE_ROLES;
};

const quickActions: QuickAction[] = [
  {
    label: 'Nueva cotización',
    href: '/quotes',
    icon: FilePlus2,
    toneClass: 'border-blue-100 bg-blue-50/80 hover:bg-blue-100/80',
    iconClass: 'bg-white text-blue-700',
    visibleForRoles: COMMERCIAL_ROLES,
  },
  {
    label: 'Nueva venta',
    href: '/sales',
    icon: ShoppingCart,
    toneClass: 'border-emerald-100 bg-emerald-50/80 hover:bg-emerald-100/80',
    iconClass: 'bg-white text-emerald-700',
    visibleForRoles: COMMERCIAL_ROLES,
  },
  {
    label: 'Nueva compra',
    href: '/purchases',
    icon: ClipboardPlus,
    toneClass: 'border-violet-100 bg-violet-50/80 hover:bg-violet-100/80',
    iconClass: 'bg-white text-violet-700',
    visibleForRoles: WAREHOUSE_ROLES,
  },
  {
    label: 'Registrar recepción',
    href: '/purchases',
    icon: PackageCheck,
    toneClass: 'border-amber-100 bg-amber-50/80 hover:bg-amber-100/80',
    iconClass: 'bg-white text-amber-700',
    visibleForRoles: WAREHOUSE_ROLES,
  },
];

const operationalMetrics = [
  {
    label: 'Cotizaciones',
    key: 'quotes',
    href: '/quotes',
    icon: FilePlus2,
    iconClass: 'bg-blue-50 text-blue-700',
    visibleForRoles: COMMERCIAL_ROLES,
  },
  {
    label: 'Compras',
    key: 'purchases',
    href: '/purchases',
    icon: ClipboardPlus,
    iconClass: 'bg-violet-50 text-violet-700',
    visibleForRoles: WAREHOUSE_ROLES,
  },
  {
    label: 'Ventas',
    key: 'sales',
    href: '/sales',
    icon: ShoppingCart,
    iconClass: 'bg-emerald-50 text-emerald-700',
    visibleForRoles: COMMERCIAL_ROLES,
  },
] as const;

const numberFormatter = new Intl.NumberFormat('es-MX');

function ResourceError({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-ui-md border border-danger/25 bg-danger-subtle p-4 text-danger sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden="true" size={16} />
        {retryLabel}
      </Button>
    </div>
  );
}

function WelcomeBanner({
  firstName,
  companyName,
}: {
  firstName: string;
  companyName: string;
}) {
  return (
    <section
      aria-label="Bienvenida"
      className="relative isolate overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-sky-50 px-5 py-5 shadow-subtle sm:px-6 sm:py-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-blue-100/70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-24 h-16 w-16 rounded-full bg-sky-100/50 blur-xl"
      />
      <div className="relative z-10 flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-white/80 text-blue-600 shadow-sm">
          <Sparkles aria-hidden="true" size={26} />
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            {firstName ? 'Hola, ' + firstName : 'Bienvenido a Zaping'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {companyName
              ? 'Aquí tienes un resumen de la operación en ' + companyName + '.'
              : 'Aquí tienes un resumen de tu operación diaria.'}
          </p>
        </div>
        <div
          aria-hidden="true"
          className="ml-auto hidden h-16 w-16 shrink-0 rotate-[-8deg] items-center justify-center rounded-2xl bg-blue-600 text-3xl font-bold text-white shadow-lg shadow-blue-100/80 lg:flex"
        >
          Z
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const {
    dashboardState,
    equipmentState,
    purchasesState,
    loadDashboard,
    loadEquipment,
    loadPurchases,
    initialLoading,
    attentionUpdating,
    attentionHasErrors,
    currentUserRole,
    currentCompanyId,
    currentCompanyTimezone,
    currentUserName,
    currentCompanyName,
    sessionLoading,
  } = useHomeData();

  const visibleQuickActions = sessionLoading
    ? []
    : quickActions.filter((action) =>
        hasRole(currentUserRole, action.visibleForRoles),
      );
  const visibleOperationalMetrics = operationalMetrics
    .filter((metric) => hasRole(currentUserRole, metric.visibleForRoles))
    .map((metric) => ({
      ...metric,
      value: dashboardState.data?.totals[metric.key],
    }))
    .filter((metric) => metric.value !== undefined);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Inicio"
        description="Resumen de tu operación diaria."
      />

      <WelcomeBanner
        firstName={currentUserName}
        companyName={currentCompanyName}
      />

      {visibleQuickActions.length > 0 ? (
        <Section title="Acciones rápidas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleQuickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  type="button"
                  className={[
                    'group flex min-h-20 w-full min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm transition-colors duration-[var(--motion-duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
                    action.toneClass,
                  ].join(' ')}
                  onClick={() => router.push(action.href)}
                >
                  <span
                    className={[
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm',
                      action.iconClass,
                    ].join(' ')}
                  >
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    {action.label}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    size={17}
                    className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1"
                  />
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      {initialLoading ? (
        <Loading message="Cargando prioridades..." />
      ) : (
        <>
          {dashboardState.error ? (
            <ResourceError
              title="Inventario no disponible"
              message={dashboardState.error}
              retryLabel="Reintentar inventario"
              onRetry={() => void loadDashboard()}
            />
          ) : null}
          {equipmentState.error ? (
            <ResourceError
              title="Equipos no disponibles"
              message={equipmentState.error}
              retryLabel="Reintentar equipos"
              onRetry={() => void loadEquipment()}
            />
          ) : null}
          {purchasesState.error ? (
            <ResourceError
              title="Compras no disponibles"
              message={purchasesState.error}
              retryLabel="Reintentar compras"
              onRetry={() => void loadPurchases()}
            />
          ) : null}

          <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <HomeAttentionSection
              dashboardData={dashboardState.data}
              equipmentData={equipmentState.data}
              purchasesData={purchasesState.data}
              updating={attentionUpdating}
              hasErrors={attentionHasErrors}
            />

            <Section
              title="Resumen operativo"
              description="Referencias generales para continuar trabajando."
            >
              {dashboardState.data ? (
                <Card className="border border-border shadow-subtle">
                  <dl className="divide-y divide-border">
                    {visibleOperationalMetrics.map((metric) => {
                      const Icon = metric.icon;

                      return (
                        <div
                          key={metric.label}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <dt className="min-w-0 flex-1">
                            <Link
                              href={metric.href}
                              className="group flex min-w-0 items-center gap-2 rounded-md text-sm font-medium text-text transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            >
                              <span
                                className={[
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                  metric.iconClass,
                                ].join(' ')}
                              >
                                <Icon aria-hidden="true" size={18} />
                              </span>
                              <span className="min-w-0 truncate">{metric.label}</span>
                              <ChevronRight
                                aria-hidden="true"
                                size={15}
                                className="shrink-0 text-text-muted group-hover:text-primary"
                              />
                            </Link>
                          </dt>
                          <dd className="shrink-0 text-lg font-semibold tabular-nums text-text">
                            {numberFormatter.format(Number(metric.value))}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </Card>
              ) : dashboardState.loading ? (
                <p className="text-sm text-text-muted" aria-live="polite">
                  Actualizando resumen...
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  El resumen estará disponible al recuperar inventario.
                </p>
              )}
            </Section>
          </div>
          {currentCompanyId ? (
            <RecentActivitySection
              key={currentCompanyId}
              companyId={currentCompanyId}
              timezone={currentCompanyTimezone}
            />
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
