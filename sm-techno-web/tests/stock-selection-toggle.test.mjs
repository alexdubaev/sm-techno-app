import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stockPageSource = await readFile(
  new URL("../components/stock-page.tsx", import.meta.url),
  "utf8",
);

test("clicking the selected catalog row clears the product selection", () => {
  assert.match(
    stockPageSource,
    /onClick=\{\s*\(\) =>\s*isSelected \? clearSelection\(\) : selectItem\(item\)\s*\}/,
  );
});
