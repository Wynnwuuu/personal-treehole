import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chat, analyzeEvent } from './services/deepseek'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

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
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码。' })
  if (!isValidEmail(email)) return res.status(400).json({ error: '邮箱格式不正确，请使用 user@example.com 这样的邮箱地址。' })
  if (!isStrongPassword(password)) return res.status(400).json({ error: '密码长度至少 8 位，建议包含字母和数字。' })

  const passwordHash = await bcrypt.hash(password, 10)
  const { data, error } = await supabase.from('users').insert({ email, password_hash: passwordHash }).select().single()

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

  res.json({ token: createToken(data.id) })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码。' })
  if (!isValidEmail(email)) return res.status(400).json({ error: '邮箱格式不正确，请使用 user@example.com 这样的邮箱地址。' })

  const { data, error } = await supabase.from('users').select('*').eq('email', email).single()
  if (error || !data) return res.status(401).json({ error: '邮箱或密码不正确，请检查后重试。' })

  const match = await bcrypt.compare(password, data.password_hash)
  if (!match) return res.status(401).json({ error: '邮箱或密码不正确，请检查后重试。' })

  res.json({ token: createToken(data.id) })
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
    .order('created_at', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
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

  // 获取会话历史
  const { data: historyData } = await supabase
    .from('entries')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  console.log('[API] History data:', historyData)

  const sessionHistory = (historyData || []).map((entry: any) => ({
    role: entry.role as 'user' | 'assistant',
    content: entry.content
  }))

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

  // 存储用户消息
  const { data: userMessage, error: userMsgError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content,
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
    userMessage,
    assistantMessage
  })
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

  // 更新消息内容
  const { data: updatedEntry, error: updateError } = await supabase
    .from('entries')
    .update({
      content: content.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError) return res.status(400).json({ error: updateError.message })
  res.json(updatedEntry)
})

// ============ 情绪 API ===========

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
