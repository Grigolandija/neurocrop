import { useCallback, useState } from 'react'

export type NeuroCropProduct = 'field' | 'greenhouse'

const productStorageKey = 'neurocrop-product-choice-v1'

function readProductChoice(): NeuroCropProduct | null {
  try {
    const stored = sessionStorage.getItem(productStorageKey)
    return stored === 'field' || stored === 'greenhouse' ? stored : null
  } catch {
    return null
  }
}

export function useProductChoice() {
  const [product, setProduct] = useState<NeuroCropProduct | null>(readProductChoice)

  const chooseProduct = useCallback((next: NeuroCropProduct) => {
    try { sessionStorage.setItem(productStorageKey, next) } catch { /* Continue without persistence. */ }
    setProduct(next)
  }, [])

  const clearProduct = useCallback(() => {
    try { sessionStorage.removeItem(productStorageKey) } catch { /* Continue without persistence. */ }
    setProduct(null)
  }, [])

  return { product, chooseProduct, clearProduct }
}
