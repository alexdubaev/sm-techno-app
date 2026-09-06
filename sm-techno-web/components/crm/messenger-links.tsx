import type { ComponentProps } from "react";

function telegramHref(value: string | undefined): string | null {
  const source = value?.trim();
  if (!source) return null;
  if (/^tg:\/\//i.test(source)) return source;
  if (/^https:\/\/(t\.me|telegram\.me)\//i.test(source)) return source;
  const username = source.replace(/^@/, "");
  if (/^\+?[\d\s()-]+$/.test(username)) {
    const phone = username.replace(/\D/g, "");
    return phone ? `https://t.me/+${phone}` : null;
  }
  return /^[a-zA-Z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}` : null;
}

function maxHref(value: string | undefined): string | null {
  const source = value?.trim();
  if (!source) return null;
  return /^max:\/\//i.test(source) || /^https:\/\/max\.ru\//i.test(source) ? source : null;
}

function TelegramIcon(props: ComponentProps<"svg">) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}><path fill="currentColor" d="M21.55 3.37 2.84 10.58c-1.28.51-1.27 1.23-.23 1.55l4.8 1.5 1.86 5.7c.23.64.12.9.78.9.5 0 .72-.23 1-.5l2.4-2.34 5 3.7c.92.51 1.58.25 1.81-.85l3.19-15.03c.34-1.35-.52-1.96-1.3-1.6ZM8.37 13.3l10.82-6.83c.54-.33 1.03-.15.62.22l-9.27 8.37-.36 3.87-1.81-5.63Z" /></svg>;
}

function MaxIcon(props: ComponentProps<"svg">) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path fill="currentColor" d="M3 6.25h3.2L9 11.02l2.8-4.77H15l-4.8 7.7V18H7v-4.05L3 6.25Zm12.2 0h2.66L21 11.1l-3.14 4.87H15.2l3.1-4.87-3.1-4.85Z" /></svg>;
}

export function MessengerLinks({ telegram, maxLink, className = "" }: { telegram?: string; maxLink?: string; className?: string }) {
  const telegramUrl = telegramHref(telegram);
  const maxUrl = maxHref(maxLink);
  if (!telegramUrl && !maxUrl) return null;
  return <div className={`flex items-center gap-1.5 ${className}`} aria-label="Мессенджеры клиента">
    {telegramUrl ? <a href={telegramUrl} target="_blank" rel="noreferrer" aria-label="Написать клиенту в Telegram" title="Написать в Telegram" className="flex size-9 items-center justify-center rounded-[9px] bg-[#229ED9] text-white outline-offset-2 hover:bg-[#1685bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"><TelegramIcon className="size-5" /></a> : null}
    {maxUrl ? <a href={maxUrl} target="_blank" rel="noreferrer" aria-label="Написать клиенту в MAX" title="Написать в MAX" className="flex size-9 items-center justify-center rounded-[9px] bg-[#2268E8] text-white outline-offset-2 hover:bg-[#1755c8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"><MaxIcon className="size-5" /></a> : null}
  </div>;
}
