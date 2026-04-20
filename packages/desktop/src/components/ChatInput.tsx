import { useState } from 'react'

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState('')

  return (
    <div style={{ marginTop: 16 }}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc' }}
      />
      <button
        style={{ marginTop: 8, padding: '10px 16px', borderRadius: 6, border: 'none', backgroundColor: '#4d7cfe', color: '#fff' }}
        onClick={async () => {
          await onSend(text)
          setText('')
        }}
      >
        保存日记
      </button>
    </div>
  )
}
