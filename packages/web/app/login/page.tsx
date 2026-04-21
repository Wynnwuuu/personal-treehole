'use client'

import { useState, useEffect } from 'react'
import { login, signup, setStoredToken, resendVerification } from '../../lib/api'

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

function validateInvitationCode(value: string) {
  if (!value.trim()) return '请输入邀请码。'
  if (value.length < 6) return '邀请码长度至少 6 位。'
  return ''
}

export default function AuthPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [invitationCodeError, setInvitationCodeError] = useState('')
  const [status, setStatus] = useState('')
  const [requiresVerification, setRequiresVerification] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  // 检查 URL 中是否有验证 token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      // 尝试验证邮箱
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/api/auth/verify-email?token=${token}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setStatus('邮箱验证成功！请登录。')
          } else {
            setStatus(data.error || '验证失败。')
          }
        })
        .catch(() => setStatus('验证失败。'))
    }
  }, [])

  const handleSubmit = async () => {
    const newEmailError = validateEmail(email)
    const newPasswordError = validatePassword(password)
    setEmailError(newEmailError)
    setPasswordError(newPasswordError)

    if (newEmailError || newPasswordError) {
      setStatus('请按上方提示修正注册信息后重试。')
      return
    }

    if (isRegister) {
      const newInvitationCodeError = validateInvitationCode(invitationCode)
      setInvitationCodeError(newInvitationCodeError)
      if (newInvitationCodeError) {
        setStatus('请填写邀请码。')
        return
      }
    }

    try {
      const result = isRegister
        ? await signup(email, password, invitationCode)
        : await login(email, password)

      if (result.requiresEmailVerification) {
        setRequiresVerification(true)
        setVerificationSent(true)
        setStatus('注册成功！请登录邮箱验证您的账号。')
      } else {
        setStoredToken(result.token)
        window.location.href = '/'
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '请求失败，请重试。')
    }
  }

  const handleResendVerification = async () => {
    try {
      await resendVerification(email)
      setStatus('验证邮件已发送，请检查邮箱。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '发送失败，请稍后重试。')
    }
  }

  if (requiresVerification) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 28,
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#0D0D0D',
        color: '#E5E5E5',
        position: 'relative'
      }}>
        <a href="/" style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: '#00D2A0',
          textDecoration: 'none',
          fontSize: 22,
          fontWeight: 500
        }}>Personal Treehole</a>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <h2 style={{ color: '#00D2A0' }}>验证您的邮箱</h2>
          <p style={{ color: '#E5E5E5', lineHeight: 1.6, marginTop: 16 }}>
            我们已向 <strong>{email}</strong> 发送了一封验证邮件。
            请点击邮件中的链接完成验证。
          </p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 16 }}>
            验证链接有效期为 24 小时。
          </p>

          {status && (
            <p style={{ marginTop: 20, color: status.includes('成功') ? '#00D2A0' : '#ef4444' }}>
              {status}
            </p>
          )}

          <button
            onClick={handleResendVerification}
            style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, backgroundColor: '#2563eb', border: 'none', color: '#fff' }}
          >
            重发验证邮件
          </button>

          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => {
                setRequiresVerification(false)
                setVerificationSent(false)
                setEmail('')
                setPassword('')
                setInvitationCode('')
                setStatus('')
              }}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
            >
              返回登录
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 28,
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#0D0D0D',
      color: '#E5E5E5',
      position: 'relative'
    }}>
      <a href="/" style={{
        position: 'absolute',
        top: 20,
        left: 20,
        color: '#00D2A0',
        textDecoration: 'none',
        fontSize: 22,
        fontWeight: 500
      }}>Personal Treehole</a>
      <h1 style={{ color: '#00D2A0', marginBottom: 24 }}>{isRegister ? '注册' : '登录'}</h1>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <label style={{ display: 'block', marginTop: 16 }}>
          邮箱
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailError(validateEmail(email))}
            style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #333', backgroundColor: '#1A1A1A', color: '#E5E5E5' }}
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
            style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #333', backgroundColor: '#1A1A1A', color: '#E5E5E5' }}
          />
          <div style={{ marginTop: 6, fontSize: 14, color: passwordError ? '#dc2626' : '#6b7280' }}>
            {passwordError || '密码长度至少 8 位，建议包含字母和数字'}
          </div>
        </label>

        {isRegister && (
          <label style={{ display: 'block', marginTop: 14 }}>
            邀请码
            <input
              value={invitationCode}
              onChange={(event) => setInvitationCode(event.target.value.toUpperCase())}
              onBlur={() => setInvitationCodeError(validateInvitationCode(invitationCode))}
              placeholder="请输入邀请码"
              style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #333', backgroundColor: '#1A1A1A', color: '#E5E5E5' }}
            />
            <div style={{ marginTop: 6, fontSize: 14, color: invitationCodeError ? '#dc2626' : '#6b7280' }}>
              {invitationCodeError || '注册需要有效的邀请码'}
            </div>
          </label>
        )}

        <button
          onClick={handleSubmit}
          style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, backgroundColor: '#00D2A0', border: 'none', color: '#0D0D0D', fontWeight: 500, cursor: 'pointer' }}
        >
          {isRegister ? '注册' : '登录'}
        </button>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: '#ef4444', margin: 0 }}>{status}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666' }}>{isRegister ? '已有账号？' : '没有账号？'}</span>
            <button
              onClick={() => {
                setIsRegister(!isRegister)
                setStatus('')
                setInvitationCodeError('')
              }}
              style={{ background: 'none', border: 'none', color: '#00D2A0', cursor: 'pointer', padding: 0 }}
            >
              {isRegister ? '去登录' : '去注册'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}