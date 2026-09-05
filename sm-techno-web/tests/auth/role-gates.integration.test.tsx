import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import SettingsPage from "@/app/settings/page";
import WorkWithPricePage from "@/app/work-with-price/page";
import { AuthProvider } from "@/components/auth-provider";
import { saveAuthSessionToStorage } from "@/lib/storage";
import type { AppUser } from "@/lib/types";
import { server } from "./server";


function account(role: AppUser["role"]): AppUser {
  return {
    id: role === "admin" ? 1 : 2,
    username: role,
    role,
    fullName: role === "admin" ? "Administrator" : "Operator",
    onecUsername: "",
    hasOnecPassword: false,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

function installSession(role: AppUser["role"]) {
  const user = account(role);
  saveAuthSessionToStorage({ token: `${role}-token`, user });
  return user;
}

function commonHandlers(user: AppUser) {
  return [
    http.get("/api/auth/me", () => HttpResponse.json({ user })),
    http.get("/api/crm/reminders/due", () => HttpResponse.json({ items: [] })),
  ];
}

async function expandDesktopGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  const button = screen.getAllByRole("button", { name }).find(
    (candidate) => candidate.getAttribute("aria-controls")?.startsWith("desktop-"),
  );
  expect(button).toBeDefined();
  if (button?.getAttribute("aria-expanded") !== "true") {
    await user.click(button!);
  }
}

describe("rendered role gates", () => {
  test("ordinary users cannot see or trigger administrator surfaces", async () => {
    const operator = installSession("user");
    const settingsRequest = vi.fn();
    const usersRequest = vi.fn();
    server.use(
      ...commonHandlers(operator),
      http.get("/api/settings/system", () => {
        settingsRequest();
        return HttpResponse.json({});
      }),
      http.get("/api/users", () => {
        usersRequest();
        return HttpResponse.json({ items: [] });
      }),
    );
    const user = userEvent.setup();
    const settingsView = render(<AuthProvider><SettingsPage /></AuthProvider>);

    expect(await screen.findByText("Этот раздел доступен только администратору приложения.")).toBeVisible();
    await expandDesktopGroup(user, "Администрирование");
    expect(screen.queryByRole("link", { name: "Настройки" })).not.toBeInTheDocument();
    expect(settingsRequest).not.toHaveBeenCalled();
    expect(usersRequest).not.toHaveBeenCalled();

    settingsView.unmount();
    render(<AuthProvider><WorkWithPricePage /></AuthProvider>);
    expect(await screen.findByText("Этот раздел доступен только администратору приложения.")).toBeVisible();
  });

  test("administrators see guarded navigation and load the settings controls", async () => {
    const admin = installSession("admin");
    server.use(
      ...commonHandlers(admin),
      http.get("/api/settings/system", () => HttpResponse.json({
        base_url: "",
        default_organization_key: "",
        sale_operation: "ЗаказНаПродажу",
        currency_key: "",
        order_type_key: "",
        order_type_type: "",
        price_type_key: "",
        order_state_key: "",
        order_state_type: "",
        sale_unit_key: "",
        reserve_unit_key: "",
        business_operation_key: "",
        vat_rate_key: "",
        vat_percent: "22",
        vat_included: "1",
        sum_includes_vat: "1",
        unit_type: "",
      })),
      http.get("/api/users", () => HttpResponse.json({ items: [admin] })),
    );
    const user = userEvent.setup();
    render(<AuthProvider><SettingsPage /></AuthProvider>);

    expect(await screen.findByRole("heading", { name: "Настройки и пользователи" })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Сохранить настройки" })).toBeEnabled();
    });

    await expandDesktopGroup(user, "Администрирование");
    expect(screen.getAllByRole("link", { name: "Настройки" })).not.toHaveLength(0);
    await expandDesktopGroup(user, "Прайсы");
    expect(screen.getAllByRole("link", { name: "Работа с прайсом" })).not.toHaveLength(0);
  });
});
