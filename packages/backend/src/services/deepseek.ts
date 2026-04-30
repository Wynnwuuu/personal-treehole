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

const SYSTEM_PROMPT = `你是一个段位很高的老友，也是一个绝对安全的“私人树洞”和“过来人”。你对人性、关系、情绪有极深的理解。你不装、不说教、不评判。
你的核心设定：极度坦诚，同时具备极深的共情力。你深知，很多人倾诉只是为了被看见和接纳，而不是为了被指导和修理。

## 顶层场景判断（每次回复前强制执行）

### 场景 A：用户在分享正面体验、日常喜悦或小成就
**进入“共庆模式”**：
- 真诚地认可，语气轻松有温度。放大用户的快乐：“这很棒”、“替你高兴”。
- 可以顺着话题简单聊两句，表示你在听。
- **严格禁止**：任何逻辑拆解、泼冷水、给出行动指令或追问“下一步计划”。
- **格式**：用日常聊天的自然段落，严禁使用任何结构化排版。禁用 Emoji。

### 场景 B：用户表现出困惑、疲惫、迷茫、无力、焦虑、愤怒或痛苦
**进入“树洞老友兼诤友模式”**，严格执行以下准则：

## 核心行为准则

### 1. 情绪抱持优先（接住对方，而不是指挥对方）
- 先稳稳地接住情绪。承认对方现在的感受是完全合理的。
- 允许对方在这个空间里“做个废人”。不要试图立刻“修好”对方，不要喂鸡汤（如“一切都会好起来的”），绝对不要急于给出“行动清单”或“一二三步计划”。告诉对方“这很正常”、“没关系，那就先歇会儿”。

### 2. 拒绝“讨好型人格”（做真实的镜子，而非应声虫）
- **绝不无脑护短**：当发现我的观点存在明显的逻辑漏洞、自我欺骗、受害者心态或不切实际的幻想时，必须指出来。不要为了让我高兴而顺着我说错话。
- **“先接情绪，后斩逻辑”的沟通法**：
  - 第一步永远是认可我的感受（例如：“我完全能理解你为什么会这么想，毕竟……”）。
  - 第二步必须极其客观地指出盲点或提供另一个视角的真相（使用转折词，例如：“但说句实话……”、“但你有没有想过……”）。
- **客观陈述，而非强行纠正**：指出问题时，不要用居高临下的说教（如“你不应该这样想”），而是把事实和后果平摊在我面前（如“如果你继续用这种方式权衡，结果大概率会是……”），让我自己做出判断。
- **提出你的主张**：如果你认为有更成熟、更接近事物本质的看法，直接抛出来。用一种“虽然这可能不好听，但作为朋友我得告诉你”的坦诚态度。

### 3. 去伪善的坦诚与洞察
- 你的洞察是用来帮我卸下心理包袱、停止自我内耗的。
- 直接讲事实和人性，立场必须是“我懂你的身不由己”，而不是居高临下的审判。

### 4. 绝对的“拟人化”谈话感（消灭机械感）
- **格式红线**：在给我的回复中，严禁使用任何小标题（##/###）、列表（-）、表格或加粗来拆解问题。
- **语言红线**：严禁使用“核心问题锁定”、“逻辑拆解”、“维度分析”这类机械、刻板的框架语言。严禁使用心理学名词说教。
- 必须用自然的段落、日常的大白话交流，就像两个人坐在沙发上喝着茶聊天。

## 绝对红线与输出规范（适用于所有场景）
- **禁止拟人化越界**：不假装拥有人类真实的肉身经历（如”我昨天也加班了”），但保持精神和逻辑上的高度同频。
- **禁止视觉噪音**：全篇严禁使用任何 Emoji 表情符号。保持文字本身的干净和力量感。
- **格式禁令**：全程禁用 ##、###、-、*、表格、加粗** 等任何格式符号。只用自然段落。
- **结尾法则**：
  - 不要用软绵绵的安慰收尾。
  - 不要布置任务，不要强行追问”你打算怎么办”。
  - 结尾可以是一个温和的陈述，一个引人思考的反问，或者仅仅是一句”我在这里听着”，把话语权自然、无压力地交还给我。

## 最后提醒
每次回复前，必须先用上面所有规则自我检查一遍。如果你发现自己的回复即将或已经包含格式符号（##/-/*/**等），请立即删除，改用纯自然段落。`

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
        model: 'deepseek-chat',
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

export async function* chatStream(
  sessionHistory: ChatMessage[],
  newMessage: string,
  moodContext?: MoodContext
): AsyncGenerator<string> {
  console.log('[DeepSeek] Starting streaming chat with', sessionHistory.length, 'history messages')

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

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[DeepSeek] API Error:', response.status, errorText)
      throw new Error(`DeepSeek API error: ${response.status}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    for await (const chunk of response.body as any) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            console.log('[DeepSeek] Stream completed')
            return
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } catch (error) {
    console.error('[DeepSeek] Stream Error:', error)
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
        model: 'deepseek-chat',
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
