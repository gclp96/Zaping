import {
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  Hospital,
  House,
  LayoutDashboard,
  Package,
  PackageCheck,
  ShoppingCart,
  Stethoscope,
  Tags,
  Truck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/app/auth-session";
import {
  COMMERCIAL_ROLES,
  MANAGEMENT_ROLES,
  WAREHOUSE_ROLES,
} from "@/app/erp-role-access";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  visibleForRoles?: readonly UserRole[];
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "GENERAL",
    items: [
      {
        label: "Inicio",
        href: "/home",
        icon: House,
      },
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "VENTAS",
    items: [
      {
        label: "Clientes",
        href: "/customers",
        icon: UsersRound,
        visibleForRoles: COMMERCIAL_ROLES,
      },
      {
        label: "Cotizaciones",
        href: "/quotes",
        icon: FileText,
        visibleForRoles: COMMERCIAL_ROLES,
      },
      {
        label: "Ventas",
        href: "/sales",
        icon: ShoppingCart,
        visibleForRoles: COMMERCIAL_ROLES,
      },
    ],
  },
  {
    label: "COMPRAS",
    items: [
      {
        label: "Proveedores",
        href: "/suppliers",
        icon: Truck,
        visibleForRoles: WAREHOUSE_ROLES,
      },
      {
        label: "Órdenes de compra",
        href: "/purchases",
        icon: ClipboardList,
        visibleForRoles: WAREHOUSE_ROLES,
      },
      {
        label: "Recepciones",
        href: "/purchase-receipts",
        icon: PackageCheck,
        visibleForRoles: WAREHOUSE_ROLES,
      },
      {
        label: "Documentos de proveedor",
        href: "/supplier-documents",
        icon: FileText,
        visibleForRoles: MANAGEMENT_ROLES,
      },
    ],
  },
  {
    label: "INVENTARIO",
    items: [
      {
        label: "Productos",
        href: "/products",
        icon: Package,
      },
      {
        label: "Categorías",
        href: "/categories",
        icon: Tags,
      },
      {
        label: "Inventario",
        href: "/inventory",
        icon: Boxes,
      },
      {
        label: "Equipos",
        href: "/equipment",
        icon: Wrench,
        visibleForRoles: WAREHOUSE_ROLES,
      },
    ],
  },
  {
    label: "SALUD",
    items: [
      {
        label: "Casos de salud",
        href: "/healthcare-cases",
        icon: ClipboardList,
      },
      {
        label: "Médicos",
        href: "/doctors",
        icon: Stethoscope,
      },
      {
        label: "Hospitales",
        href: "/hospitals",
        icon: Hospital,
      },
    ],
  },
  {
    label: "ADMINISTRACIÓN",
    items: [
      {
        label: "Usuarios",
        href: "/users",
        icon: UsersRound,
        visibleForRoles: ["ADMIN"],
      },
      {
        label: "Datos fiscales de empresa",
        href: "/company-settings",
        icon: Building2,
        visibleForRoles: ["ADMIN"],
      },
    ],
  },
];

export function isNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getVisibleNavigationGroups(
  currentUserRole?: UserRole | null,
): NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.visibleForRoles ||
          (currentUserRole === undefined &&
            item.visibleForRoles.length > 1) ||
          Boolean(
            currentUserRole && item.visibleForRoles.includes(currentUserRole),
          ),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

// Account context remains available without becoming operational navigation.
const accountRouteTitles = [{ href: '/change-password', title: 'Cambiar contraseña' }];

export function getRouteTitle(pathname: string): string {
  const accountRoute = accountRouteTitles.find(route => isNavigationItemActive(pathname, route.href));
  if (accountRoute) return accountRoute.title;
  for (const group of navigationGroups) {
    const activeItem = group.items.find((item) =>
      isNavigationItemActive(pathname, item.href),
    );

    if (activeItem) {
      return activeItem.label;
    }
  }

  return "Zaping ERP";
}
