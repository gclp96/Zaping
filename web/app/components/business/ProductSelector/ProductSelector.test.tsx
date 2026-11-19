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

import { useState } from 'react';
import ProductSelector from './ProductSelector';

afterEach(() => {
  cleanup();
});

const products = [
  {
    id: 'product-1',
    sku: 'SKU-001',
    name: 'Catéter diagnóstico',
    barcode: '750100000001',
    brand: 'Abbott',
    category: {
      id: 'category-1',
      name: 'Hemodinamia',
    },
    cost: 150.5,
    price: 250,
    stock: 10,
    minStock: 5,
    isActive: true,
  },
  {
    id: 'product-2',
    sku: 'SKU-002',
    name: 'Guía médica',
    barcode: '750100000002',
    brand: 'Terumo',
    category: {
      id: 'category-2',
      name: 'Intervencionismo',
    },
    cost: 80,
    price: 125.75,
    stock: 0,
    minStock: 3,
    isActive: true,
  },
  {
    id: 'product-3',
    sku: 'SKU-003',
    name: 'Introductor vascular',
    barcode: null,
    brand: 'Merit',
    category: {
      id: 'category-1',
      name: 'Hemodinamia',
    },
    cost: 95,
    price: 160,
    stock: 2,
    minStock: 5,
    isActive: true,
  },
];

function openSelector() {
  fireEvent.focus(
    screen.getByRole('combobox', {
      name: 'Producto',
    }),
  );
}

describe('ProductSelector', () => {
  it('muestra SKU, nombre, stock y costo en modo compras', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        priceMode="cost"
        onChange={() => undefined}
      />,
    );

    openSelector();

    expect(
      screen.getByRole('option', {
        name: /SKU-001.*Catéter diagnóstico/i,
      }),
    ).toBeDefined();

    expect(
      screen.getByText('Costo: $150.50'),
    ).toBeDefined();

    expect(
      screen.getByText('Stock: 10'),
    ).toBeDefined();
  });

  it('muestra precio de venta en modo cotizaciones', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        priceMode="price"
        onChange={() => undefined}
      />,
    );

    openSelector();

    expect(
      screen.getByText('Precio: $250.00'),
    ).toBeDefined();
  });

  it('devuelve el identificador del producto seleccionado', () => {
    const onChange = vi.fn();

    render(
      <ProductSelector
        options={products}
        value=""
        onChange={onChange}
      />,
    );

    openSelector();

    fireEvent.click(
      screen.getByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    );

    expect(onChange).toHaveBeenCalledWith(
      'product-2',
    );
  });

  it('deshabilita los productos excluidos', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        excludedProductIds={['product-1']}
        onChange={() => undefined}
      />,
    );

    openSelector();

    const option = screen.getByRole(
      'option',
      {
        name: /SKU-001.*Catéter diagnóstico/i,
      },
    );

    expect(
      option.getAttribute('aria-disabled'),
    ).toBe('true');

    expect(
      (option as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('permite seleccionar productos sin stock', () => {
    const onChange = vi.fn();

    render(
      <ProductSelector
        options={products}
        value=""
        onChange={onChange}
      />,
    );

    openSelector();

    const option = screen.getByRole(
      'option',
      {
        name: /SKU-002.*Guía médica/i,
      },
    );

    expect(
      (option as HTMLButtonElement).disabled,
    ).toBe(false);

    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(
      'product-2',
    );
  });

  it('busca productos por nombre', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        onChange={() => undefined}
      />,
    );

    const search = screen.getByRole(
      'combobox',
      {
        name: 'Producto',
      },
    );

    fireEvent.change(search, {
      target: {
        value: 'Guía médica',
      },
    });

    expect(
      screen.getByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    ).toBeDefined();

    expect(
      screen.queryByRole('option', {
        name: /SKU-001.*Catéter diagnóstico/i,
      }),
    ).toBeNull();
  });

  it('busca productos por SKU', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        onChange={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'Producto',
      }),
      {
        target: {
          value: 'SKU-003',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-003.*Introductor vascular/i,
      }),
    ).toBeDefined();
  });

  it('busca productos por código de barras', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        onChange={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'Producto',
      }),
      {
        target: {
          value: '750100000002',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    ).toBeDefined();
  });

  it('busca productos por marca', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        onChange={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'Producto',
      }),
      {
        target: {
          value: 'Abbott',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-001.*Catéter diagnóstico/i,
      }),
    ).toBeDefined();
  });

  it('busca productos por categoría', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        onChange={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'Producto',
      }),
      {
        target: {
          value: 'Intervencionismo',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    ).toBeDefined();
  });

  it('filtra productos con existencia', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        enableStockFilter
        onChange={() => undefined}
      />,
    );

    openSelector();

    fireEvent.change(
      screen.getByLabelText('Disponibilidad'),
      {
        target: {
          value: 'in-stock',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-001.*Catéter diagnóstico/i,
      }),
    ).toBeDefined();

    expect(
      screen.queryByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    ).toBeNull();

    expect(
      screen.queryByRole('option', {
        name: /SKU-003.*Introductor vascular/i,
      }),
    ).toBeNull();
  });

  it('filtra productos con stock bajo', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        enableStockFilter
        onChange={() => undefined}
      />,
    );

    openSelector();

    fireEvent.change(
      screen.getByLabelText('Disponibilidad'),
      {
        target: {
          value: 'low-stock',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-003.*Introductor vascular/i,
      }),
    ).toBeDefined();

    expect(
      screen.queryByRole('option', {
        name: /SKU-001.*Catéter diagnóstico/i,
      }),
    ).toBeNull();
  });

  it('filtra productos sin existencia', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        enableStockFilter
        onChange={() => undefined}
      />,
    );

    openSelector();

    fireEvent.change(
      screen.getByLabelText('Disponibilidad'),
      {
        target: {
          value: 'out-of-stock',
        },
      },
    );

    expect(
      screen.getByRole('option', {
        name: /SKU-002.*Guía médica/i,
      }),
    ).toBeDefined();
  });

  it('muestra carga y deshabilita el buscador', () => {
    render(
      <ProductSelector
        options={[]}
        value=""
        loading
        onChange={() => undefined}
      />,
    );

    const search = screen.getByRole(
      'combobox',
      {
        name: 'Producto',
      },
    ) as HTMLInputElement;

    expect(search.disabled).toBe(true);

    expect(
      search.getAttribute('aria-busy'),
    ).toBe('true');

    expect(
      screen.getByText('Cargando productos...'),
    ).toBeDefined();
  });

  it('muestra el estado vacío', () => {
    render(
      <ProductSelector
        options={[]}
        value=""
        onChange={() => undefined}
      />,
    );

    const search = screen.getByRole(
      'combobox',
      {
        name: 'Producto',
      },
    ) as HTMLInputElement;

    expect(search.disabled).toBe(true);

    expect(
      screen.getByText(
        'No hay productos disponibles',
      ),
    ).toBeDefined();
  });

  it('muestra errores de forma accesible', () => {
    render(
      <ProductSelector
        options={products}
        value=""
        error="Selecciona un producto"
        onChange={() => undefined}
      />,
    );

    const search = screen.getByRole(
      'combobox',
      {
        name: 'Producto',
      },
    );

    expect(
      search.getAttribute('aria-invalid'),
    ).toBe('true');

    expect(
      screen.getByRole('alert').textContent,
    ).toBe('Selecciona un producto');
  });

  it('muestra el producto seleccionado', () => {
    render(
      <ProductSelector
        options={products}
        value="product-2"
        priceMode="price"
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByText(
        /SKU-002.*Guía médica/i,
      ),
    ).toBeDefined();

    expect(
      screen.getByText('Sin existencia'),
    ).toBeDefined();

    expect(
      screen.getByText(
        'Precio: $125.75',
      ),
    ).toBeDefined();
  });

  it('oculta el buscador redundante en modo compacto y enfoca la búsqueda al cambiar', () => {
    function ControlledSelector() {
      const [value, setValue] = useState('product-1');
      return (
        <ProductSelector
          options={products}
          value={value}
          onChange={setValue}
          collapseSearchOnSelection
        />
      );
    }

    render(<ControlledSelector />);
    expect(screen.getByText(/SKU-001.*Catéter diagnóstico/i)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Producto' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    const search = screen.getByRole('combobox', { name: 'Producto' });
    expect(document.activeElement).toBe(search);
    expect(search.getAttribute('aria-expanded')).toBe('true');

    fireEvent.change(search, { target: { value: 'SKU-002' } });
    fireEvent.click(screen.getByRole('option', { name: /SKU-002.*Guía médica/i }));
    expect(screen.queryByRole('combobox', { name: 'Producto' })).toBeNull();
    expect(screen.getByText(/SKU-002.*Guía médica/i)).toBeTruthy();
  });

  it('conserva el buscador visible por defecto aunque haya producto seleccionado', () => {
    render(<ProductSelector options={products} value="product-1" onChange={() => undefined} />);
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeTruthy();
  });

  it('permite cambiar el producto seleccionado', () => {
    const onChange = vi.fn();

    render(
      <ProductSelector
        options={products}
        value="product-1"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cambiar',
      }),
    );

    expect(onChange).toHaveBeenCalledWith('');
  });
});