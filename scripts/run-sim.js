'use strict';
// 命令行运行模拟世界（无界面）：node scripts/run-sim.js [seed] [steps]
const path = require('path');
require('../core/env').loadEnv(path.join(__dirname, '..', '.env'));
const { AgentEngine } = require('../core/engine');
(async () => {
  const [seed, steps = 40] = process.argv.slice(2);
  const eng = new AgentEngine({ seed, dataDir: path.join(__dirname, '..', '.alos-data') });
  eng.on('event', (e) => console.log(`[${e.clock}] ${e.kind.padEnd(7)} ${e.text}`));
  eng.on('approval', (ap) => { console.log(`>>> 命令行模式自动拒绝支出请求（请在桌面端人工审批）：${ap.memo} $${ap.amount}`); eng.reject(ap.id, 'CLI 模式'); });
  await eng.init();
  console.log(`\n智能体：${eng.persona.name}  档案卡：${eng.persona.profileCard.id}（虚构）`);
  for (let i = 0; i < Number(steps); i++) await eng.step();
  const s = eng.snapshot();
  console.log(`\n结束：收入 $${s.stats.earned}，支出 $${s.stats.spent}，余额 $${s.adapters.payment.balance}`);
  process.exit(0);
})();
