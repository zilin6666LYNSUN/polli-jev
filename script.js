/* =====================================================================
 * Jev 裁决台 · 核心逻辑
 * 调用 Pollinations /alpha/decisions 让 Jev 做结构化决策，
 * 未连接钱包时展示预置演示数据（绝不阻塞）。
 *
 * 结构：
 *   1. 工具函数
 *   2. BYOP 登录（fragment flow，key 仅存内存）
 *   3. callJev：POST /alpha/decisions
 *   4. 演示数据（三组示例请求 + 响应）
 *   5. 各页签请求构造与渲染（裁决卡 / 过滤列表 / 紧急度仪表）
 *   6. 历史决策记录（localStorage）
 *   7. 事件绑定与初始化
 * ===================================================================== */
'use strict';

/* ==================== 1. 工具函数 ==================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const uid = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function Toast(msg) {
  const box = $('#toast');
  const txt = $('#toast-text');
  if (!box || !txt) return;
  txt.textContent = msg;
  box.classList.remove('hidden');
  clearTimeout(Toast._t);
  Toast._t = setTimeout(() => box.classList.add('hidden'), 2800);
}

/** 简易 loading 骨架 */
function loadingHTML(tip) {
  return '<div class="loading-box"><div class="spinner"></div><span>' + esc(tip) + '</span></div>';
}

function errorHTML(msg) {
  return '<div class="err-box">⚠ ' + esc(msg) +
    '<div class="retry-row"><button class="btn btn-small btn-primary" data-retry="1">↻ 重试</button>' +
    '<button class="btn btn-small btn-ghost" data-cancel="1">取消</button></div></div>';
}

/* ==================== 2. BYOP 登录 ==================== */

const BYOP = {
  key: null,
  loggedIn: false,

  init() {
    try {
      const m = location.hash.match(/api_key=(sk_[A-Za-z0-9_-]+)/);
      if (m) {
        this.key = m[1];
        this.loggedIn = true;
        /* 清空 hash：key 只保存在内存，绝不落盘 */
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
    this.updateUI();
  },

  login() {
    const redirect = encodeURIComponent(location.href.split('#')[0]);
    location.href = 'https://enter.pollinations.ai/authorize?redirect_uri=' + redirect + '&scope=usage&client_id=';
  },

  logout() {
    this.key = null;
    this.loggedIn = false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    this.updateUI();
    Toast('已退出，回到演示模式');
  },

  updateUI() {
    const status = $('#byop-status');
    if (status) {
      status.textContent = this.loggedIn ? '✓ 已连接 · 实时调用 Jev' : '演示模式';
      status.style.color = this.loggedIn ? '#3ee08b' : '#8b96b8';
    }
    const btnIn = $('#btn-byop-login');
    const btnOut = $('#btn-byop-logout');
    if (btnIn) btnIn.classList.toggle('hidden', this.loggedIn);
    if (btnOut) btnOut.classList.toggle('hidden', !this.loggedIn);
  }
};

/* ==================== 3. callJev ==================== */

/**
 * 调用 Pollinations /alpha/decisions。
 * 需 BYOP 登录；未登录返回 null（由调用方走演示模式）。
 */
async function callJev(state, questions) {
  if (!BYOP.loggedIn || !BYOP.key) return null;
  const resp = await fetch('https://gen.pollinations.ai/alpha/decisions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + BYOP.key
    },
    body: JSON.stringify({ state: state, questions: questions })
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      /* token 失效：自动退出回演示模式 */
      BYOP.loggedIn = false;
      BYOP.key = null;
      BYOP.updateUI();
      return null;
    }
    throw new Error('Jev 请求失败（HTTP ' + resp.status + '）');
  }
  const data = await resp.json();
  return data;
}

/* ==================== 4. 演示数据 ==================== */

const DEMO = {
  startup: {
    state: '面向自由职业者的 AI 记账工具，按月订阅 9.9 美元，已有 200 人内测，留存 40%。同类产品至少 5 个且头部获客凶猛，但用户反馈"自动分类准"是强需求，且有稳定付费意愿。',
    questions: {
      verdict: {
        type: 'choice',
        instructions: '判断该创业点子应该 Kill、Fix 还是 Ship。',
        criteria: {
          kill: '无市场或存在致命缺陷',
          fix: '需转型或补强后才能做',
          ship: '有强烈需求信号，可以上线'
        }
      }
    },
    answers: {
      verdict: {
        type: 'choice',
        choice: 'fix',
        confidence: 0.82,
        probabilities: { kill: 0.24, fix: 0.51, ship: 0.25 },
        explanation: '需求真实（付费意愿与留存都不错），但红海竞争 + 获客成本高是主要风险。建议聚焦单一细分职业（如自由设计师）先 Fix 出差异化，再 Ship。'
      }
    }
  },
  filter: {
    state: '逐项评估下列头条的新闻价值与可信度，分数越高代表越值得关注且可信。',
    items: [
      '某明星宣布进军 NFT 市场，粉丝反响平平',
      '科学家证实室温超导重大突破，多团队复现成功',
      'AI 帮助医生提前 10 年发现阿尔茨海默症',
      '某新能源车企发布新款车型，售价 12 万起',
      '监管部门拟出台新规，规范直播带货行业'
    ],
    questions: {
      item1: { type: 'score', instructions: '评估第 1 条头条的新闻价值与可信度（0-100 分）' },
      item2: { type: 'score', instructions: '评估第 2 条头条的新闻价值与可信度（0-100 分）' },
      item3: { type: 'score', instructions: '评估第 3 条头条的新闻价值与可信度（0-100 分）' },
      item4: { type: 'score', instructions: '评估第 4 条头条的新闻价值与可信度（0-100 分）' },
      item5: { type: 'score', instructions: '评估第 5 条头条的新闻价值与可信度（0-100 分）' }
    },
    answers: {
      item1: { type: 'score', score: 18, legend: '娱乐八卦，可信度低，商业价值一般', confidence: 0.9 },
      item2: { type: 'score', score: 74, legend: '重大科学突破，影响面广', confidence: 0.85 },
      item3: { type: 'score', score: 88, legend: '医疗 AI 里程碑，社会价值高', confidence: 0.93 },
      item4: { type: 'score', score: 41, legend: '行业常规动态，价值一般', confidence: 0.78 },
      item5: { type: 'score', score: 63, legend: '政策相关，值得跟踪', confidence: 0.8 }
    }
  },
  urgency: {
    state: '服务器数据库被误删，备份在另一台机器上，客户明天就要验收，我在外地出差，身边只有一台笔记本。',
    questions: {
      urgency: {
        type: 'noul',
        instructions: '评估该求助的紧急程度，0 表示完全不紧急，1 表示极其紧急。'
      }
    },
    answers: {
      urgency: { type: 'noul', noul: 0.92 }
    }
  }
};

/* ==================== 5. 渲染与请求 ==================== */

const TAB_META = {
  startup: { label: '🚀 创业点子裁决', demoKey: 'startup' },
  filter: { label: '🧪 语义过滤器', demoKey: 'filter' },
  urgency: { label: '🚨 紧急度判断', demoKey: 'urgency' }
};

/** 从响应 answers 提取字符串依据说明（兼容不同字段名） */
function getExplain(ans) {
  if (!ans) return '';
  return ans.explanation || ans.reasoning || ans.summary || ans.rationale || '';
}

/** 创业点子裁决：choice 渲染 */
function renderStartup(answers) {
  const ans = answers.verdict || answers.startup || Object.values(answers)[0];
  if (!ans) return '<div class="err-box">⚠ 响应缺少裁决字段</div>';
  const choice = String(ans.choice || '').toLowerCase();
  const conf = Math.round((ans.confidence != null ? ans.confidence : 0.5) * 100);
  const probs = ans.probabilities || {};
  const names = { kill: ['KILL', '💀'], fix: ['FIX', '🔧'], ship: ['SHIP', '🚀'] };
  const [label, emoji] = names[choice] || [choice.toUpperCase(), '🧿'];
  const explain = getExplain(ans);

  const probKeys = Object.keys(probs).length ? Object.keys(probs) : ['kill', 'fix', 'ship'];
  const probRows = probKeys.map((k) => {
    const pct = Math.round((probs[k] != null ? probs[k] : 0) * 100);
    const cls = k === choice ? 'prob-' + (k in { kill: 1, fix: 1, ship: 1 } ? k : 'other') : 'prob-other';
    return '<div class="prob-row ' + cls + '"><div class="prob-label"><span>' + esc(k.toUpperCase()) + '</span><b>' + pct + '%</b></div>' +
      '<div class="prob-track"><div class="prob-fill" style="width:' + pct + '%"></div></div></div>';
  }).join('');

  return '<div class="panel">' +
    '<div class="verdict-hero verdict-' + (choice in { kill: 1, fix: 1, ship: 1 } ? choice : 'fix') + '">' +
      '<span class="verdict-emoji">' + emoji + '</span>' +
      '<span class="verdict-name">' + label + '</span>' +
      '<div class="verdict-conf">置信度<br><b>' + conf + '%</b></div>' +
    '</div>' +
    '<div class="prob-label"><b>三选项概率</b></div>' + probRows +
    (explain ? '<div class="explain-box"><span class="explain-label">🧿 Jev 依据</span>' + esc(explain) + '</div>' : '') +
  '</div>';
}

/** 语义过滤器：score 渲染（可排序 + 保留高分） */
function renderFilter(answers, items) {
  const rows = [];
  Object.keys(answers).forEach((k) => {
    const ans = answers[k];
    rows.push({
      key: k,
      text: items[k] != null ? items[k] : k,
      score: ans && ans.score != null ? Math.max(0, Math.min(100, Math.round(ans.score))) : 0,
      legend: ans ? ans.legend || '' : '',
      conf: ans && ans.confidence != null ? Math.round(ans.confidence * 100) : null
    });
  });
  rows.sort((a, b) => b.score - a.score);
  localStorage.setItem('polli-jev-filter-order', JSON.stringify(rows.map((r) => r.key)));

  const listHTML = rows.map((r, i) =>
    '<div class="filter-item" data-key="' + esc(r.key) + '">' +
      '<span class="filter-idx">' + (i + 1) + '</span>' +
      '<span class="filter-text">' + esc(r.text) + '</span>' +
      '<span class="filter-score-col">' +
        '<span class="filter-score">' + r.score + '<span class="score-max"> /100</span></span>' +
        (r.legend ? '<div class="filter-legend">' + esc(r.legend) + '</div>' : '') +
        (r.conf != null ? '<div class="filter-conf">置信 ' + r.conf + '%</div>' : '') +
      '</span>' +
      '<div class="score-bar" style="width:' + r.score + '%"></div>' +
    '</div>'
  ).join('');

  return '<div class="panel">' +
    '<div class="filter-toolbar">' +
      '<button class="btn btn-small" data-sort="desc">⬇ 分数从高到低</button>' +
      '<button class="btn btn-small" data-sort="asc">⬆ 分数从低到高</button>' +
      '<button class="btn btn-small btn-primary" data-keep="1">💾 保留高分项（≥70）</button>' +
    '</div>' +
    '<div class="filter-list">' + listHTML + '</div>' +
    '<div class="keep-zone hidden" id="keep-zone"><h4>✅ 已保留的高分项</h4><div id="keep-items"></div></div>' +
  '</div>';
}

/** 紧急度判断：noul 渲染（仪表盘 + 建议） */
function renderUrgency(answers) {
  const ans = answers.urgency || answers.level || Object.values(answers)[0];
  if (!ans) return '<div class="err-box">⚠ 响应缺少紧急度字段</div>';
  const v = ans.noul != null ? ans.noul : 0.5;
  const pct = Math.round(v * 100);
  let level = '低', cls = 'meter-low', action = '可以稍后处理，按计划推进即可。', actCls = 'act-low', actLabel = '不急 · 常规节奏';
  if (v >= 0.7) {
    level = '高'; cls = 'meter-high';
    action = '立即处理：通知相关方、启动应急预案，优先恢复服务/数据，必要时求助上级。';
    actCls = 'act-high'; actLabel = '立即响应';
  } else if (v >= 0.35) {
    level = '中'; cls = 'meter-mid';
    action = '尽快处理：安排专人跟进，设定 2-4 小时响应时限，避免升级为高紧急。';
    actCls = 'act-mid'; actLabel = '尽快响应';
  }

  return '<div class="panel">' +
    '<div class="meter-wrap">' +
      '<div class="meter ' + cls + '" style="--p:' + pct + '">' +
        '<div class="meter-inner">' +
          '<span class="meter-val">' + pct + '%</span>' +
          '<span class="meter-unit">紧急度 0-100%</span>' +
          '<span class="meter-level">' + level + '紧急</span>' +
        '</div>' +
      '</div>' +
      '<div class="meter-side">' +
        '<div class="urgency-desc">Jev 判断该求助的紧急程度为 <b style="color:var(--cyan)">' + v.toFixed(2) + '</b>（0-1 区间）。</div>' +
        '<div class="action-box ' + actCls + '"><b>' + actLabel + '</b>：' + esc(action) + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ==================== 6. 历史决策记录 ==================== */

const HISTORY_KEY = 'polli-jev-history';
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
}
function addHistory(tab, demo, summary, renderHTML) {
  const arr = loadHistory();
  arr.unshift({
    id: uid(),
    ts: Date.now(),
    tab: tab,
    demo: demo,
    summary: summary.slice(0, 180),
    html: renderHTML
  });
  if (arr.length > 20) arr.length = 20;
  saveHistory(arr);
  renderHistory();
}
function renderHistory() {
  const box = $('#history-list');
  if (!box) return;
  const arr = loadHistory();
  if (!arr.length) {
    box.innerHTML = '<div class="tiny" style="margin-top:2px">暂无历史记录，执行一次决策后这里会保存。</div>';
    return;
  }
  box.innerHTML = arr.map((h) =>
    '<div class="history-item" data-id="' + h.id + '">' +
      '<div class="history-head"><span>' + esc(TAB_META[h.tab] ? TAB_META[h.tab].label : h.tab) + '</span>' +
        (h.demo ? '<span class="history-demo">演示</span>' : '') + '</div>' +
      '<div class="history-meta">' + esc(new Date(h.ts).toLocaleString()) + ' · ' + esc(h.summary) + '</div>' +
    '</div>'
  ).join('');
}
function openHistory(id) {
  const h = loadHistory().find((x) => x.id === id);
  if (!h) return;
  const zone = $('#' + TAB_META[h.tab].demoKey + '-zone');
  if (zone) {
    zone.innerHTML = h.html;
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    Toast('已载入历史记录（' + h.summary.slice(0, 40) + '…）');
  }
}

/* ==================== 7. 请求构造与运行 ==================== */

const S = {
  /* 每个页签：textarea 的键 */
  startup: { ta: '#startup-input', zone: '#startup-zone' },
  filter: { ta: '#filter-input', zone: '#filter-zone' },
  urgency: { ta: '#urgency-input', zone: '#urgency-zone' }
};

function getInput(tab) {
  const ta = $(S[tab].ta);
  return ta ? ta.value.trim() : '';
}

function makeQuestions(tab, input) {
  if (tab === 'startup') {
    return {
      verdict: {
        type: 'choice',
        instructions: '判断该创业点子应该 Kill、Fix 还是 Ship，并给出置信度、三选项概率与依据。',
        criteria: {
          kill: '无市场或存在致命缺陷',
          fix: '需转型或补强后才能做',
          ship: '有强烈需求信号，可以上线'
        }
      }
    };
  }
  if (tab === 'filter') {
    const lines = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const q = {};
    lines.forEach((line, i) => {
      q['item' + (i + 1)] = {
        type: 'score',
        instructions: '评估第 ' + (i + 1) + ' 条内容的新闻价值与可信度，0-100 分，并给出 legend 说明'
      };
    });
    return { questions: q, lines: lines };
  }
  /* urgency */
  return {
    questions: {
      urgency: {
        type: 'noul',
        instructions: '评估该求助的紧急程度，0 表示完全不紧急，1 表示极其紧急。'
      }
    }
  };
}

async function runTool(tab) {
  const input = getInput(tab);
  const zone = $(S[tab].zone);
  if (!input) {
    Toast('请先填写内容');
    zone.focus && $(S[tab].ta).focus();
    return;
  }

  let demo = false;
  let answers = null;
  let stateText = input;
  let summaryText = input;

  if (tab === 'startup') {
    stateText = input;
    summaryText = input;
  } else if (tab === 'filter') {
    const lines = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    summaryText = '共 ' + lines.length + ' 条';
    if (!BYOP.loggedIn) {
      /* 演示：用预置示例替代，行数不同也展示完整 UI */
      answers = DEMO.filter.answers;
      stateText = DEMO.filter.state;
      summaryText = '演示：5 条示例头条';
      demo = true;
    } else {
      const q = makeQuestions(tab, input);
      zone.innerHTML = loadingHTML('Jev 正在逐条打分…');
      const data = await callJev(stateText, q.questions);
      if (data && data.answers) answers = data.answers;
    }
  } else if (tab === 'urgency') {
    if (!BYOP.loggedIn) {
      answers = DEMO.urgency.answers;
      stateText = DEMO.urgency.state;
      summaryText = '演示：数据库被误删求助';
      demo = true;
    } else {
      const q = makeQuestions(tab, input);
      zone.innerHTML = loadingHTML('Jev 正在评估紧急度…');
      const data = await callJev(stateText, q.questions);
      if (data && data.answers) answers = data.answers;
    }
  }

  /* startup：未登录走演示 */
  if (tab === 'startup' && !BYOP.loggedIn) {
    answers = DEMO.startup.answers;
    stateText = DEMO.startup.state;
    summaryText = '演示：AI 记账工具';
    demo = true;
  }

  if (!answers) {
    /* 401 自动降级或网络失败 */
    zone.innerHTML = loadingHTML('演示模式：载入 Jev 示例…');
    await new Promise((r) => setTimeout(r, 350));
    if (tab === 'startup') answers = DEMO.startup.answers;
    else if (tab === 'filter') answers = DEMO.filter.answers;
    else answers = DEMO.urgency.answers;
    demo = true;
    stateText = DEMO[tab].state;
  }

  let html = '';
  if (tab === 'startup') html = renderStartup(answers);
  else if (tab === 'filter') {
    const lines = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const items = {};
    if (!demo) {
      lines.forEach((l, i) => { items['item' + (i + 1)] = l; });
    } else {
      (DEMO.filter.items || []).forEach((l, i) => { items['item' + (i + 1)] = l; });
    }
    html = renderFilter(answers, items);
  } else html = renderUrgency(answers);

  if (demo) {
    html += '<div class="tiny">🔌 演示模式：以上为示例请求与响应。' +
      '<button class="btn btn-small btn-ghost" data-byop="1">连接钱包</button>后即可实时调用 Jev。</div>';
  }
  zone.innerHTML = html;
  addHistory(tab, demo, summaryText, html);
}

/* ==================== 8. 事件绑定 ==================== */

function bindEvents() {
  const tabs = $$('.tab-btn');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      tabs.forEach((b) => b.classList.toggle('active', b === btn));
      $$('.panel-wrap').forEach((p) => p.classList.toggle('active', p.dataset.panel === t));
      $('#tab-title').textContent = TAB_META[t].label;
      if (window._track) clearTimeout(window._track);
    });
  });

  const clearBtn = $('#btn-clear-history');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    saveHistory([]);
    renderHistory();
    Toast('已清空历史记录');
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) { runTool(b.dataset.tool); return; }

    const byopIn = e.target.closest('#btn-byop-login');
    if (byopIn) { BYOP.login(); return; }
    const byopOut = e.target.closest('#btn-byop-logout');
    if (byopOut) { BYOP.logout(); return; }
    const byopHint = e.target.closest('[data-byop="1"]');
    if (byopHint) { BYOP.login(); return; }

    const hi = e.target.closest('.history-item');
    if (hi) { openHistory(hi.dataset.id); return; }

    const keep = e.target.closest('[data-keep="1"]');
    if (keep) {
      const items = $$('#filter-zone .filter-item');
      const zone = $('#keep-zone');
      const keepBox = $('#keep-items');
      if (!zone || !keepBox) return;
      const kept = items.filter((el) => {
        const scoreEl = el.querySelector('.filter-score');
        return scoreEl && parseInt(scoreEl.textContent, 10) >= 70;
      });
      if (!kept.length) {
        zone.classList.add('hidden');
        Toast('没有 ≥70 分的高分项');
        return;
      }
      keepBox.innerHTML = kept.map((el, i) => {
        const t = el.querySelector('.filter-text');
        const s = el.querySelector('.filter-score');
        return '<div class="keep-item">' + (i + 1) + '. ' + esc(t ? t.textContent : '') + ' — <b style="color:var(--green)">' + (s ? s.textContent : '') + '</b></div>';
      }).join('');
      zone.classList.remove('hidden');
      Toast('已保留 ' + kept.length + ' 个高分项');
      return;
    }

    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const list = $('#filter-zone .filter-list');
      const arr = list ? Array.from(list.children) : [];
      const dir = sort.dataset.sort === 'asc' ? 1 : -1;
      arr.sort((a, b) => {
        const sa = parseInt(a.querySelector('.filter-score').textContent, 10);
        const sb = parseInt(b.querySelector('.filter-score').textContent, 10);
        return (sa - sb) * dir;
      });
      arr.forEach((el, i) => {
        el.querySelector('.filter-idx').textContent = i + 1;
        list.appendChild(el);
      });
      return;
    }

    const retry = e.target.closest('[data-retry="1"]');
    if (retry) {
      const wrap = retry.closest('.panel-wrap');
      if (wrap) runTool(wrap.dataset.panel);
      return;
    }
    const cancel = e.target.closest('[data-cancel="1"]');
    if (cancel) {
      const wrap = cancel.closest('.panel-wrap');
      if (wrap) {
        $(S[wrap.dataset.panel].zone).innerHTML = '';
      }
      return;
    }
  });
}

/* ==================== 9. 初始化 ==================== */
(function init() {
  BYOP.init();
  renderHistory();
  bindEvents();
})();

