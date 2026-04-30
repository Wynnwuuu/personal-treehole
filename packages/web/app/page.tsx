'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../hooks/useAuth'
import { fetchMessages, sendMessage, sendMessageStream, createSession, searchMessages, updateMessage, editMessage, SearchResult, Message } from '../lib/api'

const SESSION_KEY = 'personal-treehole-session-id'

// 情绪标签淡入动画组件
function MoodTag({ children, delay = 0, isEvent = false }: { children: React.ReactNode, delay?: number, isEvent?: boolean }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 6,
      backgroundColor: isEvent ? '#1F3D33' : '#00D2A0',
      color: isEvent ? '#00D2A0' : '#0D0D0D',
      fontSize: 10,
      fontWeight: 500,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(4px)',
      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out'
    }}>
      {children}
    </span>
  )
}

// 注入全局动画样式
function useGlobalStyles() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes breathing {
        0%, 100% { transform: scale(1); opacity: 0; }
        50% { transform: scale(1); opacity: 1; }
      }
      @keyframes dotPulse {
        0%, 100% { opacity: 0.15; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1.15); }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes glow {
        0%, 100% { text-shadow: 0 0 4px rgba(0, 210, 160, 0.2), 0 0 8px rgba(0, 210, 160, 0.1); opacity: 0.7; transform: scale(0.98); }
        50% { text-shadow: 0 0 20px rgba(0, 210, 160, 0.8), 0 0 40px rgba(0, 210, 160, 0.5), 0 0 60px rgba(0, 210, 160, 0.3); opacity: 1; transform: scale(1.02); }
      }
      .mood-tag {
        animation: fadeIn 0.3s ease-out forwards;
      }
      .glow-text {
        animation: glow 2s ease-in-out infinite;
      }
    `
    document.head.appendChild(style)
    setMounted(true)
    return () => { document.head.removeChild(style) }
  }, [])
  return mounted
}

export default function HomePage() {
  const { isAuthenticated, loading, signOut } = useAuth()
  useGlobalStyles() // 注入全局动画样式
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [assistantTyping, setAssistantTyping] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const cancelRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 初始化会话，加载历史记录
  useEffect(() => {
    if (isAuthenticated) {
      initSession()
    }
  }, [isAuthenticated])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, assistantTyping])

  const initSession = async () => {
    try {
      const storedSessionId = localStorage.getItem(SESSION_KEY)

      if (storedSessionId) {
        try {
          const historicalMessages = await fetchMessages(storedSessionId)
          setSessionId(storedSessionId)
          setMessages(historicalMessages || [])

          // 检查是否有未完成的编辑进度
          const editProgress = localStorage.getItem('treehole-edit-progress')
          if (editProgress) {
            const { sessionId: editSessionId, oldMessageId, newContent } = JSON.parse(editProgress)
            if (editSessionId === storedSessionId) {
              // 找到对应的旧消息位置
              const oldMsgIndex = historicalMessages.findIndex(m => m.id === oldMessageId)
              if (oldMsgIndex !== -1) {
                const nextAiMsg = historicalMessages[oldMsgIndex + 1]
                // 隐藏旧消息，显示编辑后的内容和呼吸灯
                setMessages(prev => {
                  const filtered = prev.filter(m => m.id !== oldMessageId && m.id !== nextAiMsg?.id)
                  return [...filtered, {
                    id: `temp-edit-${Date.now()}`,
                    session_id: storedSessionId,
                    role: 'user' as const,
                    content: newContent,
                    created_at: new Date().toISOString()
                  }]
                })
                setEditingMessageId(oldMessageId)
                setEditingContent(newContent)
                setAssistantTyping(true)

                // 继续等待编辑结果
                try {
                  const { userMessage: newUserMsg, assistantMessage: newAiMsg } = await editMessage(
                    storedSessionId,
                    oldMessageId,
                    newContent
                  )
                  localStorage.removeItem('treehole-edit-progress')
                  setMessages(prev => {
                    const updated = prev.filter(m => !m.id.startsWith('temp-edit-'))
                    return [...updated, newUserMsg, newAiMsg]
                  })
                  setAssistantTyping(false)
                  setEditingMessageId(null)
                  setEditingContent('')
                } catch (e) {
                  console.error('恢复编辑进度失败:', e)
                  localStorage.removeItem('treehole-edit-progress')
                  setAssistantTyping(false)
                }
              }
            }
          }

          setIsInitialLoading(false)
          return
        } catch (e) {
          console.log('历史记录加载失败，创建新会话')
        }
      }

      const session = await createSession()
      localStorage.setItem(SESSION_KEY, session.id)
      setSessionId(session.id)
      setMessages([])
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化会话失败')
    } finally {
      setIsInitialLoading(false)
    }
  }

  const handleCancelGeneration = () => {
    cancelRef.current = true
    if ((window as any).__cancelStream) {
      ;(window as any).__cancelStream()
      ;(window as any).__cancelStream = null
    }
    setIsLoading(false)
    setAssistantTyping(false)
    setStreamingContent('')
  }

  const handleSendMessage = async () => {
    if (!inputText.trim() || !sessionId || isLoading) return

    cancelRef.current = false
    const text = inputText.trim()
    setInputText('')
    setIsLoading(true)
    setError('')
    setStreamingContent('')

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMessage])

    setAssistantTyping(true)

    let userMessageResult: Message | null = null
    let assistantMessageResult: Message | null = null

    const cleanup = sendMessageStream(sessionId, text, {
      onUserMessage: (msg) => {
        userMessageResult = msg
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMessage.id)
          return [...filtered, msg]
        })
      },
      onChunk: (chunk) => {
        setStreamingContent(prev => prev + chunk)
      },
      onAssistantMessage: (msg) => {
        assistantMessageResult = msg
      },
      onError: (errorMsg) => {
        if (!cancelRef.current) {
          setError(errorMsg)
          setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id))
        }
      },
      onDone: () => {
        if (cancelRef.current) {
          setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id))
        } else if (assistantMessageResult) {
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempUserMessage.id)
            return [...filtered, assistantMessageResult!]
          })
        }
        setIsLoading(false)
        setAssistantTyping(false)
        setStreamingContent('')
      }
    })

    // 保存取消函数
    ;(window as any).__cancelStream = cleanup
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleEditMessage = (msg: Message) => {
    setEditingMessageId(msg.id)
    setEditingContent(msg.content)
  }

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingContent.trim() || !sessionId || isEditing) return

    setIsEditing(true)
    setError('')

    try {
      // 找到当前编辑消息的位置
      const msgIndex = messages.findIndex(m => m.id === editingMessageId)
      const nextAiMsg = messages[msgIndex + 1]
      const editedContent = editingContent.trim()

      // 保存编辑进度到 localStorage，防止刷新后丢失
      const editProgress = {
        sessionId,
        oldMessageId: editingMessageId,
        newContent: editedContent
      }
      localStorage.setItem('treehole-edit-progress', JSON.stringify(editProgress))
      console.log('[DEBUG] 保存编辑进度:', editProgress)

      // 先隐藏旧消息，添加临时消息显示编辑后的内容
      setMessages(prev => {
        const filtered = prev.filter(m =>
          m.id !== editingMessageId && m.id !== nextAiMsg?.id
        )
        return [...filtered, {
          id: `temp-edit-${Date.now()}`,
          session_id: sessionId,
          role: 'user' as const,
          content: editedContent,
          created_at: new Date().toISOString()
        }]
      })
      setAssistantTyping(true)

      // 使用统一的编辑端点：标记旧数据 + 获取新 AI 回复
      const { userMessage: newUserMsg, assistantMessage: newAiMsg } = await editMessage(
        sessionId,
        editingMessageId,
        editedContent
      )

      // 清除编辑进度
      localStorage.removeItem('treehole-edit-progress')
      console.log('[DEBUG] 清除编辑进度')

      // 替换临时消息为真实消息
      setMessages(prev => {
        const updated = prev.filter(m => !m.id.startsWith('temp-edit-'))
        return [...updated, newUserMsg, newAiMsg]
      })
      setAssistantTyping(false)

      setEditingMessageId(null)
      setEditingContent('')
    } catch (err) {
      localStorage.removeItem('treehole-edit-progress')
      console.error('[DEBUG] 编辑失败:', err)
      setError(err instanceof Error ? err.message : '修改失败')
      setAssistantTyping(false)
    } finally {
      setIsEditing(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingContent('')
  }

  if (loading) {
    return (
      <div style={{ backgroundColor: '#0D0D0D', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: 14 }}>正在加载...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div style={{ backgroundColor: '#0D0D0D', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <h1 style={{ color: '#fff', marginBottom: 16 }} className="glow-text">Personal Treehole</h1>
        <a href="/login" style={{ color: '#00D2A0', textDecoration: 'none' }}>去登录</a>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#0D0D0D',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 顶部栏 */}
      <header style={{
        padding: '12px 20px',
        borderBottom: '1px solid #1F1F1F',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#141414'
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>Treehole</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setSearchOpen(true)}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: '#1F1F1F',
              color: '#888',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            🔍
          </button>
          <button
            onClick={signOut}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: '#1F1F1F',
              color: '#888',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            登出
          </button>
        </div>
      </header>

      {/* 对话区域 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            {isInitialLoading ? (
              <div style={{ textAlign: 'center', paddingTop: 120 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: '#2A2A2A',
                  marginBottom: 16
                }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: '#555',
                    animation: 'breathing 1.5s ease-in-out infinite'
                  }} />
                </div>
                <p style={{ fontSize: 12, color: '#555' }}>加载中...</p>
              </div>
            ) : messages.length === 0 && !isLoading && !assistantTyping ? (
              <div style={{ textAlign: 'center', paddingTop: 120 }}>
                <p style={{ fontSize: 18, color: '#666', marginBottom: 8 }}>这里是你的私人树洞</p>
                <p style={{ fontSize: 18, color: '#555' }}>今天过得好吗，我在听</p>
              </div>
            ) : null}

            {messages.map((msg, idx) => {
              const lastUserMessageId = messages.filter(m => m.role === 'user').pop()?.id
              const isLastUserMessage = msg.role === 'user' && msg.id === lastUserMessageId
              return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 16
                }}
              >
                {msg.role === 'assistant' && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 4
                  }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: '#2A2A2A',
                      color: '#00D2A0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0
                    }}>
                      ✦
                    </div>
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        backgroundColor: 'transparent',
                        color: '#E5E5E5',
                        fontSize: 16,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {msg.role === 'user' && (
                  <div style={{ position: 'relative', maxWidth: '75%' }}>
                    {editingMessageId === msg.id ? (
                      <div>
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 12,
                            backgroundColor: '#2A2A2A',
                            color: '#E5E5E5',
                            fontSize: 16,
                            lineHeight: 1.5,
                            border: '1px solid #00D2A0',
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none'
                          }}
                          rows={Math.max(1, editingContent.split('\n').length)}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={handleCancelEdit}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 4,
                              border: 'none',
                              backgroundColor: '#2A2A2A',
                              color: '#888',
                              fontSize: 12,
                              cursor: 'pointer'
                            }}
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={isEditing}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 4,
                              border: 'none',
                              backgroundColor: isEditing ? '#888' : '#00D2A0',
                              color: isEditing ? '#ccc' : '#0D0D0D',
                              fontSize: 12,
                              cursor: isEditing ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isEditing ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onMouseEnter={(e) => {
                          if (isLastUserMessage) {
                            const actions = e.currentTarget.querySelector('.msg-actions') as HTMLElement
                            if (actions) actions.style.opacity = '1'
                          }
                        }}
                        onMouseLeave={(e) => {
                          const actions = e.currentTarget.querySelector('.msg-actions') as HTMLElement
                          if (actions) actions.style.opacity = '0'
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          backgroundColor: '#2A2A2A',
                          color: '#E5E5E5',
                          fontSize: 16,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {msg.content}
                        {/* 编辑/删除按钮 - 仅最后一条用户消息 hover 时显示 */}
                        {isLastUserMessage && (
                          <span
                            className="msg-actions"
                            style={{
                              position: 'absolute',
                              right: -32,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              display: 'flex',
                              gap: 2,
                              opacity: 0,
                              transition: 'opacity 0.2s'
                            }}
                          >
                            <button
                              onClick={() => handleEditMessage(msg)}
                              style={{
                                padding: '4px 6px',
                                borderRadius: 4,
                                border: 'none',
                                backgroundColor: '#1F1F1F',
                                color: '#888',
                                fontSize: 12,
                                cursor: 'pointer'
                              }}
                              title="编辑"
                            >
                              ✏️
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 情绪数据标签 */}
                {msg.role === 'user' && msg.event_data && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {msg.event_data.mood && (
                      <MoodTag key={`mood-${msg.id}`} delay={0}>
                        {msg.event_data.mood}
                      </MoodTag>
                    )}
                    {msg.event_data.events_mentioned?.slice(0, 2).map((event: string, i: number) => (
                      <MoodTag key={`event-${msg.id}-${i}`} delay={(i + 1) * 100} isEvent>
                        {event}
                      </MoodTag>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>
                  {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )})}

            {/* AI 正在输入 / 流式输出 */}
            {assistantTyping && (
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: '#2A2A2A',
                  color: '#00D2A0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                  boxShadow: '0 0 8px rgba(0, 210, 160, 0.4)',
                  animation: 'glow 2s ease-in-out infinite'
                }}>
                  ✦
                </div>
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  backgroundColor: 'transparent',
                  color: '#E5E5E5',
                  fontSize: 16,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}>
                  {streamingContent ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                  ) : (
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ animation: 'dotPulse 1.2s infinite', animationDelay: '0s', color: '#fff' }}>●</span>
                      <span style={{ animation: 'dotPulse 1.2s infinite', animationDelay: '0.2s', color: '#fff' }}>●</span>
                      <span style={{ animation: 'dotPulse 1.2s infinite', animationDelay: '0.4s', color: '#fff' }}>●</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{
          padding: '16px 20px 24px',
          borderTop: '1px solid #1F1F1F',
          backgroundColor: '#141414'
        }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 20,
                border: '1px solid #2A2A2A',
                backgroundColor: '#1E1E1E',
                color: '#E5E5E5',
                fontSize: 16,
                lineHeight: 1.4,
                maxHeight: 100,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none'
              }}
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: inputText.trim() && !isLoading ? '#00D2A0' : '#2A2A2A',
                color: inputText.trim() && !isLoading ? '#0D0D0D' : '#555',
                fontSize: 16,
                cursor: inputText.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ▲
            </button>
            {(isLoading || assistantTyping) && (
              <button
                onClick={handleCancelGeneration}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#FF6B6B',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ■
              </button>
            )}
          </div>
          {error && (
            <div style={{ maxWidth: 680, margin: '8px auto 0', color: '#ff6b6b', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </main>

      {/* 搜索 Modal */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const [keyword, setKeyword] = useState('')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    try {
      const data = await searchMessages({
        keyword: keyword || undefined,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined
      })
      setResults(data)
    } catch (err) {
      console.error('搜索失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: '90%',
        maxWidth: 560,
        maxHeight: '75vh',
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #2A2A2A'
      }}>
        {/* Modal 头部 */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2A2A2A',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>搜索聊天记录</h2>
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: '#2A2A2A',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ✕
          </button>
        </div>

        {/* 搜索条件 */}
        <div style={{ padding: 16, borderBottom: '1px solid #2A2A2A' }}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索关键字..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #2A2A2A',
                backgroundColor: '#141414',
                color: '#fff',
                fontSize: 13,
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #2A2A2A', backgroundColor: '#141414', color: '#fff', fontSize: 12 }}
            />
            <span style={{ color: '#555', fontSize: 12 }}>至</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #2A2A2A', backgroundColor: '#141414', color: '#fff', fontSize: 12 }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '10px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#00D2A0',
              color: '#0D0D0D',
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {/* 搜索结果 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {results.length === 0 && !loading && (
            <p style={{ textAlign: 'center', color: '#555', padding: 40, fontSize: 13 }}>暂无搜索结果</p>
          )}
          {results.map(result => (
            <div
              key={result.id}
              style={{
                padding: 12,
                borderRadius: 10,
                backgroundColor: '#141414',
                marginBottom: 8,
                cursor: 'pointer',
                border: '1px solid #2A2A2A'
              }}
              onClick={() => {
                navigator.clipboard.writeText(result.content)
                alert('已复制')
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: result.role === 'user' ? '#00D2A0' : '#2A2A2A',
                  color: result.role === 'user' ? '#0D0D0D' : '#888',
                  fontSize: 10,
                  fontWeight: 500
                }}>
                  {result.role === 'user' ? '我' : 'AI'}
                </span>
                <span style={{ fontSize: 11, color: '#555' }}>
                  {new Date(result.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{result.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}