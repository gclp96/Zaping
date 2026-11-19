import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { clearAuthenticatedSessionCache } from '@/app/auth-session';

import ProductsPage from './page';

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorStatus: (error: unknown) =>
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined,
  getApiErrorMessage: (
    error: unknown,
    fallbackMessage: string,
  ) => {
    if (error instanceof Error) {
      return error.message;
    }

    return fallbackMessage;
  },
}));

type Product = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  isActive: boolean;
  inventoryTracking: 'QUANTITY' | 'SERIALIZED' | 'ASSET';
  lotTracking: 'NONE' | 'OPTIONAL' | 'REQUIRED';
};

type Category = {
  id: string;
  name: string;
  isActive: boolean;
};

const surgicalCategory: Category = {
  id: 'category-surgical',
  name: 'Quirúrgico',
  isActive: true,
};

const inactiveCategory: Category = {
  id: 'category-inactive',
  name: 'Inactiva',
  isActive: false,
};

const bluntTipProduct: Product = {
  id: 'product-blunt-tip',
  sku: 'LF1837',
  name: 'BLUNT TIP',
  description: 'Punta roma',
  brand: 'Acme Medical',
  categoryId: surgicalCategory.id,
  barcode: '750000000001',
  cost: 100,
  price: 150,
  stock: 7,
  minStock: 2,
  isActive: true,
  inventoryTracking: 'QUANTITY',
  lotTracking: 'OPTIONAL',
};

const noBrandProduct: Product = {
  ...bluntTipProduct,
  id: 'product-no-brand',
  sku: 'NB001',
  name: 'SIN MARCA',
  brand: null,
  categoryId: null,
  barcode: null,
};

const assetProduct: Product = {
  ...bluntTipProduct,
  id: 'product-asset',
  sku: 'EQP900',
  name: 'EQUIPO ZETA',
  brand: 'Beta Health',
  categoryId: inactiveCategory.id,
  barcode: '750000000900',
  stock: 3,
  isActive: false,
  inventoryTracking: 'ASSET',
  lotTracking: 'REQUIRED',
};

function buildProductList(count: number): Product[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const suffix = number.toString().padStart(3, '0');

    return {
      ...bluntTipProduct,
      id: `product-${suffix}`,
      sku: `SKU${suffix}`,
      name: `Producto ${suffix}`,
      barcode: `750000${suffix}`,
      lotTracking: number === count ? 'REQUIRED' : 'OPTIONAL',
    };
  });
}

function configureApiMocks({
  products = [bluntTipProduct, noBrandProduct],
  categories = [surgicalCategory, inactiveCategory],
  categoryError,
  productError,
  role = 'ADMIN',
}: {
  products?: Product[];
  categories?: Category[];
  categoryError?: Error;
  productError?: Error;
  role?: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE';
} = {}) {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role,
          companyTimezone: 'America/Hermosillo',
        },
      } as never;
    }

    if (endpoint === '/products') {
      if (productError) {
        throw productError;
      }

      return {
        data: products,
      } as never;
    }

    if (endpoint === '/categories') {
      if (categoryError) {
        throw categoryError;
      }

      return {
        data: categories,
      } as never;
    }

    throw new Error(`Solicitud GET no configurada: ${endpoint}`);
  });
}

async function renderProductsPage() {
  render(<ProductsPage />);

  await screen.findByText('LF1837');
}

async function openCreateProductModal() {
  const user = userEvent.setup();

  await renderProductsPage();
  await user.click(
    screen.getByRole('button', {
      name: /agregar producto/i,
    }),
  );

  return user;
}

async function openEditProductModal(productName = 'BLUNT TIP') {
  const user = userEvent.setup();

  await renderProductsPage();
  await clickEditProduct(user, productName);

  return user;
}

async function clickEditProduct(
  user: ReturnType<typeof userEvent.setup>,
  productName = 'BLUNT TIP',
) {
  const productRow = screen.getAllByText(productName)[0].closest('tr');
  expect(productRow).toBeTruthy();

  await user.click(
    within(productRow as HTMLTableRowElement).getByRole('button', {
      name: /acciones del producto/i,
    }),
  );
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
}

async function clickDeactivateProduct(
  user: ReturnType<typeof userEvent.setup>,
  productName = 'BLUNT TIP',
) {
  const productRow = screen.getAllByText(productName)[0].closest('tr');
  expect(productRow).toBeTruthy();

  await user.click(
    within(productRow as HTMLTableRowElement).getByRole('button', {
      name: /acciones del producto/i,
    }),
  );
  await user.click(
    screen.getByRole('menuitem', {
      name: 'Acción destructiva: Desactivar',
    }),
  );
}

function getFormSelect(name: RegExp) {
  const matches = screen.getAllByRole('combobox', { name });

  return matches[matches.length - 1] as HTMLSelectElement;
}

function getRenderedProductNames() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
}

function fillRequiredProductFields() {
  fireEvent.change(screen.getByLabelText(/sku/i), {
    target: {
      value: 'NEW001',
    },
  });
  fireEvent.change(screen.getByLabelText(/nombre/i), {
    target: {
      value: 'Producto nuevo',
    },
  });
  fireEvent.change(screen.getByLabelText(/marca/i), {
    target: {
      value: 'Marca nueva',
    },
  });
  fireEvent.change(screen.getByLabelText(/costo/i), {
    target: {
      value: '10',
    },
  });
  fireEvent.change(screen.getByLabelText(/precio/i), {
    target: {
      value: '20',
    },
  });
  fireEvent.change(screen.getByLabelText(/stock mínimo/i), {
    target: {
      value: '3',
    },
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let alertSpy: ReturnType<typeof vi.spyOn>;

describe('ProductsPage', () => {
  beforeEach(() => {
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();
    configureApiMocks();

    vi.mocked(api.post).mockResolvedValue({
      data: bluntTipProduct,
    } as never);
    vi.mocked(api.patch).mockResolvedValue({
      data: bluntTipProduct,
    } as never);
    vi.mocked(api.delete).mockResolvedValue({
      data: bluntTipProduct,
    } as never);

    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    alertSpy = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
    cleanup();
  });

  it('muestra loading, lista y estado vacío', async () => {
    const { unmount } = render(<ProductsPage />);

    expect(screen.getByText('Cargando productos...')).toBeTruthy();
    expect(await screen.findByText('LF1837')).toBeTruthy();

    unmount();
    cleanup();
    vi.clearAllMocks();
    configureApiMocks({ products: [] });

    render(<ProductsPage />);

    expect(
      await screen.findByText('No hay productos registrados'),
    ).toBeTruthy();
  });

  it.each(['SALES', 'WAREHOUSE'] as const)(
    'mantiene la lectura del catálogo y oculta las mutaciones para %s',
    async (role) => {
      clearAuthenticatedSessionCache();
      configureApiMocks({ role });

      render(<ProductsPage />);

      await screen.findByText('LF1837');
      expect(screen.queryByRole('button', { name: /agregar producto/i })).toBeNull();

      const row = screen.getByText('BLUNT TIP').closest('tr');
      expect(row).toBeTruthy();
      expect(
        within(row as HTMLTableRowElement).queryByRole('button', {
          name: /acciones del producto/i,
        }),
      ).toBeNull();
    },
  );

  it('muestra error de productos y permite reintentar', async () => {
    const user = userEvent.setup();
    let firstRequest = true;

    configureApiMocks({
      productError: new Error('Productos no disponibles'),
    });

    vi.mocked(api.get).mockImplementation(async (url) => {
      const endpoint = String(url);

      if (endpoint === '/products' && firstRequest) {
        firstRequest = false;
        throw new Error('Productos no disponibles');
      }

      if (endpoint === '/products') {
        return {
          data: [bluntTipProduct],
        } as never;
      }

      if (endpoint === '/categories') {
        return {
          data: [surgicalCategory],
        } as never;
      }

      throw new Error(`Solicitud GET no configurada: ${endpoint}`);
    });

    render(<ProductsPage />);

    const alert = await screen.findByRole('alert');

    expect(alert.textContent).toContain('Productos no disponibles');

    await user.click(
      within(alert).getByRole('button', {
        name: /reintentar/i,
      }),
    );

    expect(await screen.findByText('LF1837')).toBeTruthy();
  });

  it('renderiza Brand desde product.brand y no duplica el nombre', async () => {
    await renderProductsPage();

    const brandedRow = screen.getByText('BLUNT TIP').closest('tr');
    const noBrandRow = screen.getByText('SIN MARCA').closest('tr');

    expect(brandedRow).toBeTruthy();
    expect(noBrandRow).toBeTruthy();
    expect(
      within(brandedRow as HTMLTableRowElement).getByText('Acme Medical'),
    ).toBeTruthy();
    expect(
      within(brandedRow as HTMLTableRowElement).queryAllByText('BLUNT TIP'),
    ).toHaveLength(1);
    expect(
      within(noBrandRow as HTMLTableRowElement).getAllByText('-').length,
    ).toBeGreaterThan(0);
  });

  it('muestra categoria, tracking y estado en la lista', async () => {
    await renderProductsPage();

    const productRow = screen.getByText('BLUNT TIP').closest('tr');

    expect(productRow).toBeTruthy();
    expect(
      within(productRow as HTMLTableRowElement).getByText('Quirúrgico'),
    ).toBeTruthy();
    expect(
      screen.getAllByLabelText('Seguimiento de inventario: Por cantidad')
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText('Estado del producto: Activo').length,
    ).toBeGreaterThan(0);
  });

  it('expone caption y prioridades responsive del piloto', async () => {
    await renderProductsPage();

    expect(
      screen.getByRole('table', { name: 'Catálogo de productos' }),
    ).toBeTruthy();

    const productHeader = screen.getByRole('columnheader', {
      name: 'Producto',
    });
    const statusHeader = screen.getByRole('columnheader', { name: 'Estado' });
    const skuHeader = screen.getByRole('columnheader', { name: 'SKU' });
    const brandHeader = screen.getByRole('columnheader', { name: 'Marca' });
    const actionsHeader = screen.getByRole('columnheader', {
      name: 'Acciones',
    });

    expect(productHeader.classList.contains('hidden')).toBe(false);
    expect(statusHeader.classList.contains('hidden')).toBe(false);
    expect(actionsHeader.classList.contains('hidden')).toBe(false);
    expect(skuHeader.classList.contains('hidden')).toBe(true);
    expect(skuHeader.classList.contains('sm:table-cell')).toBe(true);
    expect(brandHeader.classList.contains('hidden')).toBe(true);
    expect(brandHeader.classList.contains('md:table-cell')).toBe(true);
  });

  it('busca por nombre, SKU, marca y barcode sin distinguir mayúsculas', async () => {
    const user = userEvent.setup();

    await renderProductsPage();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar productos',
    });

    for (const query of [
      'blunt tip',
      'lf1837',
      'acme medical',
      '750000000001',
    ]) {
      await user.clear(search);
      await user.type(search, query);

      expect(screen.getByText('BLUNT TIP')).toBeTruthy();
      expect(screen.queryByText('SIN MARCA')).toBeNull();
    }

    await user.clear(search);
    await user.type(search, 'sin coincidencias');

    expect(
      screen.getByRole('heading', {
        name: 'No hay productos que coincidan',
      }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByText('BLUNT TIP')).toBeTruthy();
    expect(screen.getByText('SIN MARCA')).toBeTruthy();
  });

  it('combina categoría, seguimiento de inventario y seguimiento por lote', async () => {
    const user = userEvent.setup();
    configureApiMocks({
      products: [bluntTipProduct, noBrandProduct, assetProduct],
    });

    render(<ProductsPage />);
    await screen.findByText('LF1837');

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^categoría$/i }),
      surgicalCategory.id,
    );
    expect(screen.getByText('BLUNT TIP')).toBeTruthy();
    expect(screen.queryByText('EQUIPO ZETA')).toBeNull();

    await user.selectOptions(
      screen.getByRole('combobox', {
        name: /^seguimiento de inventario$/i,
      }),
      'QUANTITY',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^seguimiento por lote$/i }),
      'REQUIRED',
    );
    expect(
      screen.getByRole('heading', {
        name: 'No hay productos que coincidan',
      }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: /^seguimiento de inventario$/i,
      }),
      'ASSET',
    );
    expect(screen.getByText('EQUIPO ZETA')).toBeTruthy();
    expect(screen.queryByText('BLUNT TIP')).toBeNull();
  });

  it('ordena establemente asc, desc, none y comienza asc al cambiar columna', async () => {
    const user = userEvent.setup();
    configureApiMocks({
      products: [assetProduct, noBrandProduct, bluntTipProduct],
    });

    render(<ProductsPage />);
    await screen.findByText('NB001');

    expect(getRenderedProductNames()).toEqual([
      'EQUIPO ZETA',
      'SIN MARCA',
      'BLUNT TIP',
    ]);

    const productSort = screen.getByRole('button', { name: 'Producto' });
    await user.click(productSort);
    expect(getRenderedProductNames()).toEqual([
      'BLUNT TIP',
      'EQUIPO ZETA',
      'SIN MARCA',
    ]);
    await user.click(productSort);
    expect(getRenderedProductNames()).toEqual([
      'SIN MARCA',
      'EQUIPO ZETA',
      'BLUNT TIP',
    ]);
    await user.click(productSort);
    expect(getRenderedProductNames()).toEqual([
      'EQUIPO ZETA',
      'SIN MARCA',
      'BLUNT TIP',
    ]);

    await user.click(screen.getByRole('button', { name: 'SKU' }));
    expect(getRenderedProductNames()).toEqual([
      'EQUIPO ZETA',
      'BLUNT TIP',
      'SIN MARCA',
    ]);
    expect(
      screen.getByRole('columnheader', { name: 'SKU' }).getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(
      screen
        .getByRole('columnheader', { name: 'Producto' })
        .hasAttribute('aria-sort'),
    ).toBe(false);
  });

  it('pagina client-side y reinicia página al cambiar tamaño, búsqueda o filtro', async () => {
    const user = userEvent.setup();
    configureApiMocks({ products: buildProductList(30) });

    render(<ProductsPage />);
    await screen.findByText('SKU001');

    expect(getRenderedProductNames()).toHaveLength(25);
    expect(screen.getByText('Producto 025')).toBeTruthy();
    expect(screen.queryByText('Producto 026')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    expect(getRenderedProductNames()).toHaveLength(5);
    expect(screen.getByText('Producto 026')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filas por página' }),
      '10',
    );
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    expect(getRenderedProductNames()).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Página 3 de 3')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^seguimiento por lote$/i }),
      'REQUIRED',
    );
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
    expect(getRenderedProductNames()).toEqual(['Producto 030']);

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar productos' }),
      'producto 030',
    );
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
    expect(getRenderedProductNames()).toEqual(['Producto 030']);
  });

  it('renderiza selectores de tracking en create con defaults backend', async () => {
    const user = await openCreateProductModal();

    const inventoryTrackingSelect = getFormSelect(
      /^seguimiento de inventario$/i,
    );
    const lotTrackingSelect = getFormSelect(/^seguimiento por lote$/i);

    expect(
      within(inventoryTrackingSelect).getByRole('option', {
        name: 'Por cantidad',
      }),
    ).toBeTruthy();
    expect(
      within(inventoryTrackingSelect).getByRole('option', {
        name: 'Serializado',
      }),
    ).toBeTruthy();
    expect(
      within(inventoryTrackingSelect).getByRole('option', {
        name: 'Equipo / activo físico',
      }),
    ).toBeTruthy();
    expect(
      within(lotTrackingSelect).getByRole('option', { name: 'Sin lote' }),
    ).toBeTruthy();
    expect(
      within(lotTrackingSelect).getByRole('option', {
        name: 'Lote opcional',
      }),
    ).toBeTruthy();
    expect(
      within(lotTrackingSelect).getByRole('option', {
        name: 'Lote requerido',
      }),
    ).toBeTruthy();
    expect(inventoryTrackingSelect.value).toBe('QUANTITY');
    expect(lotTrackingSelect.value).toBe('OPTIONAL');

    await user.selectOptions(inventoryTrackingSelect, 'ASSET');
    await user.selectOptions(lotTrackingSelect, 'REQUIRED');

    expect(screen.getByText('Cada unidad se controla como EquipmentAsset.'))
      .toBeTruthy();
    expect(screen.getByText('Requiere flujo de lote específico.')).toBeTruthy();
  });

  it('envia tracking, categoria y minStock al crear sin enviar stock', async () => {
    const user = await openCreateProductModal();

    fillRequiredProductFields();
    await user.selectOptions(
      getFormSelect(/^categoría$/i),
      surgicalCategory.id,
    );
    await user.selectOptions(
      getFormSelect(/^seguimiento de inventario$/i),
      'ASSET',
    );
    await user.selectOptions(
      getFormSelect(/^seguimiento por lote$/i),
      'REQUIRED',
    );

    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    expect(api.post).toHaveBeenCalledWith('/products', {
      sku: 'NEW001',
      name: 'Producto nuevo',
      description: undefined,
      brand: 'Marca nueva',
      categoryId: surgicalCategory.id,
      barcode: undefined,
      cost: 10,
      price: 20,
      minStock: 3,
      inventoryTracking: 'ASSET',
      lotTracking: 'REQUIRED',
    });

    const payload = vi.mocked(api.post).mock.calls[0][1] as Record<
      string,
      unknown
    >;

    expect(payload).not.toHaveProperty('stock');
  });

  it('permite capturar pzas. como unidad explícita del producto', async () => {
    const user = await openCreateProductModal();
    fillRequiredProductFields();
    const unitField = screen.getByRole('textbox', { name: 'Unidad de medida' });
    await user.type(unitField, 'pzas.');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));
    expect(api.post).toHaveBeenCalledWith(
      '/products',
      expect.objectContaining({ unitOfMeasure: 'pzas.' }),
    );
  });

  it('resetea tracking a defaults al volver a crear', async () => {
    const user = await openCreateProductModal();

    await user.selectOptions(
      getFormSelect(/^seguimiento de inventario$/i),
      'ASSET',
    );
    await user.click(screen.getByLabelText('Cerrar modal'));
    await user.click(
      screen.getByRole('button', {
        name: /agregar producto/i,
      }),
    );

    expect(
      getFormSelect(/^seguimiento de inventario$/i).value,
    ).toBe('QUANTITY');
  });

  it('muestra tracking readonly en edit y PATCH excluye tracking y stock', async () => {
    const user = await openEditProductModal();

    expect(screen.getByText('Stock actual')).toBeTruthy();
    expect(screen.getByText('Las operaciones de inventario administran este valor.'))
      .toBeTruthy();
    expect(screen.getByText('Inventario controlado por unidades.')).toBeTruthy();
    expect(screen.getByText('El lote puede capturarse cuando aplique.'))
      .toBeTruthy();
    expect(
      screen.getAllByRole('combobox', {
        name: /^seguimiento de inventario$/i,
      }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('combobox', {
        name: /^seguimiento por lote$/i,
      }),
    ).toHaveLength(1);

    await user.clear(screen.getByLabelText(/nombre/i));
    await user.type(screen.getByLabelText(/nombre/i), 'BLUNT TIP EDITADO');
    await user.clear(screen.getByLabelText(/stock mínimo/i));
    await user.type(screen.getByLabelText(/stock mínimo/i), '5');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    expect(api.patch).toHaveBeenCalledWith('/products/product-blunt-tip', {
      sku: 'LF1837',
      name: 'BLUNT TIP EDITADO',
      description: 'Punta roma',
      brand: 'Acme Medical',
      categoryId: surgicalCategory.id,
      barcode: '750000000001',
      cost: 100,
      price: 150,
      minStock: 5,
    });

    const payload = vi.mocked(api.patch).mock.calls[0][1] as Record<
      string,
      unknown
    >;

    expect(payload).not.toHaveProperty('stock');
    expect(payload).not.toHaveProperty('inventoryTracking');
    expect(payload).not.toHaveProperty('lotTracking');
  });

  it('cambia y limpia categoria en edit', async () => {
    const user = await openEditProductModal();

    await user.selectOptions(getFormSelect(/^categoría$/i), '');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    expect(api.patch).toHaveBeenCalledWith(
      '/products/product-blunt-tip',
      expect.objectContaining({
        categoryId: null,
      }),
    );
  });

  it('maneja error de categorias sin romper lista ni selector', async () => {
    configureApiMocks({
      categoryError: new Error('Categorias no disponibles'),
    });

    render(<ProductsPage />);

    expect(await screen.findByText('LF1837')).toBeTruthy();
    expect(
      screen.getByText('Categorias no disponibles'),
    ).toBeTruthy();

    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', {
        name: /agregar producto/i,
      }),
    );

    expect(
      getFormSelect(/^categoría$/i).disabled,
    ).toBe(true);
  });

  it('no renderiza input editable de stock y mantiene minStock editable', async () => {
    const user = await openCreateProductModal();

    expect(
      screen.queryByRole('spinbutton', {
        name: /^stock$/i,
      }),
    ).toBeNull();
    expect(
      screen.getByRole('spinbutton', {
        name: /stock mínimo/i,
      }),
    ).toBeTruthy();

    await user.click(screen.getByLabelText('Cerrar modal'));
    await clickEditProduct(user);

    expect(
      screen.queryByRole('spinbutton', {
        name: /^stock$/i,
      }),
    ).toBeNull();
    expect(screen.getByText('Stock actual')).toBeTruthy();
  });

  it('presenta la desactivacion con copy no destructivo y contexto accesible', async () => {
    const user = userEvent.setup();

    await renderProductsPage();
    const productRow = screen.getByText('BLUNT TIP').closest('tr');
    expect(productRow).toBeTruthy();

    const actionsTrigger = within(
      productRow as HTMLTableRowElement,
    ).getByRole('button', {
      name: 'Acciones del producto LF1837',
    });

    expect(actionsTrigger.getAttribute('title')).toBe(
      'Acciones del producto LF1837',
    );
    expect(screen.queryByText(/eliminar/i)).toBeNull();

    await user.click(actionsTrigger);
    const actionsMenu = screen.getByRole('menu', {
      name: 'Acciones del producto LF1837',
    });
    const deactivateAction = within(actionsMenu).getByRole('menuitem', {
      name: 'Acción destructiva: Desactivar',
    });
    expect(deactivateAction.textContent).toContain('Desactivar');

    await user.click(deactivateAction);

    expect(
      screen.getByRole('heading', {
        name: 'Desactivar producto',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /dejará de estar disponible para nuevas operaciones, pero su historial se conservará/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: /^desactivar$/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/eliminar/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      screen.queryByRole('combobox', {
        name: /estado|activo|inactivo/i,
      }),
    ).toBeNull();
  });

  it('mantiene DELETE y recarga la lista hasta retirar el producto desactivado', async () => {
    let productRequestCount = 0;

    vi.mocked(api.get).mockImplementation(async (url) => {
      const endpoint = String(url);

      if (endpoint === '/auth/me') {
        return {
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        } as never;
      }

      if (endpoint === '/products') {
        productRequestCount += 1;

        return {
          data:
            productRequestCount === 1
              ? [bluntTipProduct, noBrandProduct]
              : [noBrandProduct],
        } as never;
      }

      if (endpoint === '/categories') {
        return {
          data: [surgicalCategory, inactiveCategory],
        } as never;
      }

      throw new Error(`Solicitud GET no configurada: ${endpoint}`);
    });

    const user = userEvent.setup();

    await renderProductsPage();
    await clickDeactivateProduct(user);
    await user.click(
      screen.getByRole('button', {
        name: /^desactivar$/i,
      }),
    );

    expect(api.delete).toHaveBeenCalledWith('/products/product-blunt-tip');
    await waitFor(() => {
      expect(screen.queryByText('BLUNT TIP')).toBeNull();
    });
    expect(screen.getByText('NB001')).toBeTruthy();
    expect(productRequestCount).toBe(2);
    expect(
      screen.queryByRole('heading', {
        name: 'Desactivar producto',
      }),
    ).toBeNull();
  });

  it('conserva el producto y muestra el error cuando falla la desactivacion', async () => {
    vi.mocked(api.delete).mockRejectedValue(
      new Error('No fue posible desactivar el producto'),
    );

    const user = userEvent.setup();

    await renderProductsPage();
    await clickDeactivateProduct(user);
    await user.click(
      screen.getByRole('button', {
        name: /^desactivar$/i,
      }),
    );

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'No fue posible desactivar el producto',
      );
    });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(api.get).mock.calls.filter(
        ([url]) => String(url) === '/products',
      ),
    ).toHaveLength(1);
    expect(screen.getAllByText('BLUNT TIP').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', {
        name: 'Desactivar producto',
      }),
    ).toBeTruthy();
  });
});
