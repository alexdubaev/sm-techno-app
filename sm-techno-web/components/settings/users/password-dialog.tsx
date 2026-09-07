'use client';

import { useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import styles from './users.module.css';

export function SettingsDialog({
  title,
  description,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PasswordDialog({
  kind,
  onApply,
  onClose,
  onDirtyChange,
}: {
  kind: 'app' | 'onec';
  onApply: (password: string) => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  return (
    <SettingsDialog
      title={`Изменить пароль ${kind === 'app' ? 'СМ ТЕХНО' : '1С'}`}
      description="Новый пароль будет применён после нажатия «Сохранить изменения» в карточке пользователя."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!password.trim()) {
            setError('Введите новый пароль');
            return;
          }
          if (password !== confirm) {
            setError('Пароли не совпадают');
            return;
          }
          onApply(password);
        }}
      >
        <div className={styles.dialogFields}>
          <label className={styles.field}>
            Новый пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                onDirtyChange(Boolean(event.target.value || confirm));
                setError('');
              }}
            />
          </label>
          <label className={styles.field}>
            Повторите пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                onDirtyChange(Boolean(password || event.target.value));
                setError('');
              }}
            />
          </label>
        </div>
        {error ? (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Отмена
          </button>
          <button className={styles.primary} type="submit">
            Изменить пароль
          </button>
        </div>
      </form>
    </SettingsDialog>
  );
}
