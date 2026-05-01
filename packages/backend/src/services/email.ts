import dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../../.env') })

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || ''
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || ''
const TENCENT_SES_SENDER_EMAIL = process.env.TENCENT_SES_SENDER_EMAIL || ''
const TENCENT_SES_TEMPLATE_ID = process.env.TENCENT_SES_TEMPLATE_ID || ''

console.log('[Email] Tencent config loaded:', {
  hasSecretId: !!TENCENT_SECRET_ID,
  hasSecretKey: !!TENCENT_SECRET_KEY,
  hasSenderEmail: !!TENCENT_SES_SENDER_EMAIL,
  hasTemplateId: !!TENCENT_SES_TEMPLATE_ID
})

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text: string
  templateData?: Record<string, string>
}

export async function sendEmail({ to, subject, html, text, templateData }: SendEmailParams): Promise<boolean> {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY || !TENCENT_SES_SENDER_EMAIL || !TENCENT_SES_TEMPLATE_ID) {
    console.error('[Email] Tencent SES configuration incomplete:', {
      hasSecretId: !!TENCENT_SECRET_ID,
      hasSecretKey: !!TENCENT_SECRET_KEY,
      hasSenderEmail: !!TENCENT_SES_SENDER_EMAIL,
      hasTemplateId: !!TENCENT_SES_TEMPLATE_ID
    })
    return false
  }

  return sendViaTencentSES(to, subject, templateData || { name: '用户' })
}

async function sendViaTencentSES(to: string, subject: string, templateData: Record<string, string>): Promise<boolean> {
  const tencentcloud = require('tencentcloud-sdk-nodejs')

  const SESClient = tencentcloud.ses.v20201002.Client

  const client = new SESClient({
    credential: {
      secretId: TENCENT_SECRET_ID,
      secretKey: TENCENT_SECRET_KEY
    },
    region: 'ap-hongkong'
  })

  try {
    const result = await client.SendEmail({
      FromEmailAddress: TENCENT_SES_SENDER_EMAIL,
      Destination: [to],
      Subject: subject,
      Template: {
        TemplateID: parseInt(TENCENT_SES_TEMPLATE_ID, 10),
        TemplateData: JSON.stringify(templateData)
      },
      TriggerType: 1
    })

    console.log('[Email] Sent via Tencent SES successfully to:', to, JSON.stringify(result))
    return true
  } catch (error) {
    console.error('[Email] Tencent SES send failed:', error)
    return false
  }
}

export function generateVerifyEmailHtml(token: string): { html: string; text: string } {
  const verifyUrl = `${FRONTEND_URL}/verify-email/${token}`

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>树洞验证邮件 · 深色主题</title>
</head>
<body style="margin:0; padding:0; background-color:#0C0F0E; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0C0F0E" style="background-color:#0C0F0E;">
        <tr>
            <td align="center" style="padding: 40px 16px;">
                <table width="100%" max-width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%; background-color:#141A18; border-radius: 32px; border: 1px solid #2A3A34; box-shadow: 0 20px 35px -12px rgba(0,0,0,0.5); overflow:hidden;">
                    <tr>
                        <td style="padding: 32px 28px 16px; text-align: center; border-bottom: 1px solid #2A3A34;">
                            <div style="font-size: 42px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🌑</div>
                            <h1 style="margin: 12px 0 4px; font-size: 26px; font-weight: 500; color: #E0F2E9; letter-spacing: -0.2px;">Personal Treehole</h1>
                            <p style="margin: 0; font-size: 13px; color: #7E8D85;">你的安静回响 · 匿名寄存处</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 28px 28px;">
                            <h2 style="font-size: 20px; font-weight: 500; color: #C3E0D4; margin: 0 0 12px 0;">✧ 验证你的邮箱 ✧</h2>
                            <p style="font-size: 15px; line-height: 1.5; color: #C9D4CF; margin: 0 0 18px 0;">你好，树洞的朋友：</p>
                            <p style="font-size: 15px; line-height: 1.55; color: #B9C7C0; margin: 0 0 24px 0;">感谢你选择 <strong style="color:#B3E4CD;">Personal Treehole</strong> —— 一个深色里也可以安心倾诉的地方。点击下方按钮验证邮箱，之后便能匿名记录心事，或收到来自树洞的回响。</p>
                            <div style="text-align: center; margin: 28px 0 24px;">
                                <a href="${verifyUrl}" style="display: inline-block; background-color: #2B7A62; color: #F2FFF9; text-decoration: none; font-size: 16px; font-weight: 600; padding: 12px 32px; border-radius: 60px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); letter-spacing: 0.3px;">🔓 验证并进入树洞</a>
                            </div>
                            <p style="font-size: 12px; color: #7A9085; margin: 28px 0 0; border-top: 1px solid #28332E; padding-top: 22px;">⏱️ 链接有效期 <strong>30分钟</strong>。若未注册过 Personal Treehole，请忽略这封邮件，抱歉打扰。</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0F1412; padding: 18px 28px; text-align: center; border-top: 1px solid #202A26;">
                            <p style="margin: 0 0 5px; font-size: 12px; color: #7A8F85;">🌲 树洞里没有评价，只有倾听。随时回来。</p>
                            <p style="margin: 0; font-size: 11px; color: #55685E;">—— 树洞守护者 · 系统邮件，请勿直接回复 ——</p>
                        </td>
                    </tr>
                </table>
                <p style="max-width:560px; margin-top: 24px; font-size: 11px; color:#4A5D55; text-align:center;">Personal Treehole · 深色庇护所</p>
            </td>
        </tr>
    </table>
</body>
</html>`

  const text = `Personal Treehole - 邮箱验证

你好，树洞的朋友：

感谢你选择 Personal Treehole！请访问以下链接验证你的邮箱：

${verifyUrl}

此链接有效期为 30 分钟。

若未注册过 Personal Treehole，请忽略此邮件。

—— 树洞守护者 ——`

  return { html, text }
}

export function generateInvitationCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}