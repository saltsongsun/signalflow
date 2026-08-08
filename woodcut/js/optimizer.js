// 재단 최적화 엔진 — 길로틴 컷 기반 2D 배치 (DOM 의존 없음, Node 테스트에서 직접 사용)

export const EPS = 1e-6;

const SORTS = {
  area: (a, b) => b.w * b.h - a.w * a.h || b.w - a.w || a.pieceIndex - b.pieceIndex,
  long: (a, b) =>
    Math.max(b.w, b.h) - Math.max(a.w, a.h) ||
    Math.min(b.w, b.h) - Math.min(a.w, a.h) ||
    a.pieceIndex - b.pieceIndex,
  width: (a, b) => b.w - a.w || b.h - a.h || a.pieceIndex - b.pieceIndex,
  perim: (a, b) => (b.w + b.h) - (a.w + a.h) || b.w - a.w || a.pieceIndex - b.pieceIndex,
};

// 자유 영역 선택 휴리스틱 — [1차, 2차] 점수가 작을수록 좋은 자리
const CHOOSERS = {
  bssf: (fr, w, h) => {
    const dw = fr.w - w, dh = fr.h - h;
    return [Math.min(dw, dh), Math.max(dw, dh)];
  },
  blsf: (fr, w, h) => {
    const dw = fr.w - w, dh = fr.h - h;
    return [Math.max(dw, dh), Math.min(dw, dh)];
  },
  baf: (fr, w, h) => {
    const dw = fr.w - w, dh = fr.h - h;
    return [fr.w * fr.h - w * h, Math.min(dw, dh)];
  },
};

const SPLITS = ['slas', 'llas', 'maxrect'];

export function normalizeParts(parts) {
  return (parts || [])
    .map((p, i) => ({
      partIndex: i,
      name: String(p.name || '').trim() || `부재 ${i + 1}`,
      w: Number(p.w),
      h: Number(p.h),
      qty: Math.floor(Number(p.qty)),
      rot: p.rot !== false, // 회전(결 방향 무관) 허용 여부, 기본 허용
    }))
    .filter((p) => Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > 0 && p.h > 0 && p.qty > 0);
}

function fitsEmpty(part, uw, uh) {
  if (part.w <= uw + EPS && part.h <= uh + EPS) return true;
  if (part.rot && part.h <= uw + EPS && part.w <= uh + EPS) return true;
  return false;
}

// 부재 배치 후 남는 자유 영역을 길로틴 방식으로 분할
function splitFree(fr, w, h, kerf, rule) {
  const rw = fr.w - w - kerf; // 오른쪽 남는 폭
  const bh = fr.h - h - kerf; // 아래쪽 남는 높이
  const out = [];
  const hasRight = rw > EPS;
  const hasBottom = bh > EPS;

  if (!hasRight && !hasBottom) return out;
  if (hasRight && !hasBottom) {
    out.push({ x: fr.x + w + kerf, y: fr.y, w: rw, h: fr.h });
    return out;
  }
  if (!hasRight && hasBottom) {
    out.push({ x: fr.x, y: fr.y + h + kerf, w: fr.w, h: bh });
    return out;
  }

  // H 분할: 아래 영역이 전체 폭 차지 / V 분할: 오른쪽 영역이 전체 높이 차지
  const H = [
    { x: fr.x + w + kerf, y: fr.y, w: rw, h },
    { x: fr.x, y: fr.y + h + kerf, w: fr.w, h: bh },
  ];
  const V = [
    { x: fr.x + w + kerf, y: fr.y, w: rw, h: fr.h },
    { x: fr.x, y: fr.y + h + kerf, w, h: bh },
  ];

  let useH;
  if (rule === 'slas') useH = rw <= bh;
  else if (rule === 'llas') useH = rw > bh;
  else {
    // maxrect: 더 큰 자투리 사각형이 남는 쪽 선택
    const maxH = Math.max(H[0].w * H[0].h, H[1].w * H[1].h);
    const maxV = Math.max(V[0].w * V[0].h, V[1].w * V[1].h);
    useH = maxH >= maxV;
  }
  return useH ? H : V;
}

function packOnce(pieces, uw, uh, kerf, chooserKey, splitRule, offset) {
  const choose = CHOOSERS[chooserKey];
  const sheets = [];

  for (const piece of pieces) {
    let best = null;
    for (let si = 0; si < sheets.length; si++) {
      const free = sheets[si].free;
      for (let fi = 0; fi < free.length; fi++) {
        const fr = free[fi];
        for (const rotated of piece.rot && piece.w !== piece.h ? [false, true] : [false]) {
          const w = rotated ? piece.h : piece.w;
          const h = rotated ? piece.w : piece.h;
          if (w <= fr.w + EPS && h <= fr.h + EPS) {
            const [s1, s2] = choose(fr, w, h);
            if (!best || s1 < best.s1 - EPS || (Math.abs(s1 - best.s1) <= EPS && s2 < best.s2 - EPS)) {
              best = { si, fi, rotated, s1, s2 };
            }
          }
        }
      }
    }

    if (!best) {
      sheets.push({ free: [{ x: 0, y: 0, w: uw, h: uh }], placements: [] });
      const rotated = !(piece.w <= uw + EPS && piece.h <= uh + EPS);
      best = { si: sheets.length - 1, fi: 0, rotated, s1: 0, s2: 0 };
    }

    const sheet = sheets[best.si];
    const fr = sheet.free[best.fi];
    const w = best.rotated ? piece.h : piece.w;
    const h = best.rotated ? piece.w : piece.h;

    sheet.placements.push({
      x: fr.x + offset,
      y: fr.y + offset,
      w,
      h,
      rotated: best.rotated,
      name: piece.name,
      partIndex: piece.partIndex,
      pieceIndex: piece.pieceIndex,
    });
    sheet.free.splice(best.fi, 1, ...splitFree(fr, w, h, kerf, splitRule));
  }

  return sheets;
}

function scoreSolution(sheets, uw, uh) {
  const sheetArea = uw * uh;
  let sq = 0;
  let largestFree = 0;
  for (const s of sheets) {
    let used = 0;
    for (const p of s.placements) used += p.w * p.h;
    const free = sheetArea - used;
    sq += free * free;
    for (const fr of s.free) largestFree = Math.max(largestFree, fr.w * fr.h);
  }
  return { count: sheets.length, sq, largestFree };
}

function betterSolution(a, b) {
  if (!b) return true;
  if (a.count !== b.count) return a.count < b.count;
  if (Math.abs(a.sq - b.sq) > EPS) return a.sq > b.sq;
  return a.largestFree > b.largestFree;
}

/**
 * @param {object} input
 * @param {Array}  input.parts  [{name, w, h, qty, rot}]
 * @param {object} input.stock  {w, h}
 * @param {number} input.kerf   톱날 두께(mm)
 * @param {number} input.trim   원장 가장자리 손질 여유(mm, 4변 동일)
 */
export function optimize(input) {
  const stock = { w: Number(input.stock?.w), h: Number(input.stock?.h) };
  const kerf = Math.max(0, Number(input.kerf) || 0);
  const trim = Math.max(0, Number(input.trim) || 0);
  const parts = normalizeParts(input.parts);

  const errors = [];
  if (!Number.isFinite(stock.w) || !Number.isFinite(stock.h) || stock.w <= 0 || stock.h <= 0) {
    errors.push('원장 크기를 올바르게 입력해 주세요.');
    return { ok: false, errors, sheets: [], unplaced: [] };
  }
  const uw = stock.w - trim * 2;
  const uh = stock.h - trim * 2;
  if (uw <= 0 || uh <= 0) {
    errors.push('가장자리 손질 여유가 원장 크기보다 큽니다.');
    return { ok: false, errors, sheets: [], unplaced: [] };
  }
  if (parts.length === 0) {
    errors.push('부재를 1개 이상 입력해 주세요.');
    return { ok: false, errors, sheets: [], unplaced: [] };
  }

  // 원장에 아예 들어가지 않는 부재는 사전에 걸러서 알려준다
  const unplaced = parts.filter((p) => !fitsEmpty(p, uw, uh));
  const usable = parts.filter((p) => fitsEmpty(p, uw, uh));
  for (const p of unplaced) {
    errors.push(
      `"${p.name}" (${fmt(p.w)}×${fmt(p.h)})는 원장 유효 영역(${fmt(uw)}×${fmt(uh)})에 들어가지 않습니다.`
    );
  }
  if (usable.length === 0) {
    return { ok: false, errors, sheets: [], unplaced };
  }

  const pieces = [];
  for (const p of usable) {
    for (let i = 0; i < p.qty; i++) {
      pieces.push({ ...p, pieceIndex: pieces.length });
    }
  }

  const sortKeys = Object.keys(SORTS);
  const chooserKeys = Object.keys(CHOOSERS);
  // 부재 수가 많으면 검증된 조합만 사용해 계산 시간을 제한
  const combos = [];
  if (pieces.length > 800) {
    combos.push(
      ['area', 'bssf', 'slas'],
      ['area', 'baf', 'maxrect'],
      ['long', 'bssf', 'slas'],
      ['area', 'blsf', 'llas']
    );
  } else {
    for (const s of sortKeys)
      for (const c of chooserKeys) for (const sp of SPLITS) combos.push([s, c, sp]);
  }

  let best = null;
  let bestScore = null;
  for (const [sortKey, chooserKey, splitRule] of combos) {
    const sorted = pieces.slice().sort(SORTS[sortKey]);
    const sheets = packOnce(sorted, uw, uh, kerf, chooserKey, splitRule, trim);
    const score = scoreSolution(sheets, uw, uh);
    if (betterSolution(score, bestScore)) {
      bestScore = score;
      best = { sheets, strategy: { sort: sortKey, choose: chooserKey, split: splitRule } };
    }
  }

  const stockArea = stock.w * stock.h;
  let totalPartsArea = 0;
  const sheets = best.sheets.map((s, i) => {
    let used = 0;
    for (const p of s.placements) used += p.w * p.h;
    totalPartsArea += used;
    return {
      index: i,
      placements: s.placements,
      freeRects: s.free.map((fr) => ({ x: fr.x + trim, y: fr.y + trim, w: fr.w, h: fr.h })),
      usedArea: used,
      utilization: used / stockArea,
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    unplaced,
    stock,
    kerf,
    trim,
    usable: { w: uw, h: uh },
    parts,
    sheets,
    sheetCount: sheets.length,
    totalPartsArea,
    utilization: totalPartsArea / (sheets.length * stockArea),
    strategy: best.strategy,
  };
}

export function fmt(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// 활용 가능한 자투리(양변이 minSide 이상) 목록
export function collectOffcuts(result, minSide = 50) {
  const offcuts = [];
  for (const sheet of result.sheets || []) {
    for (const fr of sheet.freeRects) {
      if (Math.min(fr.w, fr.h) >= minSide) {
        offcuts.push({ sheet: sheet.index, w: fr.w, h: fr.h, area: fr.w * fr.h });
      }
    }
  }
  offcuts.sort((a, b) => b.area - a.area);
  return offcuts;
}
