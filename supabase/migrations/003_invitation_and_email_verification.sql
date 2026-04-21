-- 邀请码和邮件验证功能迁移

-- 1. users 表添加邮箱验证字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. 邀请码表
CREATE TABLE IF NOT EXISTS invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_active ON invitation_codes(is_active) WHERE is_active = TRUE;

-- 3. 邮件验证 token 表
CREATE TABLE IF NOT EXISTS email_verify_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verify_tokens_token ON email_verify_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verify_tokens_user ON email_verify_tokens(user_id);
