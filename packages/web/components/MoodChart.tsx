'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Mood {
  id: string
  sentiment_score: number
  created_at: string
}

interface MoodChartProps {
  moods: Mood[]
}

export default function MoodChart({ moods }: MoodChartProps) {
  const data = moods
    .slice(0, 12)
    .map((mood) => ({
      date: new Date(mood.created_at).toLocaleDateString('zh-CN'),
      sentiment: mood.sentiment_score
    }))

  return (
    <section style={{ marginTop: 24, padding: 20, border: '1px solid #ddd', borderRadius: 12, backgroundColor: '#fff' }}>
      <h2>情绪趋势</h2>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Line type="monotone" dataKey="sentiment" stroke="#4f46e5" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
