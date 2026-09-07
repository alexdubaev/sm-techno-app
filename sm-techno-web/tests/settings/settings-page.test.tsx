import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  isAdmin: true,
}));

const api = vi.hoisted(() => ({
  fetchUsers: vi.fn(async () => [
    {
      id: 1,
      username: "admin",
      fullName: "Администратор",
      role: "admin" as const,
      isActive: true,
      onecUsername: "onec-admin",
      hasOnecPassword: true,
      hasRecoverableAppPassword: true,
    },
    {
      id: 2,
      username: "disabled",
      fullName: "Отключенный сотрудник",
      role: "user" as const,
      isActive: false,
      onecUsername: "",
      hasOnecPassword: false,
      hasRecoverableAppPassword: false,
    },
  ]),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ isAdmin: state.isAdmin }),
}));
vi.mock("@/lib/api", () => api);
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // The optimized image loader is outside this route's contract.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import SettingsPage from "@/app/settings/page";

describe("Settings landing route", () => {
  beforeEach(() => {
    state.isAdmin = true;
    vi.clearAllMocks();
  });

  test("shows only the two destination cards and derives user counts from the user API", async () => {
    render(<SettingsPage />);

    expect(await screen.findByRole("link", { name: /Пользователи/ })).toHaveAttribute(
      "href",
      "/settings/users",
    );
    expect(screen.getByRole("link", { name: /Интеграция с 1С/ })).toHaveAttribute(
      "href",
      "/settings/onec",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("definition", { name: "Всего 2" })).toHaveTextContent("2");
    expect(screen.getByRole("definition", { name: "Активны 1" })).toHaveTextContent("1");
    expect(api.fetchUsers).toHaveBeenCalledTimes(1);
  });

  test("keeps the landing behind the admin gate and does not load user data", async () => {
    state.isAdmin = false;
    render(<SettingsPage />);

    expect(screen.getByText(/доступен только администратору/i)).toBeInTheDocument();
    await waitFor(() => expect(api.fetchUsers).not.toHaveBeenCalled());
  });
});
