import { useAuth } from '@clerk/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { setAuthTokenProvider } from '../services/api/client'

export default function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded } = useAuth()

  useLayoutEffect(() => {
    if (!isLoaded) return
    setAuthTokenProvider(getToken)
    return () => {
      setAuthTokenProvider(null)
    }
  }, [getToken, isLoaded])

  return children
}
