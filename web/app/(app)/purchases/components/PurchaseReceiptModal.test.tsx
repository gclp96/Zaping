import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PurchaseReceiptModal from './PurchaseReceiptModal';

import type { PurchaseReceiptFormItem } from '../types';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function createReceiptItem(
  overrides: Partial<PurchaseReceiptFormItem> = {},
): PurchaseReceiptFormItem {
  return {
    purchaseItemId: 'purchase-item-1',
    productId: 'product-1',
    sku: 'QTY-001',
    name: 'Producto por cantidad',
    inventoryTracking: 'QUANTITY',
    lotTracking: 'OPTIONAL',
    orderedQuantity: 10,
    receivedQuantity: 4,
    pendingQuantity: 6,
    quantityReceived: '',
    lotNumber: '',
    expirationDate: '',
    ...overrides,
  };
}

describe('PurchaseReceiptModal — recepción registrada', () => {
  it('expone navegación a la recepción y a su contexto de inventario', async () => {
    const user = userEvent.setup();
    const onViewReceipt = vi.fn();
    const onViewInventory = vi.fn();

    render(
      <PurchaseReceiptModal
        isOpen
        receiptAuthority="LEGACY"
        receiptAuthorityError=""
        onRetryAuthority={vi.fn()}
        purchase={null}
        items={[]}
        notes=""
        supplierDocumentType=""
        supplierDocumentNumber=""
        onSupplierDocumentTypeChange={vi.fn()}
        onSupplierDocumentNumberChange={vi.fn()}
        saving={false}
        error=""
        fieldErrors={{}}
        createdReceipt={{ id: 'receipt-123', folio: 'REC-000123' }}
        onClose={vi.fn()}
        onItemChange={vi.fn()}
        onNotesChange={vi.fn()}
        onSubmit={vi.fn()}
        onViewReceipt={onViewReceipt}
        onViewInventory={onViewInventory}
      />,
    );

    const receiptButton = screen.getByRole('button', {
      name: 'Ver recepción',
    });
    const inventoryButton = screen.getByRole('button', {
      name: 'Ver en inventario',
    });

    expect(receiptButton.className).toContain('w-full');
    expect(inventoryButton.className).toContain('w-full');

    await user.click(receiptButton);
    await user.click(inventoryButton);

    expect(onViewReceipt).toHaveBeenCalledWith('receipt-123');
    expect(onViewInventory).toHaveBeenCalledWith('receipt-123', 'REC-000123');
  });

  it('mantiene tabla y editor responsive con tracking por partida', async () => {
  vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
  const onItemChange = vi.fn();

    render(
      <PurchaseReceiptModal
        isOpen
        receiptAuthority="LEGACY"
        receiptAuthorityError=""
        onRetryAuthority={vi.fn()}
        purchase={{
          folio: 'OC-0001',
          supplier: { name: 'Proveedor médico' },
        }}
        items={[
          createReceiptItem({
            purchaseItemId: 'none-item',
            sku: 'QTY-NONE',
            name: 'Producto sin lote',
            lotTracking: 'NONE',
          }),
          createReceiptItem({
            purchaseItemId: 'optional-item',
            sku: 'QTY-OPTIONAL',
            name: 'Producto opcional',
          }),
          createReceiptItem({
            purchaseItemId: 'required-item',
            sku: 'QTY-REQUIRED',
            name: 'Producto requerido',
            lotTracking: 'REQUIRED',
          }),
          createReceiptItem({
            purchaseItemId: 'asset-item',
            sku: 'ASSET-001',
            name: 'Equipo individual',
            inventoryTracking: 'ASSET',
          }),
        ]}
        notes=""
        supplierDocumentType=""
        supplierDocumentNumber=""
        onSupplierDocumentTypeChange={vi.fn()}
        onSupplierDocumentNumberChange={vi.fn()}
        saving={false}
        error=""
        fieldErrors={{}}
        createdReceipt={null}
        onClose={vi.fn()}
        onItemChange={onItemChange}
        onNotesChange={vi.fn()}
        onSubmit={vi.fn()}
        onViewReceipt={vi.fn()}
        onViewInventory={vi.fn()}
      />,
    );

    const desktop = await screen.findByTestId('receipt-desktop-items');
    const mobile = screen.getByTestId('receipt-mobile-items');
    const table = within(desktop).getByRole('table');

    expect(desktop.className).toContain('xl:block');
    expect(mobile.className).toContain('xl:hidden');
    expect(within(table).getByText(/líneas pendientes/i)).toBeTruthy();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .every((header) => header.getAttribute('scope') === 'col'),
    ).toBe(true);

    expect(within(desktop).getAllByText('No aplica')).toHaveLength(2);
    expect(
      within(mobile).getByText('Lote y caducidad: no aplica.'),
    ).toBeTruthy();

    const requiredLot = within(desktop).getByLabelText(
      'Lote de Producto requerido',
    );
    expect(requiredLot.getAttribute('required')).toBe('');
    expect(
      within(desktop).getByLabelText('Lote de Producto opcional'),
    ).toBeTruthy();

    expect(
      screen.getByRole('note', {
        name: 'Información sobre generación de equipos',
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        'Al registrar esta recepción se generarán equipos individuales para esta partida.',
      ),
    ).toHaveLength(2);

    const mobileAssetItem = within(mobile).getByTestId(
      'receipt-mobile-item-asset-item',
    );
    fireEvent.change(
      within(mobileAssetItem).getByLabelText('Lote de Equipo individual'),
      { target: { value: 'ASSET-LOT-001' } },
    );

    expect(onItemChange).toHaveBeenCalledWith(
      'asset-item',
      'lotNumber',
      'ASSET-LOT-001',
    );
  });
});

describe('OX-PUR-05 — editor por autoridad en ambos layouts', () => {
  function show(
    overrides: Partial<React.ComponentProps<typeof PurchaseReceiptModal>> = {},
  ) {
    const props = {
      isOpen: true,
      purchase: { folio: 'OC-1', supplier: { name: 'Proveedor' } },
      receiptAuthority: 'PHYSICAL' as const,
      receiptAuthorityError: '',
      onRetryAuthority: vi.fn(),
      items: [createReceiptItem()],
      notes: '',
      supplierDocumentType: '',
      supplierDocumentNumber: '',
      onSupplierDocumentTypeChange: vi.fn(),
      onSupplierDocumentNumberChange: vi.fn(),
      saving: false,
      error: '',
      fieldErrors: {},
      createdReceipt: null,
      onClose: vi.fn(),
      onItemChange: vi.fn(),
      onNotesChange: vi.fn(),
      onSubmit: vi.fn(),
      onViewReceipt: vi.fn(),
      onViewInventory: vi.fn(),
      ...overrides,
    };
    render(<PurchaseReceiptModal {...props} />);
    return props;
  }
  it('RR-002 mantiene acciones y validaciones al usar panel ancho', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const props = show();
    const dialog = screen.getByRole('dialog', {
      name: 'Registrar recepción · OC-1',
    });
    expect(dialog.getAttribute('data-modal-layout')).toBe('workspace');
    expect(dialog.querySelector('[data-modal-body]')).toBeTruthy();
    const footer = dialog.querySelector('[data-modal-footer]');
    expect(footer).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: 'Registrar recepción',
    });
    expect(footer?.contains(submit)).toBe(true);
    fireEvent.click(submit);
    expect(props.onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('receipt-desktop-items')).toBeTruthy();
    expect(screen.getByTestId('receipt-mobile-items')).toBeTruthy();
  });

  it('RR-002 mantiene modal anterior cuando la bandera está desactivada', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
    const props = show();
    const dialog = screen.getByRole('dialog', {
      name: 'Registrar recepción · OC-1',
    });
    expect(dialog.getAttribute('data-modal-layout')).toBe('default');
    expect(dialog.querySelector('[data-modal-footer]')).toBeNull();
    const submit = screen.getByRole('button', {
      name: 'Registrar recepción',
    });
    expect(dialog.querySelector('[data-modal-body]')?.contains(submit)).toBe(
      true,
    );
    fireEvent.click(submit);
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it('RR-004 sitúa el resumen en el lado derecho del workspace sin cambiar las partidas', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    show({
      items: [
        createReceiptItem({
          purchaseItemId: 'item-a',
          pendingQuantity: 6,
          quantityReceived: '3',
        }),
        createReceiptItem({
          purchaseItemId: 'item-b',
          pendingQuantity: 4,
          quantityReceived: '2',
        }),
      ],
    });
    const lower = screen.getByTestId('receipt-lower-area');
    expect(lower.className).toContain('lg:grid-cols-');
    const summary = within(lower).getByRole('region', {
      name: 'Resumen de esta recepción',
    });
    expect(summary.parentElement?.className).toContain('lg:col-start-2');
    expect(
      within(summary).getByTestId('receipt-summary-pending-before').textContent,
    ).toBe('10');
    expect(
      within(summary).getByTestId('receipt-summary-to-receive').textContent,
    ).toBe('5');
    expect(
      within(summary).getByTestId('receipt-summary-pending-after').textContent,
    ).toBe('5');
    expect(
      within(summary).getByRole('status').textContent,
    ).toContain('2 de 2 partidas');
    expect(within(lower).queryByRole('button', { name: /adjuntar/i })).toBeNull();
  });

  it('RR-004 no muestra resumen nuevo con la bandera de workspace OFF', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
    show();
    expect(screen.queryByTestId('receipt-lower-area')).toBeNull();
    expect(screen.queryByTestId('receipt-capture-summary')).toBeNull();
  });

  it('RR-003 agrupa partida y documento sin cambiar la captura ni sus callbacks', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onItemChange = vi.fn();
    const onSupplierDocumentTypeChange = vi.fn();
    const onSupplierDocumentNumberChange = vi.fn();
    const onNotesChange = vi.fn();
    show({
      onItemChange,
      onSupplierDocumentTypeChange,
      onSupplierDocumentNumberChange,
      onNotesChange,
    });

    const context = screen.getByTestId('receipt-purchase-context');
    expect(within(context).getByText('OC-1')).toBeTruthy();
    expect(within(context).getAllByText('Proveedor')).toHaveLength(2);

    const items = screen.getByTestId('receipt-item-capture-section');
    expect(within(items).getByText('Partidas pendientes')).toBeTruthy();
    const desktop = within(items).getByTestId('receipt-desktop-items');
    const mobile = within(items).getByTestId('receipt-mobile-items');
    expect(desktop.className).toContain('lg:block');
    expect(mobile.className).toContain('lg:hidden');
    expect(within(desktop).getByRole('table').className).toContain(
      'min-w-[940px]',
    );
    expect(within(desktop).getByText('Pedido')).toBeTruthy();
    expect(within(desktop).getByText('Recibido')).toBeTruthy();
    expect(within(desktop).getByText('Pendiente')).toBeTruthy();

    fireEvent.change(
      within(desktop).getByLabelText('Cantidad recibida de Producto por cantidad'),
      { target: { value: '3' } },
    );
    expect(onItemChange).toHaveBeenCalledWith(
      'purchase-item-1',
      'quantityReceived',
      '3',
    );

    const documents = screen.getByTestId('receipt-supplier-document-section');
    expect(
      within(documents).getByText('Documento del proveedor y notas'),
    ).toBeTruthy();
    fireEvent.change(
      within(documents).getByLabelText('Documento del proveedor (opcional)'),
      { target: { value: 'REMISION' } },
    );
    fireEvent.change(within(documents).getByLabelText('Número del documento'), {
      target: { value: 'REM-123' },
    });
    fireEvent.change(within(documents).getByLabelText('Notas'), {
      target: { value: 'Tres piezas recibidas' },
    });
    expect(onSupplierDocumentTypeChange).toHaveBeenCalledWith('REMISION');
    expect(onSupplierDocumentNumberChange).toHaveBeenCalledWith('REM-123');
    expect(onNotesChange).toHaveBeenCalledWith('Tres piezas recibidas');
    expect(screen.queryByText('Guardar borrador')).toBeNull();
    expect(screen.queryByText('Rechazado')).toBeNull();
  });

  it('RR-003 conserva el layout clásico y las mismas partidas con la flag OFF', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
    show();
    const context = screen.getByTestId('receipt-purchase-context');
    expect(within(context).queryByText('OC-1')).toBeNull();
    const items = screen.getByTestId('receipt-item-capture-section');
    expect(within(items).queryByText('Partidas pendientes')).toBeNull();
    const desktop = within(items).getByTestId('receipt-desktop-items');
    const mobile = within(items).getByTestId('receipt-mobile-items');
    expect(desktop.className).toContain('xl:block');
    expect(mobile.className).toContain('xl:hidden');
    expect(within(desktop).getByRole('table').className).toContain(
      'min-w-[760px]',
    );
    expect(screen.getByRole('button', {
      name: 'Registrar recepción',
    })).toBeTruthy();
  });

  it.each(['NONE', 'OPTIONAL', 'REQUIRED'] as const)(
    'PHYSICAL QUANTITY %s ofrece lote y fecha independientes en desktop y móvil',
    (lotTracking) => {
      const { onItemChange } = show({
        items: [
          createReceiptItem({
            lotTracking,
            lotNumber: 'REAL-1',
            expirationDate: '2029-06-30',
          }),
        ],
      });
      for (const layout of ['desktop', 'mobile']) {
        const group = within(
          screen.getByTestId('receipt-' + layout + '-items'),
        );
        const lot = group.getByLabelText(
          'Lote de Producto por cantidad',
        ) as HTMLInputElement;
        expect(lot.required).toBe(false);
        expect(lot.value).toBe('REAL-1');
        expect(lot.matches(':disabled')).toBe(false);
        const date = group.getByLabelText('Caducidad de Producto por cantidad');
        expect(group.getByText('Opcional, incluso sin lote.')).toBeTruthy();
        fireEvent.change(lot, { target: { value: '' } });
        expect(onItemChange).toHaveBeenCalledWith(
          'purchase-item-1',
          'lotNumber',
          '',
        );
        expect(date.matches(':disabled')).toBe(false);
      }
    },
  );
  it.each(['ASSET', 'SERIALIZED'] as const)(
    'conserva REQUIRED para %s en PHYSICAL',
    (inventoryTracking) => {
      show({
        items: [
          createReceiptItem({ inventoryTracking, lotTracking: 'REQUIRED' }),
        ],
      });
      for (const layout of ['desktop', 'mobile']) {
        const group = within(
          screen.getByTestId('receipt-' + layout + '-items'),
        );
        expect(
          (
            group.getByLabelText(
              'Lote de Producto por cantidad',
            ) as HTMLInputElement
          ).required,
        ).toBe(true);
        expect(group.getByText('Requiere número de lote.')).toBeTruthy();
      }
    },
  );
  it('mantiene campos y envío bloqueados durante carga o CUTOVER, con reintento explícito', async () => {
    const user = userEvent.setup();
    const props = show({
      receiptAuthority: null,
      receiptAuthorityError: 'CUTOVER_FROZEN',
    });
    expect(screen.getByRole('alert').querySelector('p')?.textContent).toBe(
      'No es posible registrar recepciones mientras se realiza la transición del inventario. Contacta al administrador.',
    );
    expect(screen.queryByText('CUTOVER_FROZEN')).toBeNull();
    expect(props.receiptAuthorityError).toBe('CUTOVER_FROZEN');
    expect(
      (
        screen.getByRole('button', {
          name: 'Registrar recepción',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    for (const input of screen.getAllByRole('spinbutton'))
      expect(input.matches(':disabled')).toBe(true);
    await user.click(
      screen.getByRole('button', { name: 'Reintentar verificación' }),
    );
    expect(props.onRetryAuthority).toHaveBeenCalledOnce();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});


describe('ZF-001-UX — documentos después del registro', () => {
  const props = {
    isOpen: true,
    receiptAuthority: 'PHYSICAL' as const,
    receiptAuthorityError: '',
    onRetryAuthority: vi.fn(),
    purchase: { folio: 'OC-RR005', supplier: { name: 'Proveedor prueba' } },
    items: [createReceiptItem()],
    notes: '',
    supplierDocumentType: '',
    supplierDocumentNumber: '',
    onSupplierDocumentTypeChange: vi.fn(),
    onSupplierDocumentNumberChange: vi.fn(),
    saving: false,
    error: '',
    fieldErrors: {},
    createdReceipt: null,
    onClose: vi.fn(),
    onItemChange: vi.fn(),
    onNotesChange: vi.fn(),
    onSubmit: vi.fn(),
    onViewReceipt: vi.fn(),
    onViewInventory: vi.fn(),
  };

  it.each(['true', 'false'])('permite registrar sin selector local en workspace=%s', (workspace) => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', workspace);
    vi.stubEnv('NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI', 'true');
    const onSubmit = vi.fn();
    const { container } = render(<PurchaseReceiptModal {...props} onSubmit={onSubmit} />);
    expect(screen.getByText('Los documentos se adjuntan después de registrar la recepción, desde su página de detalle.')).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/No se guardarán/)).toBeNull();
    const submit = screen.getByRole('button', { name: 'Registrar recepción' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('no altera la vista clásica al apagar el workspace', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
    render(<PurchaseReceiptModal {...props} />);
    expect(screen.queryByTestId('receipt-lower-area')).toBeNull();
    expect(screen.getByRole('button', { name: 'Registrar recepción' })).toBeTruthy();
  });
});


describe('RR-006 — confirmación de descarte', () => {
  const base = {
    isOpen: true,
    purchase: { folio: 'OC-006', supplier: { name: 'Proveedor prueba' } },
    receiptAuthority: 'PHYSICAL' as const,
    receiptAuthorityError: '',
    onRetryAuthority: vi.fn(),
    items: [createReceiptItem()],
    notes: '',
    supplierDocumentType: '',
    supplierDocumentNumber: '',
    onSupplierDocumentTypeChange: vi.fn(),
    onSupplierDocumentNumberChange: vi.fn(),
    saving: false,
    error: '',
    fieldErrors: {},
    createdReceipt: null,
    onItemChange: vi.fn(),
    onNotesChange: vi.fn(),
    onSubmit: vi.fn(),
    onViewReceipt: vi.fn(),
    onViewInventory: vi.fn(),
  };

  it('sin cambios cierra inmediatamente', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('con cantidades editadas solicita confirmar y permite continuar', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} items={[createReceiptItem({ quantityReceived: '3' })]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Descartar cambios de la recepción' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar captura' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('durante guardado no permite salir', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} saving onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la recepción' })).toBeNull();
  });

  it('Escape solicita descarte de notas no guardadas sin perder el contenido', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} notes="Notas importantes" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Descartar cambios de la recepción' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar captura' }));
    expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe('Notas importantes');
  });

  it('documento incompleto también exige descarte', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'true');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} supplierDocumentNumber="REM-123" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Descartar cambios de la recepción' })).toBeTruthy();
  });

  it('modo clásico conserva el cierre original', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE', 'false');
    const onClose = vi.fn();
    render(<PurchaseReceiptModal {...base} notes="observación" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
