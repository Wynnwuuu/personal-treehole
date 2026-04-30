const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'
const STORAGE_KEY = 'personal-treehole-token'

export interface Mood {
  id: string
  entry_id: string
  user_id: string
  sentiment_score: number
  primary_mood: string
  mood_tags: string[]
  energy_level: number
  stress_level: number
  events_mentioned: string[]
  event_timestamp: string | null
  created_at: string
}

export interface Entry {
  id: string
  user_id: string
  session_id?: string
  content: string
  role?: 'user' | 'assistant'
  created_at: string
  updated_at?: string
  is_deleted?: boolean
}

export interface Session {
  id: string
  user_id: string
  title: string
  started_at: string
  created_at: string
}

export interface EventData {
  mood: string
  sentiment_score: number
  energy_level: number
  stress_level: number
  events_mentioned: string[]
  event_timestamp: string | null
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  event_data?: EventData
  created_at: string
}

export interface AuthResponse {
  token: string
  requiresEmailVerification?: boolean
}

export function getStoredToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, token)
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body instanceof String ? options.body.toString() : options.body
    })
  } catch (error) {
    const message =
      error instanceof TypeError && error.message === 'Failed to fetch'
        ? `无法连接到后台服务，请确认后端已启动并且 URL 为 ${API_BASE_URL}`
        : (error instanceof Error ? error.message : '请求失败，请重试。')
    throw new Error(message)
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredToken()
    }

    const body = await response.json().catch(() => null)
    const message = body?.error || response.statusText
    throw new Error(message)
  }

  return (await response.json()) as T
}

// ============ 认证 API ============

export async function login(email: string, password: string) {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
}

export async function signup(email: string, password: string, invitationCode?: string) {
  return apiFetch<AuthResponse & { requiresEmailVerification?: boolean }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, invitationCode })
  })
}

export async function resendVerification(email: string) {
  return apiFetch<{ success: boolean }>('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

// ============ 会话 API ============

export async function fetchSessions(): Promise<Session[]> {
  return apiFetch<Session[]>('/api/sessions')
}

export async function createSession(title?: string): Promise<Session> {
  return apiFetch<Session>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: title || '新的对话' })
  })
}

export async function deleteSession(sessionId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/sessions/${sessionId}`, {
    method: 'DELETE'
  })
}

export async function fetchMessages(sessionId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/sessions/${sessionId}/messages`)
}

export async function sendMessage(sessionId: string, content: string): Promise<{
  userMessage: Message
  assistantMessage: Message
}> {
  return apiFetch(`/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content })
  })
}

export function sendMessageStream(sessionId: string, content: string, callbacks: {
  onUserMessage?: (message: Message) => void
  onChunk?: (chunk: string) => void
  onAssistantMessage?: (message: Message) => void
  onError?: (error: string) => void
  onDone?: () => void
}): () => void {
  const token = getStoredToken()
  const abortController = new AbortController()

  fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ content }),
    signal: abortController.signal
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(response.statusText)
      }
      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.('No response body')
        return () => {}
      }

      const decoder = new TextDecoder()
      let buffer = ''

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            callbacks.onDone?.()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'userMessage') {
                  callbacks.onUserMessage?.(data.data)
                } else if (data.type === 'chunk') {
                  callbacks.onChunk?.(data.data)
                } else if (data.type === 'assistantMessage') {
                  callbacks.onAssistantMessage?.(data.data)
                } else if (data.type === 'error') {
                  callbacks.onError?.(data.data)
                } else if (data === '[DONE]') {
                  callbacks.onDone?.()
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
          read()
        })
      }

      read()
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        callbacks.onDone?.()
      } else {
        callbacks.onError?.(error.message)
      }
    })

  return () => abortController.abort()
}

// ============ 搜索 API ===========

export interface SearchResult {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
}

export interface SearchParams {
  keyword?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export async function searchMessages(params: SearchParams): Promise<SearchResult[]> {
  const query = new URLSearchParams()
  if (params.keyword) query.append('keyword', params.keyword)
  if (params.startDate) query.append('startDate', params.startDate)
  if (params.endDate) query.append('endDate', params.endDate)
  if (params.limit) query.append('limit', String(params.limit))
  if (params.offset) query.append('offset', String(params.offset))

  return apiFetch<SearchResult[]>(`/api/search?${query.toString()}`)
}

// ============ 消息编辑/删除 API ===========

export async function updateMessage(id: string, content: string): Promise<Message> {
  return apiFetch<Message>(`/api/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  })
}

export async function editMessage(sessionId: string, entryId: string, content: string): Promise<{
  userMessage: Message
  assistantMessage: Message
}> {
  return apiFetch(`/api/sessions/${sessionId}/edit`, {
    method: 'POST',
    body: JSON.stringify({ entryId, content })
  })
}

export async function deleteMessage(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/entries/${id}`, {
    method: 'DELETE'
  })
}
