import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { greet, saveEntry, getEntries } from './services/api';
import { syncLocalEntries } from './services/sync';
import { login, signup } from './services/auth';
import ChatInput from './components/ChatInput';
import MoodChart from './components/MoodChart';
function App() {
    const [message, setMessage] = useState('');
    const [entries, setEntries] = useState([]);
    const [syncToken, setSyncToken] = useState(() => localStorage.getItem('treehole_auth_token') || '');
    const [syncMessage, setSyncMessage] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [loggedInEmail, setLoggedInEmail] = useState(() => localStorage.getItem('treehole_user_email') || '');
    const loadEntries = async () => {
        const list = await getEntries();
        setEntries(list);
    };
    useEffect(() => {
        loadEntries();
    }, []);
    const handleSend = async (content) => {
        await saveEntry(content);
        await loadEntries();
    };
    const handleSync = async () => {
        try {
            setSyncMessage('同步中...');
            const result = await syncLocalEntries(syncToken);
            setSyncMessage(`已同步 ${result.synced} 条本地记录。`);
            await loadEntries();
        }
        catch (error) {
            setSyncMessage(error instanceof Error ? error.message : '同步失败');
        }
    };
    const handleTokenSave = () => {
        localStorage.setItem('treehole_auth_token', syncToken);
        localStorage.setItem('treehole_user_email', email);
        setLoggedInEmail(email);
        setAuthMessage('登录令牌已保存。');
    };
    const validateEmail = (value) => {
        if (!value.trim())
            return '请输入邮箱。';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
            return '请输入有效邮箱，例如 user@example.com。';
        return '';
    };
    const validatePassword = (value) => {
        if (!value.trim())
            return '请输入密码。';
        if (value.length < 8)
            return '密码长度至少 8 位。';
        if (!/[A-Za-z]/.test(value) || !/\d/.test(value))
            return '建议密码包含字母和数字。';
        return '';
    };
    const handleAuthValidation = () => {
        const newEmailError = validateEmail(email);
        const newPasswordError = validatePassword(password);
        setEmailError(newEmailError);
        setPasswordError(newPasswordError);
        return !newEmailError && !newPasswordError;
    };
    const handleLogin = async () => {
        if (!handleAuthValidation()) {
            setAuthMessage('请按上方提示修正登录信息后重试。');
            return;
        }
        const result = await login(email, password);
        if (result.error) {
            setAuthMessage(result.error);
            return;
        }
        if (result.token) {
            setSyncToken(result.token);
            handleTokenSave();
            setAuthMessage('登录成功。');
        }
    };
    const handleSignup = async () => {
        if (!handleAuthValidation()) {
            setAuthMessage('请按上方提示修正注册信息后重试。');
            return;
        }
        const result = await signup(email, password);
        if (result.error) {
            setAuthMessage(result.error);
            return;
        }
        if (result.token) {
            setSyncToken(result.token);
            handleTokenSave();
            setAuthMessage('注册成功，已保存令牌。');
        }
    };
    return (_jsxs("div", { style: { padding: 24, fontFamily: 'system-ui, sans-serif' }, children: [_jsx("h1", { children: "Personal Treehole" }), _jsx("p", { children: message }), _jsx("button", { onClick: async () => setMessage(await greet('Wynn')), children: "\u6D4B\u8BD5\u540E\u7AEF" }), _jsxs("div", { style: { marginTop: 20, padding: 12, border: '1px solid #ddd', borderRadius: 10 }, children: [_jsx("h2", { children: "\u540C\u6B65\u767B\u5F55" }), loggedInEmail ? (_jsxs("p", { children: ["\u5DF2\u767B\u5F55\uFF1A", loggedInEmail] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: 'block', marginBottom: 10 }, children: ["\u90AE\u7BB1", _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), onBlur: () => setEmailError(validateEmail(email)), style: { width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ccc' } }), _jsx("div", { style: { marginTop: 6, fontSize: 14, color: emailError ? '#dc2626' : '#6b7280' }, children: emailError || '请输入常用邮箱，例如 user@example.com' })] }), _jsxs("label", { style: { display: 'block', marginBottom: 10 }, children: ["\u5BC6\u7801", _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), onBlur: () => setPasswordError(validatePassword(password)), style: { width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ccc' } }), _jsx("div", { style: { marginTop: 6, fontSize: 14, color: passwordError ? '#dc2626' : '#6b7280' }, children: passwordError || '密码至少 8 位，建议包含字母和数字' })] }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 10 }, children: [_jsx("button", { onClick: handleLogin, style: { padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#2563eb', color: '#fff' }, children: "\u767B\u5F55" }), _jsx("button", { onClick: handleSignup, style: { padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#f59e0b', color: '#fff' }, children: "\u6CE8\u518C" })] })] })), _jsx("div", { style: { marginTop: 20 }, children: _jsx("button", { onClick: handleSync, style: { padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#10b981', color: '#fff' }, children: "\u540C\u6B65\u672C\u5730\u8BB0\u5F55" }) }), _jsx("p", { style: { marginTop: 10, color: '#4b5563' }, children: authMessage || syncMessage })] }), _jsx(ChatInput, { onSend: handleSend }), _jsxs("div", { style: { marginTop: 24 }, children: [_jsx("h2", { children: "Recent Entries" }), entries.map((entry) => (_jsxs("div", { style: { marginBottom: 12, padding: 12, border: '1px solid #ddd' }, children: [_jsx("div", { children: new Date(entry.created_at).toLocaleString() }), _jsx("div", { children: entry.content })] }, entry.id)))] }), _jsx(MoodChart, {})] }));
}
export default App;
