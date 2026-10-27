'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { fetchManagerAvatar, uploadManagerAvatar } from '@/lib/api';
import type { ManagerAccount } from '@/lib/manager-types';
import { errorMessage } from './format';
import styles from './manager.module.css';
export function ManagerAvatar({
  account,
  editable,
  onSaved,
}: {
  account: ManagerAccount;
  editable: boolean;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!account.hasAvatar) return;
    let active = true;
    let objectUrl = '';
    fetchManagerAvatar(account.id)
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [account.id, account.hasAvatar, account.avatarVersion]);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (
      file.size > 5 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      setError('Выберите PNG, JPEG или WebP до 5 МБ.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadManagerAvatar(account.id, account.avatarVersion, file);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.avatarBlock}>
      <div className={styles.avatar}>
        {url ? (
          <Image
            src={url}
            alt={`Фото ${account.name}`}
            width={64}
            height={64}
            unoptimized
          />
        ) : (
          <span aria-label="Аватар с инициалами">
            {account.name
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0])
              .join('')
              .toUpperCase()}
          </span>
        )}
      </div>
      {editable && (
        <label className={styles.photoLabel}>
          {busy ? 'Загрузка…' : 'Изменить фото'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      )}
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
