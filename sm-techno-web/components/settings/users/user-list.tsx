'use client';

import { ChevronRight, Plus, RefreshCw, Search } from 'lucide-react';
import type { SettingsUser } from './users-settings';
import styles from './users.module.css';

export function userInitials(
  user: Pick<SettingsUser, 'fullName' | 'username'>,
) {
  return (user.fullName || user.username)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('ru');
}

export function UserList({
  users,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  onRefresh,
  busy,
  hideCreate = false,
}: {
  users: SettingsUser[];
  selectedId: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (user: SettingsUser) => void;
  onCreate: () => void;
  onRefresh: () => void;
  busy: boolean;
  hideCreate?: boolean;
}) {
  const search = query.trim().toLocaleLowerCase('ru');
  const filtered = users.filter((user) =>
    `${user.fullName} ${user.username} ${user.onecUsername}`
      .toLocaleLowerCase('ru')
      .includes(search),
  );
  return (
    <aside
      className={styles.list}
      aria-label="Список пользователей"
      aria-busy={busy}
    >
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <input
            className={styles.input}
            type="search"
            aria-label="Поиск пользователей"
            placeholder="Имя или логин"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="Обновить список"
          title="Обновить список"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {!hideCreate ? (
        <button
          className={`${styles.primary} ${styles.newUser}`}
          type="button"
          aria-label="Новый пользователь"
          disabled={busy}
          onClick={onCreate}
        >
          <Plus size={18} aria-hidden="true" />
          Новый пользователь
        </button>
      ) : null}
      <p className={styles.count}>
        Всего: {users.length} · Активных:{' '}
        {users.filter((user) => user.isActive).length}
      </p>
      <div className={styles.listItems}>
        {filtered.map((user) => (
          <button
            key={user.id}
            type="button"
            className={`${styles.user} ${selectedId === user.id ? styles.selected : ''}`}
            aria-label={`${user.fullName || user.username} ${user.username}, ${user.role === 'admin' ? 'Администратор' : 'Пользователь'}, ${user.isActive ? 'Активен' : 'Отключён'}, ${user.onecUsername && user.hasOnecPassword ? '1С настроена' : '1С не настроена'}`}
            aria-pressed={selectedId === user.id}
            disabled={busy}
            onClick={() => onSelect(user)}
          >
            <span className={styles.avatar} aria-hidden="true">
              {userInitials(user)}
            </span>
            <span className={styles.identity}>
              <strong>{user.fullName || user.username}</strong>
              <small>{user.username}</small>
              <span className={styles.badges}>
                <span className={styles.badge}>
                  {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
                </span>
                <span
                  className={`${styles.badge} ${user.isActive ? styles.active : styles.inactive}`}
                >
                  {user.isActive ? 'Активен' : 'Отключён'}
                </span>
                <span className={styles.badge}>
                  {user.onecUsername && user.hasOnecPassword
                    ? '1С настроена'
                    : '1С не настроена'}
                </span>
              </span>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
        {!filtered.length && !busy ? (
          <p className={styles.empty}>
            {users.length
              ? 'Ничего не найдено. Измените запрос.'
              : 'Пользователей пока нет. Создайте первую учётную запись.'}
          </p>
        ) : null}
        {busy && !users.length ? (
          <p className={styles.empty}>Загрузка пользователей…</p>
        ) : null}
      </div>
    </aside>
  );
}
