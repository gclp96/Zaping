'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  ProductOption,
  ProductPriceMode,
  ProductSelectorProps,
  ProductStockFilter,
} from './ProductSelector.types';

const moneyFormatter = new Intl.NumberFormat(
  'es-MX',
  {
    style: 'currency',
    currency: 'MXN',
  },
);

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getDisplayedPrice(
  product: ProductOption,
  priceMode: ProductPriceMode,
): number | null {
  if (priceMode === 'cost') {
    return product.cost;
  }

  if (priceMode === 'price') {
    return product.price;
  }

  return null;
}

function matchesStockFilter(
  product: ProductOption,
  filter: ProductStockFilter,
): boolean {
  switch (filter) {
    case 'in-stock':
      return product.stock > product.minStock;

    case 'low-stock':
      return (
        product.stock > 0 &&
        product.stock <= product.minStock
      );

    case 'out-of-stock':
      return product.stock <= 0;

    case 'all':
    default:
      return true;
  }
}

function getStockLabel(
  product: ProductOption,
): string {
  if (product.stock <= 0) {
    return 'Sin existencia';
  }

  if (product.stock <= product.minStock) {
    return `Stock bajo: ${product.stock}`;
  }

  return `Stock: ${product.stock}`;
}

export default function ProductSelector({
  options,
  value,
  onChange,
  excludedProductIds = [],

  priceMode = 'cost',

  label = 'Producto',
  name = 'productId',
  placeholder = 'Buscar por nombre, SKU, código de barras, marca o categoría',

  loading = false,
  disabled = false,
  required = false,

  error,
  helperText,

  enableStockFilter = false,
  collapseSearchOnSelection = false,
}: ProductSelectorProps) {
  const generatedId = useId();

  const inputId = `${generatedId}-search`;
  const listboxId = `${generatedId}-results`;
  const descriptionId =
    error || helperText
      ? `${generatedId}-description`
      : undefined;

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusOnClearRef = useRef(false);

  const [stockFilter, setStockFilter] =
    useState<ProductStockFilter>('all');

  const excludedIds = useMemo(
    () => new Set(excludedProductIds),
    [excludedProductIds],
  );

  const selectedProduct = useMemo(
    () =>
      options.find(
        (product) => product.id === value,
      ) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!selectedProduct && focusOnClearRef.current) {
      focusOnClearRef.current = false;
      searchInputRef.current?.focus();
    }
  }, [selectedProduct]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch =
      normalizeSearchValue(search);

    return options
      .filter(
        (product) =>
          product.isActive !== false,
      )
      .filter((product) =>
        matchesStockFilter(
          product,
          stockFilter,
        ),
      )
      .filter((product) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchableValues = [
          product.sku,
          product.name,
          product.barcode ?? '',
          product.brand ?? '',
          product.category?.name ?? '',
        ];

        return searchableValues.some((item) =>
          normalizeSearchValue(
            item,
          ).includes(normalizedSearch),
        );
      })
      .slice(0, 50);
  }, [
    options,
    search,
    stockFilter,
  ]);

  const isEmpty =
    !loading &&
    options.filter(
      (product) => product.isActive !== false,
    ).length === 0;

  const isDisabled =
    disabled || loading || isEmpty;

  function handleSelectProduct(
    product: ProductOption,
  ) {
    if (
      isDisabled ||
      excludedIds.has(product.id)
    ) {
      return;
    }

    onChange(product.id);

    setSearch('');
    setOpen(false);
  }

  function handleClearSelection() {
    if (isDisabled) {
      return;
    }

    focusOnClearRef.current = collapseSearchOnSelection;
    onChange('');
    setSearch('');
    setOpen(true);
  }

  function getPriceLabel(
    product: ProductOption,
  ): string | null {
    const displayedPrice =
      getDisplayedPrice(
        product,
        priceMode,
      );

    if (displayedPrice === null) {
      return null;
    }

    if (priceMode === 'cost') {
      return `Costo: ${formatMoney(
        displayedPrice,
      )}`;
    }

    return `Precio: ${formatMoney(
      displayedPrice,
    )}`;
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={selectedProduct && collapseSearchOnSelection ? undefined : inputId}
        className="text-sm font-medium text-gray-700"
      >
        {label}

        {required ? (
          <span
            aria-hidden="true"
            className="ml-1 text-red-500"
          >
            *
          </span>
        ) : null}
      </label>

      <input
        type="hidden"
        name={name}
        value={value}
      />

      {selectedProduct ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">
                {selectedProduct.sku} —{' '}
                {selectedProduct.name}
              </p>

              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                {selectedProduct.brand ? (
                  <span>
                    Marca:{' '}
                    {selectedProduct.brand}
                  </span>
                ) : null}

                {selectedProduct.category ? (
                  <span>
                    Categoría:{' '}
                    {
                      selectedProduct
                        .category.name
                    }
                  </span>
                ) : null}

                <span>
                  {getStockLabel(
                    selectedProduct,
                  )}
                </span>

                {getPriceLabel(
                  selectedProduct,
                ) ? (
                  <span>
                    {getPriceLabel(
                      selectedProduct,
                    )}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              disabled={isDisabled}
              className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleClearSelection}
            >
              Cambiar
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="relative"
        hidden={Boolean(selectedProduct && collapseSearchOnSelection)}
      >
        <input
          ref={searchInputRef}
          id={inputId}
          type="search"
          role="combobox"
          autoComplete="off"
          value={search}
          placeholder={
            loading
              ? 'Cargando productos...'
              : isEmpty
                ? 'No hay productos disponibles'
                : placeholder
          }
          disabled={isDisabled}
          aria-expanded={
            open && !isDisabled
          }
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={
            error ? true : undefined
          }
          aria-describedby={descriptionId}
          aria-busy={loading}
          className={[
            'w-full rounded-lg border bg-white px-3 py-3 text-sm text-gray-900',
            'outline-none transition focus:ring-2',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-100',
            isDisabled
              ? 'cursor-not-allowed bg-gray-100'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onFocus={() => {
            if (!isDisabled) {
              setOpen(true);
            }
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />

        {open && !isDisabled ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Resultados de productos"
            className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No se encontraron productos con
                los criterios seleccionados.
              </div>
            ) : (
              filteredProducts.map(
                (product) => {
                  const excluded =
                    excludedIds.has(
                      product.id,
                    );

                  const priceLabel =
                    getPriceLabel(product);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={
                        product.id === value
                      }
                      aria-disabled={
                        excluded
                      }
                      disabled={excluded}
                      className={[
                        'w-full border-b border-gray-100 p-3 text-left last:border-b-0',
                        excluded
                          ? 'cursor-not-allowed bg-gray-50 opacity-50'
                          : 'hover:bg-blue-50 focus:bg-blue-50 focus:outline-none',
                      ].join(' ')}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() =>
                        handleSelectProduct(
                          product,
                        )
                      }
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {product.sku} —{' '}
                            {product.name}
                          </p>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                            {product.brand ? (
                              <span>
                                Marca:{' '}
                                {
                                  product.brand
                                }
                              </span>
                            ) : null}

                            {product.category ? (
                              <span>
                                Categoría:{' '}
                                {
                                  product
                                    .category
                                    .name
                                }
                              </span>
                            ) : null}

                            {product.barcode ? (
                              <span>
                                Código:{' '}
                                {
                                  product.barcode
                                }
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {excluded ? (
                          <span className="shrink-0 text-xs font-medium text-gray-500">
                            Ya agregado
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span
                          className={
                            product.stock <= 0
                              ? 'text-red-600'
                              : product.stock <=
                                  product.minStock
                                ? 'text-amber-700'
                                : 'text-gray-600'
                          }
                        >
                          {getStockLabel(
                            product,
                          )}
                        </span>

                        {priceLabel ? (
                          <span className="font-medium text-gray-700">
                            {priceLabel}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                },
              )
            )}
          </div>
        ) : null}
      </div>

      {enableStockFilter ? (
        <div className="flex items-center gap-2">
          <label
            htmlFor={`${generatedId}-stock-filter`}
            className="text-xs font-medium text-gray-600"
          >
            Disponibilidad
          </label>

          <select
            id={`${generatedId}-stock-filter`}
            value={stockFilter}
            disabled={isDisabled}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            onChange={(event) =>
              setStockFilter(
                event.target
                  .value as ProductStockFilter,
              )
            }
          >
            <option value="all">
              Todos
            </option>

            <option value="in-stock">
              Con existencia
            </option>

            <option value="low-stock">
              Bajo stock
            </option>

            <option value="out-of-stock">
              Sin existencia
            </option>
          </select>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">
          Cargando productos...
        </p>
      ) : isEmpty ? (
        <p className="text-sm text-gray-500">
          No hay productos disponibles
        </p>
      ) : null}

      {error ? (
        <span
          id={descriptionId}
          role="alert"
          className="text-sm text-red-500"
        >
          {error}
        </span>
      ) : helperText ? (
        <span
          id={descriptionId}
          className="text-sm text-gray-500"
        >
          {helperText}
        </span>
      ) : null}
    </div>
  );
}