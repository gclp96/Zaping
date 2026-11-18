'use client';

import {
  useId,
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

export type LocationOption = {
  key: string;
  value: string;
  label: string;
  postalCode?: string | null;
};

type Props = {
  name: string;
  label: string;
  value: string;
  options: LocationOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onChange: (value: string) => void;
  onSelect?: (option: LocationOption) => void;
};

function searchable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}

/**
 * An inline, scroll-limited list intentionally replaces native datalist:
 * browser datalist popups can escape the customer modal and use OS styling.
 * Free-text entry remains possible when the postal catalog is incomplete.
 */
export default function CustomerLocationCombobox({
  name,
  label,
  value,
  options,
  placeholder,
  disabled = false,
  loading = false,
  hasMore = false,
  onLoadMore,
  onChange,
  onSelect,
}: Props) {
  const inputId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [active, setActive] = useState(0);
  const query = browseAll ? '' : searchable(value);
  const filtered = useMemo(
    () =>
      options.filter(
        (option) =>
          !query ||
          searchable(option.label).includes(query) ||
          searchable(option.value).includes(query),
      ),
    [options, query],
  );
  const visible = filtered.slice(0, 40);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    }
  }

  function choose(option: LocationOption) {
    onChange(option.value);
    onSelect?.(option);
    setOpen(false);
    setBrowseAll(false);
    setActive(0);
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full" onBlur={onBlur}>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="flex items-stretch rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        <input
          id={inputId}
          name={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && visible[active] ? listId + '-option-' + active : undefined
          }
          autoComplete="off"
          className="min-w-0 w-full rounded-l-lg bg-transparent p-3 outline-none disabled:bg-gray-100"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            setBrowseAll(false);
            setActive(0);
            setOpen(true);
          }}
        />
        <button
          type="button"
          disabled={disabled}
          className="px-3 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          aria-label={'Mostrar opciones de ' + label}
          onClick={() => {
            setBrowseAll(true);
            setOpen((wasOpen) => !wasOpen);
            setActive(0);
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {open && !disabled ? (
        <div
          className="mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          <div
            id={listId}
            role="listbox"
            aria-label={'Opciones de ' + label}
            className="max-h-44 overflow-y-auto overscroll-contain p-1"
          >
            {visible.map((option, index) => (
              <button
                id={listId + '-option-' + index}
                key={option.key}
                type="button"
                role="option"
                aria-selected={index === active}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 focus:bg-blue-50"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            ))}
            {loading ? (
              <p role="status" className="px-3 py-2 text-xs text-gray-500">
                Cargando opciones...
              </p>
            ) : null}
            {!loading && visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">
                No hay coincidencias en las opciones cargadas. Puedes escribir
                el valor manualmente.
              </p>
            ) : null}
            {filtered.length > visible.length ? (
              <p className="px-3 py-2 text-xs text-gray-500">
                Refina la búsqueda para ver más coincidencias.
              </p>
            ) : null}
          </div>
          {hasMore && onLoadMore ? (
            <button
              type="button"
              disabled={loading}
              onClick={onLoadMore}
              className="w-full border-t border-gray-200 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              Ver más colonias
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
