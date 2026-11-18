'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  PackageX,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import { canRegisterPurchaseReceipt } from '@/app/(app)/purchases/purchase-status';
import Badge, { type BadgeColor } from '@/app/components/ui/Badge';
import Card from '@/app/components/ui/Card';
import Section from '@/app/components/ui/layout/Section';

import type {
  DashboardData,
  HomeEquipment,
  HomePurchase,
} from './useHomeData';

type AttentionItem = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  actionLabel: string;
  color: BadgeColor;
  icon: LucideIcon;
  iconClassName: string;
};

type HomeAttentionSectionProps = {
  dashboardData: DashboardData | null;
  equipmentData: HomeEquipment[] | null;
  purchasesData: HomePurchase[] | null;
  updating: boolean;
  hasErrors: boolean;
};

const numberFormatter = new Intl.NumberFormat('es-MX');

function formatCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${numberFormatter.format(count)} ${count === 1 ? singular : plural}`;
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const Icon = item.icon;

  return (
    <Card className="h-full border border-border/80 shadow-subtle transition-shadow duration-[var(--motion-duration-fast)] hover:shadow-md">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-md ${item.iconClassName}`}
          >
            <Icon aria-hidden="true" size={20} />
          </span>
          <Badge color={item.color}>{numberFormatter.format(item.count)}</Badge>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-text">{item.label}</p>
          <p className="mt-1 text-sm leading-5 text-text-muted">{item.description}</p>
        </div>

        <Link
          href={item.href}
          className="inline-flex w-fit items-center gap-2 rounded-ui-sm text-sm font-semibold text-primary transition-colors duration-[var(--motion-duration-fast)] hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {item.actionLabel}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </Card>
  );
}

export default function HomeAttentionSection({
  dashboardData,
  equipmentData,
  purchasesData,
  updating,
  hasErrors,
}: HomeAttentionSectionProps) {
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const lowStock = dashboardData?.lowStock ?? [];
    const outOfStockCount = lowStock.filter((product) => product.stock <= 0)
      .length;
    const lowStockCount = lowStock.filter((product) => product.stock > 0).length;
    const pendingInspectionCount = (equipmentData ?? []).filter(
      (equipment) =>
        equipment.lifecycle === 'ACTIVE' &&
        equipment.condition === 'INSPECTION_PENDING',
    ).length;
    const pendingReceiptCount = (purchasesData ?? []).filter((purchase) =>
      canRegisterPurchaseReceipt(purchase.status),
    ).length;

    if (outOfStockCount > 0) {
      items.push({
        key: 'out-of-stock',
        label: 'Productos sin stock',
        description: formatCount(
          outOfStockCount,
          'producto requiere reposición',
          'productos requieren reposición',
        ),
        count: outOfStockCount,
        href: '/inventory',
        actionLabel: 'Ver inventario',
        color: 'red',
        icon: PackageX,
        iconClassName: 'bg-danger-subtle text-danger',
      });
    }

    if (lowStockCount > 0) {
      items.push({
        key: 'low-stock',
        label: 'Stock bajo',
        description: formatCount(
          lowStockCount,
          'producto está en o debajo de su mínimo',
          'productos están en o debajo de su mínimo',
        ),
        count: lowStockCount,
        href: '/inventory',
        actionLabel: 'Ver inventario',
        color: 'yellow',
        icon: TriangleAlert,
        iconClassName: 'bg-warning-subtle text-warning',
      });
    }

    if (pendingInspectionCount > 0) {
      items.push({
        key: 'pending-inspection',
        label: 'Inspecciones pendientes',
        description: formatCount(
          pendingInspectionCount,
          'equipo requiere inspección',
          'equipos requieren inspección',
        ),
        count: pendingInspectionCount,
        href: '/equipment',
        actionLabel: 'Ver equipos',
        color: 'yellow',
        icon: Wrench,
        iconClassName: 'bg-warning-subtle text-warning',
      });
    }

    if (pendingReceiptCount > 0) {
      items.push({
        key: 'pending-receipt',
        label: 'Compras por recibir',
        description: formatCount(
          pendingReceiptCount,
          'compra permite registrar recepción',
          'compras permiten registrar recepción',
        ),
        count: pendingReceiptCount,
        href: '/purchases',
        actionLabel: 'Ver compras',
        color: 'blue',
        icon: ClipboardCheck,
        iconClassName: 'bg-info-subtle text-info',
      });
    }

    return items;
  }, [dashboardData, equipmentData, purchasesData]);

  return (
    <Section
      title="Requiere atención"
      description="Operaciones pendientes derivadas de la información actual."
    >
      {attentionItems.length > 0 ? (
        <ul
          aria-label="Alertas operativas"
          className={`grid list-none gap-4 p-0 ${
            attentionItems.length === 3
              ? 'md:grid-cols-2 2xl:grid-cols-3'
              : attentionItems.length === 1
                ? 'grid-cols-1'
                : 'md:grid-cols-2'
          }`}
        >
          {attentionItems.map((item, index) => (
            <li
              key={item.key}
              className={
                attentionItems.length === 3 && index === 2
                  ? 'md:col-span-2 2xl:col-span-1'
                  : undefined
              }
            >
              <AttentionCard item={item} />
            </li>
          ))}
        </ul>
      ) : updating ? (
        <p className="text-sm text-text-muted" aria-live="polite">
          Actualizando prioridades...
        </p>
      ) : hasErrors ? (
        <p className="text-sm text-text-muted">
          Las prioridades disponibles aparecerán al recuperar los datos.
        </p>
      ) : (
        <div className="flex items-start gap-3 rounded-ui-md border border-success/20 bg-success-subtle p-4 text-success">
          <CheckCircle2 aria-hidden="true" className="shrink-0" size={20} />
          <p className="text-sm font-medium">
            No hay operaciones que requieran atención inmediata.
          </p>
        </div>
      )}
    </Section>
  );
}
