import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import SupplierSelector from './SupplierSelector';

afterEach(() => {
  cleanup();
});

const suppliers = [
  {
    id: 'supplier-1',
    name: 'Distribuidora Médica del Norte',
    email: 'compras@proveedor.com',
    contactName: 'Juan Pérez',
  },
  {
    id: 'supplier-2',
    name: 'Suministros Hospitalarios',
    email: null,
    contactName: null,
  },
];

describe('SupplierSelector', () => {
  it('muestra los proveedores disponibles', () => {
    render(
      <SupplierSelector
        options={suppliers}
        value=""
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByText(
        'Distribuidora Médica del Norte — compras@proveedor.com',
      ),
    ).toBeDefined();

    expect(
      screen.getByText('Suministros Hospitalarios'),
    ).toBeDefined();
  });

  it('devuelve el identificador del proveedor seleccionado', () => {
    const onChange = vi.fn();

    render(
      <SupplierSelector
        options={suppliers}
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'Proveedor',
      }),
      {
        target: {
          value: 'supplier-2',
        },
      },
    );

    expect(onChange).toHaveBeenCalledWith('supplier-2');
  });

  it('muestra el estado de carga y deshabilita el selector', () => {
    render(
      <SupplierSelector
        options={[]}
        value=""
        loading
        onChange={() => undefined}
      />,
    );

    const select = screen.getByRole('combobox', {
      name: 'Proveedor',
    });

    expect(select.hasAttribute('disabled')).toBe(true);
    expect(select.getAttribute('aria-busy')).toBe('true');

    expect(
      screen.getByText('Cargando proveedores...'),
    ).toBeDefined();
  });

  it('muestra el estado vacío y deshabilita el selector', () => {
    render(
      <SupplierSelector
        options={[]}
        value=""
        onChange={() => undefined}
      />,
    );

    const select = screen.getByRole('combobox', {
      name: 'Proveedor',
    });

    expect(select.hasAttribute('disabled')).toBe(true);

    expect(
      screen.getByText('No hay proveedores disponibles'),
    ).toBeDefined();
  });

  it('muestra el error de forma accesible', () => {
    render(
      <SupplierSelector
        options={suppliers}
        value=""
        error="Selecciona un proveedor"
        onChange={() => undefined}
      />,
    );

    const select = screen.getByRole('combobox', {
      name: 'Proveedor',
    });

    expect(select.getAttribute('aria-invalid')).toBe('true');

    expect(
      screen.getByRole('alert').textContent,
    ).toBe('Selecciona un proveedor');
  });

  it('no abre la lista al enfocar automáticamente al editar, pero sí al hacer clic', () => {
    render(
      <SupplierSelector
        options={suppliers}
        value="supplier-1"
        searchable
        onChange={() => undefined}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('conserva el proveedor al editar con búsqueda vacía hasta elegir otro', () => {
    const onChange = vi.fn();
    render(
      <SupplierSelector
        options={suppliers}
        value="supplier-1"
        searchable
        showSelectedSeparately
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Buscar para cambiar proveedor');
    expect(screen.getByText('Proveedor actual')).toBeTruthy();
    expect(screen.getByText('Distribuidora Médica del Norte')).toBeTruthy();
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'Suministros' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'Suministros' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('supplier-2');
  });

  it('permite buscar por nombre y correo en modo opt-in', () => {
    const onChange = vi.fn();
    render(<SupplierSelector options={suppliers} value="" searchable onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'medica' } });
    expect(screen.getByRole('option', { name: /Distribuidora Médica del Norte/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Suministros Hospitalarios/i })).toBeNull();

    fireEvent.change(input, { target: { value: 'compras@proveedor.com' } });
    fireEvent.click(screen.getByRole('option', { name: /Distribuidora Médica del Norte/i }));
    expect(onChange).toHaveBeenCalledWith('supplier-1');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('permite seleccionar con teclado y descartar la búsqueda sin cambiar proveedor', () => {
    const onChange = vi.fn();
    render(<SupplierSelector options={suppliers} value="supplier-1" searchable onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLInputElement;
    expect(input.value).toBe('Distribuidora Médica del Norte');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Suministros' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Distribuidora Médica del Norte');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Suministros' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('supplier-2');
  });

  it('muestra un mensaje cuando no hay coincidencias, sin crear proveedores nuevos', () => {
    const onChange = vi.fn();
    render(<SupplierSelector options={suppliers} value="" searchable onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Proveedor inexistente' } });
    expect(screen.getByText('No se encontraron proveedores.')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('respeta el proveedor seleccionado', () => {
    render(
      <SupplierSelector
        options={suppliers}
        value="supplier-1"
        onChange={() => undefined}
      />,
    );

    const select = screen.getByRole(
      'combobox',
      {
        name: 'Proveedor',
      },
    ) as HTMLSelectElement;

    expect(select.value).toBe('supplier-1');
  });
});