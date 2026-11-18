import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/services/api';

import CustomerFormModal from './CustomerFormModal';

vi.mock('@/services/api', () => ({
  api: { post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const customer = {
  id: 'customer-a',
  name: 'Hospital del Norte',
  type: 'Hospital',
  email: 'contacto@hospital.test',
  phone: '6621234567',
  contactName: 'María Ruiz',
  address: 'Hermosillo',
  notes: 'Prioritario',
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole('textbox', { name: 'Nombre' }),
    '  Clínica del Centro  ',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Tipo' }),
    'CLINIC',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    '  centro@clinica.test  ',
  );
  await user.type(screen.getByRole('textbox', { name: 'Teléfono' }), '  6621112233  ');
}

describe('CustomerFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: customer } as never);
    vi.mocked(api.patch).mockResolvedValue({ data: customer } as never);
  });

  afterEach(cleanup);

  it('groups editable fields and marks the current required fields', () => {
    render(
      <CustomerFormModal
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Nuevo cliente' });
    expect(
      within(dialog).getByRole('heading', { name: 'Datos generales' }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('heading', { name: 'Información de contacto' }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('heading', { name: /Información adicional/ }),
    ).toBeTruthy();

    for (const label of ['Nombre']) {
      expect(
        (screen.getByRole('textbox', { name: label }) as HTMLInputElement)
          .required,
      ).toBe(true);
    }
    expect(
      (screen.getByRole('combobox', { name: 'Tipo' }) as HTMLSelectElement)
        .required,
    ).toBe(true);
    for (const label of ['Email', 'Teléfono', 'Razón social', 'Código postal', 'Municipio', 'Contacto', 'Dirección', 'Ciudad', 'Estado / provincia', 'País (código ISO)']) {
      expect(
        (screen.getByRole('textbox', { name: label }) as HTMLInputElement)
          .required,
      ).toBe(false);
    }
  });

  it('keeps save and cancel actions outside the scrollable form content', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CustomerFormModal isOpen onClose={onClose} onSaved={vi.fn()} />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Nuevo cliente' });
    const body = dialog.querySelector('[data-modal-body]');
    const footer = dialog.querySelector('[data-modal-footer]');
    const form = body?.querySelector('form');
    const submit = within(footer as HTMLElement).getByRole('button', {
      name: 'Registrar cliente',
    }) as HTMLButtonElement;

    expect(body).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(form).not.toBeNull();
    expect(footer?.contains(submit)).toBe(true);
    expect(body?.contains(submit)).toBe(false);
    expect(submit.form).toBe(form);
    expect(submit.type).toBe('submit');

    await user.click(submit);
    expect(
      screen.getByText('El nombre del cliente es obligatorio.'),
    ).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('focuses the first invalid field and shows inline errors without calling the API', async () => {
    const user = userEvent.setup();
    render(
      <CustomerFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    const nameField = screen.getByRole('textbox', { name: 'Nombre' });
    expect(document.activeElement).toBe(nameField);
    expect(nameField.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('El nombre del cliente es obligatorio.')).toBeTruthy();
    expect(screen.getByText('El tipo de cliente es obligatorio.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    await user.type(nameField, 'Cliente QA');
    expect(
      screen.queryByText('El nombre del cliente es obligatorio.'),
    ).toBeNull();
  });

  it('creates a customer with only name and type', async () => {
    const user = userEvent.setup();
    render(<CustomerFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Hospital QA');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'HOSPITAL');
    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/customers', expect.objectContaining({
      name: 'Hospital QA', type: 'HOSPITAL', email: null, phone: null,
    })));
  });

  it('validates the email format and focuses it when invalid', async () => {
    const user = userEvent.setup();
    render(
      <CustomerFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Cliente QA');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo' }),
      'HOSPITAL',
    );
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'invalido');
    await user.type(screen.getByRole('textbox', { name: 'Teléfono' }), '6621231234');
    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    expect(
      screen.getByText('Ingresa un correo electrónico válido.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Email' }),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates through the existing payload contract and closes after save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomerFormModal isOpen onClose={onClose} onSaved={onSaved} />,
    );

    await fillRequiredFields(user);
    await user.type(screen.getByRole('textbox', { name: 'Contacto' }), '  Ana  ');
    await user.type(screen.getByRole('textbox', { name: 'Dirección' }), '  Norte  ');
    await user.type(screen.getByRole('textbox', { name: 'Notas' }), '  Verificar datos  ');
    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customers', {
        name: 'Clínica del Centro',
        legalName: null,
        type: 'CLINIC',
        email: 'centro@clinica.test',
        phone: '6621112233',
        contactName: 'Ana',
        address: 'Norte',
        postalCode: null,
        neighborhood: null,
        municipality: null,
        city: null,
        state: null,
        countryCode: 'MX',
        notes: 'Verificar datos',
      });
      expect(onSaved).toHaveBeenCalledWith(customer);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('prefills an existing customer and updates using PATCH', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <CustomerFormModal
        isOpen
        customer={customer}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    expect(
      (screen.getByRole('textbox', { name: 'Nombre' }) as HTMLInputElement).value,
    ).toBe(customer.name);
    expect(
      (screen.getByRole('textbox', { name: 'Notas' }) as HTMLTextAreaElement).value,
    ).toBe(customer.notes);

    await user.clear(screen.getByRole('textbox', { name: 'Nombre' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Nombre' }),
      'Hospital Actualizado',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/customers/customer-a', {
        name: 'Hospital Actualizado',
        legalName: null,
        type: undefined,
        email: customer.email,
        phone: customer.phone,
        contactName: customer.contactName,
        address: customer.address,
        postalCode: null,
        neighborhood: null,
        municipality: null,
        city: null,
        state: null,
        countryCode: null,
        notes: customer.notes,
      }),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('saves explicit classification and structured location on legacy edits', async () => {
    const user = userEvent.setup();
    render(
      <CustomerFormModal
        isOpen
        customer={{ ...customer, type: 'Licitación histórica' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/Clasificación anterior/)).toBeTruthy();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo' }),
      'PUBLIC_INSTITUTION',
    );
    await user.type(screen.getByRole('textbox', { name: 'Ciudad' }), 'Hermosillo');
    await user.type(
      screen.getByRole('textbox', { name: 'Estado / provincia' }),
      'Sonora',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'País (código ISO)' }),
      'mx',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/customers/customer-a',
        expect.objectContaining({
          type: 'PUBLIC_INSTITUTION',
          city: 'Hermosillo',
          state: 'Sonora',
          countryCode: 'MX',
        }),
      ),
    );
  });

  it('keeps the form open after an API failure and allows resubmission', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error('Cliente duplicado'))
      .mockResolvedValueOnce({ data: customer } as never);
    const onClose = vi.fn();
    render(
      <CustomerFormModal isOpen onClose={onClose} onSaved={vi.fn()} />,
    );
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cliente duplicado',
    );
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('blocks duplicate submissions while the first request is pending', async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: unknown) => void;
    vi.mocked(api.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(
      <CustomerFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }));
    const form = screen.getByRole('dialog').querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: customer });
    await waitFor(() =>
      expect(screen.queryByText('Registrando...')).toBeNull(),
    );
  });

  it('keeps cancellation separate from form submission', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CustomerFormModal isOpen onClose={onClose} onSaved={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });
});
