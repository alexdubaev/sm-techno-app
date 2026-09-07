'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import type { RevealedPassword, SettingsUser } from './users-settings';
import { UserEditor, type UserDraft } from './user-editor';
import { userInitials } from './user-list';
import styles from './users.module.css';

function SecretField({
  kind,
  available,
  changed,
  busy,
  reveal,
  onChange,
}: {
  kind: 'app' | 'onec';
  available: boolean;
  changed: boolean;
  busy: boolean;
  reveal: () => Promise<RevealedPassword>;
  onChange: () => void;
}) {
  const label = kind === 'app' ? 'СМ ТЕХНО' : '1С';
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (secret === null) return;
    const timer = window.setTimeout(() => setSecret(null), 45_000);
    return () => window.clearTimeout(timer);
  }, [secret]);

  async function show() {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const result = await reveal();
      if (current !== request.current) return;
      if (result.available && result.password !== null)
        setSecret(result.password);
      else setUnavailable(true);
    } catch {
      if (current === request.current)
        setError('Не удалось показать пароль. Повторите попытку.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  return (
    <div className={styles.secret}>
      <div className={styles.secretLabel}>Пароль {label}</div>
      <div className={styles.secretValue}>{secret ?? '••••••••'}</div>
      <div className={styles.secretActions}>
        <button
          className={styles.button}
          type="button"
          aria-label={`${secret !== null ? 'Скрыть' : 'Показать'} пароль ${label}`}
          disabled={busy || loading || !available || unavailable || changed}
          onClick={() => {
            if (secret !== null) {
              request.current += 1;
              setSecret(null);
            } else void show();
          }}
        >
          {secret !== null ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
          {loading ? 'Загрузка…' : secret !== null ? 'Скрыть' : 'Показать'}
        </button>
        <button
          className={styles.button}
          type="button"
          aria-label={`Изменить пароль ${label}`}
          disabled={busy}
          onClick={() => {
            request.current += 1;
            setSecret(null);
            setLoading(false);
            onChange();
          }}
        >
          <Pencil size={15} aria-hidden="true" />
          Изменить пароль
        </button>
      </div>
      {changed ? (
        <p className={styles.pending}>
          Новый пароль подготовлен. Сохраните изменения.
        </p>
      ) : !available || unavailable ? (
        <p className={styles.hint}>
          {kind === 'app'
            ? 'Пароль недоступен для просмотра. Задайте новый пароль.'
            : 'Пароль 1С не задан или недоступен для просмотра.'}
        </p>
      ) : (
        <p className={styles.hint}>
          Пароль автоматически скроется через 45 секунд.
        </p>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function UserDetail({
  user,
  draft,
  onChange,
  self,
  busy,
  revealAppPassword,
  revealOnecPassword,
  onPasswordChange,
  onDelete,
}: {
  user: SettingsUser;
  draft: UserDraft;
  onChange: (patch: Partial<UserDraft>) => void;
  self: boolean;
  busy: boolean;
  revealAppPassword: () => Promise<RevealedPassword>;
  revealOnecPassword: () => Promise<RevealedPassword>;
  onPasswordChange: (kind: 'app' | 'onec') => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className={styles.detailHeader}>
        <span className={styles.avatar} aria-hidden="true">
          {userInitials(user)}
        </span>
        <div>
          <h2>{user.fullName || user.username}</h2>
          <p>{user.username}</p>
          <div className={styles.badges}>
            <span className={styles.badge}>
              {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
            </span>
            <span
              className={`${styles.badge} ${user.isActive ? styles.active : styles.inactive}`}
            >
              {user.isActive ? 'Активен' : 'Отключён'}
            </span>
          </div>
        </div>
      </div>
      <UserEditor
        draft={draft}
        onChange={onChange}
        self={self}
        disabled={busy}
      />
      <section className={styles.section}>
        <h3>Доступ в СМ ТЕХНО</h3>
        <label className={styles.field}>
          Логин
          <input className={styles.input} value={user.username} readOnly />
        </label>
        <SecretField
          kind="app"
          available={Boolean(user.hasRecoverableAppPassword)}
          changed={Boolean(draft.appPassword)}
          busy={busy}
          reveal={revealAppPassword}
          onChange={() => onPasswordChange('app')}
        />
      </section>
      <section className={styles.section}>
        <h3>Доступ к 1С</h3>
        <label className={styles.field}>
          Логин 1С
          <input
            className={styles.input}
            value={draft.onecUsername}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => onChange({ onecUsername: event.target.value })}
          />
        </label>
        <SecretField
          kind="onec"
          available={user.hasOnecPassword}
          changed={Boolean(draft.onecPassword)}
          busy={busy}
          reveal={revealOnecPassword}
          onChange={() => onPasswordChange('onec')}
        />
      </section>
      <section className={styles.danger}>
        <div>
          <h3>Удаление пользователя</h3>
          <p className={styles.hint}>
            {self
              ? 'Свою учётную запись удалить нельзя.'
              : 'Удаление учётной записи нельзя отменить.'}
          </p>
        </div>
        <button
          className={styles.dangerButton}
          type="button"
          disabled={busy || self}
          onClick={onDelete}
        >
          <Trash2 size={16} aria-hidden="true" />
          Удалить пользователя
        </button>
      </section>
    </>
  );
}
