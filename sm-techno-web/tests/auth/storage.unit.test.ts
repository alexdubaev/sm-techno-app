import { describe, expect, test } from "vitest";

import {
  AUTH_SESSION_STORAGE_KEY,
  loadAuthSessionFromStorage,
  loadDraftLinesFromStorage,
  saveAuthSessionToStorage,
  saveDraftLinesToStorage,
  type StoredAuthSession,
} from "@/lib/storage";
import type { AppUser, DraftLine } from "@/lib/types";


function user(id: number): AppUser {
  return {
    id,
    username: `user-${id}`,
    role: "user",
    fullName: `User ${id}`,
    onecUsername: "",
    hasOnecPassword: false,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

function session(id: number): StoredAuthSession {
  return { token: `token-${id}`, user: user(id) };
}

function line(itemId: number): DraftLine {
  return {
    lineId: `line-${itemId}`,
    itemId,
    sku: `SKU-${itemId}`,
    name: `Item ${itemId}`,
    categoryName: "Category",
    price: 10,
    quantity: 1,
    available: 2,
    availableOnWarehouse: 2,
    warehouseId: 1,
    warehouseName: "Main",
    rack: "",
    cell: "",
    locationLabel: "",
  };
}

describe("auth and account-scoped storage", () => {
  test("drafts remain isolated across A to B to A switches", () => {
    saveAuthSessionToStorage(session(1));
    saveDraftLinesToStorage([line(101)]);

    saveAuthSessionToStorage(session(2));
    expect(loadDraftLinesFromStorage()).toBeNull();
    saveDraftLinesToStorage([line(202)]);

    saveAuthSessionToStorage(session(1));
    expect(loadDraftLinesFromStorage()).toEqual([line(101)]);
    saveAuthSessionToStorage(session(2));
    expect(loadDraftLinesFromStorage()).toEqual([line(202)]);
  });

  test.each([
    "not-json",
    "{}",
    JSON.stringify({ token: "", user: user(1) }),
    JSON.stringify({ token: "token", user: { id: "1", username: "wrong" } }),
  ])("rejects malformed or structurally invalid auth storage: %s", (raw) => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, raw);

    expect(loadAuthSessionFromStorage()).toBeNull();
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});
