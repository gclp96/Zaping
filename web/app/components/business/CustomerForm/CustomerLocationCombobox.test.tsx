import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CustomerLocationCombobox from './CustomerLocationCombobox';

const options = [
  { key: '1', value: 'Jesús García', label: 'Jesús García' },
  { key: '2', value: 'Centro', label: 'Centro · CP 83140', postalCode: '83140' },
];

function Fixture({
  onSelect = vi.fn(),
  emptyMessage,
  values = options,
}: {
  onSelect?: (value: string) => void;
  emptyMessage?: string;
  values?: typeof options;
}) {
  const [value, setValue] = useState('');
  return (
    <div data-testid="modal-body">
      <CustomerLocationCombobox
        name="neighborhood"
        label="Colonia / asentamiento"
        placeholder="Busca una colonia"
        value={value}
        options={values}
        emptyMessage={emptyMessage}
        onChange={setValue}
        onSelect={(option) => onSelect(option.value)}
      />
    </div>
  );
}

describe('CustomerLocationCombobox', () => {
  afterEach(() => cleanup());
  it('shows options in an internal scrolling list and selects a colonia', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<Fixture onSelect={selected} />);
    await user.click(
      screen.getByRole('button', { name: 'Mostrar opciones de Colonia / asentamiento' }),
    );
    const list = screen.getByRole('listbox', {
      name: 'Opciones de Colonia / asentamiento',
    });
    expect(screen.getByTestId('modal-body').contains(list)).toBe(true);
    await user.click(screen.getByRole('option', { name: 'Centro · CP 83140' }));
    expect(selected).toHaveBeenCalledWith('Centro');
    expect(
      (screen.getByRole('combobox', { name: 'Colonia / asentamiento' }) as HTMLInputElement).value,
    ).toBe('Centro');
  });

  it('searches without accents and supports keyboard selection', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole('combobox', { name: 'Colonia / asentamiento' });
    await user.type(input, 'garcia');
    expect(await screen.findByRole('option', { name: 'Jesús García' })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect((input as HTMLInputElement).value).toBe('Jesús García');
  });

  it('shows a municipality-specific explanation when no cities exist', async () => {
    const user = userEvent.setup();
    render(
      <Fixture
        values={[]}
        emptyMessage="No hay ciudades registradas para este municipio. Puedes escribirla manualmente."
      />,
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Mostrar opciones de Colonia / asentamiento',
      }),
    );
    expect(
      screen.getByText('No hay ciudades registradas para este municipio. Puedes escribirla manualmente.'),
    ).toBeTruthy();
    await user.type(
      screen.getByRole('combobox', { name: 'Colonia / asentamiento' }),
      'Localidad capturada',
    );
    expect(
      (screen.getByRole('combobox', {
        name: 'Colonia / asentamiento',
      }) as HTMLInputElement).value,
    ).toBe('Localidad capturada');
  });

  it('keeps manual capture possible when no catalog match exists', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole('combobox', { name: 'Colonia / asentamiento' });
    await user.type(input, 'Colonia sin registrar');
    expect((input as HTMLInputElement).value).toBe('Colonia sin registrar');
    expect(screen.getByText(/Puedes escribir el valor manualmente/)).toBeTruthy();
  });
});
