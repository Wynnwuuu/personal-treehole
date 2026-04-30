import dotenv from 'dotenv'
import { chat } from './src/services/deepseek'

dotenv.config({ path: './.env' })

async function test() {
  const testCases = [
    "回重庆了，但是小猫在家，过敏了猫毛，昨天一晚上都没有睡好"
  ]

  console.log('========== 开始测试 System Prompt ==========\n')

  for (const msg of testCases) {
    console.log(`【用户】: ${msg}`)
    process.stdout.write('【AI】: ')
    try {
      const response = await chat([], msg)
      console.log(response)
    } catch (error) {
      console.error('错误:', error)
    }
    console.log('\n---\n')
  }

  console.log('========== 测试完成 ==========')
}

test()
