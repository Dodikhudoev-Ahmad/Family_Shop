import { useEffect } from 'react';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  isDangerous = true,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isBusy, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-dialog__backdrop" onClick={() => !isBusy && onCancel()}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`confirm-dialog__icon ${isDangerous ? 'is-danger' : ''}`}>
          <WarningIcon />
        </div>
        <h3 id="confirm-dialog-title">{title}</h3>
        <p>{description}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__cancel" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-dialog__confirm ${isDangerous ? 'is-danger' : ''}`}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? <span className="confirm-dialog__spinner" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M11 2 20.5 19H1.5L11 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11 8.5v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="16" r="0.9" fill="currentColor" />
    </svg>
  );
}
