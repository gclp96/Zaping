'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import StatusBadge from '@/app/components/business/StatusBadge';
import ReceiptFilesPanel from '@/app/components/files/ReceiptFilesPanel';
import Button from '@/app/components/ui/Button';
import Loading from '@/app/components/ui/Loading';
import StaticTable, {
  type StaticTableColumn,
} from '@/app/components/ui/StaticTable';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import {
  getEquipmentConditionDescriptor,
  getEquipmentLifecycleDescriptor,
  getEquipmentOriginLabel,
} from '@/app/(app)/equipment/equipment-display';
import {
  formatMovementDate,
  getMovementTypeDescriptor,
} from '@/app/(app)/inventory/inventory-ledger';
import { getPurchaseStatusDescriptor } from '@/app/(app)/purchases/purchase-status';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

import {
  formatReceiptDate,
  formatReceiptExpirationDate,
  formatReceiptMoney,
  getReceiptResponsibleLabel,
} from '../receipt-display';
import { getPurchaseReceiptInventoryHref } from '../receipt-navigation';
import ReceiptSupplierDocuments from '../ReceiptSupplierDocuments';
import type {
  PurchaseReceiptDetail,
  ReceiptEquipmentAsset,
} from '../types';

type DetailFieldProps = {
  label: string;
  children: ReactNode;
  wide?: boolean;
};

type EquipmentRow = {
  asset: ReceiptEquipmentAsset;
  lotNumber: string;
};

type ReceivedItemRow = PurchaseReceiptDetail['items'][number];
type InventoryMovementRow =
  PurchaseReceiptDetail['inventoryMovements'][number];

function DetailField({ label, children, wide = false }: DetailFieldProps) {
  return (
    <div className={`min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5 ${wide ? 'sm:col-span-2 xl:col-span-4' : ''}`}>
      <dt className="text-sm font-medium text-text-muted">{label}</dt>
      <dd className="mt-2 break-words whitespace-pre-wrap font-medium text-text">{children}</dd>
    </div>
  );
}

function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-border bg-surface text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 [&>div]:overflow-visible [&>div]:shadow-none [&_tr]:border-border [&_thead]:bg-surface-subtle"
    >
      {children}
    </div>
  );
}

const backLink = (
  <Link
    href="/purchase-receipts"
    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 font-medium text-text-secondary transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
  >
    <ArrowLeft aria-hidden="true" size={18} />
    Volver a recepciones
  </Link>
);

const traceabilityActionClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600';

export default function PurchaseReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<PurchaseReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestGeneration = useRef(0);

  const loadReceipt = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      setLoading(true);
      setError('');
      setReceipt(null);

      const response = await api.get<PurchaseReceiptDetail>(
        `/purchase-receipts/${id}`,
      );
      if (generation !== requestGeneration.current) return;

      // Do not render a partial detail or flatten missing related collections.
      const detail = response.data;
      if (
        detail && (
          !detail.purchase?.supplier ||
          !Array.isArray(detail.items) ||
          !Array.isArray(detail.inventoryMovements) ||
          detail.items.some((item) =>
            !item?.product ||
            !Array.isArray(item.equipmentAssets) ||
            item.equipmentAssets.some((asset) => !asset?.product),
          ) ||
          detail.inventoryMovements.some((movement) => !movement?.product)
        )
      ) {
        throw new Error('El detalle de la recepción está incompleto. Vuelve a intentarlo.');
      }

      setReceipt(response.data);
    } catch (requestError: unknown) {
      if (generation !== requestGeneration.current) return;
      setError(
        getApiErrorMessage(
          requestError,
          'No fue posible cargar el detalle de la recepción.',
        ),
      );
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReceipt();
    return () => { requestGeneration.current += 1; };
  }, [loadReceipt]);

  const equipmentRows = useMemo<EquipmentRow[]>(
    () =>
      receipt?.items.flatMap((item) =>
        item.equipmentAssets.map((asset) => ({
          asset,
          lotNumber:
            asset.batch?.lotNumber ??
            item.batch?.lotNumber ??
            item.lotNumber ??
            '—',
        })),
      ) ?? [],
    [receipt],
  );

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Recepción" action={backLink} />
        <Loading message="Cargando detalle de la recepción..." />
      </PageContainer>
    );
  }

  if (error || !receipt) {
    return (
      <PageContainer>
        <PageHeader title="Recepción" action={backLink} />
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error || 'Recepción no encontrada.'}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadReceipt()}
          >
            Reintentar
          </Button>
        </div>
      </PageContainer>
    );
  }

  const purchaseStatus = getPurchaseStatusDescriptor(receipt.purchase.status);
  const responsible = getReceiptResponsibleLabel(receipt.receivedByUser);
  const inventoryHref = getPurchaseReceiptInventoryHref(
    receipt.id,
    receipt.folio,
  );

  const receivedItemColumns: StaticTableColumn<ReceivedItemRow>[] = [
    {
      id: 'sku',
      header: 'SKU',
      minWidth: 100,
      cell: (item) => <span className="text-xs font-medium text-text-muted">{item.product.sku}</span>,
    },
    {
      id: 'product',
      header: 'Producto',
      minWidth: 190,
      cell: (item) => <span className="font-semibold text-text">{item.product.name}</span>,
    },
    {
      id: 'quantity',
      header: 'Cantidad recibida',
      align: 'end',
      minWidth: 130,
      cell: (item) => <span className="font-semibold tabular-nums text-blue-900">{item.quantityReceived}</span>,
    },
    {
      id: 'unitCost',
      header: 'Costo unitario',
      align: 'end',
      minWidth: 125,
      cell: (item) => <span className="whitespace-nowrap tabular-nums">{formatReceiptMoney(item.unitCost)}</span>,
    },
    {
      id: 'batch',
      header: 'Lote',
      minWidth: 130,
      cell: (item) => item.batch?.lotNumber ?? item.lotNumber ?? 'Sin lote informado',
    },
    {
      id: 'expiration',
      header: 'Caducidad',
      minWidth: 135,
      cell: (item) =>
        item.expirationDate
          ? formatReceiptExpirationDate(item.expirationDate)
          : 'No informada',
    },
    {
      id: 'equipment',
      header: 'Equipo generado',
      align: 'end',
      cell: (item) => item.equipmentAssets.length,
    },
  ];

  const inventoryMovementColumns: StaticTableColumn<InventoryMovementRow>[] = [
    {
      id: 'date',
      header: 'Fecha',
      cell: (movement) => formatMovementDate(movement.createdAt),
    },
    {
      id: 'product',
      header: 'Producto',
      cell: (movement) => (
        <div>
          <p className="font-medium text-gray-900">
            {movement.product.name}
          </p>
          <p className="text-sm text-gray-500">
            {movement.product.sku}
          </p>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (movement) => {
        const descriptor = getMovementTypeDescriptor(
          movement.movementType,
        );

        return (
          <StatusBadge
            label={descriptor.label}
            tone={descriptor.tone}
            ariaLabel={`Tipo de movimiento: ${descriptor.label}`}
          />
        );
      },
    },
    {
      id: 'quantity',
      header: 'Cantidad',
      align: 'end',
      cell: (movement) => movement.quantity,
    },
    {
      id: 'balance',
      header: 'Saldo',
      align: 'end',
      cell: (movement) => movement.balance ?? 'No disponible',
    },
    {
      id: 'unitCost',
      header: 'Costo unitario',
      align: 'end',
      cell: (movement) =>
        movement.unitCost == null
          ? '—'
          : formatReceiptMoney(movement.unitCost),
    },
    {
      id: 'reference',
      header: 'Referencia',
      cell: () => `Recepción ${receipt.folio}`,
    },
  ];

  const equipmentColumns: StaticTableColumn<EquipmentRow>[] = [
    {
      id: 'code',
      header: 'Código',
      cell: ({ asset }) => (
        <Link
          href={`/equipment?assetId=${encodeURIComponent(asset.id)}`}
          aria-label={`Ver equipo ${asset.assetCode}`}
          className="inline-block rounded-sm font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          {asset.assetCode}
        </Link>
      ),
    },
    {
      id: 'product',
      header: 'Producto',
      cell: ({ asset }) => (
        <div>
          <p className="font-medium text-gray-900">
            {asset.product.name}
          </p>
          <p className="text-sm text-gray-500">
            {asset.product.sku}
          </p>
        </div>
      ),
    },
    {
      id: 'serial',
      header: 'Serie',
      cell: ({ asset }) => asset.serialNumber || '—',
    },
    {
      id: 'lifecycle',
      header: 'Estado',
      cell: ({ asset }) => {
        const lifecycle = getEquipmentLifecycleDescriptor(
          asset.lifecycle,
        );

        return (
          <StatusBadge
            label={lifecycle.label}
            tone={lifecycle.tone}
            ariaLabel={`Estado del equipo ${asset.assetCode}: ${lifecycle.label}`}
          />
        );
      },
    },
    {
      id: 'condition',
      header: 'Condición',
      cell: ({ asset }) => {
        const condition = getEquipmentConditionDescriptor(
          asset.condition,
        );

        return (
          <StatusBadge
            label={condition.label}
            tone={condition.tone}
            ariaLabel={`Condición del equipo ${asset.assetCode}: ${condition.label}`}
          />
        );
      },
    },
    {
      id: 'origin',
      header: 'Origen',
      cell: ({ asset }) => getEquipmentOriginLabel(asset.origin),
    },
    {
      id: 'batch',
      header: 'Lote',
      cell: ({ lotNumber }) => lotNumber,
    },
  ];

  return (
    <PageContainer>
      <div className="rounded-xl border border-border border-t-4 border-t-blue-600 bg-surface p-5 sm:p-6 [&>div]:mb-0">
        <PageHeader
          title={`Recepción ${receipt.folio}`}
          description={`${formatReceiptDate(receipt.receivedAt)} | ${responsible}`}
          action={backLink}
        />
      </div>

      <Section title="General">
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField label="Folio">{receipt.folio}</DetailField>
          <DetailField label="Fecha de recepción">
            {formatReceiptDate(receipt.receivedAt)}
          </DetailField>
          <DetailField label="Responsable">{responsible}</DetailField>
          <DetailField label="Documento proveedor">
            <ReceiptSupplierDocuments
              receiptId={receipt.id}
              supplierId={receipt.purchase.supplier.id}
              legacyReference={
                receipt.supplierDocumentType && receipt.supplierDocumentNumber
                  ? `${receipt.supplierDocumentType.replace('_', ' ')} · ${receipt.supplierDocumentNumber}`
                  : null
              }
            />
          </DetailField>
          <DetailField label="Notas" wide>
            {receipt.notes || 'Sin notas'}
          </DetailField>
        </dl>
      </Section>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Section
          title="Compra y proveedor"
          action={
            <Link
              href={`/purchases/${encodeURIComponent(receipt.purchase.id)}`}
              className={traceabilityActionClassName}
            >
              Ver compra
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          }
        >
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Compra"><span className="font-semibold text-blue-800">{receipt.purchase.folio}</span></DetailField>
            <DetailField label="Estado de compra">
              <StatusBadge
                label={purchaseStatus.label}
                tone={purchaseStatus.tone}
                ariaLabel={`Estado de compra: ${purchaseStatus.label}`}
              />
            </DetailField>
            <DetailField label="Proveedor">
              {receipt.purchase.supplier.name}
            </DetailField>
            <DetailField label="Total de compra">
              <span className="text-xl font-semibold tabular-nums text-blue-900">{formatReceiptMoney(receipt.purchase.total)}</span>
            </DetailField>
          </dl>
        </Section>
      </div>

      <div className="space-y-4">
        <Section
          title="Partidas recibidas"
          description="Productos y costos registrados en esta recepción."
        >
          <p className="text-sm text-text-muted sm:hidden">Desliza la tabla para consultar lote, caducidad y costos.</p>
          <TableRegion label="Partidas recibidas desplazables">
            <StaticTable
              caption="Partidas recibidas"
              columns={receivedItemColumns}
              rows={receipt.items}
              getRowKey={(item) => item.id}
              emptyState="Sin registros"
            />
          </TableRegion>
        </Section>
      </div>

      <ReceiptFilesPanel key={receipt.id} receiptId={receipt.id} />

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Section
          title="Movimientos de inventario"
          description="Entradas asociadas directamente con esta recepción."
          action={
            <Link
              href={inventoryHref}
              className={traceabilityActionClassName}
            >
              Ver en inventario
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          }
        >
          {receipt.inventoryMovements.length === 0 ? (
            <p className="border-l-4 border-gray-300 py-2 pl-4 text-gray-600">
              No hay movimientos de inventario asociados a esta recepción.
            </p>
          ) : (
            <TableRegion label="Movimientos de inventario desplazables">
              <StaticTable
                caption="Movimientos de inventario"
                columns={inventoryMovementColumns}
                rows={receipt.inventoryMovements}
                getRowKey={(movement) => movement.id}
                emptyState="Sin registros"
              />
            </TableRegion>
          )}
        </Section>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Section
          title="Equipos generados"
          description="Unidades físicas creadas por las partidas recibidas."
        >
          {equipmentRows.length === 0 ? (
            <p className="border-l-4 border-gray-300 py-2 pl-4 text-gray-600">
              Esta recepción no generó equipos.
            </p>
          ) : (
            <TableRegion label="Equipos generados desplazables">
              <StaticTable
                caption="Equipos generados"
                columns={equipmentColumns}
                rows={equipmentRows}
                getRowKey={({ asset }) => asset.id}
                emptyState="Sin registros"
              />
            </TableRegion>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
