'use client';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import styles from './manager.module.css';
export function ManagerModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop className={styles.backdrop} />
        <DialogPopup className={styles.modal}>
          <div className={styles.modalHeading}>
            <DialogTitle>{title}</DialogTitle>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
          </div>
          <DialogDescription className={styles.hint}>
            {description}
          </DialogDescription>
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
