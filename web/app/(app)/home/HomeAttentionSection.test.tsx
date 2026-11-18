import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import HomeAttentionSection from './HomeAttentionSection';

afterEach(cleanup);

describe('HomeAttentionSection responsive layout', () => {
  const lowStock = { id: 'product-low', stock: 2, minStock: 4 };
  const outOfStock = { id: 'product-empty', stock: 0, minStock: 4 };
  const equipment = [
    {
      id: 'equipment-1',
      lifecycle: 'ACTIVE',
      condition: 'INSPECTION_PENDING',
    },
  ];
  const purchases = [{ id: 'purchase-1', status: 'CONFIRMED' as const }];

  it('places three alerts in one row on very wide screens without an orphan card', () => {
    render(
      <HomeAttentionSection
        dashboardData={{ totals: {}, lowStock: [lowStock] }}
        equipmentData={equipment}
        purchasesData={purchases}
        updating={false}
        hasErrors={false}
      />,
    );

    const grid = screen.getByRole('list', { name: 'Alertas operativas' });
    const items = within(grid).getAllByRole('listitem');

    expect(grid.classList.contains('md:grid-cols-2')).toBe(true);
    expect(grid.classList.contains('2xl:grid-cols-3')).toBe(true);
    expect(items).toHaveLength(3);
    expect(items[2].classList.contains('md:col-span-2')).toBe(true);
    expect(items[2].classList.contains('2xl:col-span-1')).toBe(true);
    expect(screen.getByText('Stock bajo')).toBeTruthy();
    expect(screen.getByText('Inspecciones pendientes')).toBeTruthy();
    expect(screen.getByText('Compras por recibir')).toBeTruthy();
  });

  it('preserves a balanced two-column layout for four alerts', () => {
    render(
      <HomeAttentionSection
        dashboardData={{ totals: {}, lowStock: [outOfStock, lowStock] }}
        equipmentData={equipment}
        purchasesData={purchases}
        updating={false}
        hasErrors={false}
      />,
    );

    const grid = screen.getByRole('list', { name: 'Alertas operativas' });
    const items = within(grid).getAllByRole('listitem');

    expect(grid.classList.contains('md:grid-cols-2')).toBe(true);
    expect(grid.classList.contains('2xl:grid-cols-3')).toBe(false);
    expect(items).toHaveLength(4);
    expect(items.every((item) => !item.classList.contains('md:col-span-2'))).toBe(
      true,
    );
  });

  it('lets a single alert use the full available width', () => {
    render(
      <HomeAttentionSection
        dashboardData={{ totals: {}, lowStock: [] }}
        equipmentData={[]}
        purchasesData={purchases}
        updating={false}
        hasErrors={false}
      />,
    );

    const grid = screen.getByRole('list', { name: 'Alertas operativas' });
    expect(grid.classList.contains('grid-cols-1')).toBe(true);
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(within(grid).getByRole('link', { name: 'Ver compras' })).toBeTruthy();
  });
});
