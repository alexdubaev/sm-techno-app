import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { ApiRequestError, fetchOrders, invalidateApiCache } from "@/lib/api";
import { saveAuthSessionToStorage, type StoredAuthSession } from "@/lib/storage";
import type { AppUser } from "@/lib/types";
import { server } from "./server";


function user(id: number, username: string): AppUser {
  return {
    id,
    username,
    role: "user",
    fullName: username,
    onecUsername: "",
    hasOnecPassword: false,
    hasRecoverableAppPassword: false,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

function saveSession(token: string, account: AppUser) {
  const session: StoredAuthSession = { token, user: account };
  saveAuthSessionToStorage(session);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("session-isolated API cache", () => {
  test("a new account never reuses or caches the previous account's pending response", async () => {
    const releaseA = deferred<void>();
    const releaseB = deferred<void>();
    const aStarted = deferred<void>();
    const bStarted = deferred<void>();
    const calls: string[] = [];

    server.use(
      http.get("/api/orders", async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        calls.push(authorization);
        if (authorization === "Bearer token-a") {
          aStarted.resolve();
          await releaseA.promise;
          return HttpResponse.json({ items: [{ owner: "A" }] });
        }
        bStarted.resolve();
        await releaseB.promise;
        return HttpResponse.json({ items: [{ owner: "B" }] });
      }),
    );

    saveSession("token-a", user(1, "account-a"));
    const requestA = fetchOrders();
    await aStarted.promise;

    invalidateApiCache();
    saveSession("token-b", user(2, "account-b"));
    const requestB = fetchOrders();
    await bStarted.promise;

    // Let B publish its cache entry first, then finish the stale A request.
    // A must not overwrite the current account's cached response.
    releaseB.resolve();
    expect(await requestB).toEqual([{ owner: "B" }]);
    releaseA.resolve();
    expect(await requestA).toEqual([{ owner: "A" }]);
    expect(await fetchOrders()).toEqual([{ owner: "B" }]);
    expect(calls).toEqual(["Bearer token-a", "Bearer token-b"]);
  });

  test("an old request finishing cannot detach the current account's pending request", async () => {
    const releaseA = deferred<void>();
    const releaseB = deferred<void>();
    const aStarted = deferred<void>();
    const bStarted = deferred<void>();
    const calls: string[] = [];

    server.use(
      http.get("/api/orders", async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        calls.push(authorization);
        if (authorization === "Bearer token-a") {
          aStarted.resolve();
          await releaseA.promise;
          return HttpResponse.json({ items: [{ owner: "A" }] });
        }
        bStarted.resolve();
        await releaseB.promise;
        return HttpResponse.json({ items: [{ owner: "B" }] });
      }),
    );

    saveSession("token-a", user(1, "account-a"));
    const requestA = fetchOrders();
    await aStarted.promise;

    invalidateApiCache();
    saveSession("token-b", user(2, "account-b"));
    const requestB = fetchOrders();
    await bStarted.promise;

    // A settles while B is still pending. A's finally handler must not remove
    // B from the in-flight map, so another B read coalesces with requestB.
    releaseA.resolve();
    await expect(requestA).resolves.toEqual([{ owner: "A" }]);
    const coalescedB = fetchOrders();
    releaseB.resolve();

    await expect(requestB).resolves.toEqual([{ owner: "B" }]);
    await expect(coalescedB).resolves.toEqual([{ owner: "B" }]);
    expect(calls).toEqual(["Bearer token-a", "Bearer token-b"]);
  });

  test("a late 401 from an old account cannot expire the current account", async () => {
    const releaseA = deferred<void>();
    const aStarted = deferred<void>();
    const expired = vi.fn();
    window.addEventListener("sm-techno-auth-expired", expired);

    server.use(
      http.get("/api/orders", async ({ request }) => {
        if (request.headers.get("authorization") === "Bearer token-a") {
          aStarted.resolve();
          await releaseA.promise;
          return HttpResponse.json({ detail: "expired A" }, { status: 401 });
        }
        return HttpResponse.json({ items: [{ owner: "B" }] });
      }),
    );

    saveSession("token-a", user(1, "account-a"));
    const requestA = fetchOrders();
    const settledA = requestA.catch((error: unknown) => error);
    await aStarted.promise;

    invalidateApiCache();
    saveSession("token-b", user(2, "account-b"));
    const requestB = fetchOrders();
    releaseA.resolve();
    await expect(requestB).resolves.toEqual([{ owner: "B" }]);
    const oldError = await settledA;
    expect(oldError).toBeInstanceOf(ApiRequestError);
    expect((oldError as ApiRequestError).status).toBe(401);
    expect(expired).not.toHaveBeenCalled();

    window.removeEventListener("sm-techno-auth-expired", expired);
  });
});
