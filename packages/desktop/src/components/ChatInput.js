import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export default function ChatInput({ onSend }) {
    const [text, setText] = useState('');
    return (_jsxs("div", { style: { marginTop: 16 }, children: [_jsx("textarea", { value: text, onChange: (event) => setText(event.target.value), rows: 5, style: { width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc' } }), _jsx("button", { style: { marginTop: 8, padding: '10px 16px', borderRadius: 6, border: 'none', backgroundColor: '#4d7cfe', color: '#fff' }, onClick: async () => {
                    await onSend(text);
                    setText('');
                }, children: "\u4FDD\u5B58\u65E5\u8BB0" })] }));
}
