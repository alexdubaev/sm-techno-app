import type { CrmReminder } from "@/lib/types";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

export type ImportantReminder = CrmReminder & { urgency: "overdue" | "today" };

const moscowDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function moscowDateKey(value: Date): string {
  return moscowDateFormatter.format(value);
}

export function getImportantReminders(items: CrmReminder[], now = new Date()): ImportantReminder[] {
  const today = moscowDateKey(now);
  const nowTime = now.getTime();

  return items
    .filter((item) => item.status === "active")
    .map((item) => ({ item, dueTime: new Date(item.dueAt).getTime() }))
    .filter(({ dueTime }) => Number.isFinite(dueTime))
    .map(({ item, dueTime }) => {
      const urgency = dueTime < nowTime ? "overdue" : moscowDateKey(new Date(dueTime)) === today ? "today" : null;
      return urgency === null ? null : { ...item, urgency };
    })
    .filter((item): item is ImportantReminder => item !== null)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
}

export function getNearestActiveReminderByClient(items: CrmReminder[]): Map<number, CrmReminder> {
  const nearest = new Map<number, CrmReminder>();

  for (const item of items) {
    if (item.status !== "active" || !Number.isFinite(new Date(item.dueAt).getTime())) continue;

    const current = nearest.get(item.clientId);
    if (!current || new Date(item.dueAt).getTime() < new Date(current.dueAt).getTime()) {
      nearest.set(item.clientId, item);
    }
  }

  return nearest;
}

export function moscowInputToUtc(value: string): string {
  return new Date(`${value}:00+03:00`).toISOString();
}

export function utcToMoscowInput(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(" ", "T");
}

export function getSafeMailtoHref(value: string): string | null {
  const email = value.trim();
  if (email.length === 0 || email.length > 254) return null;

  const separator = email.indexOf("@");
  if (separator <= 0 || separator !== email.lastIndexOf("@")) return null;

  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[A-Z0-9.!#$%&'*+/=^_`{|}~-]+$/i.test(localPart) ||
    !/^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)*$/i.test(domain)
  ) return null;

  const encodedRecipient = `${encodeURIComponent(localPart)}@${domain
    .split(".")
    .map((label) => encodeURIComponent(label))
    .join(".")}`;
  return `mailto:${encodedRecipient}`;
}
