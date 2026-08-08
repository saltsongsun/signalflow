// 우드컷 — UI 로직

import { optimize, collectOffcuts, fmt } from './optimizer.js';
import { renderSheetSVG, PALETTE } from './render.js';

const STORAGE_KEY = 'woodcut.project.v1';
const OFFCUT_MIN_SIDE = 50; // 이 크기(mm) 이상 양변이 남는 조각만 자투리로 표시

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
};

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
    if (data && data.stock && Array.isArray(data.parts)) state = data;
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
}

function readSettings() {
  state.stock.w = num(el.stockW.value);
  state.stock.h = num(el.stockH.value);
  state.price = num(el.price.value);
  state.kerf = num(el.kerf.value);
  state.trim = num(el.trim.value);
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

function currentInput() {
  readSettings();
  return {
    parts: state.parts,
    stock: state.stock,
    kerf: state.kerf,
    trim: state.trim,
  };
}

let hasResult = false;

function calc() {
  const result = optimize(currentInput());
  renderResults(result);
  hasResult = true;
  el.results.hidden = false;
  el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let recalcTimer = null;
function scheduleRecalc() {
  if (!hasResult) return;
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => {
    const result = optimize(currentInput());
    renderResults(result);
  }, 400);
}

function renderResults(result) {
  // 경고/오류
  el.alerts.innerHTML = '';
  for (const msg of result.errors || []) {
    const div = document.createElement('div');
    div.className = 'alert alert-error';
    div.textContent = msg;
    el.alerts.appendChild(div);
  }
  if (result.sheets.length && result.kerf === 0) {
    const div = document.createElement('div');
    div.className = 'alert alert-warn';
    div.textContent = '톱날 두께(kerf)가 0mm입니다. 실제 재단에서는 톱날 손실을 감안해 주세요.';
    el.alerts.appendChild(div);
  }

  if (!result.sheets.length) {
    el.summary.innerHTML = '';
    el.sheets.innerHTML = '';
    el.cutlist.innerHTML = '';
    el.offcuts.innerHTML = '';
    return;
  }

  // 요약 카드
  const pieceCount = result.sheets.reduce((a, s) => a + s.placements.length, 0);
  const cards = [
    { label: '필요 원장', value: `${result.sheetCount}장` },
    { label: '전체 수율', value: `${(result.utilization * 100).toFixed(1)}%` },
    { label: '배치한 부재', value: `${pieceCount}개` },
  ];
  if (state.price > 0) {
    cards.push({ label: '예상 자재비', value: `${(state.price * result.sheetCount).toLocaleString('ko-KR')}원` });
  }
  el.summary.innerHTML = cards
    .map((c) => `<div class="stat"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`)
    .join('');

  // 배치도
  el.sheets.innerHTML = result.sheets
    .map((s) => {
      const cap = `원장 ${s.index + 1} / ${result.sheetCount} — ${fmt(result.stock.w)} × ${fmt(result.stock.h)}mm · 수율 ${(s.utilization * 100).toFixed(1)}% · 부재 ${s.placements.length}개`;
      return `<figure class="sheet-block"><figcaption>${cap}</figcaption>${renderSheetSVG(s, result)}</figure>`;
    })
    .join('');

  // 재단 목록
  const rows = result.parts
    .map((p) => {
      const placed = result.sheets.reduce(
        (a, s) => a + s.placements.filter((pl) => pl.partIndex === p.partIndex).length,
        0
      );
      const chip = `<span class="chip" style="background:${PALETTE[p.partIndex % PALETTE.length]}"></span>`;
      const rot = p.rot ? '허용' : '<strong>고정</strong>';
      return `<tr><td>${chip} ${p.partIndex + 1}. ${escAttr(p.name)}</td><td class="num">${fmt(p.w)} × ${fmt(p.h)}</td><td class="num">${p.qty}</td><td class="num">${placed}</td><td>${rot}</td></tr>`;
    })
    .join('');
  el.cutlist.innerHTML = `
    <table class="list-table">
      <thead><tr><th>부재</th><th class="num">치수(mm)</th><th class="num">수량</th><th class="num">배치</th><th>회전</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  // 자투리
  const offcuts = collectOffcuts(result, OFFCUT_MIN_SIDE).slice(0, 30);
  if (offcuts.length) {
    const orows = offcuts
      .map(
        (o) =>
          `<tr><td>원장 ${o.sheet + 1}</td><td class="num">${fmt(o.w)} × ${fmt(o.h)}</td><td class="num">${(o.area / 1e6).toFixed(2)}㎡</td></tr>`
      )
      .join('');
    el.offcuts.innerHTML = `
      <h3>활용 가능한 자투리 <span class="muted">(양변 ${OFFCUT_MIN_SIDE}mm 이상)</span></h3>
      <table class="list-table">
        <thead><tr><th>위치</th><th class="num">크기(mm)</th><th class="num">면적</th></tr></thead>
        <tbody>${orows}</tbody>
      </table>`;
  } else {
    el.offcuts.innerHTML = '';
  }
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
bindEvents();
setupPWA();
