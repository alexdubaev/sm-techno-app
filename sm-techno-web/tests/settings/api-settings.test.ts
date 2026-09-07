import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";

import { revealAppPassword, revealOneCPassword } from "@/lib/api";
import { saveAuthSessionToStorage } from "@/lib/storage";
import type { AppUser } from "@/lib/types";
import { server } from "../auth/server";

const admin: AppUser = {
  id: 1,
  username: "admin",
  role: "admin",
  fullName: "Administrator",
  onecUsername: "admin-onec",
  hasOnecPassword: true,
  hasRecoverableAppPassword: true,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

describe("Settings password reveal API", () => {
  test.each([
    ["application", revealAppPassword, "/api/users/42/reveal-app-password", "app-secret"],
    ["1C", revealOneCPassword, "/api/users/42/reveal-onec-password", "onec-secret"],
  ] as const)("requests the dedicated %s endpoint without caching", async (_, reveal, path, password) => {
    let calls = 0;
    server.use(
      http.post(path, ({ request }) => {
        calls += 1;
        expect(request.headers.get("authorization")).toBe("Bearer admin-token");
        return HttpResponse.json({ available: true, password });
      }),
    );
    saveAuthSessionToStorage({ token: "admin-token", user: admin });

    await expect(reveal(42)).resolves.toEqual({ available: true, password });
    await expect(reveal(42)).resolves.toEqual({ available: true, password });
    expect(calls).toBe(2);
  });

  test("keeps the unavailable legacy state explicit", async () => {
    server.use(
      http.post("/api/users/7/reveal-app-password", () =>
        HttpResponse.json({ available: false, password: null }),
      ),
    );
    saveAuthSessionToStorage({ token: "admin-token", user: admin });

    await expect(revealAppPassword(7)).resolves.toEqual({ available: false, password: null });
  });
});
