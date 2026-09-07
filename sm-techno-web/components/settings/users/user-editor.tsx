'use client';

import type { SettingsUser } from './users-settings';
import styles from './users.module.css';

export type UserDraft = {
  username: string;
  fullName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  onecUsername: string;
  appPassword: string;
  confirmPassword: string;
  onecPassword: string;
};

export function buildUserDraft(user?: SettingsUser | null): UserDraft {
  return {
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    role: user?.role ?? 'user',
    isActive: user?.isActive ?? true,
    onecUsername: user?.onecUsername ?? '',
    appPassword: '',
    confirmPassword: '',
    onecPassword: '',
  };
}

export function UserEditor({
  draft,
  onChange,
  creating = false,
  self = false,
  disabled = false,
}: {
  draft: UserDraft;
  onChange: (patch: Partial<UserDraft>) => void;
  creating?: boolean;
  self?: boolean;
  disabled?: boolean;
}) {
  return (
    <section className={styles.section} aria-labelledby="user-basic-heading">
      <h3 id="user-basic-heading">Основное</h3>
      <div className={styles.fields}>
        <label className={`${styles.field} ${styles.wide}`}>
          ФИО
          <input
            className={styles.input}
            value={draft.fullName}
            autoComplete="name"
            disabled={disabled}
            onChange={(event) => onChange({ fullName: event.target.value })}
          />
        </label>
        {creating ? (
          <label className={styles.field}>
            Логин
            <input
              className={styles.input}
              value={draft.username}
              autoComplete="off"
              required
              disabled={disabled}
              onChange={(event) => onChange({ username: event.target.value })}
            />
          </label>
        ) : null}
        <label className={styles.field}>
          Роль
          <select
            className={styles.input}
            value={draft.role}
            disabled={disabled || self}
            onChange={(event) =>
              onChange({ role: event.target.value as UserDraft['role'] })
            }
          >
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
        {!creating ? (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.isActive}
              disabled={disabled || self}
              onChange={(event) => onChange({ isActive: event.target.checked })}
            />
            Пользователь активен
          </label>
        ) : null}
      </div>
      {self ? (
        <p className={styles.hint}>
          Вы редактируете свою учётную запись. Роль и активность защищены от
          изменения.
        </p>
      ) : null}
    </section>
  );
}

export function CreateUserCredentials({
  draft,
  onChange,
  disabled,
}: {
  draft: UserDraft;
  onChange: (patch: Partial<UserDraft>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <section className={styles.section}>
        <h3>Доступ в СМ ТЕХНО</h3>
        <div className={styles.fields}>
          <label className={styles.field}>
            Пароль СМ ТЕХНО
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              required
              value={draft.appPassword}
              disabled={disabled}
              onChange={(event) =>
                onChange({ appPassword: event.target.value })
              }
            />
          </label>
          <label className={styles.field}>
            Повторите пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              required
              value={draft.confirmPassword}
              disabled={disabled}
              onChange={(event) =>
                onChange({ confirmPassword: event.target.value })
              }
            />
          </label>
        </div>
      </section>
      <section className={styles.section}>
        <h3>Доступ к 1С</h3>
        <p className={styles.hint}>
          Индивидуальная учётная запись сотрудника. Можно заполнить позже.
        </p>
        <div className={styles.fields} style={{ marginTop: 16 }}>
          <label className={styles.field}>
            Логин 1С
            <input
              className={styles.input}
              autoComplete="off"
              value={draft.onecUsername}
              disabled={disabled}
              onChange={(event) =>
                onChange({ onecUsername: event.target.value })
              }
            />
          </label>
          <label className={styles.field}>
            Пароль 1С
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={draft.onecPassword}
              disabled={disabled}
              onChange={(event) =>
                onChange({ onecPassword: event.target.value })
              }
            />
          </label>
        </div>
      </section>
    </>
  );
}
