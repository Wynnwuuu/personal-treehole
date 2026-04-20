import { useEffect, useState } from 'react'
import { greet, saveEntry, getEntries } from './services/api'
import { syncLocalEntries } from './services/sync'
import { login, signup } from './services/auth'
import ChatInput from './components/ChatInput'
import MoodChart from './components/MoodChart'

interface Entry {
  id: string
  content: string
  created_at: string
}

function App() {
  const [message, setMessage] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [syncToken, setSyncToken] = useState<string>(() => localStorage.getItem('treehole_auth_token') || '')
  const [syncMessage, setSyncMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [loggedInEmail, setLoggedInEmail] = useState<string>(() => localStorage.getItem('treehole_user_email') || '')

  const loadEntries = async () => {
    const list = await getEntries()
    setEntries(list)
  }

  useEffect(() => {
    loadEntries()
  }, [])

  const handleSend = async (content: string) => {
    await saveEntry(content)
    await loadEntries()
  }

  const handleSync = async () => {
    try {
      setSyncMessage('同步中...')
      const result = await syncLocalEntries(syncToken)
      setSyncMessage(`已同步 ${result.synced} 条本地记录。`)
      await loadEntries()
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '同步失败')
    }
  }

  const handleTokenSave = () => {
    localStorage.setItem('treehole_auth_token', syncToken)
    localStorage.setItem('treehole_user_email', email)
    setLoggedInEmail(email)
    setAuthMessage('登录令牌已保存。')
  }

  const validateEmail = (value: string) => {
    if (!value.trim()) return '请输入邮箱。'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return '请输入有效邮箱，例如 user@example.com。'
    return ''
  }

  const validatePassword = (value: string) => {
    if (!value.trim()) return '请输入密码。'
    if (value.length < 8) return '密码长度至少 8 位。'
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return '建议密码包含字母和数字。'
    return ''
  }

  const handleAuthValidation = () => {
    const newEmailError = validateEmail(email)
    const newPasswordError = validatePassword(password)
    setEmailError(newEmailError)
    setPasswordError(newPasswordError)
    return !newEmailError && !newPasswordError
  }

  const handleLogin = async () => {
    if (!handleAuthValidation()) {
      setAuthMessage('请按上方提示修正登录信息后重试。')
      return
    }

    const result = await login(email, password)
    if (result.error) {
      setAuthMessage(result.error)
      return
    }
    if (result.token) {
      setSyncToken(result.token)
      handleTokenSave()
      setAuthMessage('登录成功。')
    }
  }

  const handleSignup = async () => {
    if (!handleAuthValidation()) {
      setAuthMessage('请按上方提示修正注册信息后重试。')
      return
    }

    const result = await signup(email, password)
    if (result.error) {
      setAuthMessage(result.error)
      return
    }
    if (result.token) {
      setSyncToken(result.token)
      handleTokenSave()
      setAuthMessage('注册成功，已保存令牌。')
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Personal Treehole</h1>
      <p>{message}</p>
      <button onClick={async () => setMessage(await greet('Wynn'))}>测试后端</button>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid #ddd', borderRadius: 10 }}>
        <h2>同步登录</h2>
        {loggedInEmail ? (
          <p>已登录：{loggedInEmail}</p>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: 10 }}>
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
            <label style={{ display: 'block', marginBottom: 10 }}>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => setPasswordError(validatePassword(password))}
                style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
              />
              <div style={{ marginTop: 6, fontSize: 14, color: passwordError ? '#dc2626' : '#6b7280' }}>
                {passwordError || '密码至少 8 位，建议包含字母和数字'}
              </div>
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={handleLogin} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#2563eb', color: '#fff' }}>
                登录
              </button>
              <button onClick={handleSignup} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#f59e0b', color: '#fff' }}>
                注册
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <button onClick={handleSync} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#10b981', color: '#fff' }}>
            同步本地记录
          </button>
        </div>
        <p style={{ marginTop: 10, color: '#4b5563' }}>{authMessage || syncMessage}</p>
      </div>

      <ChatInput onSend={handleSend} />

      <div style={{ marginTop: 24 }}>
        <h2>Recent Entries</h2>
        {entries.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 12, padding: 12, border: '1px solid #ddd' }}>
            <div>{new Date(entry.created_at).toLocaleString()}</div>
            <div>{entry.content}</div>
          </div>
        ))}
      </div>

      <MoodChart />
    </div>
  )
}

export default App
