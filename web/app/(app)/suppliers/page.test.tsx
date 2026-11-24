import {
  cleanup,
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

import SuppliersPage from './page';

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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

const medicalSupplier = {
  id: 'supplier-medical',
  name: 'Distribuidora Médica',
  contactName: 'María Ruiz',
  email: 'ventas@medica.test',
  phone: '6625551000',
  address: 'Hermosillo Norte',
  notes: 'Equipo médico',
};

const laboratorySupplier = {
  id: 'supplier-laboratory',
  name: 'Laboratorios del Desierto',
  contactName: 'Carlos Vega',
  email: 'pedidos@laboratorio.test',
  phone: '6625552000',
  address: 'Parque Industrial',
  notes: 'Consumibles',
};

const suppliers = [medicalSupplier, laboratorySupplier];

function authSessionResponse(
  role: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE' = 'ADMIN',
) {
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

function buildSupplier(index: number) {
  return {
    ...medicalSupplier,
    id: `supplier-${index}`,
    name: `Proveedor ${String(index).padStart(2, '0')}`,
    contactName: `Contacto ${index}`,
    email: `proveedor${index}@test.test`,
    phone: `662555${String(index).padStart(4, '0')}`,
    address: `Dirección ${index}`,
  };
}

function configureApiMocks(
  list = suppliers,
  role: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE' = 'ADMIN',
) {
  vi.mocked(api.get).mockImplementation(async (url) =>
    String(url) === '/auth/me'
      ? authSessionResponse(role)
      : ({ data: list } as never),
  );
  vi.mocked(api.post).mockResolvedValue({ data: medicalSupplier } as never);
  vi.mocked(api.patch).mockResolvedValue({ data: medicalSupplier } as never);
  vi.mocked(api.delete).mockResolvedValue({ data: {} } as never);
}

async function renderSuppliersPage() {
  render(<SuppliersPage />);
  await screen.findByText(medicalSupplier.name);
}

async function chooseSupplierAction(
  user: ReturnType<typeof userEvent.setup>,
  supplierName: string,
  actionName: 'Editar' | 'Desactivar',
) {
  const row = screen.getByText(supplierName).closest('tr');

  if (!row) {
    throw new Error(`No se encontró la fila de ${supplierName}`);
  }

  await user.click(
    within(row).getByRole('button', {
      name: `Acciones del proveedor ${supplierName}`,
    }),
  );
  await user.click(
    screen.getByRole('menuitem', {
      name:
        actionName === 'Desactivar'
          ? 'Acción destructiva: Desactivar'
          : actionName,
    }),
  );
}

function renderedSupplierNames() {
  return screen.getAllByRole('row').slice(1).map((row) => {
    const firstCell = within(row).getAllByRole('cell')[0];
    return firstCell.textContent?.trim();
  });
}

async function completeSupplierForm(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByRole('textbox', { name: 'Nombre' }), name);
  await user.type(
    screen.getByRole('textbox', { name: 'Nombre de contacto' }),
    'Laura Soto',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'compras@proveedor.test',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Teléfono' }),
    '6625553000',
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

describe('SuppliersPage', () => {
  beforeEach(() => {
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();
    configureApiMocks();
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('carga las columnas útiles y busca por nombre, contacto, email y teléfono', async () => {
    const user = userEvent.setup();
    render(<SuppliersPage />);

    expect(screen.getByText('Cargando proveedores...')).toBeTruthy();
    expect(await screen.findByText(medicalSupplier.name)).toBeTruthy();
    expect(screen.getByText(medicalSupplier.contactName)).toBeTruthy();
    expect(screen.getByText(medicalSupplier.email)).toBeTruthy();
    expect(screen.getByText(medicalSupplier.phone)).toBeTruthy();
    expect(screen.getByText(medicalSupplier.address)).toBeTruthy();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar proveedores',
    });

    await user.type(search, '  distribuidora médica  ');
    expect(screen.getByText(medicalSupplier.name)).toBeTruthy();
    expect(screen.queryByText(laboratorySupplier.name)).toBeNull();

    await user.clear(search);
    await user.type(search, laboratorySupplier.contactName.toUpperCase());
    expect(screen.getByText(laboratorySupplier.name)).toBeTruthy();
    expect(screen.queryByText(medicalSupplier.name)).toBeNull();

    await user.clear(search);
    await user.type(search, medicalSupplier.email.toUpperCase());
    expect(screen.getByText(medicalSupplier.name)).toBeTruthy();

    await user.clear(search);
    await user.type(search, laboratorySupplier.phone);
    expect(screen.getByText(laboratorySupplier.name)).toBeTruthy();

    await user.clear(search);
    await user.type(search, 'sin coincidencias');
    expect(screen.getByText('Sin proveedores coincidentes')).toBeTruthy();
    expect(
      screen.getByText('No encontramos proveedores con esa búsqueda.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByText(medicalSupplier.name)).toBeTruthy();
  });

  it.each(['ADMIN', 'MANAGER', 'WAREHOUSE'] as const)(
    'muestra las acciones de proveedores a %s',
    async (role) => {
      const user = userEvent.setup();
      clearAuthenticatedSessionCache();
      configureApiMocks(suppliers, role);

      render(<SuppliersPage />);

      await screen.findByText(medicalSupplier.name);
      expect(
        screen.getByRole('button', { name: 'Nuevo proveedor' }),
      ).toBeTruthy();

      const row = screen.getByText(medicalSupplier.name).closest('tr');
      expect(row).toBeTruthy();
      await user.click(
        within(row as HTMLTableRowElement).getByRole('button', {
          name: `Acciones del proveedor ${medicalSupplier.name}`,
        }),
      );
      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeTruthy();
      expect(
        screen.getByRole('menuitem', {
          name: 'Acción destructiva: Desactivar',
        }),
      ).toBeTruthy();
    },
  );

  it('deniega Suppliers a SALES sin solicitar el listado ni mostrar acciones', async () => {
    clearAuthenticatedSessionCache();
    configureApiMocks(suppliers, 'SALES');

    render(<SuppliersPage />);

    expect(
      await screen.findByRole('heading', { name: 'Sin permisos' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).toBeNull();
    expect(screen.queryByText(medicalSupplier.name)).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('ordena columnas claras con el ciclo ascendente, descendente y neutral', async () => {
    const user = userEvent.setup();
    const sortingSuppliers = [
      { ...medicalSupplier, id: 'supplier-z', name: 'Proveedor Z', contactName: 'Contacto Z' },
      { ...laboratorySupplier, id: 'supplier-a', name: 'Proveedor A', contactName: 'Contacto A' },
      { ...medicalSupplier, id: 'supplier-m', name: 'Proveedor M', contactName: 'Contacto M' },
    ];
    configureApiMocks(sortingSuppliers);

    render(<SuppliersPage />);
    await screen.findByText('Proveedor Z');
    expect(screen.queryByRole('button', { name: 'Dirección' })).toBeNull();

    const supplierHeader = screen.getByRole('button', { name: 'Proveedor' });

    await user.click(supplierHeader);
    expect(renderedSupplierNames()).toEqual([
      'Proveedor A',
      'Proveedor M',
      'Proveedor Z',
    ]);

    await user.click(supplierHeader);
    expect(renderedSupplierNames()).toEqual([
      'Proveedor Z',
      'Proveedor M',
      'Proveedor A',
    ]);

    await user.click(supplierHeader);
    expect(renderedSupplierNames()).toEqual([
      'Proveedor Z',
      'Proveedor A',
      'Proveedor M',
    ]);

    await user.click(screen.getByRole('button', { name: 'Contacto' }));
    expect(renderedSupplierNames()).toEqual([
      'Proveedor A',
      'Proveedor M',
      'Proveedor Z',
    ]);
  });

  it('pagina con 25 filas por defecto, permite cambiar tamaño y reinicia la búsqueda', async () => {
    const user = userEvent.setup();
    const manySuppliers = Array.from({ length: 30 }, (_, index) =>
      buildSupplier(index),
    );
    configureApiMocks(manySuppliers);

    render(<SuppliersPage />);
    await screen.findByText('Proveedor 00');

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect(screen.queryByText('Proveedor 29')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Proveedor 29')).toBeTruthy();
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByText('Proveedor 00')).toBeTruthy();
    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filas por página' }),
      '10',
    );
    expect(screen.getByText('Mostrando 1-10 de 30')).toBeTruthy();
    expect(screen.getByText('Proveedor 00')).toBeTruthy();
    expect(screen.queryByText('Proveedor 29')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Proveedor 10')).toBeTruthy();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar proveedores',
    });
    await user.type(search, 'Proveedor 29');
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.getByText('Proveedor 29')).toBeTruthy();
  });

  it('muestra un error de carga y permite reintentar', async () => {
    const user = userEvent.setup();
    let supplierRequestCount = 0;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === '/auth/me') {
        return authSessionResponse();
      }

      supplierRequestCount += 1;
      if (supplierRequestCount === 1) {
        throw new Error('Proveedores no disponibles');
      }

      return { data: suppliers } as never;
    });

    render(<SuppliersPage />);

    expect(await screen.findByText('Proveedores no disponibles')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(medicalSupplier.name)).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('presenta un estado vacío útil', async () => {
    configureApiMocks([]);

    render(<SuppliersPage />);

    expect(await screen.findByText('Sin proveedores activos')).toBeTruthy();
    expect(
      screen.getByText(
        'Registra un proveedor para comenzar a usarlo en compras.',
      ),
    ).toBeTruthy();
  });

  it('crea un proveedor sin lifecycle, refresca la lista y cierra el formulario', async () => {
    const user = userEvent.setup();
    const newSupplier = {
      ...medicalSupplier,
      id: 'supplier-new',
      name: 'Proveedor Nuevo',
      contactName: 'Laura Soto',
      email: 'compras@proveedor.test',
      phone: '6625553000',
      address: null,
      notes: null,
    };
    let supplierRequestCount = 0;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === '/auth/me') {
        return authSessionResponse();
      }

      supplierRequestCount += 1;
      return {
        data:
          supplierRequestCount === 1
            ? suppliers
            : [...suppliers, newSupplier],
      } as never;
    });
    vi.mocked(api.post).mockResolvedValue({ data: newSupplier } as never);

    await renderSuppliersPage();
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }));
    await completeSupplierForm(user, newSupplier.name);
    await user.click(
      screen.getByRole('button', { name: 'Registrar proveedor' }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/suppliers', {
        name: newSupplier.name,
        email: newSupplier.email,
        phone: newSupplier.phone,
        address: undefined,
        contactName: newSupplier.contactName,
        notes: undefined,
      });
    });
    expect(await screen.findByText(newSupplier.name)).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Nuevo proveedor' }),
    ).toBeNull();
  });

  it('captura la identidad fiscal completa del proveedor en el alta', async () => {
    const user = userEvent.setup();
    await renderSuppliersPage();
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Proveedor Fiscal');
    await user.type(screen.getByRole('textbox', { name: 'Razón social' }), 'Proveedor Fiscal S.A.');
    await user.type(screen.getByRole('textbox', { name: 'RFC' }), 'HME091016DQ8');
    await user.type(screen.getByRole('textbox', { name: 'Domicilio fiscal completo' }), 'Calle Fiscal 100, México, C.P. 64850');
    const code = screen.getByRole('textbox', { name: 'Código de proveedor' }) as HTMLInputElement;
    expect(code.disabled).toBe(true);
    expect(code.value).toBe('Automático al registrar');
    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/suppliers',
        expect.objectContaining({
          name: 'Proveedor Fiscal',
          legalName: 'Proveedor Fiscal S.A.',
          rfc: 'HME091016DQ8',
          fiscalAddress: 'Calle Fiscal 100, México, C.P. 64850',
        }),
      );
    });
  });

  it('mantiene abierto el formulario y muestra el error de creación sin alert', async () => {
    const user = userEvent.setup();
    const alertSpy = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined);
    vi.mocked(api.post).mockRejectedValue(new Error('Proveedor duplicado'));

    await renderSuppliersPage();
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }));
    await completeSupplierForm(user, 'Proveedor Duplicado');
    await user.click(
      screen.getByRole('button', { name: 'Registrar proveedor' }),
    );

    expect(await screen.findByText('Proveedor duplicado')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Nuevo proveedor' }),
    ).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('edita con un payload tipado y sin campos de lifecycle', async () => {
    const user = userEvent.setup();
    const updatedSupplier = {
      ...medicalSupplier,
      name: 'Distribuidora Médica Actualizada',
    };
    let supplierRequestCount = 0;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === '/auth/me') {
        return authSessionResponse();
      }

      supplierRequestCount += 1;
      return {
        data:
          supplierRequestCount === 1
            ? suppliers
            : [updatedSupplier, laboratorySupplier],
      } as never;
    });
    vi.mocked(api.patch).mockResolvedValue({ data: updatedSupplier } as never);

    await renderSuppliersPage();
    await chooseSupplierAction(user, medicalSupplier.name, 'Editar');
    const nameInput = screen.getByRole('textbox', { name: 'Nombre' });
    await user.clear(nameInput);
    await user.type(nameInput, updatedSupplier.name);
    await user.click(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        `/suppliers/${medicalSupplier.id}`,
        {
          name: updatedSupplier.name,
          email: medicalSupplier.email,
          phone: medicalSupplier.phone,
          address: medicalSupplier.address,
          contactName: medicalSupplier.contactName,
          notes: medicalSupplier.notes,
        },
      );
    });
    expect(await screen.findByText(updatedSupplier.name)).toBeTruthy();
  });

  it('desactiva con lenguaje no destructivo y refresca la lista activa', async () => {
    const user = userEvent.setup();
    let supplierRequestCount = 0;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === '/auth/me') {
        return authSessionResponse();
      }

      supplierRequestCount += 1;
      return {
        data: supplierRequestCount === 1 ? suppliers : [laboratorySupplier],
      } as never;
    });

    await renderSuppliersPage();
    await chooseSupplierAction(user, medicalSupplier.name, 'Desactivar');

    expect(
      screen.getByRole('heading', { name: 'Desactivar proveedor' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /El proveedor dejará de aparecer en las operaciones nuevas\. Su historial se conservará\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/eliminar/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(api.delete).toHaveBeenCalledWith(
      `/suppliers/${medicalSupplier.id}`,
    );
    await waitFor(() => {
      expect(screen.queryByText(medicalSupplier.name)).toBeNull();
    });
    expect(screen.getByText(laboratorySupplier.name)).toBeTruthy();
  });

  it('conserva el proveedor y permite reintentar cuando falla la desactivación', async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockRejectedValue(
      new Error('No fue posible desactivar este proveedor'),
    );

    await renderSuppliersPage();
    await chooseSupplierAction(user, medicalSupplier.name, 'Desactivar');
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No fue posible desactivar este proveedor'),
    ).toBeTruthy();
    expect(screen.getAllByText(medicalSupplier.name).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
