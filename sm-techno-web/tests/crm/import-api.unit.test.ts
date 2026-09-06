import { describe, expect, test, vi } from "vitest";

import { ApiRequestError, importCrmFile, previewCrmImport } from "@/lib/api";
import type { CrmImportPreview, CrmImportResult } from "@/lib/types";

const preview: CrmImportPreview = {
  ownerId: 17,
  target: { tabId: 8, newTabName: null },
  clientsToCreate: 2,
  clientsToUpdate: 1,
  unchangedClients: 3,
  clientsToAssign: 1,
  contactsToCreate: 4,
  contactsToUpdate: 5,
  duplicateConflicts: 0,
  skippedOneCLinked: 1,
  errors: [],
};

function successfulFetch(payload: unknown) {
  return vi.fn(async () => Response.json(payload));
}

describe("CRM Excel import API", () => {
  test("sends a preview file and existing target as authenticated multipart data for the selected owner", async () => {
    const fetchMock = successfulFetch(preview);
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["workbook"], "clients.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(previewCrmImport({
      file,
      ownerId: 17,
      targetTabId: 8,
      includeExistingClients: false,
    })).resolves.toEqual(preview);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/crm/import/preview?ownerId=17");
    expect(init.method).toBe("POST");
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("targetTabId")).toBe("8");
    expect(body.get("newTabName")).toBeNull();
    expect(body.get("includeExistingClients")).toBe("false");
  });

  test("sends final import data with a new target and defaults inclusion to true", async () => {
    const result: CrmImportResult = {
      ...preview,
      target: { tabId: null, newTabName: "Новые клиенты" },
      targetTab: { id: 23, name: "Новые клиенты", systemKind: "custom" },
    };
    const fetchMock = successfulFetch(result);
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["workbook"], "clients.xlsx");

    await expect(importCrmFile({
      file,
      newTabName: "Новые клиенты",
    })).resolves.toEqual(result);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/crm/import");
    expect(init.method).toBe("POST");
    expect(init.headers).not.toHaveProperty("Content-Type");
    const body = init.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("targetTabId")).toBeNull();
    expect(body.get("newTabName")).toBe("Новые клиенты");
    expect(body.get("includeExistingClients")).toBe("true");
  });

  test("propagates the API error returned by a rejected final import", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { detail: "В файле есть ошибки строк." },
      { status: 422 },
    )));

    await expect(importCrmFile({
      file: new File(["workbook"], "clients.xlsx"),
      targetTabId: 8,
    })).rejects.toMatchObject<ApiRequestError>({
      name: "ApiRequestError",
      message: "В файле есть ошибки строк.",
      status: 422,
    });
  });
});
