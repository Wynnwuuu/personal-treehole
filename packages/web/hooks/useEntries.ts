'use client'

import useSWR from 'swr'
import { fetchEntries } from '../lib/api'

interface Entry {
  id: string
  content: string
  sentiment_score?: number
  created_at: string
}

const fetcher = async () => {
  return fetchEntries()
}

export function useEntries(enabled: boolean) {
  const { data, mutate, error } = useSWR(enabled ? 'entries' : null, fetcher, {
    revalidateOnFocus: false
  })

  return {
    entries: data ?? [],
    refresh: mutate,
    error
  }
}
