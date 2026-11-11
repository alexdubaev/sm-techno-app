import { http, HttpResponse } from "msw";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import WorkWithPricePage from "@/app/work-with-price/page";
import { AuthProvider } from "@/components/auth-provider";
import { saveAuthSessionToStorage } from "@/lib/storage";
import { invalidateApiCache } from "@/lib/api";
import type { StockItem, AppUser } from "@/lib/types";
import { server } from "../auth/server";

const admin: AppUser = {
  id: 1,
  username: "admin",
  role: "admin",
  fullName: "Тестовый администратор",
  onecUsername: "",
  hasOnecPassword: false,
  hasRecoverableAppPassword: false,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const item: StockItem = {
  id: 1,
  sku: "TEST-PRICE-1",
  name: "Синтетическая позиция",
  printName: "Синтетическая позиция",
  categoryName: "Тест",
  groupName: "",
  createdAt: "",
  quantity: 3,
  price: 100,
  onecKey: "",
  unitKey: "",
  unitName: "шт.",
  hasStock: true,
  isLinkedToOneC: false,
  warehouseCount: 1,
  topWarehouseName: "Тестовый склад",
  warehouseSummary: "Тестовый склад: 3",
  catalogRowKey: "1:7",
  rowWarehouseId: 7,
  rowWarehouseName: "Тестовый склад",
  rowQuantity: 3,
  rowRack: "",
  rowCell: "",
  rowLocationLabel: "",
  warehouses: [],
};

describe("work with price save draft", () => {
  test("a closed stock drawer cannot overwrite a subsequently selected item", async () => {
    saveAuthSessionToStorage({ token: "admin-token", user: admin });
    const second = { ...item, id: 2, sku: "TEST-SECOND", name: "Вторая синтетическая позиция",
      printName: "Вторая синтетическая позиция", catalogRowKey: "2:7", price: 250,
      warehouses: [{ warehouseId: 7, warehouseName: "Тестовый склад", quantity: 3, price: 250,
        rack: "", cell: "", locationLabel: "" }] };
    let requests = 0;
    let release!: (response: ReturnType<typeof HttpResponse.json>) => void;
    const pending = new Promise<ReturnType<typeof HttpResponse.json>>((resolve) => { release = resolve; });
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({ user: admin })),
      http.get("/api/crm/reminders/due", () => HttpResponse.json({ items: [] })),
      http.get("/api/warehouses", () => HttpResponse.json({ items: [
        { id: 7, name: "Тестовый склад", externalCode: "test-7", isActive: true, createdAt: "", updatedAt: "" },
      ] })),
      http.get("/api/stock/catalog", () => HttpResponse.json({ items: [item, second], total: 2,
        page: 1, pageSize: 20, categories: ["Тест"], groups: [],
        summary: { catalog_count: 2, filtered_count: 2, filtered_quantity: 6 } })),
      http.get("/api/stock/items/1", () => ++requests === 1 ? HttpResponse.json({ item }) : pending),
      http.get("/api/stock/items/2", () => HttpResponse.json({ item: second })),
    );
    const user = userEvent.setup();
    render(<AuthProvider><WorkWithPricePage /></AuthProvider>);
    await screen.findByLabelText("Цена");
    await waitFor(() => expect(requests).toBe(1));
    invalidateApiCache();
    await user.click(screen.getByRole("button", { name: "Изменить остатки…" }));
    await waitFor(() => expect(requests).toBe(2));
    await user.click(screen.getByRole("button", { name: "Закрыть окно" }));
    await user.click(screen.getByText(second.name, { exact: true }));
    await waitFor(() => expect(screen.getByLabelText("Артикул")).toHaveValue(second.sku));
    const lateResponse = new Promise<void>((resolve) => {
      const received = ({ request }: { request: Request }) => {
        if (new URL(request.url).pathname === "/api/stock/items/1") {
          server.events.removeListener("response:mocked", received);
          resolve();
        }
      };
      server.events.on("response:mocked", received);
    });
    await act(async () => { release(HttpResponse.json({ item: { ...item, price: 999 } })); await lateResponse; });
    expect(screen.getByLabelText("Артикул")).toHaveValue(second.sku);
    expect(screen.getByLabelText("Цена")).toHaveValue("250.00");
  });

  test("keeps a typed warehouse price through late detail load and PATCHes only card data", async () => {
    saveAuthSessionToStorage({ token: "admin-token", user: admin });
    let releaseDetails!: (response: ReturnType<typeof HttpResponse.json>) => void;
    const detailWait = new Promise<ReturnType<typeof HttpResponse.json>>((resolve) => {
      releaseDetails = resolve;
    });
    let patchBody: Record<string, unknown> | undefined;
    let addBody: Record<string, unknown> | undefined;

    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({ user: admin })),
      http.get("/api/crm/reminders/due", () => HttpResponse.json({ items: [] })),
      http.get("/api/warehouses", () => HttpResponse.json({ items: [
        { id: 7, name: "Тестовый склад", externalCode: "test-7", isActive: true, createdAt: "", updatedAt: "" },
      ] })),
      http.get("/api/stock/catalog", () => HttpResponse.json({
        items: [item], total: 1, page: 1, pageSize: 20, categories: ["Тест"], groups: [],
        summary: { catalog_count: 1, filtered_count: 1, filtered_quantity: 3 },
      })),
      http.get("/api/stock/items/1", async () => await detailWait),
      http.post("/api/stock/items/1/add-stock", async ({ request }) => {
        addBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ item: {
          ...item,
          quantity: 5,
          warehouses: [{
            warehouseId: 7, warehouseName: "Тестовый склад", quantity: 5, price: 81,
            rack: "", cell: "", locationLabel: "",
          }],
        } });
      }),
      http.patch("/api/stock/items/1", async ({ request }) => {
        patchBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ item: {
          ...item,
          price: 100,
          warehouses: [{
            warehouseId: 7, warehouseName: "Тестовый склад", quantity: 3, price: 0,
            rack: "", cell: "", locationLabel: "",
          }],
        } });
      }),
    );

    const user = userEvent.setup();
    render(<AuthProvider><WorkWithPricePage /></AuthProvider>);

    const priceInput = await screen.findByLabelText("Цена");
    await user.clear(priceInput);
    await user.type(priceInput, "0");

    await act(async () => {
      releaseDetails(HttpResponse.json({ item: {
        ...item,
        price: 777,
        warehouses: [{
          warehouseId: 7, warehouseName: "Тестовый склад", quantity: 3, price: 81,
          rack: "", cell: "", locationLabel: "",
        }],
      } }));
    });
    expect(priceInput).toHaveValue("0");

    await user.click(screen.getByRole("button", { name: "Изменить остатки…" }));
    const quantityInput = await screen.findByLabelText("Количество");
    await user.clear(quantityInput);
    await user.type(quantityInput, "2");
    await user.click(screen.getByRole("button", { name: "Добавить остаток" }));
    await waitFor(() => expect(addBody).toMatchObject({ warehouseId: 7, quantity: 2 }));
    expect(priceInput).toHaveValue("0");

    await user.click(screen.getByRole("button", { name: "Сохранить цену и данные" }));
    await waitFor(() => expect(patchBody).toBeDefined());
    expect(patchBody).toMatchObject({ price: 0, priceWarehouseId: 7 });
    expect(patchBody).not.toHaveProperty("warehouses");
    expect(patchBody).not.toHaveProperty("quantity");
  });
});
