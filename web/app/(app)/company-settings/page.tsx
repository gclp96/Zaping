'use client';

import { useEffect, useState } from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import Button from '@/app/components/ui/Button';
import ForbiddenState from '@/app/components/ui/ForbiddenState';
import Input from '@/app/components/ui/Input';
import Loading from '@/app/components/ui/Loading';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

type CompanyFiscalProfile = {
  id: string;
  name: string;
  tradeName?: string | null;
  rfc: string;
  fiscalAddress?: string | null;
  placeOfIssue?: string | null;
};

export default function CompanySettingsPage() {
  const session = useAuthenticatedSession();
  const allowed = session.status === 'success' && session.user.role === 'ADMIN';
  const [company, setCompany] = useState<CompanyFiscalProfile | null>(null);
  const [fiscalAddress, setFiscalAddress] = useState('');
  const [placeOfIssue, setPlaceOfIssue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (session.status === 'loading' || !allowed) return;
    let active = true;

    api.get<CompanyFiscalProfile>('/companies/me').then(({ data }) => {
      if (!active) return;
      setCompany(data);
      setFiscalAddress(data.fiscalAddress || '');
      setPlaceOfIssue(data.placeOfIssue || '');
      setError('');
    }).catch((cause: unknown) => {
      if (active) setError(getApiErrorMessage(
        cause,
        'No fue posible cargar los datos fiscales de la empresa.',
      ));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [allowed, session.status]);

  async function save() {
    if (!allowed || saving) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const response = await api.patch<CompanyFiscalProfile>('/companies/me', {
        fiscalAddress: fiscalAddress.trim() || null,
        placeOfIssue: placeOfIssue.trim() || null,
      });
      setCompany(response.data);
      setSuccess(true);
    } catch (cause: unknown) {
      setError(getApiErrorMessage(
        cause,
        'No fue posible guardar los datos fiscales.',
      ));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Datos fiscales de empresa"
        description="Estos datos aparecerán en las órdenes de compra emitidas."
      />
      {session.status === 'success' && !allowed ? (
        <ForbiddenState />
      ) : session.status === 'loading' || loading ? (
        <Loading message="Cargando datos fiscales..." />
      ) : (
        <Section>
          {company ? (
            <form
              className="max-w-2xl space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div>
                <p className="text-sm font-semibold text-text">{company.name}</p>
                <p className="mt-1 text-sm text-text-muted">RFC: {company.rfc}</p>
              </div>
              <Input
                label="Domicilio fiscal completo"
                value={fiscalAddress}
                disabled={saving}
                onChange={(event) => {
                  setFiscalAddress(event.target.value);
                  setSuccess(false);
                }}
              />
              <Input
                label="Lugar de expedición"
                value={placeOfIssue}
                placeholder="Ej. Hermosillo, Sonora"
                disabled={saving}
                onChange={(event) => {
                  setPlaceOfIssue(event.target.value);
                  setSuccess(false);
                }}
              />
              <p className="text-sm text-text-muted">
                Las órdenes confirmadas conservarán la información fiscal
                vigente cuando se autorizaron. Las órdenes anteriores no cambian.
              </p>
              {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
              {success ? (
                <p role="status" className="text-sm text-green-700">
                  Datos fiscales actualizados.
                </p>
              ) : null}
              <Button type="submit" loading={saving} disabled={saving}>
                Guardar datos fiscales
              </Button>
            </form>
          ) : error ? (
            <p role="alert" className="text-sm text-red-700">{error}</p>
          ) : null}
        </Section>
      )}
    </PageContainer>
  );
}
