'use client';

import { useState, type SubmitEvent } from 'react';

import type { DetailController } from '@/components/crm/use-crm-client-detail';
import {
  mobileButton,
  mobileInput,
  mobilePanel,
} from '@/components/crm/mobile/mobile-sheets';

export function MobileClientNote({
  controller,
}: {
  controller: DetailController;
}) {
  const { clientNote, canEditWorkspace, isLoading, isSaving, saveClientNote } =
    controller;
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState('');

  const startEditing = () => {
    setBody(clientNote?.body || '');
    setIsEditing(true);
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await saveClientNote(body)) setIsEditing(false);
  };

  return (
    <section className={mobilePanel} aria-labelledby="mobile-client-note-heading">
      <h2 id="mobile-client-note-heading" className="text-base font-bold">
        О клиенте
      </h2>
      <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
        Постоянная заметка для менеджеров: особенности работы, закупки и
        важный контекст.
      </p>
      {isEditing ? (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Заметка о клиенте</span>
            <textarea
              required
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={mobileInput}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isSaving !== null}
              onClick={() => setIsEditing(false)}
              className={mobileButton}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!body.trim() || isSaving !== null}
              className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
            >
              {isSaving === 'note' ? 'Сохраняем…' : 'Сохранить заметку'}
            </button>
          </div>
        </form>
      ) : clientNote ? (
        <>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
            {clientNote.body}
          </p>
          {canEditWorkspace ? (
            <button
              type="button"
              disabled={isLoading || isSaving !== null}
              onClick={startEditing}
              className={`${mobileButton} mt-4 w-full`}
            >
              Редактировать заметку
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Заметки пока нет. Добавьте ориентир для себя и коллег.
          </p>
          {canEditWorkspace ? (
            <button
              type="button"
              disabled={isLoading || isSaving !== null}
              onClick={startEditing}
              className={`${mobileButton} mt-4 w-full`}
            >
              + Добавить заметку
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
