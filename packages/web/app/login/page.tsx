'use client'

import { useState } from 'react'
import { login, signup, setStoredToken } from '../../lib/api'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value: string) {
  if (!value.trim()) return '请输入邮箱。'
  if (!EMAIL_REGEX.test(value)) return '请输入有效邮箱，例如 user@example.com。'
  return ''
}

function validatePassword(value: string) {
  if (!value.trim()) return '请输入密码。'
  if (value.length < 8) return '密码长度至少 8 位。'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return '建议密码包含字母和数字。'
  return ''
}

export default function AuthPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async () => {
    const newEmailError = validateEmail(email)
    const newPasswordError = validatePassword(password)
    setEmailError(newEmailError)
    setPasswordError(newPasswordError)

    if (newEmailError || newPasswordError) {
      setStatus('请按上方提示修正注册信息后重试。')
      return
    }

    try {
      const result = isRegister
        ? await signup(email, password)
        : await login(email, password)

      setStoredToken(result.token)
      window.location.href = '/'
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '请求失败，请重试。')
    }
  }

  return (
    <main style={{ padding: 28, fontFamily: 'system-ui, sans-serif' }}>
      <h1>{isRegister ? '注册' : '登录'}</h1>
      <div style={{ maxWidth: 420 }}>
        <label style={{ display: 'block', marginTop: 16 }}>
          邮箱
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailError(validateEmail(email))}
            style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
          />
          <div style={{ marginTop: 6, fontSize: 14, color: emailError ? '#dc2626' : '#6b7280' }}>
            {emailError || '请输入常用邮箱，例如 user@example.com'}
          </div>
        </label>
        <label style={{ display: 'block', marginTop: 14 }}>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setPasswordError(validatePassword(password))}
            style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
          />
          <div style={{ marginTop: 6, fontSize: 14, color: passwordError ? '#dc2626' : '#6b7280' }}>
            {passwordError || '密码长度至少 8 位，建议包含字母和数字'}
          </div>
        </label>

        <button
          onClick={handleSubmit}
          style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, backgroundColor: '#2563eb', border: 'none', color: '#fff' }}
        >
          {isRegister ? '注册' : '登录'}
        </button>

        <p style={{ marginTop: 16, color: '#ef4444' }}>{status}</p>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{isRegister ? '已有账号？' : '没有账号？'}</span>
          <button
            onClick={() => {
              setIsRegister(!isRegister)
              setStatus('')
            }}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
          >
            {isRegister ? '去登录' : '去注册'}
          </button>
        </div>
      </div>
    </main>
  )
}
