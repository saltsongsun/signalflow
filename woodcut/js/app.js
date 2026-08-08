// 우드컷 — UI 로직

import { optimize, collectOffcuts, fmt } from './optimizer.js';
import { optimizeLumber, collectLumberOffcuts } from './lumber.js';
import { renderSheetSVG, renderBarSVG, PALETTE } from './render.js';

const STORAGE_KEY = 'woodcut.project.v1';
const OFFCUT_MIN_SIDE = 50; // 이 크기(mm) 이상 양변이 남는 조각만 자투리로 표시
const LUMBER_OFFCUT_MIN = 100; // 이 길이(mm) 이상 남는 각재만 자투리로 표시

const PRESETS = [
  { label: '합판/MDF 2440 × 1220', w: 2440, h: 1220 },
  { label: '합판/MDF 1220 × 2440 (세로 결)', w: 1220, h: 2440 },
  { label: '반장 1220 × 1220', w: 1220, h: 1220 },
  { label: '집성판 2440 × 610', w: 2440, h: 610 },
  { label: '집성판 1200 × 600', w: 1200, h: 600 },
];

const SAMPLE = {
  stock: { w: 2440, h: 1220 },
  kerf: 5,
  trim: 10,
  price: 45000,
  parts: [
    { name: '측판', w: 300, h: 1200, qty: 2, rot: false },
    { name: '상하판', w: 764, h: 300, qty: 2, rot: true },
    { name: '선반', w: 764, h: 280, qty: 4, rot: true },
    { name: '뒷판', w: 1164, h: 768, qty: 1, rot: true },
    { name: '서랍 앞판', w: 380, h: 180, qty: 2, rot: true },
  ],
  lumber: {
    stockLen: 3600,
    kerf: 3,
    trim: 10,
    price: 6500,
    items: [
      { spec: '30×30', name: '다리', len: 120, qty: 4 },
      { spec: '30×30', name: '받침 가로대', len: 764, qty: 2 },
      { spec: '30×30', name: '받침 세로대', len: 264, qty: 2 },
      { spec: '30×30', name: '뒤 보강대', len: 1164, qty: 1 },
    ],
  },
};

const DEFAULT_LUMBER = { stockLen: 3600, kerf: 3, trim: 0, price: 0, items: [] };

const $ = (id) => document.getElementById(id);
const el = {
  preset: $('stock-preset'),
  stockW: $('stock-w'),
  stockH: $('stock-h'),
  price: $('stock-price'),
  kerf: $('kerf'),
  trim: $('trim'),
  tbody: $('parts-tbody'),
  addPart: $('btn-add-part'),
  sample: $('btn-sample'),
  clearParts: $('btn-clear-parts'),
  lumberLen: $('lumber-len'),
  lumberKerf: $('lumber-kerf'),
  lumberTrim: $('lumber-trim'),
  lumberPrice: $('lumber-price'),
  lumberTbody: $('lumber-tbody'),
  addLumber: $('btn-add-lumber'),
  clearLumber: $('btn-clear-lumber'),
  bulkText: $('bulk-text'),
  bulkAdd: $('btn-bulk-add'),
  calc: $('btn-calc'),
  results: $('results'),
  summary: $('summary'),
  alerts: $('alerts'),
  sheets: $('sheets'),
  cutlist: $('cutlist'),
  offcuts: $('offcuts'),
  print: $('btn-print'),
  install: $('btn-install'),
};

let state = {
  stock: { w: 2440, h: 1220 },
  kerf: 5,
  trim: 0,
  price: 0,
  parts: [{ name: '', w: '', h: '', qty: 1, rot: true }],
  lumber: { ...DEFAULT_LUMBER, items: [] },
};

// ---------- 저장/불러오기 ----------

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* 저장 공간 없음 등은 무시 */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.stock && Array.isArray(data.parts)) {
      // 예전 저장본에는 lumber가 없을 수 있음
      data.lumber = { ...DEFAULT_LUMBER, ...(data.lumber || {}) };
      if (!Array.isArray(data.lumber.items)) data.lumber.items = [];
      state = data;
    }
  } catch (e) {
    /* 손상된 데이터는 무시 */
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

// ---------- 폼 <-> 상태 ----------

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function syncSettingsToForm() {
  el.stockW.value = state.stock.w || '';
  el.stockH.value = state.stock.h || '';
  el.price.value = state.price || '';
  el.kerf.value = state.kerf;
  el.trim.value = state.trim;
  const idx = PRESETS.findIndex((p) => p.w === num(state.stock.w) && p.h === num(state.stock.h));
  el.preset.value = idx >= 0 ? String(idx) : 'custom';
  el.lumberLen.value = state.lumber.stockLen || '';
  el.lumberKerf.value = state.lumber.kerf;
  el.lumberTrim.value = state.lumber.trim;
  el.lumberPrice.value = state.lumber.price || '';
}

function readSettings() {
  state.stock.w = num(el.stockW.value);
  state.stock.h = num(el.stockH.value);
  state.price = num(el.price.value);
  state.kerf = num(el.kerf.value);
  state.trim = num(el.trim.value);
  state.lumber.stockLen = num(el.lumberLen.value);
  state.lumber.kerf = num(el.lumberKerf.value);
  state.lumber.trim = num(el.lumberTrim.value);
  state.lumber.price = num(el.lumberPrice.value);
}

function renderPartsTable() {
  el.tbody.innerHTML = '';
  state.parts.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="색"><span class="chip" style="background:${PALETTE[i % PALETTE.length]}"></span></td>
      <td data-label="부재 이름"><input type="text" data-field="name" data-i="${i}" value="${escAttr(p.name)}" placeholder="부재 ${i + 1}"></td>
      <td data-label="가로(mm)"><input type="number" inputmode="decimal" min="1" data-field="w" data-i="${i}" value="${p.w}" placeholder="600"></td>
      <td data-label="세로(mm)"><input type="number" inputmode="decimal" min="1" data-field="h" data-i="${i}" value="${p.h}" placeholder="400"></td>
      <td data-label="수량"><input type="number" inputmode="numeric" min="1" step="1" data-field="qty" data-i="${i}" value="${p.qty}"></td>
      <td data-label="회전 허용" class="td-rot"><label class="switch"><input type="checkbox" data-field="rot" data-i="${i}" ${p.rot ? 'checked' : ''}><span title="끄면 결 방향 고정(회전 금지)"></span></label></td>
      <td data-label=""><button type="button" class="btn-icon btn-remove" data-i="${i}" aria-label="부재 삭제">✕</button></td>`;
    el.tbody.appendChild(tr);
  });
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderLumberTable() {
  el.lumberTbody.innerHTML = '';
  state.lumber.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="색"><span class="chip" style="background:${PALETTE[i % PALETTE.length]}"></span></td>
      <td data-label="규격(단면)"><input type="text" data-lfield="spec" data-i="${i}" value="${escAttr(it.spec)}" placeholder="30×30"></td>
      <td data-label="부재 이름"><input type="text" data-lfield="name" data-i="${i}" value="${escAttr(it.name)}" placeholder="각재 ${i + 1}"></td>
      <td data-label="길이(mm)"><input type="number" inputmode="decimal" min="1" data-lfield="len" data-i="${i}" value="${it.len}" placeholder="720"></td>
      <td data-label="수량"><input type="number" inputmode="numeric" min="1" step="1" data-lfield="qty" data-i="${i}" value="${it.qty}"></td>
      <td data-label=""><button type="button" class="btn-icon btn-lremove" data-i="${i}" aria-label="각재 삭제">✕</button></td>`;
    el.lumberTbody.appendChild(tr);
  });
}

// ---------- 부재 조작 ----------

function addPart(part) {
  state.parts.push(part || { name: '', w: '', h: '', qty: 1, rot: true });
  renderPartsTable();
  scheduleSave();
}

function parseBulk(text) {
  const parts = [];
  const bad = [];
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let tokens = line.split(/[,\t]+|\s+/).filter(Boolean);
    let rot = true;
    const last = tokens[tokens.length - 1];
    if (last === '고정' || last === 'x' || last === 'X') {
      rot = false;
      tokens = tokens.slice(0, -1);
    }
    // 뒤에서부터 이어지는 숫자 토큰: 가로 세로 [수량]
    const nums = [];
    while (tokens.length && nums.length < 3 && /^[\d.]+$/.test(tokens[tokens.length - 1])) {
      nums.unshift(Number(tokens.pop()));
    }
    if (nums.length < 2 || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      bad.push(rawLine);
      continue;
    }
    const [w, h, qty = 1] = nums.length === 2 ? [...nums, 1] : nums;
    parts.push({ name: tokens.join(' '), w, h, qty: Math.max(1, Math.floor(qty)), rot });
  }
  return { parts, bad };
}

// ---------- 계산/결과 ----------

function hasPanelRows() {
  return state.parts.some((p) => num(p.w) > 0 && num(p.h) > 0 && num(p.qty) > 0);
}

function hasLumberRows() {
  return state.lumber.items.some((it) => num(it.len) > 0 && num(it.qty) > 0);
}

function computeAll() {
  readSettings();
  const panel = hasPanelRows()
    ? optimize({ parts: state.parts, stock: state.stock, kerf: state.kerf, trim: state.trim })
    : null;
  const lumber = hasLumberRows()
    ? optimizeLumber({
        items: state.lumber.items,
        stockLen: state.lumber.stockLen,
        kerf: state.lumber.kerf,
        trim: state.lumber.trim,
      })
    : null;
  return { panel, lumber };
}

let hasResult = false;

function calc() {
  renderResults(computeAll());
  hasResult = true;
  el.results.hidden = false;
  el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let recalcTimer = null;
function scheduleRecalc() {
  if (!hasResult) return;
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => renderResults(computeAll()), 400);
}

function renderResults({ panel, lumber }) {
  el.alerts.innerHTML = '';
  const addAlert = (cls, msg) => {
    const div = document.createElement('div');
    div.className = `alert ${cls}`;
    div.textContent = msg;
    el.alerts.appendChild(div);
  };

  if (!panel && !lumber) {
    addAlert('alert-error', '판재 또는 각재 부재를 입력해 주세요.');
    el.summary.innerHTML = '';
    el.sheets.innerHTML = '';
    el.cutlist.innerHTML = '';
    el.offcuts.innerHTML = '';
    el.offcuts.hidden = true;
    return;
  }

  for (const msg of panel?.errors || []) addAlert('alert-error', msg);
  for (const msg of lumber?.errors || []) addAlert('alert-error', msg);
  if (panel && panel.sheets.length && panel.kerf === 0) {
    addAlert('alert-warn', '판재 톱날 두께(kerf)가 0mm입니다. 실제 재단에서는 톱날 손실을 감안해 주세요.');
  }
  if (lumber && lumber.barCount && lumber.kerf === 0) {
    addAlert('alert-warn', '각재 톱날 두께(kerf)가 0mm입니다. 실제 재단에서는 톱날 손실을 감안해 주세요.');
  }

  // 요약 카드
  const cards = [];
  if (panel && panel.sheets.length) {
    cards.push({ label: '필요 원장', value: `${panel.sheetCount}장` });
    cards.push({ label: '판재 수율', value: `${(panel.utilization * 100).toFixed(1)}%` });
  }
  if (lumber && lumber.barCount) {
    cards.push({ label: '각재 원자재', value: `${lumber.barCount}개` });
    cards.push({ label: '각재 수율', value: `${(lumber.utilization * 100).toFixed(1)}%` });
  }
  const pieceCount =
    (panel ? panel.sheets.reduce((a, s) => a + s.placements.length, 0) : 0) +
    (lumber ? lumber.totalPieces || 0 : 0);
  if (pieceCount) cards.push({ label: '배치한 부재', value: `${pieceCount}개` });
  let cost = 0;
  if (panel && panel.sheets.length && state.price > 0) cost += state.price * panel.sheetCount;
  if (lumber && lumber.barCount && state.lumber.price > 0) cost += state.lumber.price * lumber.barCount;
  if (cost > 0) cards.push({ label: '예상 자재비', value: `${cost.toLocaleString('ko-KR')}원` });
  el.summary.innerHTML = cards
    .map((c) => `<div class="stat"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`)
    .join('');

  // 배치도 (판재 → 각재)
  let sheetsHtml = '';
  if (panel) {
    sheetsHtml += panel.sheets
      .map((s) => {
        const cap = `원장 ${s.index + 1} / ${panel.sheetCount} — ${fmt(panel.stock.w)} × ${fmt(panel.stock.h)}mm · 수율 ${(s.utilization * 100).toFixed(1)}% · 부재 ${s.placements.length}개`;
        return `<figure class="sheet-block"><figcaption>${cap}</figcaption>${renderSheetSVG(s, panel)}</figure>`;
      })
      .join('');
  }
  if (lumber) {
    lumber.groups.forEach((g, gi) => {
      sheetsHtml += g.bars
        .map((bar) => {
          const specTxt = g.spec ? `${escAttr(g.spec)} ` : '';
          const cap = `각재 ${specTxt}원자재 ${bar.index + 1} / ${g.barCount} — ${fmt(lumber.stockLen)}mm · 수율 ${(bar.utilization * 100).toFixed(1)}% · 남는 길이 ${fmt(bar.leftover)}mm`;
          return `<figure class="sheet-block bar-block"><figcaption>${cap}</figcaption>${renderBarSVG(bar, g, lumber, `b${gi}-${bar.index}`)}</figure>`;
        })
        .join('');
    });
  }
  el.sheets.innerHTML = sheetsHtml;

  // 재단 목록
  let cutHtml = '';
  if (panel && panel.parts.length) {
    const rows = panel.parts
      .map((p) => {
        const placed = panel.sheets.reduce(
          (a, s) => a + s.placements.filter((pl) => pl.partIndex === p.partIndex).length,
          0
        );
        const chip = `<span class="chip" style="background:${PALETTE[p.partIndex % PALETTE.length]}"></span>`;
        const rot = p.rot ? '허용' : '<strong>고정</strong>';
        return `<tr><td>${chip} ${p.partIndex + 1}. ${escAttr(p.name)}</td><td class="num">${fmt(p.w)} × ${fmt(p.h)}</td><td class="num">${p.qty}</td><td class="num">${placed}</td><td>${rot}</td></tr>`;
      })
      .join('');
    cutHtml += `
      <h4>판재</h4>
      <table class="list-table">
        <thead><tr><th>부재</th><th class="num">치수(mm)</th><th class="num">수량</th><th class="num">배치</th><th>회전</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  if (lumber && lumber.items.length) {
    const rows = lumber.items
      .map((it) => {
        const placed = lumber.groups.reduce(
          (a, g) => a + g.bars.reduce((b, bar) => b + bar.pieces.filter((p) => p.itemIndex === it.itemIndex).length, 0),
          0
        );
        const chip = `<span class="chip" style="background:${PALETTE[it.itemIndex % PALETTE.length]}"></span>`;
        const spec = it.spec ? escAttr(it.spec) : '<span class="muted">—</span>';
        return `<tr><td>${chip} ${it.itemIndex + 1}. ${escAttr(it.name)}</td><td>${spec}</td><td class="num">${fmt(it.len)}</td><td class="num">${it.qty}</td><td class="num">${placed}</td></tr>`;
      })
      .join('');
    cutHtml += `
      <h4>각재</h4>
      <table class="list-table">
        <thead><tr><th>부재</th><th>규격</th><th class="num">길이(mm)</th><th class="num">수량</th><th class="num">배치</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  el.cutlist.innerHTML = cutHtml;

  // 자투리
  let offHtml = '';
  const offcuts = panel ? collectOffcuts(panel, OFFCUT_MIN_SIDE).slice(0, 30) : [];
  if (offcuts.length) {
    const orows = offcuts
      .map(
        (o) =>
          `<tr><td>원장 ${o.sheet + 1}</td><td class="num">${fmt(o.w)} × ${fmt(o.h)}</td><td class="num">${(o.area / 1e6).toFixed(2)}㎡</td></tr>`
      )
      .join('');
    offHtml += `
      <h4>판재 <span class="muted">(양변 ${OFFCUT_MIN_SIDE}mm 이상)</span></h4>
      <table class="list-table">
        <thead><tr><th>위치</th><th class="num">크기(mm)</th><th class="num">면적</th></tr></thead>
        <tbody>${orows}</tbody>
      </table>`;
  }
  const lumberOffcuts = lumber ? collectLumberOffcuts(lumber, LUMBER_OFFCUT_MIN).slice(0, 30) : [];
  if (lumberOffcuts.length) {
    const orows = lumberOffcuts
      .map(
        (o) =>
          `<tr><td>각재 ${o.spec ? escAttr(o.spec) + ' ' : ''}원자재 ${o.bar + 1}</td><td class="num">${fmt(o.len)}mm</td></tr>`
      )
      .join('');
    offHtml += `
      <h4>각재 <span class="muted">(${LUMBER_OFFCUT_MIN}mm 이상)</span></h4>
      <table class="list-table">
        <thead><tr><th>위치</th><th class="num">남는 길이</th></tr></thead>
        <tbody>${orows}</tbody>
      </table>`;
  }
  el.offcuts.hidden = !offHtml;
  el.offcuts.innerHTML = offHtml ? `<h3>활용 가능한 자투리</h3>${offHtml}` : '';
}

// ---------- 이벤트 ----------

function bindEvents() {
  el.preset.addEventListener('change', () => {
    const p = PRESETS[Number(el.preset.value)];
    if (p) {
      el.stockW.value = p.w;
      el.stockH.value = p.h;
    }
    readSettings();
    scheduleSave();
    scheduleRecalc();
  });

  for (const input of [el.stockW, el.stockH, el.price, el.kerf, el.trim]) {
    input.addEventListener('input', () => {
      readSettings();
      const idx = PRESETS.findIndex((p) => p.w === num(el.stockW.value) && p.h === num(el.stockH.value));
      el.preset.value = idx >= 0 ? String(idx) : 'custom';
      scheduleSave();
      scheduleRecalc();
    });
  }

  for (const input of [el.lumberLen, el.lumberKerf, el.lumberTrim, el.lumberPrice]) {
    input.addEventListener('input', () => {
      readSettings();
      scheduleSave();
      scheduleRecalc();
    });
  }

  el.lumberTbody.addEventListener('input', (e) => {
    const t = e.target;
    const i = Number(t.dataset.i);
    const f = t.dataset.lfield;
    if (!Number.isInteger(i) || !f || !state.lumber.items[i]) return;
    if (f === 'spec' || f === 'name') state.lumber.items[i][f] = t.value;
    else state.lumber.items[i][f] = t.value === '' ? '' : Number(t.value);
    scheduleSave();
    scheduleRecalc();
  });

  el.lumberTbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-lremove');
    if (!btn) return;
    state.lumber.items.splice(Number(btn.dataset.i), 1);
    renderLumberTable();
    scheduleSave();
    scheduleRecalc();
  });

  el.addLumber.addEventListener('click', () => {
    const prev = state.lumber.items[state.lumber.items.length - 1];
    state.lumber.items.push({ spec: prev ? prev.spec : '', name: '', len: '', qty: 1 });
    renderLumberTable();
    scheduleSave();
  });

  el.clearLumber.addEventListener('click', () => {
    if (!state.lumber.items.length || !confirm('각재 목록을 모두 지울까요?')) return;
    state.lumber.items = [];
    renderLumberTable();
    scheduleSave();
    scheduleRecalc();
  });

  el.tbody.addEventListener('input', (e) => {
    const t = e.target;
    const i = Number(t.dataset.i);
    const f = t.dataset.field;
    if (!Number.isInteger(i) || !f || !state.parts[i]) return;
    if (f === 'rot') state.parts[i].rot = t.checked;
    else if (f === 'name') state.parts[i].name = t.value;
    else state.parts[i][f] = t.value === '' ? '' : Number(t.value);
    scheduleSave();
    scheduleRecalc();
  });

  el.tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove');
    if (!btn) return;
    state.parts.splice(Number(btn.dataset.i), 1);
    if (state.parts.length === 0) state.parts.push({ name: '', w: '', h: '', qty: 1, rot: true });
    renderPartsTable();
    scheduleSave();
    scheduleRecalc();
  });

  el.addPart.addEventListener('click', () => addPart());

  el.sample.addEventListener('click', () => {
    state = JSON.parse(JSON.stringify(SAMPLE));
    syncSettingsToForm();
    renderPartsTable();
    renderLumberTable();
    scheduleSave();
    calc();
  });

  el.clearParts.addEventListener('click', () => {
    if (!confirm('부재 목록을 모두 지울까요?')) return;
    state.parts = [{ name: '', w: '', h: '', qty: 1, rot: true }];
    renderPartsTable();
    scheduleSave();
  });

  el.bulkAdd.addEventListener('click', () => {
    const { parts, bad } = parseBulk(el.bulkText.value);
    if (!parts.length) {
      alert('추가할 수 있는 줄이 없습니다.\n형식: 이름 가로 세로 [수량] [고정]');
      return;
    }
    // 비어 있는 기본 행은 제거하고 추가
    state.parts = state.parts.filter((p) => p.name || p.w || p.h);
    state.parts.push(...parts);
    el.bulkText.value = bad.join('\n');
    renderPartsTable();
    scheduleSave();
    if (bad.length) alert(`${parts.length}개 추가됨. 해석하지 못한 ${bad.length}줄은 입력창에 남겨두었습니다.`);
  });

  el.calc.addEventListener('click', calc);
  el.print.addEventListener('click', () => window.print());
}

// ---------- PWA ----------

function setupPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el.install.hidden = false;
  });
  el.install.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    el.install.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    el.install.hidden = true;
  });
}

// ---------- 시작 ----------

load();
syncSettingsToForm();
renderPartsTable();
renderLumberTable();
bindEvents();
setupPWA();
