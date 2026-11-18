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
import CustomerLocationCombobox, { type LocationOption } from './CustomerLocationCombobox';

import type {
  CustomerFormCustomer,
  CustomerFormModalProps,
} from './CustomerForm.types';

type SettlementOption = { id: number; name: string; postalCode: string | null };

type GeographyOption = {
  id: number;
  name: string;
  code?: string;
};

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
  const [stateOptions, setStateOptions] = useState<GeographyOption[]>([]);
  const [municipalityOptions, setMunicipalityOptions] = useState<
    GeographyOption[]
  >([]);
  const [cityOptions, setCityOptions] = useState<GeographyOption[]>([]);
  const [settlementOptions, setSettlementOptions] = useState<SettlementOption[]>([]);
  const [settlementPage, setSettlementPage] = useState(0);
  const [settlementHasMore, setSettlementHasMore] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [geographyStatus, setGeographyStatus] = useState('');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const settlementContextRef = useRef('');
  const editing = Boolean(customer);

  // Fetch catalog data only while the form is mounted. Historical values
  // remain editable even when the external geographic catalog is unavailable.
  useEffect(() => {
    let cancelled = false;
    void api
      .get<GeographyOption[]>('/customers/geography/states')
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) {
          setStateOptions(
            data.filter(
              (option) =>
                typeof option.id === 'number' &&
                typeof option.name === 'string' &&
                option.name.trim().length > 0,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setGeographyStatus(
          'Catálogo de estados no disponible. Puedes escribir la ubicación manualmente.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStateId = stateOptions.find(
    (option) => option.name === state,
  )?.id;

  useEffect(() => {
    if (!selectedStateId) return;
    let cancelled = false;
    const base = '/customers/geography/states/' + selectedStateId;
    void Promise.all([
      api.get<GeographyOption[]>(base + '/municipalities'),
      api.get<GeographyOption[]>(base + '/cities'),
    ])
      .then(([municipalityResponse, cityResponse]) => {
        if (cancelled) return;
        setMunicipalityOptions(
          Array.isArray(municipalityResponse.data) ? municipalityResponse.data : [],
        );
        setCityOptions(Array.isArray(cityResponse.data) ? cityResponse.data : []);
        setGeographyStatus('');
      })
      .catch(() => {
        if (!cancelled) {
          setGeographyStatus(
            'No se pudieron cargar municipios o ciudades. Puedes escribirlos manualmente.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStateId]);

  const selectedMunicipalityId = municipalityOptions.find(
    (option) => option.name === municipality,
  )?.id;

  useEffect(() => {
    settlementContextRef.current = String(selectedStateId) + ':' + String(selectedMunicipalityId);
    setSettlementOptions([]);
    setSettlementPage(0);
    setSettlementHasMore(false);
    if (
      !selectedStateId ||
      !selectedMunicipalityId ||
      postalMatches.length > 0 ||
      postalCode.length > 0
    ) {
      setSettlementLoading(false);
      return;
    }
    let cancelled = false;
    setSettlementLoading(true);
    void api
      .get<{ items: SettlementOption[]; hasMore: boolean }>(
        '/customers/geography/states/' +
          selectedStateId +
          '/municipalities/' +
          selectedMunicipalityId +
          '/settlements?page=1',
      )
      .then(({ data }) => {
        if (cancelled) return;
        setSettlementOptions(Array.isArray(data.items) ? data.items : []);
        setSettlementHasMore(data.hasMore === true);
        setSettlementPage(1);
      })
      .catch(() => {
        if (!cancelled) {
          setGeographyStatus(
            'No fue posible cargar las colonias. Puedes escribirlas manualmente.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSettlementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStateId, selectedMunicipalityId, postalCode, postalMatches.length]);

  function loadMoreSettlements() {
    if (
      !selectedStateId ||
      !selectedMunicipalityId ||
      !settlementHasMore ||
      settlementLoading
    ) {
      return;
    }
    setSettlementLoading(true);
    const page = settlementPage + 1;
    const context = settlementContextRef.current;
    void api
      .get<{ items: SettlementOption[]; hasMore: boolean }>(
        '/customers/geography/states/' +
          selectedStateId +
          '/municipalities/' +
          selectedMunicipalityId +
          '/settlements?page=' +
          page,
      )
      .then(({ data }) => {
        if (context !== settlementContextRef.current) return;
        setSettlementOptions((current) => [
          ...current,
          ...(Array.isArray(data.items) ? data.items : []),
        ]);
        setSettlementHasMore(data.hasMore === true);
        setSettlementPage(page);
      })
      .catch(() => {
        if (context === settlementContextRef.current) {
          setGeographyStatus('No fue posible cargar más colonias.');
        }
      })
      .finally(() => {
        if (context === settlementContextRef.current) setSettlementLoading(false);
      });
  }

  const neighborhoodSuggestions: LocationOption[] = postalMatches.length
    ? postalMatches.map((value, index) => ({
        key: 'postal-' + index,
        value,
        label: value,
      }))
    : settlementOptions.map((item) => ({
        key: 'settlement-' + item.id,
        value: item.name,
        label: item.postalCode
          ? item.name + ' · CP ' + item.postalCode
          : item.name,
        postalCode: item.postalCode,
      }));

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
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = getApiErrorMessage(error, '');
          setPostalStatus(
            message.includes('Consulta postal no configurada')
              ? 'Autocompletado postal no configurado. Puedes capturar el domicilio manualmente.'
              : 'Consulta no disponible. Puedes capturar el domicilio manualmente.',
          );
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
            onChange={(event) => {
              setPhone(event.target.value);
              setFormError('');
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
              setCountryCode('MX');
              setPostalMatches([]);
              setPostalStatus('');
              setPostalLoading(/^\d{5}$/.test(event.target.value.replace(/\D/g, '')));
              setNeighborhood('');
            }}
          />
          <div className="space-y-1">
            <CustomerLocationCombobox
              name="neighborhood"
              label="Colonia / asentamiento"
              placeholder="Busca o escribe la colonia"
              value={neighborhood}
              options={neighborhoodSuggestions}
              disabled={saving}
              loading={settlementLoading}
              hasMore={postalMatches.length === 0 && settlementHasMore}
              onLoadMore={loadMoreSettlements}
              onChange={(value) => setNeighborhood(value)}
              onSelect={(option) => {
                setNeighborhood(option.value);
                if (option.postalCode) {
                  setPostalCode(option.postalCode);
                  setPostalLookupRequested(false);
                  setPostalStatus('');
                }
              }}
            />
            {postalStatus ? (
              <p role="status" className="text-xs text-text-muted">
                {postalStatus}
              </p>
            ) : null}
            {postalLoading && /^\d{5}$/.test(postalCode) ? (
              <p className="text-xs text-text-muted">
                Buscando código postal...
              </p>
            ) : null}
          </div>
          {stateOptions.length ? (
            <Select
              name="state"
              label="Estado / provincia"
              value={state}
              options={[
                ...(!stateOptions.some((option) => option.name === state) && state
                  ? [{ value: state, label: state + ' (registrado)' }]
                  : []),
                ...stateOptions.map((option) => ({
                  value: option.name,
                  label: option.name,
                })),
              ]}
              placeholder="Selecciona un estado"
              disabled={saving}
              onChange={(event) => {
                setState(event.target.value);
                setMunicipality('');
                setCity('');
                setMunicipalityOptions([]);
                setCityOptions([]);
                setPostalCode('');
                setNeighborhood('');
                setPostalMatches([]);
                setPostalLookupRequested(false);
                setPostalStatus('');
                setPostalLoading(false);
                setFormError('');
              }}
            />
          ) : (
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
          )}
          <CustomerLocationCombobox
            name="municipality"
            label="Municipio"
            placeholder="Busca o escribe el municipio"
            value={municipality}
            options={municipalityOptions.map((option) => ({
              key: 'municipality-' + option.id,
              value: option.name,
              label: option.name,
            }))}
            disabled={saving}
            onChange={(value) => {
              setMunicipality(value);
              setCity('');
              setNeighborhood('');
              setPostalCode('');
              setPostalMatches([]);
              setPostalStatus('');
              setPostalLookupRequested(false);
            }}
          />
          <div className="sm:col-span-2">
            <CustomerLocationCombobox
              name="city"
              label="Ciudad"
              placeholder="Busca o escribe la ciudad"
              value={city}
              options={cityOptions.map((option) => ({
                key: 'city-' + option.id,
                value: option.name,
                label: option.name,
              }))}
              disabled={saving}
              onChange={(value) => {
                setCity(value);
                setFormError('');
              }}
            />
          </div>
        </div>
        {geographyStatus ? (
          <p role="status" className="text-xs text-text-muted">
            {geographyStatus}
          </p>
        ) : null}
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
