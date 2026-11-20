import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type {
  ComponentProps,
  ReactNode,
} from 'react';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  Product,
  PurchaseFormItem,
  Supplier,
} from '../types';
import PurchaseFormModal from './PurchaseFormModal';

vi.mock('@/app/components/ui/Modal', () => ({
  default: ({
    isOpen,
    title,
    children,
    layout = 'default',
    footer,
    dismissible = true,
    onClose,
  }: {
    isOpen: boolean;
    title: string;
    children: ReactNode;
    layout?: string;
    footer?: ReactNode;
    dismissible?: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title} data-modal-layout={layout}>
        <h2>{title}</h2>
        {dismissible ? (
          <button type="button" aria-label="Cerrar modal" onClick={onClose}>
            X
          </button>
        ) : null}
        <div data-modal-body>{children}</div>
        {footer ? <div data-modal-footer>{footer}</div> : null}
      </div>
    ) : null,
}));

const supplier: Supplier = {
  id: 'supplier-1',
  name: 'Proveedor médico',
};

const product: Product = {
  id: 'product-1',
  sku: 'MED-001',
  name: 'Producto médico',
  cost: 100,
  stock: 20,
  minStock: 5,
  price: 120,
  inventoryTracking: 'QUANTITY',
  lotTracking: 'OPTIONAL',
};

const item: PurchaseFormItem = {
  productId: product.id,
  sku: product.sku,
  name: product.name,
  quantity: '3',
  unitCost: product.cost,
};

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function renderModal(
  overrides: Partial<ComponentProps<typeof PurchaseFormModal>> = {},
) {
  const props: ComponentProps<typeof PurchaseFormModal> = {
    isOpen: true,
    editing: false,
    saving: false,
    hasUnsavedChanges: true,
    suppliers: [supplier],
    products: [product],
    supplierId: supplier.id,
    commercial: {
      paymentTerms: '',
      paymentMethod: '',
      paymentDueDate: '',
      expectedDeliveryDate: '',
    },
    selectedProductId: '',
    quantity: '1',
    items: [item],
    supplierError: '',
    productError: '',
    quantityError: '',
    itemQuantityErrors: {},
    itemsError: '',
    subtotal: 300,
    iva: 48,
    total: 348,
    formatMoney,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onAddProduct: vi.fn(),
    onRemoveItem: vi.fn(),
    onSupplierChange: vi.fn(),
    onCommercialChange: vi.fn(),
    onSelectedProductChange: vi.fn(),
    onQuantityChange: vi.fn(),
    onItemQuantityChange: vi.fn(),
    ...overrides,
  };

  return render(<PurchaseFormModal {...props} />);
}

describe('PurchaseFormModal', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('edita las condiciones comerciales sin afectar las partidas', () => {
    const onCommercialChange = vi.fn();
    renderModal({
      onCommercialChange,
      commercial: {
        paymentTerms: 'Crédito 30 días',
        paymentMethod: 'Transferencia electrónica',
        paymentDueDate: '2026-12-17',
        expectedDeliveryDate: '2026-11-17',
      },
    });
    const terms = screen.getByRole('heading', { name: 'Condiciones comerciales' });
    expect(terms).toBeTruthy();
    const paymentTerms = screen.getByRole('combobox', { name: 'Condiciones de pago' });
    fireEvent.change(paymentTerms, { target: { value: 'Contado' } });
    expect(onCommercialChange).toHaveBeenCalledWith('paymentTerms', 'Contado');
    expect((screen.getByLabelText('Fecha de pago') as HTMLInputElement).value).toBe('2026-12-17');
  });

  it('muestra catálogos No aplica sin campos editables de autor', () => {
    renderModal();
    const payment = screen.getByRole('combobox', { name: 'Condiciones de pago' }) as HTMLSelectElement;
    const method = screen.getByRole('combobox', { name: 'Método de pago' }) as HTMLSelectElement;
    expect(payment.value).toBe('');
    expect(method.value).toBe('');
    expect(payment.options[0].textContent).toBe('No aplica');
    expect(method.options[0].textContent).toBe('No aplica');
    expect(screen.queryByText('Ana Compras')).toBeNull();
    expect(screen.queryByText('Elaboró')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Comprador' })).toBeNull();
  });

  it('al editar muestra el proveedor actual y deja libre el campo de búsqueda', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onSupplierChange = vi.fn();
    renderModal({ editing: true, onSupplierChange });
    const input = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Buscar para cambiar proveedor');
    expect(screen.getByText('Proveedor actual')).toBeTruthy();
    expect(screen.getAllByText('Proveedor médico').length).toBeGreaterThan(0);
    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(onSupplierChange).not.toHaveBeenCalled();
  });

  it('habilita el workspace únicamente para Nueva compra y reubica el footer fuera del scroll', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onSubmit = vi.fn();
    const onAddProduct = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSubmit, onAddProduct, onClose });

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-modal-layout')).toBe('workspace');
    expect(within(dialog).getByRole('heading', { name: 'Proveedor de la compra' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Agregar productos' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Partidas de la compra' })).toBeTruthy();

    const lowerArea = screen.getByTestId('purchase-form-lower-area');
    expect(lowerArea.className).toContain('lg:grid-cols-');
    expect(within(lowerArea).getByRole('region', { name: 'Revisión de la orden' })).toBeTruthy();
    expect(within(lowerArea).getByText('Proveedor médico')).toBeTruthy();
    expect(within(lowerArea).getByText('Partidas agregadas')).toBeTruthy();
    expect(within(lowerArea).getByText('$348.00')).toBeTruthy();
    expect(screen.getByTestId('purchase-form-items-table').className).toContain('md:block');
    expect(screen.getByTestId('purchase-form-mobile-items').className).toContain('md:hidden');

    const fixedFooter = within(dialog).getByTestId('purchase-form-footer');
    expect(fixedFooter.closest('[data-modal-footer]')).not.toBeNull();
    expect(screen.queryAllByTestId('purchase-form-footer')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar producto' }));
    fireEvent.click(within(fixedFooter).getByRole('button', { name: 'Crear compra' }));
    fireEvent.click(within(fixedFooter).getByRole('button', { name: 'Cancelar' }));
    const warning = screen.getByRole('dialog', { name: 'Descartar cambios de la compra' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(warning).getByRole('button', { name: 'Descartar cambios' }));
    expect(onAddProduct).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('compacta el producto elegido y mantiene el total visible en el pie del workspace', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    renderModal({ selectedProductId: product.id });

    const dialog = screen.getByRole('dialog', { name: 'Nueva compra' });
    const selectedProduct = screen.getByTestId('purchase-form-add-item');
    expect(within(selectedProduct).getByText(/MED-001.*Producto médico/)).toBeTruthy();
    expect(within(selectedProduct).queryByRole('combobox', { name: 'Producto' })).toBeNull();
    expect(within(selectedProduct).getByRole('button', { name: 'Cambiar' })).toBeTruthy();

    const footer = within(dialog).getByTestId('purchase-form-footer');
    expect(within(footer).getByText('Total de la compra')).toBeTruthy();
    expect(within(footer).getByText('$348.00')).toBeTruthy();
    expect(within(footer).getByRole('button', { name: 'Crear compra' })).toBeTruthy();
    expect(within(screen.getByTestId('purchase-form-financial-summary')).getByText('$348.00')).toBeTruthy();
  });

  it('mantiene el buscador inicial y no muestra total fijo sin partidas', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    renderModal({ selectedProductId: '', items: [], subtotal: 0, iva: 0, total: 0 });
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeTruthy();
    expect(within(screen.getByTestId('purchase-form-footer')).queryByText('Total de la compra')).toBeNull();
    expect((within(screen.getByTestId('purchase-form-footer')).getByRole('button', { name: 'Crear compra' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    { label: 'proveedor elegido', supplierId: supplier.id, selectedProductId: '', quantity: '1', items: [] },
    { label: 'producto elegido', supplierId: '', selectedProductId: product.id, quantity: '1', items: [] },
    { label: 'cantidad editada', supplierId: '', selectedProductId: '', quantity: '3', items: [] },
    { label: 'partidas agregadas', supplierId: '', selectedProductId: '', quantity: '1', items: [item] },
  ])('confirma descarte con $label y permite volver a la captura', ({ supplierId, selectedProductId, quantity, items }) => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onClose = vi.fn();
    renderModal({ supplierId, selectedProductId, quantity, items, onClose });

    const editor = screen.getByRole('dialog', { name: 'Nueva compra' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancelar' }));
    const warning = screen.getByRole('dialog', { name: 'Descartar cambios de la compra' });
    expect(within(warning).getByText(/no se ha guardado/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(within(warning).getByRole('button', { name: 'Continuar captura' }));
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Nueva compra' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // The X and the footer Cancel action share the same guarded close handler.
    fireEvent.click(within(editor).getByRole('button', { name: 'Cerrar modal' }));
    const reopenedWarning = screen.getByRole('dialog', { name: 'Descartar cambios de la compra' });
    fireEvent.click(within(reopenedWarning).getByRole('button', { name: 'Descartar cambios' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
  });

  it('cierra directamente un formulario nuevo sin cambios', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onClose = vi.fn();
    renderModal({ supplierId: '', selectedProductId: '', quantity: '1', items: [], hasUnsavedChanges: false, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
  });

  it('no abre la confirmación durante el guardado', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onClose = vi.fn();
    renderModal({ saving: true, onClose });
    expect(screen.queryByRole('button', { name: 'Cerrar modal' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
  });

  it('conserva el cierre legado con la bandera apagada incluso al editar', () => {
    const onClose = vi.fn();
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'false');
    const editingView = renderModal({ editing: true, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();

    editingView.unmount();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
  });

  it('usa el workspace al editar sin cambiar Guardar cambios ni los handlers', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onSubmit = vi.fn();
    const onItemQuantityChange = vi.fn();
    renderModal({ editing: true, hasUnsavedChanges: false, onSubmit, onItemQuantityChange });
    const dialog = screen.getByRole('dialog', { name: 'Editar compra' });
    expect(dialog.getAttribute('data-modal-layout')).toBe('workspace');
    expect(within(dialog).getByRole('heading', { name: 'Proveedor de la compra' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Agregar productos' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Partidas de la compra' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Revisión de la orden' })).toBeTruthy();
    expect(within(dialog).getAllByText(/antes de guardar los cambios/).length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText(/Guardar los cambios de un borrador no registra/)).toBeTruthy();
    const footer = within(dialog).getByTestId('purchase-form-footer');
    expect(footer.closest('[data-modal-footer]')).not.toBeNull();
    expect(screen.getAllByTestId('purchase-form-footer')).toHaveLength(1);
    fireEvent.change(
      within(screen.getByTestId('purchase-form-mobile-items')).getByRole('spinbutton', { name: 'Cantidad de Producto médico' }),
      { target: { value: '5' } },
    );
    expect(onItemQuantityChange).toHaveBeenCalledWith('product-1', '5');
    fireEvent.click(within(footer).getByRole('button', { name: 'Guardar cambios' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('permite ajustar el costo en desktop y móvil solo a usuarios autorizados', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onItemUnitCostChange = vi.fn();
    const view = renderModal({
      canAdjustUnitCost: true,
      onItemUnitCostChange,
      itemUnitCostDrafts: { 'product-1': '12.3456' },
    });
    const table = screen.getByTestId('purchase-form-items-table');
    const input = within(table).getByRole('textbox', {
      name: 'Costo unitario de Producto médico',
    }) as HTMLInputElement;
    expect(input.value).toBe('12.3456');
    fireEvent.change(input, { target: { value: '13.2222' } });
    expect(onItemUnitCostChange).toHaveBeenCalledWith('product-1', '13.2222');
    const mobile = screen.getByTestId('purchase-form-mobile-items');
    expect(within(mobile).getByRole('textbox', {
      name: 'Costo unitario de Producto médico',
    })).toBeTruthy();
    view.unmount();
    renderModal({ canAdjustUnitCost: false });
    expect(screen.queryByRole('textbox', { name: 'Costo unitario de Producto médico' })).toBeNull();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('muestra y valida descuentos por partida en desktop y móvil', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onItemDiscountChange = vi.fn();
    renderModal({
      canAdjustUnitCost: true,
      onItemDiscountChange,
      items: [{
        ...item,
        unitOfMeasure: 'pzas.',
        baseUnitCost: 85.5,
        unitCost: 76.95,
        discountPercent: 10,
      }],
      itemDiscountDrafts: { 'product-1': '10' },
    });
    const table = screen.getByTestId('purchase-form-items-table');
    expect(within(table).getByText(/pzas./i)).toBeTruthy();
    const discount = within(table).getByRole('spinbutton', {
      name: 'Descuento de Producto médico',
    });
    fireEvent.change(discount, { target: { value: '12.50' } });
    expect(onItemDiscountChange).toHaveBeenCalledWith('product-1', '12.50');
    const mobile = screen.getByTestId('purchase-form-mobile-items');
    expect(within(mobile).getByRole('spinbutton', {
      name: 'Descuento de Producto médico',
    })).toBeTruthy();
  });

  it('desactiva guardar si el descuento es inválido', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    renderModal({
      canAdjustUnitCost: true,
      itemDiscountDrafts: { 'product-1': '110' },
      itemDiscountErrors: { 'product-1': 'Descuento inválido' },
    });
    const footer = screen.getByTestId('purchase-form-footer');
    const save = within(footer).getByRole('button', { name: 'Crear compra' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('bloquea guardar cuando se ingresa un costo inválido', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    renderModal({
      canAdjustUnitCost: true,
      itemUnitCostDrafts: { 'product-1': '' },
      itemUnitCostErrors: { 'product-1': 'Costo inválido' },
    });
    const footer = screen.getByTestId('purchase-form-footer');
    expect((within(footer).getByRole('button', { name: 'Crear compra' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('abre la confirmación solo si el borrador editado tiene cambios', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onClose = vi.fn();
    const editor = renderModal({ editing: true, hasUnsavedChanges: false, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();

    editor.unmount();
    renderModal({ editing: true, hasUnsavedChanges: true, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    const warning = screen.getByRole('dialog', { name: 'Descartar cambios de la compra' });
    fireEvent.click(within(warning).getByRole('button', { name: 'Continuar captura' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios de la compra' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Descartar cambios de la compra' }))
        .getByRole('button', { name: 'Descartar cambios' }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('bloquea el cierre durante guardado de un borrador', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const onClose = vi.fn();
    renderModal({ editing: true, saving: true, hasUnsavedChanges: true, onClose });
    expect(screen.queryByRole('button', { name: 'Cerrar modal' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('conserva el modal legado de creación cuando la bandera está apagada', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'false');
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-modal-layout')).toBe('default');
    expect(within(dialog).getByRole('heading', { name: 'Datos de la compra' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Crear compra' })).toBeTruthy();
    expect(within(dialog).queryByRole('region', { name: 'Revisión de la orden' })).toBeNull();
  });

  it('no habilita crear con partidas vacías y muestra el error existente en el pie fijo', () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    renderModal({ items: [], itemsError: 'Agrega al menos un producto.' });
    const footer = screen.getByTestId('purchase-form-footer');
    expect(within(footer).getByRole('alert').textContent).toContain('Agrega al menos un producto.');
    expect((within(footer).getByRole('button', { name: 'Crear compra' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('organiza el formulario y mantiene tabla/editor con el mismo handler', () => {
    const onItemQuantityChange = vi.fn();
    const onRemoveItem = vi.fn();

    renderModal({
      itemQuantityErrors: {
        [item.productId]: 'La cantidad debe ser válida.',
      },
      itemsError: 'Corrige las cantidades antes de guardar.',
      onItemQuantityChange,
      onRemoveItem,
    });

    expect(
      screen.getByRole('heading', { name: 'Datos de la compra' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Agregar partida' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Partidas' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Resumen financiero' }),
    ).toBeTruthy();

    const table = screen.getByTestId('purchase-form-items-table');
    const mobileItems = screen.getByTestId('purchase-form-mobile-items');
    const mobileItem = screen.getByTestId(
      'purchase-form-mobile-item-product-1',
    );

    expect(table.classList.contains('md:block')).toBe(true);
    expect(mobileItems.classList.contains('md:hidden')).toBe(true);
    expect(mobileItems.classList.contains('overflow-x-auto')).toBe(false);
    expect(
      within(table)
        .getByRole('columnheader', { name: 'Producto' })
        .getAttribute('scope'),
    ).toBe('col');
    expect(
      within(mobileItem).getByRole('heading', {
        name: 'Producto médico',
      }),
    ).toBeTruthy();
    expect(within(mobileItem).getByText('SKU: MED-001')).toBeTruthy();

    const mobileQuantity = within(mobileItem).getByRole('spinbutton', {
      name: 'Cantidad de Producto médico',
    });
    fireEvent.change(mobileQuantity, { target: { value: '5' } });

    expect(onItemQuantityChange).toHaveBeenCalledWith('product-1', '5');
    expect(within(mobileItem).getByText('$100.00')).toBeTruthy();
    expect(within(mobileItem).getByText('$300.00')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('purchase-form-mobile-item-product-1')).getByRole(
        'button',
        { name: 'Quitar Producto médico' },
      ),
    );
    expect(onRemoveItem).toHaveBeenCalledWith('product-1');

    const footerAlert = within(
      screen.getByTestId('purchase-form-footer'),
    ).getByRole('alert');
    expect(footerAlert.textContent?.includes(
      'Corrige las cantidades antes de guardar.',
    )).toBe(true);
    expect(
      within(screen.getByTestId('purchase-form-footer')).getByRole(
        'button',
        { name: 'Crear compra' },
      ),
    ).toBeTruthy();
  });

  it('acerca el error de cantidad al campo del bloque de alta', () => {
    renderModal({
      items: [],
      quantityError: 'La cantidad debe ser un número entero mayor o igual a uno.',
    });

    const addItemSection = screen.getByTestId('purchase-form-add-item');
    const quantityInput = within(addItemSection).getByRole('spinbutton', {
      name: 'Cantidad',
    });

    expect(quantityInput.getAttribute('aria-invalid')).toBe('true');
    const quantityAlert = within(addItemSection).getByRole('alert');
    expect(quantityAlert.textContent?.includes(
      'La cantidad debe ser un número entero mayor o igual a uno.',
    )).toBe(true);
    const itemsSection = screen.getByTestId('purchase-form-items');
    expect(itemsSection.textContent?.includes('Selecciona un producto')).toBe(
      true,
    );
    expect(itemsSection.textContent?.includes('comenzar la compra')).toBe(
      true,
    );
  });

  it.each([
    { editing: false, title: 'Nueva compra', action: 'Crear compra' },
    { editing: true, title: 'Editar compra', action: 'Guardar cambios' },
  ])('preserva el modo $title y su CTA', ({ editing, title, action }) => {
    renderModal({ editing });

    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByRole('button', { name: action })).toBeTruthy();
  });
});
