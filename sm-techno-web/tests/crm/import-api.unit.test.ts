import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiRequestError, importCrmFile, previewCrmImport } from "@/lib/api";
import { saveAuthSessionToStorage } from "@/lib/storage";
import type { AppUser, CrmImportPreview, CrmImportResult } from "@/lib/types";

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
  skippedArchived: 0,
  errors: [],
};

function successfulFetch(payload: unknown) {
  return vi.fn(async () => Response.json(payload));
}

function operator(): AppUser {
  return {
    id: 17,
    username: "operator",
    role: "user",
    fullName: "Operator",
    onecUsername: "",
    hasOnecPassword: false,
    hasRecoverableAppPassword: false,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

function expectMultipartHeaders(headers: HeadersInit | undefined) {
  const requestHeaders = new Headers(headers);
  expect(requestHeaders.get("Content-Type")).toBeNull();
  return requestHeaders;
}

describe("CRM Excel import API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sends a preview file and existing target as authenticated multipart data for the selected owner", async () => {
    const fetchMock = successfulFetch(preview);
    vi.stubGlobal("fetch", fetchMock);
    saveAuthSessionToStorage({ token: "operator-token", user: operator() });
    const file = new File(["workbook"], "clients.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(previewCrmImport({
      file,
      ownerId: 17,
      targetTabId: 8,
      includeExistingClients: false,
    })).resolves.toEqual(preview);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("/api/crm/import/preview?ownerId=17");
    expect(init.method).toBe("POST");
    expect(expectMultipartHeaders(init.headers).get("Authorization")).toBe("Bearer operator-token");
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

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("/api/crm/import");
    expect(init.method).toBe("POST");
    expectMultipartHeaders(init.headers);
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
