'use strict';
// OpenAI 兼容的 Chat Completions 客户端（OpenAI / DeepSeek / Qwen / Ollama / vLLM 等均可）
function llmConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.OPENAI_MODEL || '',
    vision: process.env.OPENAI_VISION !== '0',
  };
}
function llmEnabled() { const c = llmConfig(); return !!(c.model && (c.apiKey || /localhost|127\.0\.0\.1/.test(c.baseUrl))); }

async function chatJSON(messages, { temperature = 0.4, timeoutMs = 60000 } = {}) {
  const c = llmConfig();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({ model: c.model, messages, temperature, response_format: { type: 'json_object' } }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`LLM ${res.status}: ${j.error?.message || JSON.stringify(j).slice(0, 200)}`);
    const txt = j.choices?.[0]?.message?.content || '{}';
    const m = txt.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : txt);
  } finally { clearTimeout(t); }
}
module.exports = { chatJSON, llmEnabled, llmConfig };
