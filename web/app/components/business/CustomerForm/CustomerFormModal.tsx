import { useId, useRef, useState, type FormEvent } from 'react';
import { Building2, ContactRound, MapPin } from 'lucide-react';

import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';

import type {
  CustomerFormCustomer,
  CustomerFormModalProps,
} from './CustomerForm.types';

type FormErrors = {
  name?: string;
  type?: string;
  email?: string;
  phone?: string;
};

type CustomerFormContentProps = {
  customer: CustomerFormCustomer | null;
  formId: string;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onClose: () => void;
  onSaved: (customer: CustomerFormCustomer) => void | Promise<void>;
};

function normalizeOptionalValue(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function CustomerFormContent({
  customer,
  formId,
  saving,
  setSaving,
  onClose,
  onSaved,
}: CustomerFormContentProps) {
  const [name, setName] = useState(customer?.name ?? '');
  const [customerType, setCustomerType] = useState(customer?.type ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [contactName, setContactName] = useState(customer?.contactName ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const editing = Boolean(customer);

  function clearFieldError(field: keyof FormErrors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  function validateForm(): boolean {
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    const trimmedType = customerType.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      nextErrors.name = 'El nombre del cliente es obligatorio.';
    }
    if (!trimmedType) {
      nextErrors.type = 'El tipo de cliente es obligatorio.';
    }
    if (!trimmedEmail) {
      nextErrors.email = 'El correo electrónico es obligatorio.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Ingresa un correo electrónico válido.';
    }
    if (!trimmedPhone) {
      nextErrors.phone = 'El teléfono es obligatorio.';
    }

    setErrors(nextErrors);

    const firstInvalidField = (Object.keys(nextErrors) as (keyof FormErrors)[])[0];
    if (firstInvalidField) {
      formRef.current
        ?.querySelector<HTMLInputElement>('[name="' + firstInvalidField + '"]')
        ?.focus();
      return false;
    }

    return true;
  }

  async function handleSave() {
    if (submittingRef.current) return;

    setFormError('');
    if (!validateForm()) return;

    const payload = {
      name: name.trim(),
      type: customerType.trim(),
      email: email.trim(),
      phone: phone.trim(),
      contactName: normalizeOptionalValue(contactName),
      address: normalizeOptionalValue(address),
      notes: normalizeOptionalValue(notes),
    };

    submittingRef.current = true;
    setSaving(true);
    try {
      const response = customer
        ? await api.patch<CustomerFormCustomer>(
            '/customers/' + customer.id,
            payload,
          )
        : await api.post<CustomerFormCustomer>('/customers', payload);

      await onSaved(response.data);
      onClose();
    } catch (error) {
      setFormError(
        getApiErrorMessage(
          error,
          customer
            ? 'No fue posible actualizar el cliente.'
            : 'No fue posible registrar el cliente.',
        ),
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSave();
  }

  return (
    <form
      id={formId}
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5"
    >
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700">
          <Building2 aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {editing ? 'Actualiza los datos del cliente' : 'Datos del nuevo cliente'}
          </p>
          <p className="mt-1 text-sm leading-5 text-text-secondary">
            Los campos marcados con * son obligatorios. Los demás se pueden
            completar después.
          </p>
        </div>
      </div>

      <section aria-labelledby="customer-general-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 aria-hidden="true" size={18} className="text-text-muted" />
          <h3 id="customer-general-heading" className="font-semibold text-text">
            Datos generales
          </h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="name"
            label="Nombre"
            placeholder="Nombre comercial o razón social"
            value={name}
            required
            disabled={saving}
            error={errors.name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError('name');
            }}
          />
          <Input
            name="type"
            label="Tipo"
            placeholder="Ej. Hospital, clínica o distribuidor"
            helperText="Escribe el tipo de cliente."
            value={customerType}
            required
            disabled={saving}
            error={errors.type}
            onChange={(event) => {
              setCustomerType(event.target.value);
              clearFieldError('type');
            }}
          />
        </div>
      </section>

      <section
        aria-labelledby="customer-contact-heading"
        className="space-y-4 border-t border-border pt-4"
      >
        <div className="flex items-center gap-2">
          <ContactRound aria-hidden="true" size={18} className="text-text-muted" />
          <h3 id="customer-contact-heading" className="font-semibold text-text">
            Información de contacto
          </h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="correo@empresa.com"
            value={email}
            required
            disabled={saving}
            error={errors.email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
          />
          <Input
            name="phone"
            label="Teléfono"
            type="tel"
            autoComplete="tel"
            placeholder="Teléfono de contacto"
            value={phone}
            required
            disabled={saving}
            error={errors.phone}
            onChange={(event) => {
              setPhone(event.target.value);
              clearFieldError('phone');
            }}
          />
          <div className="sm:col-span-2">
            <Input
              name="contactName"
              label="Contacto"
              placeholder="Persona de contacto (opcional)"
              value={contactName}
              disabled={saving}
              onChange={(event) => {
                setContactName(event.target.value);
                setFormError('');
              }}
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="customer-additional-heading"
        className="space-y-4 border-t border-border pt-5"
      >
        <div className="flex items-center gap-2">
          <MapPin aria-hidden="true" size={18} className="text-text-muted" />
          <h3 id="customer-additional-heading" className="font-semibold text-text">
            Información adicional
            <span className="ml-2 text-sm font-normal text-text-muted">
              (opcional)
            </span>
          </h3>
        </div>
        <Input
          name="address"
          label="Dirección"
          placeholder="Domicilio o dirección comercial"
          value={address}
          disabled={saving}
          onChange={(event) => {
            setAddress(event.target.value);
            setFormError('');
          }}
        />
        <div className="space-y-2">
          <label htmlFor="customer-notes" className="block font-medium text-gray-700">
            Notas
          </label>
          <textarea
            id="customer-notes"
            name="notes"
            value={notes}
            rows={3}
            disabled={saving}
            placeholder="Comentarios para el seguimiento interno del cliente"
            className="w-full resize-y rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
            onChange={(event) => {
              setNotes(event.target.value);
              setFormError('');
            }}
          />
        </div>
      </section>

      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {formError}
        </div>
      ) : null}

    </form>
  );
}

export default function CustomerFormModal({
  isOpen,
  customer = null,
  onClose,
  onSaved,
}: CustomerFormModalProps) {
  const formId = useId();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(customer);

  function handleClose() {
    if (!saving) onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      dismissible={!saving}
      title={editing ? 'Editar cliente' : 'Nuevo cliente'}
      description="Formulario de datos generales y contacto del cliente."
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={handleClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            className="w-full sm:w-auto"
            loading={saving}
            loadingText={editing ? 'Actualizando...' : 'Registrando...'}
            disabled={saving}
          >
            {editing ? 'Guardar cambios' : 'Registrar cliente'}
          </Button>
        </div>
      }
    >
      {isOpen ? (
        <CustomerFormContent
          key={customer?.id ?? 'new'}
          customer={customer}
          formId={formId}
          saving={saving}
          setSaving={setSaving}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}
