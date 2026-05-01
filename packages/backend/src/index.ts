import dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { chat, analyzeEvent, chatStream } from './services/deepseek'
import { sendEmail, generateVerifyEmailHtml, generateInvitationCode } from './services/email'
import { encrypt, decrypt, isEncrypted } from './services/crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''

const missingEnv: string[] = []
if (!SUPABASE_URL) missingEnv.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
if (!JWT_SECRET) missingEnv.push('JWT_SECRET')
if (!DEEPSEEK_API_KEY) missingEnv.push('DEEPSEEK_API_KEY')

if (missingEnv.length > 0) {
  console.error(
    `缺少必要环境变量: ${missingEnv.join(', ')}. 请复制 packages/backend/.env.example 为 packages/backend/.env 并填写真实值。`
  )
  process.exit(1)
}

const invalidPlaceholder: string[] = []
if (SUPABASE_URL.includes('xyzcompany.supabase.co')) invalidPlaceholder.push('SUPABASE_URL')
if (SUPABASE_SERVICE_ROLE_KEY === 'your-service-role-key') invalidPlaceholder.push('SUPABASE_SERVICE_ROLE_KEY')
if (JWT_SECRET === 'change-this-secret') invalidPlaceholder.push('JWT_SECRET')
if (DEEPSEEK_API_KEY === 'your-deepseek-api-key') invalidPlaceholder.push('DEEPSEEK_API_KEY')
if (!SUPABASE_URL.startsWith('https://')) invalidPlaceholder.push('SUPABASE_URL')

if (invalidPlaceholder.length > 0) {
  console.error(
    `请将 packages/backend/.env 中的占位符值替换为真实值：${invalidPlaceholder.join(', ')}。`
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email)
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function createToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}

interface AuthRequest extends express.Request {
  body: {
    userId?: string
    [key: string]: any
  }
}

async function verifyToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: '未授权，请先登录。' })
  const token = auth.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.body.userId = payload.userId
    next()
  } catch (error) {
    return res.status(401).json({ error: '登录已过期，请重新登录。' })
  }
}

// ============ 认证 API ============

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, invitationCode } = req.body

  // 验证必填字段
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码。' })
  if (!isValidEmail(email)) return res.status(400).json({ error: '邮箱格式不正确，请使用 user@example.com 这样的邮箱地址。' })
  if (!isStrongPassword(password)) return res.status(400).json({ error: '密码长度至少 8 位，建议包含字母和数字。' })

  // 验证邀请码
  if (!invitationCode) return res.status(400).json({ error: '请填写邀请码。' })

  const { data: inviteData, error: inviteError } = await supabase
    .from('invitation_codes')
    .select('*')
    .eq('code', invitationCode.toUpperCase())
    .eq('is_active', true)
    .single()

  if (inviteError || !inviteData) {
    return res.status(400).json({ error: '邀请码无效。' })
  }

  if (inviteData.current_uses >= inviteData.max_uses) {
    return res.status(400).json({ error: '邀请码已使用次数上限。' })
  }

  if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
    return res.status(400).json({ error: '邀请码已过期。' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      email_verified: false
    })
    .select()
    .single()

  if (error) {
    console.error('注册错误:', error)
    const duplicateEmail =
      error.code === '23505' ||
      error.message?.toLowerCase().includes('duplicate') ||
      error.details?.toLowerCase().includes('already exists')

    if (duplicateEmail) {
      return res.status(400).json({ error: '该邮箱已被注册，请直接登录，或使用其他邮箱。' })
    }

    return res.status(500).json({ error: '注册失败，请稍后重试。如果问题持续存在，请检查后端日志。' })
  }

  // 更新邀请码使用次数
  await supabase
    .from('invitation_codes')
    .update({
      current_uses: inviteData.current_uses + 1,
      used_by: data.id,
      used_at: new Date().toISOString()
    })
    .eq('id', inviteData.id)

  // 生成邮件验证 token
  const verifyToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30分钟后过期 // 24小时后过期

  await supabase.from('email_verify_tokens').insert({
    user_id: data.id,
    token: verifyToken,
    expires_at: expiresAt
  })

  // 更新用户的验证 token
  await supabase
    .from('users')
    .update({
      email_verify_token: verifyToken,
      email_verify_token_expires_at: expiresAt
    })
    .eq('id', data.id)

  // 发送验证邮件
  const { html, text } = generateVerifyEmailHtml(verifyToken)
  await sendEmail({
    to: email,
    subject: '【心灵树洞】请验证您的邮箱',
    html,
    text,
    templateData: { name: verifyToken }
  })

  res.json({
    token: createToken(data.id),
    requiresEmailVerification: true
  })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码。' })
  if (!isValidEmail(email)) return res.status(400).json({ error: '邮箱格式不正确，请使用 user@example.com 这样的邮箱地址。' })

  const { data, error } = await supabase.from('users').select('*').eq('email', email).single()
  if (error || !data) return res.status(401).json({ error: '邮箱或密码不正确，请检查后重试。' })

  // 检查邮箱是否已验证
  if (!data.email_verified) {
    return res.status(403).json({
      error: '请先验证邮箱后再登录。验证邮件已发送至您的邮箱。',
      requiresEmailVerification: true
    })
  }

  const match = await bcrypt.compare(password, data.password_hash)
  if (!match) return res.status(401).json({ error: '邮箱或密码不正确，请检查后重试。' })

  res.json({ token: createToken(data.id) })
})

// 验证邮箱
app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: '缺少验证 token。' })
  }

  // 查询 token
  const { data: tokenData, error: tokenError } = await supabase
    .from('email_verify_tokens')
    .select('*')
    .eq('token', token)
    .single()

  if (tokenError || !tokenData) {
    return res.status(400).json({ error: '验证链接无效或已过期。' })
  }

  if (tokenData.used_at) {
    return res.status(400).json({ error: '此验证链接已使用。' })
  }

  if (new Date(tokenData.expires_at) < new Date()) {
    return res.status(400).json({ error: '验证链接已过期，请重新发送验证邮件。' })
  }

  // 更新用户邮箱验证状态
  const { error: userError } = await supabase
    .from('users')
    .update({
      email_verified: true,
      email_verify_token: null,
      email_verify_token_expires_at: null
    })
    .eq('id', tokenData.user_id)

  if (userError) {
    return res.status(500).json({ error: '验证失败，请稍后重试。' })
  }

  // 标记 token 已使用
  await supabase
    .from('email_verify_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenData.id)

  res.json({ success: true, message: '邮箱验证成功！' })
})

// 重新发送验证邮件
// 测试邮件接口（仅开发环境使用）
app.post('/api/auth/test-email', async (req, res) => {
  const { email } = req.body
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: '请提供有效的邮箱地址。' })
  }
  const token = crypto.randomBytes(32).toString('hex')
  const { html, text } = generateVerifyEmailHtml(token)
  const sent = await sendEmail({ to: email, subject: '✧ 验证你的邮箱 ✧', html, text, templateData: { name: token } })
  if (sent) {
    res.json({ success: true, message: '测试邮件已发送' })
  } else {
    res.status(500).json({ error: '发送失败，请检查 Resend API 配置' })
  }
})

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: '请提供有效的邮箱地址。' })
  }

  // 查找用户
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (userError || !user) {
    return res.status(404).json({ error: '该邮箱未注册。' })
  }

  if (user.email_verified) {
    return res.status(400).json({ error: '该邮箱已验证，无需重复验证。' })
  }

  // 生成新 token
  const verifyToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30分钟后过期

  // 更新用户验证 token
  await supabase
    .from('users')
    .update({
      email_verify_token: verifyToken,
      email_verify_token_expires_at: expiresAt
    })
    .eq('id', user.id)

  // 保存 token 记录
  await supabase.from('email_verify_tokens').insert({
    user_id: user.id,
    token: verifyToken,
    expires_at: expiresAt
  })

  // 发送验证邮件
  const { html, text } = generateVerifyEmailHtml(verifyToken)
  await sendEmail({
    to: email,
    subject: '【心灵树洞】请验证您的邮箱',
    html,
    text,
    templateData: { name: verifyToken }
  })

  res.json({ success: true, message: '验证邮件已发送。' })
})

// ============ 会话 API ============

// 创建新会话
app.post('/api/sessions', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const { title } = req.body

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      title: title || '新的对话',
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// 获取用户所有会话列表
app.get('/api/sessions', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId

  const { data, error } = await supabase
    .from('sessions')
    .select('id, title, started_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// 获取会话的所有消息
app.get('/api/sessions/:id/messages', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const sessionId = req.params.id

  console.log('[API] GET /api/sessions/:id/messages', { userId, sessionId, auth: req.headers.authorization?.slice(0, 20) })

  // 验证会话属于该用户
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (sessionError || !session) {
    return res.status(404).json({ error: '会话不存在或无权访问。' })
  }

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_stale', false)
    .order('created_at', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })

  // 解密用户消息（如果解密失败则保留原文，不影响业务流程）
  const decryptedData = (data || []).map((entry: any) => {
    if (entry.role === 'user' && isEncrypted(entry.content)) {
      try {
        return { ...entry, content: decrypt(entry.content) }
      } catch (e) {
        console.log('[API] 解密旧消息失败，保留密文:', entry.id)
        return { ...entry, content: '[此消息内容暂时无法显示]' }
      }
    }
    return entry
  })

  res.json(decryptedData)
})

// 发送消息并获取 AI 回复
app.post('/api/sessions/:id/messages', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const sessionId = req.params.id
  const { content } = req.body

  console.log('[API] /api/sessions/:id/messages called', { userId, sessionId, content: content?.slice(0, 50) })

  if (!content?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空。' })
  }

  // 验证会话属于该用户
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, title, started_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  console.log('[API] Session query result:', { session, sessionError })

  if (sessionError || !session) {
    return res.status(404).json({ error: '会话不存在或无权访问。' })
  }

  // 获取会话历史（过滤已编辑的旧数据）
  const { data: historyData } = await supabase
    .from('entries')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('is_stale', false)
    .order('created_at', { ascending: true })

  console.log('[API] History data:', historyData)

  const sessionHistory = (historyData || []).map((entry: any) => {
    if (entry.role === 'user' && isEncrypted(entry.content)) {
      try {
        return { role: entry.role as 'user' | 'assistant', content: decrypt(entry.content) }
      } catch (e) {
        console.log('[API] 解密历史消息失败，跳过:', entry.id)
        return null
      }
    }
    return { role: entry.role as 'user' | 'assistant', content: entry.content }
  }).filter(Boolean)

  // 获取用户情绪背景（从 moods 表）
  // events_mentioned: 全量历史数据（排除已删除消息的事件）
  // sentiment/energy/stress: 最近一周的平均值
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const [allMoods, recentMoods] = await Promise.all([
    supabase
      .from('moods')
      .select('events_mentioned, entry_id')
      .eq('user_id', userId),
    supabase
      .from('moods')
      .select('sentiment_score, energy_level, stress_level')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo.toISOString())
  ])

  // 汇总所有历史 events_mentioned
  const allEvents: string[] = []
  if (allMoods.data) {
    allMoods.data.forEach(m => {
      if (m.events_mentioned) {
        allEvents.push(...m.events_mentioned)
      }
    })
  }

  // 计算最近一周的情绪指标平均值
  let avgSentiment = 0.5, avgEnergy = 0.5, avgStress = 0.5
  if (recentMoods.data && recentMoods.data.length > 0) {
    avgSentiment = recentMoods.data.reduce((s, m) => s + m.sentiment_score, 0) / recentMoods.data.length
    avgEnergy = recentMoods.data.reduce((s, m) => s + m.energy_level, 0) / recentMoods.data.length
    avgStress = recentMoods.data.reduce((s, m) => s + m.stress_level, 0) / recentMoods.data.length
  }

  const moodContext = {
    events_mentioned: [...new Set(allEvents)], // 全量历史 events
    sentiment_score: avgSentiment,
    energy_level: avgEnergy,
    stress_level: avgStress
  }

  // 存储用户消息（加密）
  const { data: userMessage, error: userMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content: encrypt(content),
      role: 'user',
      user_timestamp: new Date().toISOString(),
      event_timestamp: new Date().toISOString()
    })
    .select()
    .single()

  console.log('[API] User message stored:', { userMessage, userMsgError })

  if (userMsgError) return res.status(400).json({ error: userMsgError.message })

  // 调用 Gemini 对话（带最近 20 条上下文防止模型失忆）
  const recentHistory = sessionHistory.slice(-20)
  let aiResponse = ''
  try {
    console.log('[API] Calling Gemini chat...')
    aiResponse = await chat(recentHistory, content, moodContext)
    console.log('[API] Gemini response received:', aiResponse.slice(0, 100))
  } catch (error) {
    console.error('[API] Gemini 对话错误:', error)
    aiResponse = '抱歉，我现在无法回应你，请稍后再试。'
  }

  // 存储 AI 回复
  const { data: assistantMessage, error: assistantMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content: aiResponse,
      role: 'assistant'
    })
    .select()
    .single()

  if (assistantMsgError) return res.status(400).json({ error: assistantMsgError.message })

  // 分析用户消息中的事件和情绪，存入 moods 表和 entries 表
  try {
    const eventAnalysis = await analyzeEvent(content)
    console.log('[API] Event analysis result:', eventAnalysis)

    // 存入 moods 表
    const { error: moodError } = await supabase.from('moods').insert({
      entry_id: userMessage.id,
      user_id: userId,
      sentiment_score: eventAnalysis.sentiment_score,
      primary_mood: eventAnalysis.mood,
      mood_tags: eventAnalysis.events_mentioned,
      energy_level: eventAnalysis.energy_level,
      stress_level: eventAnalysis.stress_level,
      events_mentioned: eventAnalysis.events_mentioned,
      event_timestamp: eventAnalysis.event_timestamp ? new Date().toISOString() : null
    })
    console.log('[API] Mood insert result:', moodError)

    // 同时存入 entries 表的 event_data 字段，方便统一管理
    const { error: updateError } = await supabase
      .from('entries')
      .update({
        event_data: {
          mood: eventAnalysis.mood,
          sentiment_score: eventAnalysis.sentiment_score,
          energy_level: eventAnalysis.energy_level,
          stress_level: eventAnalysis.stress_level,
          events_mentioned: eventAnalysis.events_mentioned,
          event_timestamp: eventAnalysis.event_timestamp
        },
        event_timestamp: eventAnalysis.event_timestamp ? new Date().toISOString() : null
      })
      .eq('id', userMessage.id)
    console.log('[API] Entry update result:', updateError)

    // 更新 userMessage 包含 event_data
    userMessage.event_data = {
      mood: eventAnalysis.mood,
      sentiment_score: eventAnalysis.sentiment_score,
      energy_level: eventAnalysis.energy_level,
      stress_level: eventAnalysis.stress_level,
      events_mentioned: eventAnalysis.events_mentioned,
      event_timestamp: eventAnalysis.event_timestamp
    }
  } catch (error) {
    console.error('情绪分析错误:', error)
  }

  // 更新会话标题（如果还没有标题）
  if (!session.title || session.title === '新的对话') {
    const firstContent = content.slice(0, 30)
    await supabase
      .from('sessions')
      .update({ title: firstContent + (content.length > 30 ? '...' : '') })
      .eq('id', sessionId)
  }

  res.json({
    userMessage: {
      ...userMessage,
      content: decrypt(userMessage.content)
    },
    assistantMessage
  })
})

// 发送消息并获取 AI 回复（流式版本）
app.post('/api/sessions/:id/messages/stream', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const sessionId = req.params.id
  const { content } = req.body

  console.log('[API] /api/sessions/:id/messages/stream called', { userId, sessionId, content: content?.slice(0, 50) })

  if (!content?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空。' })
  }

  // 验证会话属于该用户
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, title, started_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (sessionError || !session) {
    return res.status(404).json({ error: '会话不存在或无权访问。' })
  }

  // 获取会话历史
  const { data: historyData } = await supabase
    .from('entries')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('is_stale', false)
    .order('created_at', { ascending: true })

  const sessionHistory = (historyData || []).map((entry: any) => {
    if (entry.role === 'user' && isEncrypted(entry.content)) {
      try {
        return { role: entry.role as 'user' | 'assistant', content: decrypt(entry.content) }
      } catch (e) {
        console.log('[API] 解密历史消息失败，跳过:', entry.id)
        return null
      }
    }
    return { role: entry.role as 'user' | 'assistant', content: entry.content }
  }).filter(Boolean)

  // 获取情绪背景
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const [allMoods, recentMoods] = await Promise.all([
    supabase.from('moods').select('events_mentioned, entry_id').eq('user_id', userId),
    supabase
      .from('moods')
      .select('sentiment_score, energy_level, stress_level')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo.toISOString())
  ])

  const allEvents: string[] = []
  if (allMoods.data) {
    allMoods.data.forEach(m => {
      if (m.events_mentioned) allEvents.push(...m.events_mentioned)
    })
  }

  let avgSentiment = 0.5, avgEnergy = 0.5, avgStress = 0.5
  if (recentMoods.data && recentMoods.data.length > 0) {
    avgSentiment = recentMoods.data.reduce((s, m) => s + m.sentiment_score, 0) / recentMoods.data.length
    avgEnergy = recentMoods.data.reduce((s, m) => s + m.energy_level, 0) / recentMoods.data.length
    avgStress = recentMoods.data.reduce((s, m) => s + m.stress_level, 0) / recentMoods.data.length
  }

  const moodContext = {
    events_mentioned: [...new Set(allEvents)],
    sentiment_score: avgSentiment,
    energy_level: avgEnergy,
    stress_level: avgStress
  }

  // 存储用户消息（加密）
  const { data: userMessage, error: userMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content: encrypt(content),
      role: 'user',
      user_timestamp: new Date().toISOString(),
      event_timestamp: new Date().toISOString()
    })
    .select()
    .single()

  if (userMsgError) return res.status(400).json({ error: userMsgError.message })

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // 先发送用户消息 ID（解密后）
  const decryptedUserMessage = {
    ...userMessage,
    content: decrypt(userMessage.content)
  }
  res.write(`data: ${JSON.stringify({ type: 'userMessage', data: decryptedUserMessage })}\n\n`)

  // 构建最近 20 条历史
  const recentHistory = sessionHistory.slice(-20)

  try {
    let fullResponse = ''
    for await (const chunk of chatStream(recentHistory, content, moodContext)) {
      fullResponse += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`)
    }

    // 存储 AI 回复
    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from('entries')
      .insert({
        user_id: userId,
        session_id: sessionId,
        content: fullResponse,
        role: 'assistant'
      })
      .select()
      .single()

    if (assistantMsgError) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: assistantMsgError.message })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'assistantMessage', data: assistantMessage })}\n\n`)
    }

    // 情绪分析
    let eventAnalysisResult = null
    try {
      eventAnalysisResult = await analyzeEvent(content)
      await supabase.from('moods').insert({
        entry_id: userMessage.id,
        user_id: userId,
        sentiment_score: eventAnalysisResult.sentiment_score,
        primary_mood: eventAnalysisResult.mood,
        mood_tags: eventAnalysisResult.events_mentioned,
        energy_level: eventAnalysisResult.energy_level,
        stress_level: eventAnalysisResult.stress_level,
        events_mentioned: eventAnalysisResult.events_mentioned,
        event_timestamp: eventAnalysisResult.event_timestamp ? new Date().toISOString() : null
      })
      await supabase
        .from('entries')
        .update({
          event_data: {
            mood: eventAnalysisResult.mood,
            sentiment_score: eventAnalysisResult.sentiment_score,
            energy_level: eventAnalysisResult.energy_level,
            stress_level: eventAnalysisResult.stress_level,
            events_mentioned: eventAnalysisResult.events_mentioned,
            event_timestamp: eventAnalysisResult.event_timestamp
          },
          event_timestamp: eventAnalysisResult.event_timestamp ? new Date().toISOString() : null
        })
        .eq('id', userMessage.id)
    } catch (error) {
      console.error('情绪分析错误:', error)
    }

    // 发送更新后的用户消息（包含 event_data）
    if (eventAnalysisResult) {
      const updatedUserMessage = {
        ...userMessage,
        event_data: {
          mood: eventAnalysisResult.mood,
          sentiment_score: eventAnalysisResult.sentiment_score,
          energy_level: eventAnalysisResult.energy_level,
          stress_level: eventAnalysisResult.stress_level,
          events_mentioned: eventAnalysisResult.events_mentioned,
          event_timestamp: eventAnalysisResult.event_timestamp
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'eventDataUpdate', data: updatedUserMessage })}\n\n`)
    }

    // 更新会话标题
    if (!session.title || session.title === '新的对话') {
      const firstContent = content.slice(0, 30)
      await supabase
        .from('sessions')
        .update({ title: firstContent + (content.length > 30 ? '...' : '') })
        .eq('id', sessionId)
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (error) {
    console.error('[API] Stream error:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', data: '流式响应出错' })}\n\n`)
    res.end()
  }
})

// 删除会话
app.delete('/api/sessions/:id', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const sessionId = req.params.id

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ success: true })
})

// ============ 消息编辑/删除 API ============

// 更新消息（编辑）
app.put('/api/entries/:id', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const entryId = req.params.id
  const { content } = req.body

  if (!content?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空。' })
  }

  // 验证消息属于该用户
  const { data: entry, error: fetchError } = await supabase
    .from('entries')
    .select('id, user_id, role, session_id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !entry) {
    return res.status(404).json({ error: '消息不存在或无权修改。' })
  }

  // 只允许修改用户消息
  if (entry.role !== 'user') {
    return res.status(403).json({ error: '只能修改自己的消息。' })
  }

  // 标记旧消息为 stale（不再被读取）
  await supabase
    .from('entries')
    .update({ is_stale: true })
    .eq('id', entryId)

  // 插入新消息
  const { data: newEntry, error: insertError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: entry.session_id,
      content: content.trim(),
      role: 'user',
      user_timestamp: new Date().toISOString(),
      event_timestamp: new Date().toISOString()
    })
    .select()
    .single()

if (insertError) return res.status(400).json({ error: insertError.message })
  res.json(newEntry)
})

// 编辑消息并获取新 AI 回复
app.post('/api/sessions/:id/edit', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const sessionId = req.params.id
  const { entryId, content } = req.body

  if (!content?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空。' })
  }

  // 验证消息属于该用户
  const { data: entry, error: fetchError } = await supabase
    .from('entries')
    .select('id, user_id, role, session_id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !entry) {
    return res.status(404).json({ error: '消息不存在或无权修改。' })
  }

  if (entry.role !== 'user') {
    return res.status(403).json({ error: '只能修改自己的消息。' })
  }

  // 查找紧随其后的 AI 消息（在标记为 stale 之前查询）
  const { data: allEntries } = await supabase
    .from('entries')
    .select('id, role')
    .eq('session_id', sessionId)
    .eq('is_stale', false)
    .order('created_at', { ascending: true })

  const entryIndex = allEntries?.findIndex(e => e.id === entryId) ?? -1
  const nextEntry = allEntries?.[entryIndex + 1]

  // 标记旧用户消息和紧随的 AI 消息为 stale
  const entriesToMarkStale = [entryId]
  if (nextEntry?.role === 'assistant') {
    entriesToMarkStale.push(nextEntry.id)
  }

  await supabase
    .from('entries')
    .update({ is_stale: true })
    .in('id', entriesToMarkStale)

  // 清理关联的 mood 数据（这些事件已不再有效）
  await supabase
    .from('moods')
    .delete()
    .in('entry_id', entriesToMarkStale)

  // 获取情绪上下文
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const [allMoods, recentMoods] = await Promise.all([
    supabase.from('moods').select('events_mentioned, entry_id').eq('user_id', userId),
    supabase
      .from('moods')
      .select('sentiment_score, energy_level, stress_level')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo.toISOString())
  ])

  // 过滤 stale 关联的事件
  const validEntryIds = new Set(
    (allEntries || []).filter(e => !allEntries?.some(s => s.id === e.id)).map(e => e.id)
  )
  const allEvents: string[] = []
  if (allMoods.data) {
    allMoods.data.forEach(m => {
      if (!m.entry_id || validEntryIds.has(m.entry_id)) {
        if (m.events_mentioned) allEvents.push(...m.events_mentioned)
      }
    })
  }

  let avgSentiment = 0.5, avgEnergy = 0.5, avgStress = 0.5
  if (recentMoods.data && recentMoods.data.length > 0) {
    avgSentiment = recentMoods.data.reduce((s, m) => s + m.sentiment_score, 0) / recentMoods.data.length
    avgEnergy = recentMoods.data.reduce((s, m) => s + m.energy_level, 0) / recentMoods.data.length
    avgStress = recentMoods.data.reduce((s, m) => s + m.stress_level, 0) / recentMoods.data.length
  }

  const moodContext = {
    events_mentioned: [...new Set(allEvents)],
    sentiment_score: avgSentiment,
    energy_level: avgEnergy,
    stress_level: avgStress
  }

  // 插入新用户消息
  const { data: newUserMsg, error: userMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content: content.trim(),
      role: 'user',
      user_timestamp: new Date().toISOString(),
      event_timestamp: new Date().toISOString()
    })
    .select()
    .single()

  if (userMsgError) return res.status(400).json({ error: userMsgError.message })

  // 获取非 stale 的会话历史
  const { data: historyData } = await supabase
    .from('entries')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('is_stale', false)
    .order('created_at', { ascending: true })

  const sessionHistory = (historyData || []).map((e: any) => {
    if (e.role === 'user' && isEncrypted(e.content)) {
      try {
        return { role: e.role as 'user' | 'assistant', content: decrypt(e.content) }
      } catch (e) {
        console.log('[API] 解密历史消息失败，跳过:', e)
        return null
      }
    }
    return { role: e.role as 'user' | 'assistant', content: e.content }
  }).filter(Boolean)

  // 调用 AI
  const recentHistory = sessionHistory.slice(-20)
  let aiResponse = ''
  try {
    aiResponse = await chat(recentHistory, content, moodContext)
  } catch (error) {
    console.error('[API] AI 对话错误:', error)
    aiResponse = '抱歉，我现在无法回应你，请稍后再试。'
  }

  // 存储新 AI 回复
  const { data: assistantMsg, error: assistantMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content: aiResponse,
      role: 'assistant'
    })
    .select()
    .single()

  if (assistantMsgError) return res.status(400).json({ error: assistantMsgError.message })

  // 情绪分析
  try {
    const eventAnalysis = await analyzeEvent(content)
    await supabase.from('moods').insert({
      entry_id: newUserMsg.id,
      user_id: userId,
      sentiment_score: eventAnalysis.sentiment_score,
      primary_mood: eventAnalysis.mood,
      mood_tags: eventAnalysis.events_mentioned,
      energy_level: eventAnalysis.energy_level,
      stress_level: eventAnalysis.stress_level,
      events_mentioned: eventAnalysis.events_mentioned,
      event_timestamp: eventAnalysis.event_timestamp ? new Date().toISOString() : null
    })
    await supabase
      .from('entries')
      .update({
        event_data: {
          mood: eventAnalysis.mood,
          sentiment_score: eventAnalysis.sentiment_score,
          energy_level: eventAnalysis.energy_level,
          stress_level: eventAnalysis.stress_level,
          events_mentioned: eventAnalysis.events_mentioned,
          event_timestamp: eventAnalysis.event_timestamp
        },
        event_timestamp: eventAnalysis.event_timestamp ? new Date().toISOString() : null
      })
      .eq('id', newUserMsg.id)
  } catch (error) {
    console.error('情绪分析错误:', error)
  }

  // 更新 newUserMsg 包含 event_data
  const { data: updatedUserMsg } = await supabase
    .from('entries')
    .select('*')
    .eq('id', newUserMsg.id)
    .single()

  res.json({
    userMessage: updatedUserMsg || newUserMsg,
    assistantMessage: assistantMsg
  })
})

// ============ 情绪 API ============

app.get('/api/moods', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const { data, error } = await supabase
    .from('moods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// ============ 搜索 API ===========

app.get('/api/search', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const { keyword, startDate, endDate, limit = 50, offset = 0 } = req.query as any

  let query = supabase
    .from('entries')
    .select('id, content, role, created_at')
    .eq('user_id', userId)
    .not('session_id', 'is', null)
    .order('created_at', { ascending: false })

  if (keyword) {
    query = query.ilike('content', `%${keyword}%`)
  }

  if (startDate) {
    query = query.gte('created_at', startDate)
  }

  if (endDate) {
    query = query.lte('created_at', endDate)
  }

  const { data, error } = await query.range(Number(offset), Number(offset) + Number(limit) - 1)

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// ============ 旧版 API（保留兼容性）==========

app.post('/api/entries', verifyToken, async (req: AuthRequest, res) => {
  const { content } = req.body
  if (!content) return res.status(400).json({ error: '内容不能为空' })

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: req.body.userId,
      content
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

app.get('/api/entries', verifyToken, async (req: AuthRequest, res) => {
  const userId = req.body.userId
  const { data, error } = await supabase
    .from('entries')
    .select('id, content, created_at')
    .eq('user_id', userId)
    .is('session_id', null)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Backend API running on http://localhost:${port}`)
})
