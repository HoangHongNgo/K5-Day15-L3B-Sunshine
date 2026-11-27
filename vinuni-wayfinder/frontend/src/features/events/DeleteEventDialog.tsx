import { Modal } from '../../shared/ui'
import type { CampusEvent } from './events'

export type DeleteEventDialogProps = {
  event: CampusEvent
  busy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteEventDialog({ event, busy = false, error, onCancel, onConfirm }: DeleteEventDialogProps) {
  function handleClose() {
    if (!busy) onCancel()
  }

  return (
    <Modal title="Xoá sự kiện?" onClose={handleClose}>
      <p>
        Bạn có chắc chắn muốn xoá sự kiện <strong>{event.title || 'chưa đặt tên'}</strong>? Thao tác này không thể hoàn tác.
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button button-quiet" onClick={onCancel} disabled={busy}>
          Giữ lại
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Xoá sự kiện
        </button>
      </div>
    </Modal>
  )
}
