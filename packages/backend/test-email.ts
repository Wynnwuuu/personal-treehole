const tencentcloud = require('tencentcloud-sdk-nodejs');

// 使用环境变量方式配置腾讯云密钥
// SECRET_ID 和 SECRET_KEY 应该通过环境变量设置，不要硬编码在代码中
const REGION = 'ap-guangzhou';
const SENDER_EMAIL = 'noreply@personal-treehole.chat';

async function main() {
  const SESClient = tencentcloud.ses.v20201002.Client;

  const client = new SESClient({
    credential: {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
    },
    region: REGION,
  });

  try {
    const result = await client.SendEmail({
      FromEmailAddress: SENDER_EMAIL,
      Destination: ['578716572@qq.com'],
      Subject: 'Personal Treehole 邮箱验证',
      HtmlBody: '<p>这是一封测试邮件，来自 Personal Treehole。</p><p>如果你收到这封邮件，说明配置成功！</p>',
      TextBody: '这是一封测试邮件，来自 Personal Treehole。',
    });

    console.log('[Email] Sent successfully:', JSON.stringify(result, null, 2));
    console.log('发送结果: true');
  } catch (error) {
    console.error('[Email] Send failed:', error);
    console.log('发送结果: false');
  }
}

main();