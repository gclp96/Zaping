'use client';

import { CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';

type CompanyClockProps = {
  timezone: string;
};

export function formatCompanyDateTime(now: Date, timezone: string) {
  try {
    const date = new Intl.DateTimeFormat('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    }).format(now);
    const time = new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(now);
    return { date, time };
  } catch {
    return null;
  }
}

export default function CompanyClock({ timezone }: CompanyClockProps) {
  // Start after hydration so the server and browser do not disagree on the clock.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const formatted = now ? formatCompanyDateTime(now, timezone) : null;

  return (
    <div
      className="hidden shrink-0 items-center gap-2 border-l border-border pl-4 lg:flex"
      aria-label="Fecha y hora de la empresa"
    >
      <CalendarDays aria-hidden="true" size={18} className="text-text-secondary" />
      <div className="flex flex-col text-xs leading-tight text-text-secondary">
        {formatted ? (
          <>
            <span className="capitalize">{formatted.date}</span>
            <time dateTime={now?.toISOString()} className="mt-0.5 font-semibold tabular-nums text-text">
              {formatted.time}
            </time>
          </>
        ) : (
          <span aria-live="polite">--:--</span>
        )}
      </div>
    </div>
  );
}
