import { useEffect, useState } from 'react';
import type { UserRole } from '@/app/auth-session';
import { getUserRoleLabel } from '../../users/user-display';
import { api } from '@/services/api';
import type { Purchase } from '../types';

type CostAudit = {
  id: string;
  productDisplayName: string;
  actorDisplayName: string;
  actorRole: UserRole;
  createdAt: string;
  reason: string;
  previousGrossUnitCost: string;
  newGrossUnitCost: string;
  previousDiscountPercent: string;
  newDiscountPercent: string;
  previousNetUnitCost: string;
  newNetUnitCost: string;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 4,
});
const dateTime = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export default function PurchaseCostAuditHistory({ purchase }: { purchase: Purchase }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    purchase: Purchase;
    attempt: number;
    events: CostAudit[] | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const { data } = await api.get<CostAudit[]>(
          '/purchases/' + encodeURIComponent(purchase.id) + '/cost-audit',
        );
        if (active) setResult({ purchase, attempt, events: data });
      } catch {
        if (active) setResult({ purchase, attempt, events: null });
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [purchase, attempt]);

  const events = result?.purchase === purchase && result.attempt === attempt
    ? result.events
    : undefined;

  return (
    <section aria-labelledby="purchase-cost-history" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <h2 id="purchase-cost-history" className="mb-4 font-semibold text-text">Historial de costos y descuentos</h2>
      {events === undefined && <p role="status" className="text-sm text-text-muted">Cargando historial…</p>}
      {events === null && (
        <p role="alert" className="text-sm">
          No fue posible cargar el historial.{' '}
          <button type="button" className="underline" onClick={() => setAttempt(attempt + 1)}>Reintentar</button>
        </p>
      )}
      {events?.length === 0 && <p className="text-sm text-text-muted">Aún no hay ajustes registrados.</p>}
      {events && events.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 py-3">
              <div className="flex flex-wrap justify-between gap-x-4">
                <strong>{event.productDisplayName}</strong>
                <time dateTime={event.createdAt} className="text-text-muted">{dateTime.format(new Date(event.createdAt))}</time>
              </div>
              <p className="text-text-muted">
                <span>{event.actorDisplayName}</span>
                {' · '}
                <span>{getUserRoleLabel(event.actorRole)}</span>
              </p>
              <dl className="grid gap-2 sm:grid-cols-3">
                <div><dt>Costo bruto unitario</dt><dd>{money.format(Number(event.previousGrossUnitCost))} → {money.format(Number(event.newGrossUnitCost))}</dd></div>
                <div><dt>Descuento</dt><dd>{event.previousDiscountPercent}% → {event.newDiscountPercent}%</dd></div>
                <div><dt>Costo neto unitario</dt><dd>{money.format(Number(event.previousNetUnitCost))} → {money.format(Number(event.newNetUnitCost))}</dd></div>
              </dl>
              <p className="whitespace-pre-wrap break-words">{event.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
