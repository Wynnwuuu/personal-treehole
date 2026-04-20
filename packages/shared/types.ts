export interface Mood {
  id: string
  entry_id: string
  user_id: string
  sentiment_score: number
  primary_mood: string
  mood_tags: string[]
  energy_level: number
  stress_level: number
  events_mentioned: string[]
  event_timestamp: string | null
  created_at: string
}

export interface Entry {
  id: string
  user_id: string
  session_id?: string
  content: string
  role?: 'user' | 'assistant'
  created_at: string
  updated_at?: string
  is_deleted?: boolean
}

export interface EventAnalysis {
  mood: string
  sentiment_score: number
  energy_level: number
  stress_level: number
  events_mentioned: string[]
  event_timestamp: string | null
}

export interface User {
  id: string
  email: string
}

export interface Session {
  id: string
  user_id: string
  title: string
  started_at: string
  created_at: string
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
