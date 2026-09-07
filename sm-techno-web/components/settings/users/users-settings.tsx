'use client';

import type { AppUser } from '../../../lib/types';
import type { AppUserPayload, AppUserUpdatePayload } from '../../../lib/api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import { UserList } from './user-list';
import { UserDetail } from './user-detail';
import {
  buildUserDraft,
  CreateUserCredentials,
  UserEditor,
  type UserDraft,
} from './user-editor';
import { PasswordDialog, SettingsDialog } from './password-dialog';
import { useSettingsDirtyState } from './use-settings-dirty-state';
import styles from './users.module.css';

export type SettingsUser = AppUser & { hasRecoverableAppPassword?: boolean };
export type RevealedPassword = { available: boolean; password: string | null };
export type UsersSettingsProps = {
  loadUsers: () => Promise<SettingsUser[]>;
  createUser: (payload: AppUserPayload) => Promise<SettingsUser>;
  updateUser: (
    id: number,
    payload: AppUserUpdatePayload,
  ) => Promise<SettingsUser>;
  deleteUser: (id: number) => Promise<unknown>;
  revealAppPassword: (id: number) => Promise<RevealedPassword>;
  revealOnecPassword: (id: number) => Promise<RevealedPassword>;
  currentUserId?: number;
  onBack?: () => void;
};

function subscribeMobile(callback: () => void) {
  const media = window.matchMedia('(max-width: 1023px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const mobileSnapshot = () => window.matchMedia('(max-width: 1023px)').matches;
const serverSnapshot = () => false;

export function UsersSettings({
  loadUsers,
  createUser,
  updateUser,
  deleteUser,
  revealAppPassword,
  revealOnecPassword,
  currentUserId,
  onBack,
}: UsersSettingsProps) {
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    serverSnapshot,
  );
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [selected, setSelected] = useState<SettingsUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(buildUserDraft);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [passwordKind, setPasswordKind] = useState<'app' | 'onec' | null>(null);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);
  const mutationPending = useRef(false);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(buildUserDraft(selected));
  const dirty = useSettingsDirtyState(changed || passwordDirty);
  const busy = loading || saving;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadUsers()
      .then((items) => {
        if (active) setUsers(items);
      })
      .catch(() => {
        if (active)
          setError(
            'Не удалось загрузить пользователей. Повторите обновление списка.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [loadUsers]);

  function resetEditor(user: SettingsUser | null, create = false) {
    setSelected(user);
    setCreating(create);
    setDraft(buildUserDraft(user));
    setPasswordKind(null);
    setPasswordDirty(false);
    setError('');
    setMessage('');
    setRevision((value) => value + 1);
  }
  function changeDraft(patch: Partial<UserDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage('');
  }
  function requestChange(action: () => void) {
    if (!busy) dirty.request(action);
  }

  async function refresh() {
    setLoading(true);
    setError('');
    setMessage('');
    // Confirmed refresh discards the old draft and all reveal state immediately.
    setDraft(buildUserDraft(selected));
    setPasswordKind(null);
    setPasswordDirty(false);
    setRevision((value) => value + 1);
    try {
      const items = await loadUsers();
      if (!mounted.current) return;
      setUsers(items);
      resetEditor(items.find((item) => item.id === selected?.id) ?? null);
    } catch {
      if (mounted.current)
        setError(
          'Не удалось загрузить пользователей. Повторите обновление списка.',
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function save() {
    if (mutationPending.current || busy) return;
    if (creating && (!draft.username.trim() || !draft.appPassword.trim())) {
      setError('Укажите логин и пароль СМ ТЕХНО.');
      return;
    }
    if (creating && draft.appPassword !== draft.confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }
    mutationPending.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = creating
        ? await createUser({
            username: draft.username.trim(),
            fullName: draft.fullName.trim(),
            role: draft.role,
            password: draft.appPassword,
            appPassword: draft.appPassword,
            onecUsername: draft.onecUsername.trim(),
            onecPassword: draft.onecPassword,
          })
        : selected
          ? await updateUser(selected.id, {
              fullName: draft.fullName.trim(),
              role: draft.role,
              isActive: draft.isActive,
              onecUsername: draft.onecUsername.trim(),
              ...(draft.appPassword ? { appPassword: draft.appPassword } : {}),
              ...(draft.onecPassword
                ? { onecPassword: draft.onecPassword }
                : {}),
            })
          : null;
      if (!mounted.current || !updated) return;
      setUsers((current) =>
        creating
          ? [...current, updated]
          : current.map((item) => (item.id === updated.id ? updated : item)),
      );
      resetEditor(updated);
      setMessage(creating ? 'Пользователь создан.' : 'Изменения сохранены.');
    } catch {
      if (mounted.current)
        setError(
          creating
            ? 'Не удалось создать пользователя. Проверьте логин и повторите попытку.'
            : 'Не удалось сохранить изменения. Проверьте права и доступность сервера, затем повторите попытку.',
        );
    } finally {
      mutationPending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function remove() {
    if (!selected || selected.id === currentUserId || mutationPending.current)
      return;
    mutationPending.current = true;
    setSaving(true);
    setError('');
    try {
      await deleteUser(selected.id);
      if (!mounted.current) return;
      setUsers((current) => current.filter((item) => item.id !== selected.id));
      resetEditor(null);
      setMessage('Пользователь удалён.');
      setDeleting(false);
    } catch {
      if (mounted.current) {
        setDeleting(false);
        setError(
          'Не удалось удалить пользователя. Проверьте доступность сервера. Последнего активного администратора удалить нельзя.',
        );
      }
    } finally {
      mutationPending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const editing = selected !== null || creating;
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        {mobile && editing ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Назад к пользователям"
            disabled={busy}
            onClick={() => requestChange(() => resetEditor(null))}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : onBack ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="К настройкам"
            disabled={busy}
            onClick={() => requestChange(onBack)}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : null}
        <div>
          <h1>
            {mobile && creating
              ? 'Новый пользователь'
              : mobile && selected
                ? 'Пользователь'
                : 'Пользователи'}
          </h1>
          <p>Учётные записи, роли и индивидуальный доступ к 1С</p>
        </div>
        {mobile && !editing ? (
          <button
            type="button"
            className={`${styles.primary} ${styles.mobileAdd}`}
            aria-label="Новый пользователь"
            disabled={busy}
            onClick={() => requestChange(() => resetEditor(null, true))}
          >
            <Plus size={22} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
      {message ? <output className={styles.message}>{message}</output> : null}
      <div className={styles.layout}>
        {!mobile || !editing ? (
          <UserList
            users={users}
            selectedId={selected?.id ?? null}
            query={query}
            onQueryChange={setQuery}
            busy={busy}
            hideCreate={mobile}
            onSelect={(user) => {
              if (user.id !== selected?.id || creating)
                requestChange(() => resetEditor(user));
            }}
            onCreate={() => requestChange(() => resetEditor(null, true))}
            onRefresh={() => requestChange(() => void refresh())}
          />
        ) : null}
        {editing ? (
          <form
            className={styles.card}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            aria-label={
              creating ? 'Создание пользователя' : 'Карточка пользователя'
            }
          >
            {creating ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <h2>Новый пользователь</h2>
                    <p>Создайте учётную запись сотрудника</p>
                  </div>
                </div>
                <UserEditor
                  draft={draft}
                  creating
                  disabled={busy}
                  onChange={changeDraft}
                />
                <CreateUserCredentials
                  draft={draft}
                  disabled={busy}
                  onChange={changeDraft}
                />
              </>
            ) : selected ? (
              <UserDetail
                key={`${selected.id}:${revision}`}
                user={selected}
                draft={draft}
                onChange={changeDraft}
                self={selected.id === currentUserId}
                busy={busy}
                revealAppPassword={() => revealAppPassword(selected.id)}
                revealOnecPassword={() => revealOnecPassword(selected.id)}
                onPasswordChange={setPasswordKind}
                onDelete={() => setDeleting(true)}
              />
            ) : null}
            <div className={styles.footer}>
              {changed ? (
                <span className={styles.hint}>
                  Есть несохранённые изменения
                </span>
              ) : null}
              {!mobile ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => requestChange(() => resetEditor(null))}
                >
                  {creating ? 'Отмена' : 'Закрыть'}
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || (!creating && !changed)}
              >
                {saving
                  ? 'Сохранение…'
                  : creating
                    ? 'Создать пользователя'
                    : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        ) : !mobile ? (
          <div className={`${styles.card} ${styles.placeholder}`}>
            <span className={styles.placeholderIcon}>
              <Users size={28} aria-hidden="true" />
            </span>
            <h2>Выберите пользователя</h2>
            <p>
              Откройте карточку слева, чтобы изменить данные, роль или доступ к
              1С.
            </p>
          </div>
        ) : null}
      </div>
      {passwordKind ? (
        <PasswordDialog
          kind={passwordKind}
          onDirtyChange={setPasswordDirty}
          onClose={() => {
            if (passwordDirty)
              dirty.request(() => {
                setPasswordKind(null);
                setPasswordDirty(false);
              });
            else setPasswordKind(null);
          }}
          onApply={(password) => {
            changeDraft(
              passwordKind === 'app'
                ? { appPassword: password }
                : { onecPassword: password },
            );
            setPasswordKind(null);
            setPasswordDirty(false);
          }}
        />
      ) : null}
      {deleting && selected ? (
        <SettingsDialog
          title="Удалить пользователя?"
          description={`Учётная запись «${selected.fullName || selected.username}» (${selected.username}) будет удалена. Действие нельзя отменить.${changed ? ' Несохранённые изменения будут потеряны.' : ''}`}
          onClose={() => setDeleting(false)}
          busy={saving}
        >
          <div className={styles.dialogActions}>
            <button
              className={styles.button}
              type="button"
              disabled={saving}
              onClick={() => setDeleting(false)}
            >
              Отмена
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={saving}
              onClick={() => void remove()}
            >
              {saving ? 'Удаление…' : 'Удалить'}
            </button>
          </div>
        </SettingsDialog>
      ) : null}
      {dirty.confirming ? (
        <SettingsDialog
          title="Несохранённые изменения"
          description="Изменения ещё не сохранены. Продолжить редактирование или выйти без сохранения?"
          onClose={dirty.cancel}
        >
          <div className={styles.dialogActions}>
            <button
              className={styles.button}
              type="button"
              onClick={dirty.cancel}
            >
              Продолжить редактирование
            </button>
            <button
              className={styles.primary}
              type="button"
              onClick={dirty.discard}
            >
              Не сохранять
            </button>
          </div>
        </SettingsDialog>
      ) : null}
    </div>
  );
}
