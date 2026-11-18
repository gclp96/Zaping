'use client';

import { ArrowRight, CalendarDays, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import Button from '@/app/components/ui/Button';
import Card from '@/app/components/ui/Card';
import Section from '@/app/components/ui/layout/Section';
import { api } from '@/services/api';

export type UpcomingCase = {
  id: string;
  folio: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  hospitalName: string | null;
};

type AgendaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; items: UpcomingCase[] };

export function formatAgendaDate(timestamp: string, timezone: string) {
  const instant = new Date(timestamp);
  if (!Number.isFinite(instant.getTime())) {
    return 'Fecha no disponible';
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(instant);
  } catch {
    return 'Fecha no disponible';
  }
}

export default function OperationalAgendaSection({
  companyId,
  timezone,
}: {
  companyId: string;
  timezone: string;
}) {
  const [state, setState] = useState<AgendaState>({ status: 'loading' });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setState({ status: 'loading' });

      try {
        const response = await api.get<UpcomingCase[]>(
          '/healthcare/cases/agenda',
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
      title="Agenda operativa"
      description="Próximos casos de salud programados (7 días)."
      action={
        <Link
          href="/healthcare-cases"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Ver casos de salud
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      }
    >
      <Card className="border border-border shadow-subtle">
        {state.status === 'loading' ? (
          <p role="status" className="text-sm text-text-muted">
            Cargando agenda...
          </p>
        ) : state.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              No fue posible consultar la agenda.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRetryVersion((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" size={16} />
              Reintentar agenda
            </Button>
          </div>
        ) : state.items.length === 0 ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <CalendarDays aria-hidden="true" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                Sin casos próximos programados
              </p>
              <p className="mt-1 text-sm text-text-muted">
                No hay casos programados en los próximos siete días.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {state.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <CalendarDays aria-hidden="true" size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-text">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {item.folio}
                    {item.hospitalName ? ' · ' + item.hospitalName : ''}
                  </p>
                  <time
                    dateTime={item.scheduledStart}
                    className="mt-1 block text-xs font-medium tabular-nums text-primary"
                  >
                    {formatAgendaDate(item.scheduledStart, timezone)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}
