import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div
      className="designer-app nc-modal-portal-root"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }}
    >
      {children}
    </div>,
    document.body,
  )
}
