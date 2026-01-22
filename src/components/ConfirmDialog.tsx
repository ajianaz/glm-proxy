import React from 'react';

/**
 * Props for the ConfirmDialog component
 */
interface ConfirmDialogProps {
  /** Title of the confirmation dialog */
  title: string;
  /** Main message or description */
  message: string;
  /** Optional warning text to display (shown with alert-warning styling) */
  warning?: string;
  /** Optional detailed information (shown below the message) */
  details?: string;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Visual variant for the confirm button (default: "danger" for destructive actions) */
  confirmVariant?: 'primary' | 'danger' | 'warning';
  /** Whether the confirm action is in progress */
  isConfirming?: boolean;
  /** Callback when dialog is cancelled or closed */
  onCancel: () => void;
  /** Callback when confirm action is triggered */
  onConfirm: () => void | Promise<void>;
}

/**
 * ConfirmDialog Component
 *
 * A reusable modal dialog for confirming destructive or critical actions.
 * Features safety warnings, loading states, and customizable options.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   title="Delete API Key"
 *   message={`Are you sure you want to delete "${keyName}"?`}
 *   warning="This action cannot be undone."
 *   details="All data associated with this key will be permanently removed."
 *   confirmLabel="Delete"
 *   confirmVariant="danger"
 *   isConfirming={isDeleting}
 *   onCancel={() => setShowDialog(false)}
 *   onConfirm={async () => {
 *     await deleteKey(keyId);
 *     setShowDialog(false);
 *   }}
 * />
 * ```
 */
export default function ConfirmDialog({
  title,
  message,
  warning,
  details,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  /**
   * Handle backdrop click (close modal unless confirming)
   */
  function handleBackdropClick(event: React.MouseEvent): void {
    if (!isConfirming && event.target === event.currentTarget) {
      onCancel();
    }
  }

  /**
   * Handle ESC key press (close modal unless confirming)
   */
  function handleKeyDown(event: React.KeyboardEvent): void {
    if (!isConfirming && event.key === 'Escape') {
      onCancel();
    }
  }

  /**
   * Handle confirm button click
   */
  async function handleConfirm(): Promise<void> {
    await onConfirm();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="confirm-dialog-title" className="modal-title">
            {title}
          </h2>
          <button
            className="modal-close"
            onClick={onCancel}
            disabled={isConfirming}
            title="Close"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Main message */}
          <p id="confirm-dialog-message" className="confirm-message">
            {message}
          </p>

          {/* Warning alert */}
          {warning && (
            <div className="alert alert-warning" role="alert">
              <span className="alert-icon">⚠</span>
              <span className="alert-text">{warning}</span>
            </div>
          )}

          {/* Additional details */}
          {details && (
            <div className="confirm-details">
              <small className="text-muted">{details}</small>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isConfirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-${confirmVariant}`}
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manage confirmation dialog state
 *
 * Provides a convenient way to manage confirmation dialog state
 * with boolean open/close and optional data payload.
 *
 * @example
 * ```tsx
 * const confirmDialog = useConfirmDialog();
 *
 * function handleDelete() {
 *   confirmDialog.open({
 *     title: 'Delete Item',
 *     message: 'Are you sure?',
 *     onConfirm: async () => {
 *       await deleteItem(id);
 *     }
 *   });
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     {confirmDialog.isOpen && (
 *       <ConfirmDialog {...confirmDialog.props} onCancel={confirmDialog.close} />
 *     )}
 *   </>
 * );
 * ```
 */
export interface ConfirmDialogState {
  isOpen: boolean;
  props: Omit<ConfirmDialogProps, 'onCancel'>;
}

export function useConfirmDialog() {
  const [state, setState] = React.useState<ConfirmDialogState>({
    isOpen: false,
    props: {
      title: '',
      message: '',
      onConfirm: () => {},
    },
  });

  const open = (props: Omit<ConfirmDialogProps, 'onCancel'>) => {
    setState({ isOpen: true, props });
  };

  const close = () => {
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    isOpen: state.isOpen,
    props: state.props,
    open,
    close,
  };
}
