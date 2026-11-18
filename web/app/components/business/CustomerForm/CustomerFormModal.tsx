import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Building2, ContactRound, MapPin } from 'lucide-react';

import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';
import {
  CUSTOMER_TYPE_OPTIONS,
  resolveCustomerType,
} from '@/app/(app)/customers/customer-classification';

import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';

import type {
  CustomerFormCustomer,
  CustomerFormModalProps,
} from './CustomerForm.types';

type FormErrors = {
  name?: string;
  type?: string;
  email?: string;
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
  const [legalName, setLegalName] = useState(customer?.legalName ?? '');
  const [customerType, setCustomerType] = useState(
    resolveCustomerType(customer?.type) ?? '',
  );
  const [typeTouched, setTypeTouched] = useState(false);
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [contactName, setContactName] = useState(customer?.contactName ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [postalCode, setPostalCode] = useState(customer?.postalCode ?? '');
  const [neighborhood, setNeighborhood] = useState(customer?.neighborhood ?? '');
  const [municipality, setMunicipality] = useState(customer?.municipality ?? '');
  const [postalMatches, setPostalMatches] = useState<string[]>([]);
  const [postalStatus, setPostalStatus] = useState('');
  const [postalLoading, setPostalLoading] = useState(false);
  const [postalLookupRequested, setPostalLookupRequested] = useState(false);
  const [city, setCity] = useState(customer?.city ?? '');
  const [state, setState] = useState(customer?.state ?? '');
  const [countryCode, setCountryCode] = useState(
    customer?.countryCode ?? (customer ? '' : 'MX'),
  );
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const editing = Boolean(customer);

  useEffect(() => {
    if (!postalLookupRequested || !/^\d{5}$/.test(postalCode) || countryCode.toUpperCase() !== 'MX') {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void api
        .get<{
          state?: string;
          municipality?: string;
          city?: string;
          settlements: string[];
        }>('/customers/postal-lookup/' + postalCode)
        .then(({ data }) => {
          if (cancelled) return;
          setPostalMatches(data.settlements);
          setPostalStatus(
            data.settlements.length
              ? 'Selecciona una colonia de la lista.'
              : 'Código postal sin resultados. Puedes escribir el domicilio manualmente.',
          );
          if (data.settlements.length) {
            setState(data.state ?? '');
            setCity(data.city ?? '');
            setMunicipality(data.municipality ?? '');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPostalStatus('Consulta no disponible. Puedes capturar el domicilio manualmente.');
          }
        })
        .finally(() => {
          if (!cancelled) setPostalLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [postalCode, countryCode, postalLookupRequested]);

  function clearFieldError(field: keyof FormErrors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  function validateForm(): boolean {
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    const trimmedType = customerType.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      nextErrors.name = 'El nombre del cliente es obligatorio.';
    }
    if (!trimmedType && (!customer || typeTouched)) {
      nextErrors.type = 'El tipo de cliente es obligatorio.';
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Ingresa un correo electrónico válido.';
    }

    setErrors(nextErrors);

    const firstInvalidField = (Object.keys(nextErrors) as (keyof FormErrors)[])[0];
    if (firstInvalidField) {
      formRef.current
        ?.querySelector<HTMLInputElement | HTMLSelectElement>(
          '[name="' + firstInvalidField + '"]',
        )
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
      legalName: normalizeOptionalValue(legalName) ?? null,
      type: customer && !typeTouched ? undefined : customerType.trim(),
      email: normalizeOptionalValue(email) ?? null,
      phone: normalizeOptionalValue(phone) ?? null,
      contactName: normalizeOptionalValue(contactName),
      address: normalizeOptionalValue(address),
      postalCode: normalizeOptionalValue(postalCode) ?? null,
      neighborhood: normalizeOptionalValue(neighborhood) ?? null,
      municipality: normalizeOptionalValue(municipality) ?? null,
      city: normalizeOptionalValue(city) ?? null,
      state: normalizeOptionalValue(state) ?? null,
      countryCode: normalizeOptionalValue(countryCode)?.toUpperCase() ?? null,
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
            placeholder="Nombre comercial o identificador del cliente"
            value={name}
            required
            disabled={saving}
            error={errors.name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError('name');
            }}
          />
          <div>
            <Select
              name="type"
              label="Tipo"
              value={customerType}
              options={[...CUSTOMER_TYPE_OPTIONS]}
              placeholder="Selecciona el tipo de cliente"
              required
              disabled={saving}
              error={errors.type}
              onChange={(event) => {
                setCustomerType(event.target.value);
                setTypeTouched(true);
                clearFieldError('type');
              }}
            />
            {customer?.type?.trim() && !resolveCustomerType(customer.type) ? (
              <p className="mt-2 text-xs text-amber-700">
                Clasificación anterior: {customer.type}. Selecciona una categoría
                del catálogo para actualizarla.
              </p>
            ) : null}
          </div>
        </div>
        <Input
          name="legalName"
          label="Razón social"
          placeholder="Nombre o denominación fiscal (opcional)"
          value={legalName}
          maxLength={255}
          disabled={saving}
          onChange={(event) => setLegalName(event.target.value)}
        />
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="postalCode"
            label="Código postal"
            placeholder="Código postal de 5 dígitos"
            inputMode="numeric"
            maxLength={5}
            value={postalCode}
            disabled={saving}
            onChange={(event) => {
              setPostalCode(event.target.value.replace(/\D/g, '').slice(0, 5));
              setPostalLookupRequested(true);
              setPostalMatches([]);
              setPostalStatus('');
              setPostalLoading(/^\d{5}$/.test(event.target.value.replace(/\D/g, '')));
              setNeighborhood('');
            }}
          />
          <div className="space-y-1">
            <label htmlFor="customer-neighborhood" className="block font-medium text-gray-700">
              Colonia / asentamiento
            </label>
            {postalMatches.length ? (
              <select
                id="customer-neighborhood"
                name="neighborhood"
                value={neighborhood}
                disabled={saving}
                onChange={(event) => {
                  setNeighborhood(event.target.value);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"
              >
                <option value="">Selecciona una colonia</option>
                {postalMatches.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            ) : null}
            {!postalMatches.length ? (
              <Input
                name="neighborhoodManual"
                label="Colonia (captura manual)"
                value={neighborhood}
                disabled={saving}
                onChange={(event) => setNeighborhood(event.target.value)}
              />
            ) : null}
            {postalStatus ? <p role="status" className="text-xs text-text-muted">{postalStatus}</p> : null}
            {postalLoading && countryCode.toUpperCase() === 'MX' && /^\d{5}$/.test(postalCode) ? <p className="text-xs text-text-muted">Buscando código postal...</p> : null}
          </div>
          <Input
            name="city"
            label="Ciudad"
            placeholder="Ej. Hermosillo"
            value={city}
            maxLength={120}
            disabled={saving}
            onChange={(event) => {
              setCity(event.target.value);
              setFormError('');
            }}
          />
          <Input
            name="state"
            label="Estado / provincia"
            placeholder="Ej. Sonora"
            value={state}
            maxLength={120}
            disabled={saving}
            onChange={(event) => {
              setState(event.target.value);
              setFormError('');
            }}
          />
        </div>
        <Input
          name="municipality"
          label="Municipio"
          placeholder="Ej. Hermosillo"
          value={municipality}
          maxLength={120}
          disabled={saving}
          onChange={(event) => setMunicipality(event.target.value)}
        />
        <div className="sm:max-w-xs">
          <Input
            name="countryCode"
            label="País (código ISO)"
            placeholder="MX"
            helperText="Dos letras, por ejemplo MX o US."
            value={countryCode}
            maxLength={2}
            disabled={saving}
            onChange={(event) => {
              setCountryCode(event.target.value.toUpperCase());
              setFormError('');
            }}
          />
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
