# Order Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add order printing from the order details page with user-selectable A4 orientation.

**Architecture:** Extend the existing order details page with a small print control and print-specific CSS. Reuse the current order markup as the printable surface instead of creating a second page or backend export path.

**Tech Stack:** Next.js 16, React 19, TypeScript, browser print CSS

---

### Task 1: Add print control state

**Files:**
- Modify: `sm-techno-web/app/orders/[id]/page.tsx`

- [ ] **Step 1: Add orientation state**

```tsx
const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("landscape");
```

- [ ] **Step 2: Add print action**

```tsx
const handlePrint = useCallback(() => {
  window.print();
}, []);
```

### Task 2: Add UI controls and print container classes

**Files:**
- Modify: `sm-techno-web/app/orders/[id]/page.tsx`

- [ ] **Step 1: Add print controls block**

```tsx
<label>Ориентация</label>
<select value={printOrientation} onChange={...}>
  <option value="portrait">Книжная</option>
  <option value="landscape">Альбомная</option>
</select>
<button type="button" onClick={handlePrint}>Печать</button>
```

- [ ] **Step 2: Add root class switch**

```tsx
<div className={printOrientation === "landscape" ? "print-landscape" : "print-portrait"}>
```

### Task 3: Add print styles for A4

**Files:**
- Modify: `sm-techno-web/app/orders/[id]/page.tsx`

- [ ] **Step 1: Add print-only style block**

```tsx
<style jsx global>{`
  @media print {
    ...
  }
`}</style>
```

- [ ] **Step 2: Tune orientation-specific layout**

```css
@page { size: A4 portrait; }
.print-landscape @page { size: A4 landscape; }
```

### Task 4: Verify

**Files:**
- Modify: `sm-techno-web/app/orders/[id]/page.tsx`

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Manual check**

Open order details, switch `Книжная` and `Альбомная`, open print preview, confirm that the table is fully visible on A4.
