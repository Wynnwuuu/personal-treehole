import { SYNC_API_URL } from '../config'

export interface AuthResponse {
  token?: string
  error?: string
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SYNC_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()
    if (!response.ok) {
      return { error: data.error || '登录失败' }
    }

    return { token: data.token }
  } catch (error) {
    return {
      error:
        error instanceof TypeError && error.message === 'Failed to fetch'
          ? `无法连接到后台服务，请确认后端已启动并且 URL 为 ${SYNC_API_URL}`
          : error instanceof Error
          ? error.message
          : '登录失败'
    }
  }
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SYNC_API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()
    if (!response.ok) {
      return { error: data.error || '注册失败' }
    }

    return { token: data.token }
  } catch (error) {
    return {
      error:
        error instanceof TypeError && error.message === 'Failed to fetch'
          ? `无法连接到后台服务，请确认后端已启动并且 URL 为 ${SYNC_API_URL}`
          : error instanceof Error
          ? error.message
          : '注册失败'
    }
  }
}
