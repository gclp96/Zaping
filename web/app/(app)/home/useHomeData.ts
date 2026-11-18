'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import { hasRole, WAREHOUSE_ROLES } from '@/app/erp-role-access';
import type { PurchaseStatus } from '@/app/(app)/purchases/types';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

export type DashboardData = {
  totals: {
    quotes?: number;
    purchases?: number;
    sales?: number;
  };
  lowStock: Array<{
    id: string;
    stock: number;
    minStock: number;
  }>;
};

export type HomeEquipment = {
  id: string;
  lifecycle: 'ACTIVE' | 'RETIRED' | string;
  condition: 'INSPECTION_PENDING' | string;
};

export type HomePurchase = {
  id: string;
  status: PurchaseStatus;
};

type ResourceState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
};

function createResourceState<T>(): ResourceState<T> {
  return {
    data: null,
    loading: true,
    error: '',
  };
}

export function useHomeData() {
  const sessionState = useAuthenticatedSession();
  const currentUserRole =
    sessionState.status === 'success' ? sessionState.user?.role ?? null : null;
  const currentUserName =
    sessionState.status === 'success'
      ? sessionState.user.firstName?.trim() || ''
      : '';
  const currentCompanyName =
    sessionState.status === 'success'
      ? sessionState.user.companyName?.trim() || ''
      : '';
  const [dashboardState, setDashboardState] = useState<
    ResourceState<DashboardData>
  >(() => createResourceState<DashboardData>());
  const [equipmentState, setEquipmentState] = useState<
    ResourceState<HomeEquipment[]>
  >(() => createResourceState<HomeEquipment[]>());
  const [purchasesState, setPurchasesState] = useState<
    ResourceState<HomePurchase[]>
  >(() => createResourceState<HomePurchase[]>());

  const loadDashboard = useCallback(async () => {
    setDashboardState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const response = await api.get<DashboardData>('/dashboard');
      setDashboardState({ data: response.data, loading: false, error: '' });
    } catch (error: unknown) {
      setDashboardState({
        data: null,
        loading: false,
        error: getApiErrorMessage(
          error,
          'No fue posible consultar las prioridades de inventario.',
        ),
      });
    }
  }, []);

  const loadEquipment = useCallback(async () => {
    setEquipmentState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const response = await api.get<HomeEquipment[]>('/equipment');
      setEquipmentState({ data: response.data, loading: false, error: '' });
    } catch (error: unknown) {
      setEquipmentState({
        data: null,
        loading: false,
        error: getApiErrorMessage(
          error,
          'No fue posible consultar los equipos pendientes.',
        ),
      });
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setPurchasesState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const response = await api.get<HomePurchase[]>('/purchases');
      setPurchasesState({ data: response.data, loading: false, error: '' });
    } catch (error: unknown) {
      setPurchasesState({
        data: null,
        loading: false,
        error: getApiErrorMessage(
          error,
          'No fue posible consultar las compras por recibir.',
        ),
      });
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboard());
  }, [loadDashboard]);

  useEffect(() => {
    if (sessionState.status === 'loading') {
      return;
    }

    if (
      sessionState.status === 'success' &&
      currentUserRole &&
      !hasRole(currentUserRole, WAREHOUSE_ROLES)
    ) {
      return;
    }

    void Promise.resolve().then(() =>
      Promise.all([loadEquipment(), loadPurchases()]),
    );
  }, [
    currentUserRole,
    loadEquipment,
    loadPurchases,
    sessionState.status,
  ]);

  const operationalResourcesSuppressed = Boolean(
    sessionState.status === 'success' &&
      currentUserRole &&
      !hasRole(currentUserRole, WAREHOUSE_ROLES),
  );
  const visibleEquipmentState = operationalResourcesSuppressed
    ? { data: [], loading: false, error: '' }
    : equipmentState;
  const visiblePurchasesState = operationalResourcesSuppressed
    ? { data: [], loading: false, error: '' }
    : purchasesState;

  const initialLoading =
    dashboardState.loading && !dashboardState.data;
  const attentionUpdating =
    dashboardState.loading ||
    (sessionState.status !== 'loading' &&
      (visibleEquipmentState.loading || visiblePurchasesState.loading));
  const attentionHasErrors = Boolean(
    dashboardState.error ||
      visibleEquipmentState.error ||
      visiblePurchasesState.error,
  );

  return {
    dashboardState,
    equipmentState: visibleEquipmentState,
    purchasesState: visiblePurchasesState,
    loadDashboard,
    loadEquipment,
    loadPurchases,
    initialLoading,
    attentionUpdating,
    attentionHasErrors,
    currentUserRole,
    currentUserName,
    currentCompanyName,
    sessionLoading: sessionState.status === 'loading',
  };
}
