'use strict';
// 无界面测试：DNA 确定性、人格、档案卡虚构标记、模拟世界运行、审批流程、PPM→PNG
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
for (const k of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'ALOS_PAYMENT', 'ALOS_EMAIL', 'ALOS_PHONE', 'ALOS_WORLD']) delete process.env[k];
const { generateDNA, validateDNA } = require('../core/dna');
const { buildPersona } = require('../core/persona');
const { AgentEngine } = require('../core/engine');
const { ppmToPng } = require('../core/world/qemuWorld');

(async () => {
  const a = generateDNA('seed-alpha'), b = generateDNA('seed-alpha'), c = generateDNA('seed-beta');
  assert.deepStrictEqual(a, b, '同一 seed 必须生成相同 DNA');
  assert.notDeepStrictEqual(a.genome, c.genome);
  assert.deepStrictEqual(validateDNA(a), []);
  const p = buildPersona(a);
  assert.deepStrictEqual(p, buildPersona(b), '人格必须确定性');
  assert.ok(p.profileCard.fictional && /FICTIONAL/.test(p.profileCard.watermark) && /^ALOS-/.test(p.profileCard.id));
  assert.ok(/归人类操作者所有/.test(p.profileCard.disclaimer));
  console.log('✓ DNA/人格确定性：', p.name, p.profileCard.id, p.traits.join('/'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alos-'));
  const eng = new AgentEngine({ dataDir: dir, seed: 'seed-alpha', dnaOverrides: { genome: { frugality: 0.1 } } });
  await eng.init();
  let approvalsSeen = 0;
  eng.on('approval', async (ap) => { approvalsSeen++; if (approvalsSeen === 1) await eng.approve(ap.id); else eng.reject(ap.id, '测试拒绝'); });
  for (let i = 0; i < 80; i++) await eng.step();
  const s = eng.snapshot();
  console.log(`✓ 运行 ${s.stats.steps} 步：收入 $${s.stats.earned}，支出 $${s.stats.spent}，余额 $${s.adapters.payment.balance}，审批请求 ${approvalsSeen} 次`);
  assert.ok(s.stats.steps === 80);
  assert.ok(s.stats.earned > 0, '应该赚到钱');
  assert.ok(s.timeline.some((e) => e.kind === 'thought') && s.timeline.some((e) => e.kind === 'action'));
  assert.ok(approvalsSeen >= 1, '应该至少触发一次支出审批');
  assert.ok(!s.timeline.some((e) => e.kind === 'money' && /支出/.test(e.text) && !/批准/.test(e.text)), '没有未经批准的支出');
  assert.ok(fs.existsSync(path.join(dir, a.fingerprint, 'w0', 'audit.jsonl')), '审计日志应存在');
  assert.strictEqual(eng.violations.length, 0, '不应违反任何世界定律：' + JSON.stringify(eng.violations.slice(0, 3)));
  console.log('✓ 80 步内未违反任何世界定律（L1–L5）');
  // 未批准前钱包不应扣款
  const before = eng.adapters.payment.balance;
  await eng.requestPayment({ amount: 1, merchant: 'World Shop', memo: '测试' });
  assert.strictEqual(eng.adapters.payment.balance, before, '审批前不得扣款');
  // 接管 + 人工动作
  eng.setTakeover(true); await eng.execute({ type: 'click', target: 'dock:wallet' }, 'human');
  assert.strictEqual(eng.world.openApp, 'wallet');

  const ppm = Buffer.concat([Buffer.from('P6\n2 1\n255\n'), Buffer.from([255, 0, 0, 0, 255, 0])]);
  const png = ppmToPng(ppm);
  assert.ok(png.png.slice(1, 4).toString() === 'PNG' && png.width === 2);
  console.log('✓ QEMU 截图 PPM→PNG 转换');
  console.log('全部测试通过');
  process.exit(0);
})().catch((e) => { console.error('✗', e); process.exit(1); });
