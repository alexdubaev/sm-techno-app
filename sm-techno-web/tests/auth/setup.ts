import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { invalidateApiCache } from "@/lib/api";
import { server } from "./server";

vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    React.createElement("img", props),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  invalidateApiCache();
});

afterAll(() => server.close());
