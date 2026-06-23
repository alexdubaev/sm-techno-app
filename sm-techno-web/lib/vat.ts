export const DEFAULT_VAT_PERCENT = 22;

export function parseVatPercent(rawValue: string | number | null | undefined) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return Math.max(rawValue, 0);
  }

  const normalized = String(rawValue ?? "")
    .trim()
    .replace(",", ".");

  if (!normalized) {
    return DEFAULT_VAT_PERCENT;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_VAT_PERCENT;
  }

  return Math.max(parsed, 0);
}

export function calculateVatAmount(
  grossAmount: number,
  vatPercent: number,
  options?: { includedInPrice?: boolean },
) {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0 || vatPercent <= 0) {
    return 0;
  }

  const includedInPrice = options?.includedInPrice ?? true;
  const vatAmount = includedInPrice
    ? grossAmount - grossAmount / (1 + vatPercent / 100)
    : grossAmount * (vatPercent / 100);

  return roundMoney(vatAmount);
}

export function calculateAmountWithoutVat(
  amount: number,
  vatPercent: number,
  options?: { includedInPrice?: boolean },
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const includedInPrice = options?.includedInPrice ?? true;
  if (!includedInPrice || vatPercent <= 0) {
    return roundMoney(amount);
  }

  return roundMoney(amount - calculateVatAmount(amount, vatPercent, { includedInPrice }));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
