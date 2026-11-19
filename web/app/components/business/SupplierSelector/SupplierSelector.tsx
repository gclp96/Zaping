'use client';

import type { ChangeEvent } from 'react';

import Select, {
  type SelectOption,
} from '../../ui/Select';

import type { SupplierSelectorProps } from './SupplierSelector.types';
import SupplierSearchCombobox from './SupplierSearchCombobox';

export default function SupplierSelector({
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
  searchable = false,
}: SupplierSelectorProps) {
  const selectOptions: SelectOption[] = options.map((supplier) => ({
    value: supplier.id,
    label: supplier.email
      ? `${supplier.name} — ${supplier.email}`
      : supplier.name,
  }));

  const isEmpty = !loading && options.length === 0;

  const isDisabled =
    disabled || loading || isEmpty;

  function handleChange(
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    onChange(event.target.value);
  }

  function getPlaceholder() {
    if (loading) {
      return 'Cargando proveedores...';
    }

    if (isEmpty) {
      return 'No hay proveedores disponibles';
    }

    return placeholder;
  }

  if (searchable) {
    return (
      <SupplierSearchCombobox
        options={options}
        value={value}
        onChange={onChange}
        label={label}
        name={name}
        placeholder={placeholder}
        loading={loading}
        disabled={disabled}
        required={required}
        error={error}
        helperText={helperText}
      />
    );
  }

  return (
    <Select
      label={label}
      name={name}
      value={value}
      options={selectOptions}
      placeholder={getPlaceholder()}
      required={required}
      disabled={isDisabled}
      error={error}
      helperText={helperText}
      aria-busy={loading}
      onChange={handleChange}
    />
  );
}