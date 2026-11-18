import { describe, expect, it } from "vitest";
import {
  getRouteTitle,
  getVisibleNavigationGroups,
  isNavigationItemActive,
} from "./navigation";

describe("operational navigation and independent account titles", () => {
  it.each(["ADMIN", "MANAGER", "SALES", "WAREHOUSE"] as const)(
    "keeps account actions out of %s operational navigation",
    (role) => {
      const items = getVisibleNavigationGroups(role).flatMap(
        (group) => group.items,
      );
      expect(items.some((item) => item.href === "/change-password")).toBe(
        false,
      );
      expect(
        items.some((item) =>
          /Cerrar sesión|Logout|Cuenta|Perfil/i.test(item.label),
        ),
      ).toBe(false);
      expect(items.filter((item) => item.href === "/users")).toHaveLength(
        role === "ADMIN" ? 1 : 0,
      );
      expect(items.find((item) => item.href === "/home")).toBeTruthy();
      expect(items.find((item) => item.href === "/dashboard")).toBeTruthy();
    },
  );
  it("restricts supplier tax documents to ADMIN and MANAGER navigation", () => {
    for (const role of ["ADMIN", "MANAGER", "SALES", "WAREHOUSE"] as const) {
      const urls = getVisibleNavigationGroups(role).flatMap((group) =>
        group.items.map((item) => item.href),
      );
      expect(urls.includes("/supplier-documents")).toBe(
        role === "ADMIN" || role === "MANAGER",
      );
    }
    expect(getRouteTitle("/supplier-documents/id")).toBe("Documentos de proveedor");
  });

  it("preserves account context without an operational navigation item", () => {
    expect(getRouteTitle("/change-password")).toBe("Cambiar contraseña");
    expect(getRouteTitle("/change-password/child")).toBe("Cambiar contraseña");
    expect(getRouteTitle("/change-password-reset")).toBe("Zaping ERP");
  });
  it("preserves existing operational matching and unknown-route fallback", () => {
    expect(getRouteTitle("/products")).toBe("Productos");
    expect(getRouteTitle("/purchases/id")).toBe("Órdenes de compra");
    expect(isNavigationItemActive("/products-other", "/products")).toBe(false);
    expect(isNavigationItemActive("/products/id", "/products")).toBe(true);
    expect(isNavigationItemActive("/products", "/")).toBe(false);
    expect(getRouteTitle("/unknown")).toBe("Zaping ERP");
  });
});
