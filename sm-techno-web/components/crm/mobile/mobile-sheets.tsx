'use client';

import type { InputHTMLAttributes, ReactNode, SubmitEvent } from 'react';
import { X } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import type { DetailController } from '@/components/crm/use-crm-client-detail';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export const mobileButton =
  'min-h-11 rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)] disabled:opacity-50';
export const mobileInput =
  'min-h-12 w-full min-w-0 rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-base text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)] focus:ring-2 focus:ring-[var(--brand-yellow)]';
export const mobilePanel =
  'rounded-2xl border border-[var(--border-color)] bg-white p-4';

export function MobileSheet({
  title,
  description,
  children,
  error,
  busy,
  fullScreen = false,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  error?: string | null;
  busy?: boolean;
  fullScreen?: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          'gap-0 overflow-y-auto overscroll-contain bg-[#F7F9FC] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--text-primary)]',
          fullScreen
            ? 'data-[side=bottom]:h-[100dvh] max-h-[100dvh] rounded-none'
            : 'max-h-[92dvh] rounded-t-3xl',
        )}
      >
        <div className="sticky top-0 z-10 -mx-4 flex items-start justify-between gap-3 bg-[#F7F9FC] px-4 pb-3">
          <div className="min-w-0">
            <SheetTitle className="text-lg font-bold text-[var(--text-primary)]">
              {title}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </SheetDescription>
          </div>
          <SheetClose
            aria-label="Закрыть форму"
            className={`${mobileButton} flex size-11 shrink-0 items-center justify-center px-0`}
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4" aria-busy={busy}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{label}</span>
      <input {...props} className={mobileInput} />
    </label>
  );
}

export function MobileSubmit({
  disabled,
  busy,
  children,
}: {
  disabled?: boolean;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className={cn(
        mobileButton,
        'w-full border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]',
      )}
    >
      {busy ? 'Сохраняем…' : children}
    </button>
  );
}

export type MobileNewClientForm = {
  documentName: string;
  city: string;
  contactPerson: string;
  phone: string;
  email: string;
  telegram: string;
  maxLink: string;
  notes: string;
};

export function MobileNewClientSheet({
  form,
  isSaving,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: MobileNewClientForm;
  isSaving: boolean;
  error: string | null;
  onChange: (form: MobileNewClientForm) => void;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const isMobile = useIsMobile();
  const update = (key: keyof MobileNewClientForm, value: string) =>
    onChange({ ...form, [key]: value });
  if (!isMobile) return null;
  return (
    <MobileSheet
      title="Новый клиент"
      description="Клиент будет сохранён локально во вкладке «В работе» без отправки в 1С."
      error={error}
      busy={isSaving}
      fullScreen
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <MobileField
          label="Наименование компании *"
          required
          autoComplete="organization"
          value={form.documentName}
          onChange={(event) => update('documentName', event.target.value)}
        />
        <MobileField
          label="Город"
          autoComplete="address-level2"
          value={form.city}
          onChange={(event) => update('city', event.target.value)}
        />
        <MobileField
          label="Контактное лицо"
          autoComplete="name"
          value={form.contactPerson}
          onChange={(event) => update('contactPerson', event.target.value)}
        />
        <MobileField
          label="Телефон"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => update('phone', event.target.value)}
        />
        <MobileField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
        />
        <MobileField
          label="Telegram (username, ссылка или номер)"
          value={form.telegram}
          onChange={(event) => update('telegram', event.target.value)}
        />
        <MobileField
          label="MAX (ссылка)"
          value={form.maxLink}
          onChange={(event) => update('maxLink', event.target.value)}
        />
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Комментарий</span>
          <textarea
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
            className="min-h-28 rounded-xl border border-[var(--border-color)] bg-white p-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)] focus:ring-2 focus:ring-[var(--brand-yellow)]"
          />
        </label>
        <MobileSubmit busy={isSaving} disabled={!form.documentName.trim()}>
          Добавить клиента
        </MobileSubmit>
      </form>
    </MobileSheet>
  );
}

export function MobileContactSheet({
  controller,
  onClose,
}: {
  controller: DetailController;
  onClose: () => void;
}) {
  const { contactForm, setContactForm, isSaving, error, saveContact } =
    controller;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    if (await saveContact(event)) onClose();
  };
  return (
    <MobileSheet
      title="Новый контакт"
      description="Контактное лицо компании и способы связи."
      error={error}
      busy={isSaving !== null}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4">
        <MobileField
          label="Имя контакта"
          required
          autoComplete="name"
          value={contactForm.name}
          onChange={(event) =>
            setContactForm((form) => ({ ...form, name: event.target.value }))
          }
        />
        <MobileField
          label="Телефон"
          type="tel"
          autoComplete="tel"
          value={contactForm.phone}
          onChange={(event) =>
            setContactForm((form) => ({ ...form, phone: event.target.value }))
          }
        />
        <MobileField
          label="Email"
          type="email"
          autoComplete="email"
          value={contactForm.email}
          onChange={(event) =>
            setContactForm((form) => ({ ...form, email: event.target.value }))
          }
        />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={contactForm.isPrimary}
            onChange={(event) =>
              setContactForm((form) => ({
                ...form,
                isPrimary: event.target.checked,
              }))
            }
            className="size-5 accent-[var(--brand-yellow)]"
          />
          Основной контакт
        </label>
        <MobileSubmit
          busy={isSaving !== null}
          disabled={!contactForm.name.trim()}
        >
          Сохранить контакт
        </MobileSubmit>
      </form>
    </MobileSheet>
  );
}

export function MobileRequisitesSheet({
  controller,
  onClose,
}: {
  controller: DetailController;
  onClose: () => void;
}) {
  const {
    requisitesForm,
    setRequisitesForm,
    isSaving,
    error,
    saveCompanyRequisites,
  } = controller;
  const fields = [
    ['documentName', 'Наименование для документов'],
    ['fullName', 'Полное наименование'],
    ['inn', 'ИНН'],
    ['kpp', 'КПП'],
    ['city', 'Город'],
    ['contactPerson', 'Контактное лицо'],
    ['phone', 'Телефон компании'],
    ['email', 'Email компании'],
    ['telegram', 'Telegram (username, ссылка или номер)'],
    ['maxLink', 'MAX (ссылка)'],
  ] as const;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    if (await saveCompanyRequisites(event)) onClose();
  };
  return (
    <MobileSheet
      title="Реквизиты компании"
      description="Данные компании для работы и документов."
      error={error}
      busy={isSaving !== null}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4">
        {fields.map(([key, label]) => (
          <MobileField
            key={key}
            label={label}
            required={key === 'documentName'}
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
            inputMode={key === 'inn' || key === 'kpp' ? 'numeric' : undefined}
            value={requisitesForm[key]}
            onChange={(event) =>
              setRequisitesForm((form) => ({
                ...form,
                [key]: event.target.value,
              }))
            }
          />
        ))}
        <MobileSubmit
          busy={isSaving !== null}
          disabled={!requisitesForm.documentName.trim()}
        >
          Сохранить реквизиты
        </MobileSubmit>
      </form>
    </MobileSheet>
  );
}
