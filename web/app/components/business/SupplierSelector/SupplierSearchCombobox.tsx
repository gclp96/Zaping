'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { SupplierSelectorProps } from './SupplierSelector.types';

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}

export default function SupplierSearchCombobox({
  options,
  value,
  onChange,
  label = 'Proveedor',
  name = 'supplierId',
  placeholder = 'Selecciona un proveedor',
  loading = false,
  disabled = false,
  required = false,
  error,
  helperText,
}: SupplierSelectorProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const messageId = `${id}-message`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((supplier) => supplier.id === value);
  const unavailable = disabled || loading || options.length === 0;

  const filtered = useMemo(() => {
    const search = normalized(query);
    return options
      .filter((supplier) =>
        !search ||
        normalized(supplier.name).includes(search) ||
        normalized(supplier.email ?? '').includes(search),
      )
      .slice(0, 50);
  }, [options, query]);

  function choose(id: string) {
    onChange(id);
    setQuery('');
    setActiveIndex(0);
    setOpen(false);
  }

  function beginSearch() {
    if (unavailable) return;
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-red-500">*</span> : null}
      </label>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder={loading
          ? 'Cargando proveedores...'
          : options.length === 0
            ? 'No hay proveedores disponibles'
            : placeholder}
        value={open ? query : (selected?.name ?? '')}
        disabled={unavailable}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-expanded={open && !unavailable}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex]
          ? `${id}-option-${activeIndex}`
          : undefined}
        aria-describedby={error || helperText ? messageId : undefined}
        aria-busy={loading}
        className={[
          'w-full rounded-lg border bg-white px-3 py-3 text-sm text-gray-900',
          'outline-none transition focus:ring-2',
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-100',
          unavailable ? 'cursor-not-allowed bg-gray-100' : '',
        ].join(' ')}
        onClick={beginSearch}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) beginSearch();
            else setActiveIndex((index) => Math.min(Math.max(0, filtered.length - 1), index + 1));
          } else if (event.key === 'ArrowUp' && open) {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
            event.preventDefault();
            choose(filtered[activeIndex].id);
          }
        }}
      />

      {open && !unavailable ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Proveedores disponibles"
          className="absolute top-full z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">No se encontraron proveedores.</p>
          ) : filtered.map((supplier, index) => (
            <button
              key={supplier.id}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={supplier.id === value}
              className={[
                'flex w-full flex-col px-3 py-2 text-left text-sm',
                'focus-visible:outline-2 focus-visible:outline-blue-600',
                index === activeIndex ? 'bg-blue-50' : 'hover:bg-surface-subtle',
              ].join(' ')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(supplier.id)}
            >
              <span className="font-medium">{supplier.name}</span>
              {supplier.email ? <span className="text-xs text-text-muted">{supplier.email}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      </div>

      {error ? (
        <p id={messageId} role="alert" className="text-sm text-red-600">{error}</p>
      ) : helperText ? (
        <p id={messageId} className="text-sm text-gray-500">{helperText}</p>
      ) : null}
    </div>
  );
}
