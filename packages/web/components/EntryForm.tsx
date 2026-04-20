'use client'

import { useState } from 'react'
import { createEntry } from '../lib/api'

interface EntryFormProps {
  onSaved: () => void
}

export default function EntryForm({ onSaved }: EntryFormProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async () => {
    if (!text.trim()) {
      setStatus('内容不能为空。')
      return
    }

    try {
      await createEntry(text, [])
      setText('')
      setStatus('已保存。')
      onSaved()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败，请重试。')
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2>写下一条记录</h2>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ccc' }}
      />
      <button
        onClick={handleSubmit}
        style={{ marginTop: 12, padding: '10px 18px', borderRadius: 10, backgroundColor: '#2563eb', color: '#fff', border: 'none' }}
      >
        保存
      </button>
      <p style={{ marginTop: 10, color: '#4b5563' }}>{status}</p>
    </div>
  )
}
