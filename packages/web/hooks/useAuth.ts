'use client'

import { useEffect, useState } from 'react'
import { clearStoredToken, getStoredToken } from '../lib/api'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    setIsAuthenticated(!!token)
    setLoading(false)
  }, [])

  const signOut = () => {
    clearStoredToken()
    setIsAuthenticated(false)
  }

  return { isAuthenticated, loading, signOut }
}
