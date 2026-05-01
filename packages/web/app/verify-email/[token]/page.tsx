'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function VerifyEmailPage() {
  const params = useParams()
  const token = params.token as string
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('无效的验证链接')
      return
    }

    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/api/auth/verify-email?token=${token}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setStatus('success')
          // 存储 token 并跳转到主页
          if (data.token) {
            localStorage.setItem('personal-treehole-token', data.token)
            setTimeout(() => {
              window.location.href = '/'
            }, 1500)
          } else {
            setTimeout(() => {
              window.location.href = '/login'
            }, 1500)
          }
        } else {
          const data = await res.json().catch(() => ({}))
          setStatus('error')
          setErrorMessage(data.error || '验证失败')
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMessage('服务器繁忙，请稍后重试')
      })
  }, [token])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0D0D0D',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '40px',
        backgroundColor: '#141414',
        borderRadius: '16px',
        border: '1px solid #2A2A2A',
        maxWidth: '400px',
        width: '90%'
      }}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <h1 style={{ color: '#fff', fontSize: '20px', marginBottom: '8px' }}>验证中...</h1>
            <p style={{ color: '#888', fontSize: '14px' }}>正在验证你的邮箱</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h1 style={{ color: '#00D2A0', fontSize: '20px', marginBottom: '8px' }}>验证成功！</h1>
            <p style={{ color: '#888', fontSize: '14px' }}>即将跳转到首页...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h1 style={{ color: '#FF6B6B', fontSize: '20px', marginBottom: '8px' }}>验证失败</h1>
            <p style={{ color: '#888', fontSize: '14px' }}>{errorMessage}</p>
            <a href="/login" style={{
              display: 'inline-block',
              marginTop: '20px',
              color: '#00D2A0',
              textDecoration: 'none',
              fontSize: '14px'
            }}>返回登录页</a>
          </>
        )}
      </div>
    </div>
  )
}