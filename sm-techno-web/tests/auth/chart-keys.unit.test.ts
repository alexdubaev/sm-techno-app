import { describe, expect, test } from "vitest";

import { chartKeyToString } from "@/components/ui/chart";

describe("chartKeyToString lookup formatting", () => {
  test("keeps string and numeric keys as the template literal did", () => {
    expect(chartKeyToString("revenue", "value")).toBe("revenue");
    expect(chartKeyToString(42, "value")).toBe("42");
    expect(chartKeyToString(0, "value")).toBe("0");
  });

  test("falls back only when the chain resolves to undefined", () => {
    expect(chartKeyToString(undefined, "value")).toBe("value");
    expect(chartKeyToString("", "value")).toBe("");
  });

  test("function dataKeys keep their string form and never match a config key", () => {
    const dataKey = (point: { id: string }) => point.id;
    expect(chartKeyToString(dataKey, "value")).toBe(dataKey.toString());
    expect(chartKeyToString(dataKey, "value")).not.toBe("value");
  });
});
