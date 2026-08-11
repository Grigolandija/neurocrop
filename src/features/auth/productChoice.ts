import { useCallback, useState } from 'react'

export type NeuroCropProduct = 'field' | 'greenhouse'

const productStorageKey = 'neurocrop-product-choice-v2'

function readProductChoice(): NeuroCropProduct | null {
  try {
    const stored = sessionStorage.getItem(productStorageKey)
    return stored === 'field' || stored === 'greenhouse' ? stored : null
  } catch {
    return null
  }
}

export function useProductChoice() {
  const [choice, setChoice] = useState(() => ({
    product: readProductChoice(),
    selectedNow: false,
  }))

  const chooseProduct = useCallback((next: NeuroCropProduct) => {
    try { sessionStorage.setItem(productStorageKey, next) } catch { /* Continue without persistence. */ }
    setChoice({ product: next, selectedNow: true })
  }, [])

  const clearProduct = useCallback(() => {
    try { sessionStorage.removeItem(productStorageKey) } catch { /* Continue without persistence. */ }
    setChoice({ product: null, selectedNow: false })
  }, [])

  return {
    product: choice.product,
    selectedNow: choice.selectedNow,
    chooseProduct,
    clearProduct,
  }
}
