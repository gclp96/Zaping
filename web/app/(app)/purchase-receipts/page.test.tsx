import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { api } from '@/services/api';

import PurchaseReceiptsPage from './page';
import type { PurchaseReceiptListItem } from './types';
import type { Purchase } from '../purchases/types';

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const sessionMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('@/app/auth-session', () => ({
  useAuthenticatedSession: sessionMock,
}));

vi.mock('@/services/errors', () => ({
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  isForbiddenError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403,
    ),
}));

const primaryReceipt: PurchaseReceiptListItem = {
  id: 'receipt-alpha',
  purchaseId: 'purchase-alpha',
  folio: 'REC-ALPHA-001',
  receivedAt: '2026-08-26T18:00:00.000Z',
  receivedBy: 'user-alpha',
  notes: 'Recepción operativa',
  receivedByUser: {
    id: 'user-alpha',
    firstName: 'Ana',
    lastName: 'López',
    email: 'ana.lopez@example.com',
  },
  purchase: {
    id: 'purchase-alpha',
    folio: 'OC-ALPHA-001',
    status: 'RECEIVED',
    supplier: {
      id: 'supplier-alpha',
      name: 'Hospital Norte',
    },
  },
  items: [
    {
      id: 'item-alpha-1',
      purchaseItemId: 'purchase-item-alpha-1',
      productId: 'product-alpha-1',
      quantityReceived: 2,
      lotNumber: null,
      expirationDate: null,
      unitCost: 120,
      batchId: null,
      product: {
        id: 'product-alpha-1',
        sku: 'SKU-ALPHA',
        name: 'Monitor vital',
      },
      batch: null,
    },
    {
      id: 'item-alpha-2',
      purchaseItemId: 'purchase-item-alpha-2',
      productId: 'product-alpha-2',
      quantityReceived: 3,
      lotNumber: null,
      expirationDate: null,
      unitCost: 80,
      batchId: null,
      product: {
        id: 'product-alpha-2',
        sku: 'SKU-SECONDARY',
        name: 'Sensor clínico',
      },
      batch: null,
    },
  ],
};

const secondaryReceipt: PurchaseReceiptListItem = {
  ...primaryReceipt,
  id: 'receipt-beta',
  purchaseId: 'purchase-beta',
  folio: 'REC-BETA-002',
  receivedBy: 'user-beta',
  receivedByUser: {
    id: 'user-beta',
    firstName: 'Bruno',
    lastName: 'Díaz',
    email: 'bruno.diaz@example.com',
  },
  purchase: {
    id: 'purchase-beta',
    folio: 'OC-BETA-002',
    status: 'PARTIALLY_RECEIVED',
    supplier: {
      id: 'supplier-beta',
      name: 'Clínica Sur',
    },
  },
  items: [
    {
      ...primaryReceipt.items[0],
      id: 'item-beta-1',
      quantityReceived: 1,
      product: {
        id: 'product-beta-1',
        sku: 'SKU-BETA',
        name: 'Consumible general',
      },
    },
  ],
};

function buildReceiptList(count: number): PurchaseReceiptListItem[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const timestamp = new Date(
      Date.UTC(2026, 7, sequence, 18, 0, 0),
    ).toISOString();

    return {
      ...primaryReceipt,
      id: `receipt-page-${sequence}`,
      purchaseId: `purchase-page-${sequence}`,
      folio: `REC-${String(sequence).padStart(4, '0')}`,
      receivedAt: timestamp,
      receivedBy: `user-page-${sequence}`,
      receivedByUser: {
        ...primaryReceipt.receivedByUser!,
        id: `user-page-${sequence}`,
        firstName: 'Usuario',
        lastName: String(sequence).padStart(2, '0'),
        email: `usuario${sequence}@example.com`,
      },
      purchase: {
        ...primaryReceipt.purchase,
        id: `purchase-page-${sequence}`,
        folio: `OC-${String(sequence).padStart(4, '0')}`,
        supplier: {
          ...primaryReceipt.purchase.supplier,
          id: `supplier-page-${sequence}`,
          name: `Proveedor ${String(sequence).padStart(2, '0')}`,
        },
      },
      items: [
        {
          ...primaryReceipt.items[0],
          id: `item-page-${sequence}`,
          quantityReceived: sequence,
        },
      ],
    };
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const candidate: Purchase = {
  id: 'purchase-b3', folio: 'OC-B3', status: 'CONFIRMED',
  subtotal: 1000, iva: 160, total: 1160, createdAt: '2026-10-23T18:00:00Z',
  supplier: { id: 'supplier-b3', name: 'Proveedor B3' },
  receiptProgress: { orderedUnits: 10, receivedUnits: 0, pendingUnits: 10, orderedLines: 1, completedLines: 0 },
  items: [{ id: 'pi-b3', productId: 'product-b3', quantity: 10, price: 100, subtotal: 1000,
    product: { id: 'product-b3', sku: 'B3', name: 'Material B3', inventoryTracking: 'QUANTITY', lotTracking: 'REQUIRED' } }],
};
const secondCandidate: Purchase = { ...candidate, id: 'purchase-second', folio: 'OC-SECOND' };

function creationApi(overrides: Record<string, () => Promise<unknown>> = {}) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (overrides[url]) return overrides[url]() as never;
    const data: Record<string, unknown> = {
      '/purchase-receipts': [], '/purchases': [candidate, secondCandidate],
      '/purchases/purchase-b3': candidate, '/purchases/purchase-second': secondCandidate,
      '/purchases/purchase-b3/inventory-movements': [], '/purchases/purchase-second/inventory-movements': [],
      '/purchase-receipts/purchase/purchase-b3': [], '/purchase-receipts/purchase/purchase-second': [],
      '/purchase-receipts/capabilities': { authority: 'PHYSICAL' },
    };
    if (!(url in data)) throw new Error(`Unexpected endpoint ${url}`);
    return Promise.resolve({ data: data[url] }) as never;
  });
  vi.mocked(api.post).mockResolvedValue({ data: { id: 'receipt-created', folio: 'RC-CREATED' } } as never);
}

function deferredResponse() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openSelector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Registrar recepción' }));
  return screen.findByRole('dialog', { name: 'Seleccionar orden de compra' });
}

async function openCapture(user: ReturnType<typeof userEvent.setup>) {
  await openSelector(user);
  await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
  return screen.findByRole('dialog', { name: 'Registrar recepción · OC-B3' });
}

async function submitCapture(user: ReturnType<typeof userEvent.setup>) {
  await openCapture(user);
  expect(screen.getByText('Los documentos se adjuntan después de registrar la recepción, desde su página de detalle.')).toBeTruthy();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  const input = within(screen.getByTestId('receipt-desktop-items'))
    .getByRole('spinbutton', { name: 'Cantidad recibida de Material B3' });
  await user.type(input, '2');
  await user.click(within(screen.getByRole('dialog', { name: 'Registrar recepción · OC-B3' })).getByRole('button', { name: 'Registrar recepción' }));
}

describe('OX-PUR-06B3 — creación mediante el flujo existente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockReturnValue({ status: 'success', user: { role: 'ADMIN' } });
    creationApi();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it.each(['ADMIN', 'MANAGER', 'WAREHOUSE'])('permite iniciar a %s aun sin historial', async (role) => {
    sessionMock.mockReturnValue({ status: 'success', user: { role } });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />);
    await screen.findByText('Sin recepciones registradas');
    await openSelector(user);
    expect(await screen.findByRole('button', { name: 'Seleccionar OC-B3' })).toBeTruthy();
  });

  it.each(['unauthenticated', 'loading', 'error'])('no ofrece creación con sesión %s', (status) => {
    sessionMock.mockReturnValue({ status }); render(<PurchaseReceiptsPage />);
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
  });

  it('no ofrece creación a SALES ni tras 403', async () => {
    sessionMock.mockReturnValue({ status: 'success', user: { role: 'SALES' } });
    const view = render(<PurchaseReceiptsPage />);
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
    view.unmount();
    sessionMock.mockReturnValue({ status: 'success', user: { role: 'ADMIN' } });
    creationApi({ '/purchase-receipts': () => Promise.reject({ response: { status: 403 } }) });
    render(<PurchaseReceiptsPage />); await screen.findByRole('heading', { name: 'Sin permisos' });
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
  });

  it('excluye estados no elegibles y resúmenes sin pendientes; permite buscar proveedor', async () => {
    creationApi({ '/purchases': () => Promise.resolve({ data: [candidate,
      { ...secondCandidate, status: 'PARTIALLY_RECEIVED' },
      ...(['DRAFT', 'CANCELLED', 'RECEIVED'] as const).map((status) => ({ ...candidate, id: status, folio: status, status })),
      { ...candidate, id: 'complete', folio: 'OC-COMPLETE', receiptProgress: { ...candidate.receiptProgress, pendingUnits: 0 } },
    ] }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); const dialog = await openSelector(user);
    expect(await screen.findByRole('button', { name: 'Seleccionar OC-SECOND' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Seleccionar (DRAFT|CANCELLED|RECEIVED|OC-COMPLETE)/ })).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar OC por folio o proveedor' }), 'proveedor b3');
    expect(screen.getByRole('button', { name: 'Seleccionar OC-B3' })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('presenta pendientes estimados dinámicos, aclara la verificación y conserva búsqueda, actualización y cierre', async () => {
    creationApi({ '/purchases': () => Promise.resolve({ data: [{
      ...candidate, receiptProgress: { ...candidate.receiptProgress, pendingUnits: 25 },
    }, secondCandidate] }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />);
    const dialog = await openSelector(user);
    expect(await within(dialog).findByText('Pendientes estimados: 25 unidades')).toBeTruthy();
    expect(within(dialog).getByText('Pendientes estimados: 10 unidades')).toBeTruthy();
    expect(within(dialog).getByText('Las cantidades se verifican al seleccionar la orden.')).toBeTruthy();
    expect(within(dialog).queryByText(/Pendientes según resumen/)).toBeNull();

    const search = within(dialog).getByRole('searchbox', { name: 'Buscar OC por folio o proveedor' });
    await user.type(search, 'OC-B3');
    expect(within(dialog).getByRole('button', { name: 'Seleccionar OC-B3' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Seleccionar OC-SECOND' })).toBeNull();
    await user.clear(search);
    const refresh = deferredResponse();
    creationApi({ '/purchases': () => refresh.promise });
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar' }));
    expect(within(dialog).getByRole('status').textContent).toBe('Cargando compras...');
    expect(within(dialog).queryByRole('button', { name: 'Actualizar' })).toBeNull();
    await act(async () => { refresh.resolve({ data: [{
      ...candidate, receiptProgress: { ...candidate.receiptProgress, pendingUnits: 7 },
    }] }); });
    expect(await within(dialog).findByText('Pendientes estimados: 7 unidades')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Registrar recepción' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('muestra vacío de compras y permite reintentar el error de listado', async () => {
    creationApi({ '/purchases': () => Promise.reject(new Error('Listado fallido')) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    await screen.findByText('Listado fallido');
    creationApi({ '/purchases': () => Promise.resolve({ data: [] }) });
    await user.click(screen.getByRole('button', { name: 'Reintentar verificación' }));
    expect(await screen.findByText('No hay órdenes de compra elegibles que coincidan.')).toBeTruthy();
  });

  it.each([
    '/purchases/purchase-b3', '/purchase-receipts/purchase/purchase-b3', '/purchases/purchase-b3/inventory-movements',
  ])('bloquea fallos de %s y permite verificar de nuevo', async (path) => {
    creationApi({ [path]: () => Promise.reject(new Error('Fallo QA')) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
    creationApi(); await user.click(screen.getByRole('button', { name: 'Reintentar verificación' }));
    expect(await screen.findByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeTruthy();
  });

  it.each([
    { ...candidate, status: 'RECEIVED' }, { ...candidate, id: 'foreign' }, { ...candidate, items: undefined },
  ])('rechaza detalle actualizado incompatible', async (detail) => {
    creationApi({ '/purchases/purchase-b3': () => Promise.resolve({ data: detail }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([null, [{ id: 'old', purchaseId: 'foreign', items: [] }]])('rechaza historial incompleto o ajeno', async (data) => {
    creationApi({ '/purchase-receipts/purchase/purchase-b3': () => Promise.resolve({ data }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
    await screen.findByText('La evidencia de la compra está incompleta o es incompatible.');
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
  });

  it('utiliza pendientes del hook con historial verificado y no abre una OC ya recibida', async () => {
    creationApi({ '/purchase-receipts/purchase/purchase-b3': () => Promise.resolve({ data: [
      { id: 'previous', purchaseId: candidate.id, items: [{ purchaseItemId: 'pi-b3', quantityReceived: 10 }] },
    ] }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
    expect(await screen.findByText('La compra no tiene cantidades pendientes verificadas.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
  });

  it('evita doble preparación e ignora una selección anterior', async () => {
    const old = deferredResponse();
    creationApi({ '/purchases/purchase-b3': () => old.promise });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    const choose = await screen.findByRole('button', { name: 'Seleccionar OC-B3' });
    fireEvent.click(choose); fireEvent.click(choose);
    expect(vi.mocked(api.get).mock.calls.filter(([path]) => path === '/purchases/purchase-b3')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Seleccionar OC-SECOND' }));
    await screen.findByRole('dialog', { name: 'Registrar recepción · OC-SECOND' });
    await act(async () => { old.resolve({ data: candidate }); });
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
  });

  it.each(['detail', 'history', 'list'])('ignora %s anterior tras cerrar, reabrir y verificar otra OC', async (stage) => {
    const old = deferredResponse();
    const path = stage === 'detail' ? '/purchases/purchase-b3' : stage === 'history'
      ? '/purchase-receipts/purchase/purchase-b3' : '/purchases';
    creationApi({ [path]: () => old.promise });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openSelector(user);
    if (stage !== 'list') await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    creationApi(); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-SECOND' }));
    await screen.findByRole('dialog', { name: 'Registrar recepción · OC-SECOND' });
    await act(async () => { old.resolve({ data: stage === 'detail' ? candidate : stage === 'list' ? [candidate] : [] }); });
    expect(screen.queryByRole('dialog', { name: 'Registrar recepción · OC-B3' })).toBeNull();
  });

  it('ignora detalle pendiente tras desmontar', async () => {
    const old = deferredResponse(); creationApi({ '/purchases/purchase-b3': () => old.promise });
    const user = userEvent.setup(); const view = render(<PurchaseReceiptsPage />); await openSelector(user);
    await user.click(await screen.findByRole('button', { name: 'Seleccionar OC-B3' })); view.unmount();
    await act(async () => { old.resolve({ data: candidate }); });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalledWith('/purchase-receipts/capabilities');
  });

  it('cierra con Escape y devuelve el foco al botón de inicio desde selector y captura', async () => {
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />);
    await openSelector(user); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Registrar recepción' }));
    await openCapture(user); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Registrar recepción' }));
  });

  it.each(['CUTOVER_FROZEN', 'Authority unavailable'])('conserva bloqueo por authority %s', async (message) => {
    creationApi({ '/purchase-receipts/capabilities': () => Promise.reject(new Error(message)) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await openCapture(user);
    await screen.findByRole('button', { name: 'Reintentar verificación' });
    expect(within(screen.getByRole('dialog', { name: 'Registrar recepción · OC-B3' })).getByRole('button', { name: 'Registrar recepción' })).toHaveProperty('disabled', true);
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['detail', 'inventory'])('reutiliza éxito y navegación a %s tras refrescar historial', async (target) => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI', 'true');
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await submitCapture(user);
    await screen.findByRole('dialog', { name: 'Recepción registrada correctamente' });
    expect(screen.getByText('RC-CREATED')).toBeTruthy();
    expect(vi.mocked(api.get).mock.calls.filter(([path]) => path === '/purchase-receipts')).toHaveLength(2);
    expect(api.post).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: target === 'detail' ? 'Ver recepción' : 'Ver en inventario' }));
    expect(navigation.push).toHaveBeenCalledWith(target === 'detail' ? '/purchase-receipts/receipt-created'
      : '/inventory?tab=movements&referenceType=PURCHASE_RECEIPT&referenceId=receipt-created&receiptFolio=RC-CREATED');
  });

  it('conserva key tras error de POST y bloquea doble envío durante el reintento', async () => {
    const pending = deferredResponse();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('POST failed')).mockImplementationOnce(() => pending.promise as never);
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await submitCapture(user);
    await screen.findByText('POST failed');
    const submit = within(screen.getByRole('dialog', { name: 'Registrar recepción · OC-B3' })).getByRole('button', { name: 'Registrar recepción' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(api.post).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key'];
    expect(firstKey).toBeTruthy();
    expect(vi.mocked(api.post).mock.calls[1][2]?.headers?.['Idempotency-Key']).toBe(firstKey);
    await act(async () => { pending.resolve({ data: { id: 'receipt-created', folio: 'RC-CREATED' } }); });
    await screen.findByText('RC-CREATED');
  });

  it('no repite POST si falla la actualización del listado después del éxito', async () => {
    let reads = 0;
    creationApi({ '/purchase-receipts': () => ++reads === 1 ? Promise.resolve({ data: [] }) : Promise.reject(new Error('Refresh failed')) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />); await submitCapture(user);
    await screen.findByText('RC-CREATED');
    expect(api.post).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByText('Refresh failed')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('conserva la confirmación del POST si el refresco devuelve 403 sin permitir otra recepción', async () => {
    let reads = 0;
    creationApi({ '/purchase-receipts': () => ++reads === 1
      ? Promise.resolve({ data: [primaryReceipt] })
      : Promise.reject({ response: { status: 403 } }) });
    const user = userEvent.setup(); render(<PurchaseReceiptsPage />);
    await screen.findByRole('link', { name: primaryReceipt.folio });
    await submitCapture(user);
    const confirmation = await screen.findByRole('dialog', { name: 'Recepción confirmada' });
    expect(within(confirmation).getByText('RC-CREATED')).toBeTruthy();
    expect(within(confirmation).getByText('La API confirmó el registro. No tienes permiso para consultar el historial actualizado.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sin permisos' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('link', { name: primaryReceipt.folio })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
    expect(within(confirmation).queryByText('Proveedor B3')).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
    const key = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key'];
    expect(key).toBeTruthy();
    await user.click(within(confirmation).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Sin permisos' })).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe('PurchaseReceiptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockReturnValue({ status: 'success', user: { role: 'ADMIN' } });
    vi.mocked(api.get).mockResolvedValue({
      data: [primaryReceipt, secondaryReceipt],
    } as never);
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('carga las recepciones y calcula partidas y unidades recibidas', async () => {
    render(<PurchaseReceiptsPage />);

    const action = await screen.findByRole('link', {
      name: 'Ver recepción REC-ALPHA-001',
    });
    const row = action.closest('tr');

    expect(row).toBeTruthy();
    expect(
      screen.getByRole('table', { name: 'Listado de recepciones' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').map((header) =>
        header.textContent?.trim(),
      ),
    ).toEqual([
      'Folio',
      'Compra',
      'Proveedor',
      'Fecha de recepción',
      'Responsable',
      'Partidas',
      'Unidades',
      'Acciones',
    ]);
    expect(
      screen.getByRole('columnheader', { name: 'Folio' }).classList.contains(
        'hidden',
      ),
    ).toBe(false);
    expect(
      screen.getByRole('columnheader', { name: 'Compra' }).classList.contains(
        'hidden',
      ),
    ).toBe(false);
    expect(
      screen
        .getByRole('columnheader', { name: 'Proveedor' })
        .classList.contains('hidden'),
    ).toBe(false);
    expect(
      screen
        .getByRole('columnheader', { name: 'Fecha de recepción' })
        .classList.contains('sm:table-cell'),
    ).toBe(true);
    expect(
      screen
        .getByRole('columnheader', { name: 'Responsable' })
        .classList.contains('sm:table-cell'),
    ).toBe(true);
    expect(
      screen
        .getByRole('columnheader', { name: 'Partidas' })
        .classList.contains('md:table-cell'),
    ).toBe(true);
    expect(
      screen
        .getByRole('columnheader', { name: 'Unidades' })
        .classList.contains('md:table-cell'),
    ).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/purchase-receipts');
    expect(within(row as HTMLTableRowElement).getByText('REC-ALPHA-001')).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText('OC-ALPHA-001')).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText('Hospital Norte')).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText('Ana López')).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText('2')).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText('5')).toBeTruthy();
    expect(action.getAttribute('href')).toBe(
      '/purchase-receipts/receipt-alpha',
    );
  });

  it('presenta contador filtrado, limpieza y enlaces canónicos', async () => {
    const user = userEvent.setup();
    render(<PurchaseReceiptsPage />);
    const folio = await screen.findByRole('link', { name: primaryReceipt.folio });
    expect(folio.getAttribute('href')).toBe('/purchase-receipts/receipt-alpha');
    expect(screen.getByRole('heading', { name: 'Recepciones', level: 1 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('2 de 2 recepciones');
    expect(screen.getByRole('button', { name: 'Registrar recepción' })).toBeTruthy();
    folio.focus();
    expect(document.activeElement).toBe(folio);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar recepciones' }), 'ALPHA');
    expect(screen.getByRole('status').textContent).toBe('1 de 2 recepciones');
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar recepciones' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar recepciones' }), 'sin coincidencia');
    expect(screen.getByRole('status').textContent).toBe('0 de 2 recepciones');
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByRole('status').textContent).toBe('2 de 2 recepciones');
  });

  it.each(['ADMIN', 'MANAGER', 'WAREHOUSE'])('mantiene consulta para %s', async (role) => {
    sessionMock.mockReturnValue({ status: 'success', user: { role } });
    render(<PurchaseReceiptsPage />);
    expect(await screen.findByRole('link', { name: primaryReceipt.folio })).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/purchase-receipts');
  });

  it('bloquea SALES sin consultar recepciones', () => {
    sessionMock.mockReturnValue({ status: 'success', user: { role: 'SALES' } });
    render(<PurchaseReceiptsPage />);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('oculta datos y contador ante forbidden de la API', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<PurchaseReceiptsPage />);
    await screen.findByRole('heading', { name: 'Sin permisos' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ordena por folio y fecha usando valores reales sin mutar la respuesta', async () => {
    const user = userEvent.setup();
    const receipts = [
      {
        ...primaryReceipt,
        id: 'receipt-sort-10',
        folio: 'REC-0010',
        receivedAt: '2026-08-30T18:00:00.000Z',
        purchase: {
          ...primaryReceipt.purchase,
          folio: 'OC-0010',
        },
      },
      {
        ...primaryReceipt,
        id: 'receipt-sort-2',
        folio: 'REC-0002',
        receivedAt: '2026-08-20T18:00:00.000Z',
        purchase: {
          ...primaryReceipt.purchase,
          folio: 'OC-0002',
        },
      },
      {
        ...primaryReceipt,
        id: 'receipt-sort-1',
        folio: 'REC-0001',
        receivedAt: '2026-08-10T18:00:00.000Z',
        purchase: {
          ...primaryReceipt.purchase,
          folio: 'OC-0001',
        },
      },
    ];
    vi.mocked(api.get).mockResolvedValue({ data: receipts } as never);

    render(<PurchaseReceiptsPage />);
    await screen.findByText('REC-0010');

    const folioHeader = screen.getByRole('columnheader', {
      name: 'Folio',
    });
    await user.click(
      within(folioHeader).getByRole('button', { name: 'Folio' }),
    );

    expect(folioHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getAllByRole('cell')[0].textContent?.trim(),
      ),
    ).toEqual(['REC-0001', 'REC-0002', 'REC-0010']);
    expect(receipts.map((receipt) => receipt.folio)).toEqual([
      'REC-0010',
      'REC-0002',
      'REC-0001',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Fecha de recepción' }),
    );
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getAllByRole('cell')[0].textContent?.trim(),
      ),
    ).toEqual(['REC-0001', 'REC-0002', 'REC-0010']);
  });

  it('pagina 30 recepciones y reinicia página al cambiar tamaño y búsqueda', async () => {
    const user = userEvent.setup();
    const receipts = buildReceiptList(30);
    vi.mocked(api.get).mockResolvedValue({ data: receipts } as never);

    render(<PurchaseReceiptsPage />);
    await screen.findByText('REC-0001');

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('30 de 30 recepciones');
    expect(screen.queryByText('REC-0026')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filas por página' }),
      '10',
    );
    expect(screen.getByText('Mostrando 1-10 de 30')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar recepciones' }),
      'REC-0030',
    );
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('1 de 30 recepciones');
    expect(screen.getByText('REC-0030')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Mostrando 1-10 de 30')).toBeTruthy();
  });

  it.each([
    'rec-alpha',
    'oc-alpha',
    'hospital norte',
    'ana',
    'lópez',
    'ana.lopez@example.com',
    'sku-alpha',
    'monitor vital',
  ])('busca sin distinguir mayúsculas por %s', async (searchValue) => {
    const user = userEvent.setup();
    render(<PurchaseReceiptsPage />);

    const search = await screen.findByRole('searchbox', {
      name: 'Buscar recepciones',
    });

    await user.type(search, searchValue.toUpperCase());

    expect(
      screen.getByRole('link', {
        name: 'Ver recepción REC-ALPHA-001',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', {
        name: 'Ver recepción REC-BETA-002',
      }),
    ).toBeNull();
  });

  it('muestra el vacío de búsqueda cuando no hay coincidencias', async () => {
    const user = userEvent.setup();
    render(<PurchaseReceiptsPage />);

    const search = await screen.findByRole('searchbox', {
      name: 'Buscar recepciones',
    });

    await user.type(search, 'folio inexistente');

    expect(screen.getByText('Sin recepciones coincidentes')).toBeTruthy();
  });

  it('muestra error y permite reintentar el listado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('Recepciones temporalmente inaccesibles'))
      .mockResolvedValueOnce({ data: [primaryReceipt] } as never);

    render(<PurchaseReceiptsPage />);

    expect(
      await screen.findByText('Recepciones temporalmente inaccesibles'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('link', {
        name: 'Ver recepción REC-ALPHA-001',
      }),
    ).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('muestra el estado de carga del listado', () => {
    vi.mocked(api.get).mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<PurchaseReceiptsPage />);

    expect(screen.getByText('Cargando recepciones...')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('muestra un estado vacío útil cuando no existen recepciones', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);

    render(<PurchaseReceiptsPage />);

    expect(
      await screen.findByText('Sin recepciones registradas'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
