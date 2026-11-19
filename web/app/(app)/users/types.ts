import type { UserRole } from "@/app/auth-session";

export type { UserRole };

export type User = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  canAdjustPurchaseUnitCost?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserPayload = {
  canAdjustPurchaseUnitCost?: boolean;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  password: string;
};

export type UpdateUserPayload = {
  canAdjustPurchaseUnitCost?: boolean;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
};
