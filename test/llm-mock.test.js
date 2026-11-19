'use strict';
// 用本地假 OpenAI 兼容服务验证 LLM 决策链路（无需真实 Key）
const http = require('http');
const assert = require('assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
let calls = 0;
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    calls++;
    const j = JSON.parse(body);
    assert.ok(j.messages[0].content.includes('虚构 AI 角色'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ thought: '先打开邮件看看', action: { type: 'click', target: 'dock:mail' } }) } }] }));
  });
});
srv.listen(0, '127.0.0.1', async () => {
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${srv.address().port}/v1`;
  process.env.OPENAI_MODEL = 'mock-model'; delete process.env.OPENAI_API_KEY;
  const { AgentEngine } = require('../core/engine');
  const eng = new AgentEngine({ seed: 'llm', dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'alos-llm-')) });
  await eng.init(); await eng.step();
  assert.strictEqual(calls, 1); assert.strictEqual(eng.world.openApp, 'mail');
  assert.ok(eng.timeline.some((e) => e.kind === 'thought' && e.source === 'llm'));
  console.log('✓ OpenAI 兼容 LLM 决策链路正常'); srv.close(); process.exit(0);
});
