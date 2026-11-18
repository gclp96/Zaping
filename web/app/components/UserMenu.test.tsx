import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserMenu from "./UserMenu";

const account = {
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.test",
};
afterEach(cleanup);

describe("UserMenu account disclosure", () => {
  it("shows a blue circular avatar without changing account accessibility", () => {
    render(<UserMenu user={account} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Cuenta de Ana Pérez" });
    const avatar = trigger.querySelector('div[aria-hidden="true"]');

    expect(avatar).not.toBeNull();
    expect(avatar?.classList.contains("rounded-full")).toBe(true);
    expect(avatar?.classList.contains("bg-primary")).toBe(true);
    expect(avatar?.classList.contains("text-primary-foreground")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("exposes only the existing account actions through a native disclosure", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={account} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Cuenta de Ana Pérez" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("region", { name: "Opciones de cuenta" }),
    ).toBeNull();
    await user.click(trigger);
    const panel = screen.getByRole("region", { name: "Opciones de cuenta" });
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel).getByText("Ana Pérez")).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: "Cambiar contraseña" })
        .getAttribute("href"),
    ).toBe("/change-password");
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
    expect(within(panel).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports Enter, Tab, Shift+Tab and Escape with focus restoration", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={account} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Cuenta de Ana Pérez" });
    trigger.focus();
    await user.keyboard("{Enter}{Tab}");
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Cambiar contraseña" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Cambiar contraseña" }),
    );
    await user.keyboard("{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("toggles with Space and a second trigger activation", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={account} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Cuenta de Ana Pérez" });
    trigger.focus();
    await user.keyboard(" ");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on outside click without invoking actions or stealing focus", async () => {
    const user = userEvent.setup(),
      logout = vi.fn();
    render(
      <>
        <UserMenu user={account} onLogout={logout} />
        <button>Outside</button>
      </>,
    );
    await user.click(
      screen.getByRole("button", { name: "Cuenta de Ana Pérez" }),
    );
    const outside = screen.getByRole("button", { name: "Outside" });
    await user.click(outside);
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(logout).not.toHaveBeenCalled();
  });

  it("closes when Tab leaves the disclosure without trapping or restoring focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <UserMenu user={account} onLogout={vi.fn()} />
        <button>After account</button>
      </>,
    );
    await user.click(
      screen.getByRole("button", { name: "Cuenta de Ana Pérez" }),
    );
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "After account" }),
    );
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("retains a real password href and closes on link selection", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={account} onLogout={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Cuenta de Ana Pérez" }),
    );
    const link = screen.getByRole("link", { name: "Cambiar contraseña" });
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(link.getAttribute("href")).toBe("/change-password");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("delegates logout exactly once and closes the disclosure", async () => {
    const user = userEvent.setup(),
      logout = vi.fn();
    render(<UserMenu user={account} onLogout={logout} />);
    await user.click(
      screen.getByRole("button", { name: "Cuenta de Ana Pérez" }),
    );
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it.each([
    {
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@example.test",
      label: "Ana Pérez",
    },
    {
      firstName: " ",
      lastName: "",
      email: "fallback@example.test",
      label: "fallback@example.test",
    },
    { firstName: "", lastName: " ", email: " ", label: "Cuenta" },
  ])(
    "includes the visible label in its accessible account name: $label",
    async ({ label, ...userData }) => {
      const user = userEvent.setup();
      render(<UserMenu user={userData} onLogout={vi.fn()} />);
      const accessibleName =
        label === "Cuenta" ? "Cuenta" : "Cuenta de " + label;
      const trigger = screen.getByRole("button", { name: accessibleName });
      expect(trigger.querySelector("span")?.textContent).toBe(label);
      await user.click(trigger);
      expect(within(screen.getByRole("region")).getByText(label)).toBeTruthy();
    },
  );

  it("assigns independent disclosure IDs if reused in separate hosts", async () => {
    const user = userEvent.setup();
    render(
      <>
        <UserMenu user={account} onLogout={vi.fn()} />
        <UserMenu user={account} onLogout={vi.fn()} />
      </>,
    );
    const buttons = screen.getAllByRole("button", {
      name: "Cuenta de Ana Pérez",
    });
    expect(buttons[0].getAttribute("aria-controls")).not.toBe(
      buttons[1].getAttribute("aria-controls"),
    );
    await user.click(buttons[1]);
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true");
  });
});
