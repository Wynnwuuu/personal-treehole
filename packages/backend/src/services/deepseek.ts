import dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config({ path: '/Users/apple/Desktop/code/Personal_treehole/packages/backend/.env' })

const apiKey = process.env.DEEPSEEK_API_KEY || ''
const baseUrl = 'https://api.deepseek.com/v1'

export interface EventAnalysis {
  mood: string
  sentiment_score: number
  energy_level: number
  stress_level: number
  events_mentioned: string[]
  event_timestamp: string | null
}

export interface MoodContext {
  events_mentioned: string[]
  sentiment_score: number
  energy_level: number
  stress_level: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `你是一位温暖、有同理心的心理健康伴侣。用户会分享他们的生活经历和情绪，你需要进行：
1. 真诚、有温度的对话回应，但也需要分析用户的情绪状态和事件背景，提供有针对性的支持和建议，不要只顺着用户的话来说。
2. 在回复中体现对其经历的理解和共情
3. 根据用户的情绪和问题难易程度进行回复长度的控制，情绪糟糕或问题复杂时可以适当增加回复长度，提供更细致的分析和建议；情绪较好或问题简单时可以保持简洁，避免过度分析。
4. 提炼用户分享的事件或时间点（如有），在分析时标注出来`

export async function chat(
  sessionHistory: ChatMessage[],
  newMessage: string,
  moodContext?: MoodContext
): Promise<string> {
  console.log('[DeepSeek] Starting chat with', sessionHistory.length, 'history messages')

  const historyText = sessionHistory
    .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
    .join('\n')

  let contextInfo = ''
  if (moodContext) {
    const events = moodContext.events_mentioned.length > 0
      ? moodContext.events_mentioned.join('、')
      : '暂无'
    contextInfo = `\n\n【用户情绪背景】\n近期事件：${events}\n情绪指数：${moodContext.sentiment_score.toFixed(2)}\n能量水平：${moodContext.energy_level.toFixed(2)}\n压力指数：${moodContext.stress_level.toFixed(2)}`
  }

  const prompt = `${historyText}${contextInfo}\n\n用户: ${newMessage}`
  console.log('[DeepSeek] Prompt:', prompt.slice(0, 300))

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[DeepSeek] API Error:', response.status, errorText)
      throw new Error(`DeepSeek API error: ${response.status}`)
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const text = data.choices[0]?.message?.content || ''
    console.log('[DeepSeek] Response:', text.slice(0, 200))
    return text
  } catch (error) {
    console.error('[DeepSeek] Error:', error)
    throw error
  }
}

export async function analyzeEvent(content: string): Promise<EventAnalysis> {
  console.log('[DeepSeek] Analyzing event...')

  try {
    const prompt = `请分析下面这条消息，提取情绪和事件信息，返回 JSON 格式：

{
  "mood": "happy|sad|anxious|calm|angry|neutral|confused",
  "sentiment_score": 0.0-1.0,
  "energy_level": 0.0-1.0,
  "stress_level": 0.0-1.0,
  "events_mentioned": ["事件描述1", "事件描述2"],
  "event_timestamp": "如果用户提到具体时间（如今天、昨天、周三、3天前等），返回相对时间描述，否则返回 null"
}

重要：events_mentioned 数组中的每个事件只需概括事件本身，不要包含时间信息。例如："加班到很晚"、"考试没考好"、"和朋友吵架"，不要写成"加班到很晚 (今天)"。

消息内容：
${content}

请只返回 JSON，不要其他文字。`

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [
          { role: 'system', content: '你是一位专业心理分析师，擅长从用户描述中提取情绪事件。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[DeepSeek] Event Analysis API Error:', response.status, errorText)
      throw new Error(`DeepSeek API error: ${response.status}`)
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const text = data.choices[0]?.message?.content || ''
    const jsonString = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}'

    const result = JSON.parse(jsonString)
    return {
      mood: result.mood || 'neutral',
      sentiment_score: result.sentiment_score ?? 0.5,
      energy_level: result.energy_level ?? 0.5,
      stress_level: result.stress_level ?? 0.5,
      events_mentioned: result.events_mentioned || [],
      event_timestamp: result.event_timestamp || null
    }
  } catch (error) {
    console.error('[DeepSeek] Event Analysis Error:', error)
    return {
      mood: 'neutral',
      sentiment_score: 0.5,
      energy_level: 0.5,
      stress_level: 0.5,
      events_mentioned: [],
      event_timestamp: null
    }
  }
}
