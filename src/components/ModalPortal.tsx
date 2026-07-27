import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(<div className="designer-app nc-modal-portal-root">{children}</div>, document.body)
}
