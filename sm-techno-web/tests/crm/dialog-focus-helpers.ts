import { expect } from "vitest";
import userEvent from "@testing-library/user-event";

// Mirrors the focusable selector used by @testing-library/user-event's Tab
// implementation so the sweep below walks the same elements user-event does.
// Known divergences (no positive-tabindex sort; ancestor-disabled checks are
// handled explicitly below): any mismatch surfaces as a loud next-stop
// assertion failure, never a silent pass.
const FOCUSABLE_SELECTOR = [
  "input:not([type=hidden]):not([disabled])",
  "button:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=\"\"]",
  "[contenteditable=\"true\"]",
  "a[href]",
  "[tabindex]:not([disabled])",
  "details > summary",
].join(", ");

function isRadio(element: HTMLElement): element is HTMLInputElement {
  return element.matches('input[type="radio"]');
}

/** user-event's isDisabled also treats ancestors like a disabled fieldset. */
function isDisabledWithAncestors(element: HTMLElement): boolean {
  return element.closest("fieldset[disabled]") != null;
}

/**
 * The dialog's Tab stops in DOM order, applying the same radio-group rule as
 * user-event's Tab implementation: a radio group contributes only the active
 * radio, or the checked one when the active element is outside the group, or
 * every member when none is checked. Without this pruning the stop count would
 * overstate the real stops and the sweep could press Tab onto the focus guard.
 */
function tabStopsIn(dialog: HTMLElement, active: Element | null): HTMLElement[] {
  const matched = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !(Number(element.getAttribute("tabindex")) < 0) && !isDisabledWithAncestors(element),
  );
  // jsdom's selector engine can return grouped-selector matches grouped by
  // selector part instead of document order; user-event walks document order,
  // so sort explicitly by document position.
  const focusables = matched.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const activeIsRadio = active != null && isRadio(active as HTMLElement);
  const activeGroup = activeIsRadio ? (active as HTMLInputElement).name : "";
  const checkedRadio = new Map<string, HTMLElement>();
  const stops: HTMLElement[] = [];
  for (const element of focusables) {
    if (isRadio(element) && element.name) {
      if (element === active) {
        stops.push(element);
        continue;
      }
      if (element.name === activeGroup) continue;
      if (element.checked) {
        for (let index = stops.length - 1; index >= 0; index -= 1) {
          const previous = stops[index];
          if (isRadio(previous) && previous.name === element.name) stops.splice(index, 1);
        }
        checkedRadio.set(element.name, element);
        stops.push(element);
        continue;
      }
      if (checkedRadio.has(element.name)) continue;
    }
    stops.push(element);
  }
  return stops;
}

/**
 * Cycle focus containment (the wrap from the last tabbable back to the first)
 * is verified by the real-browser E2E in tests/e2e/auth.spec.ts: Base UI's
 * modal trap refocuses from its focus guards inside requestAnimationFrame,
 * and jsdom runs rAF on an independent frame clock, so the wrap step is not
 * deterministically observable in JSDOM. What JSDOM can prove is that Tab
 * reaches every stop of the dialog in order without ever leaving it, which is
 * what this sweep asserts. Callers must first wait for a strict initial focus
 * on a specific dialog control.
 */
export async function sweepTabsWithinDialog(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
): Promise<void> {
  let stops = tabStopsIn(dialog, document.activeElement);
  expect(stops.length).toBeGreaterThan(0);
  expect(stops, "initial focus should be on a dialog stop").toContain(document.activeElement);
  // A sweep starting on the last stop would press zero Tabs and prove
  // nothing; callers must pin the initial focus to an earlier control.
  expect(stops.indexOf(document.activeElement as HTMLElement), "initial focus must not start on the last dialog stop").toBeLessThan(stops.length - 1);

  for (let index = stops.indexOf(document.activeElement as HTMLElement); index < stops.length - 1; index += 1) {
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(stops[index + 1]);
    // Radio checks can change when focus moves onto a radio, so recompute the
    // remaining stops from the new active element.
    stops = tabStopsIn(dialog, document.activeElement);
    index = stops.indexOf(document.activeElement as HTMLElement) - 1;
  }
}

export { tabStopsIn };
