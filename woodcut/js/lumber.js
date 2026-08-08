// 각재(길이 재단) 최적화 엔진 — 1D 컷팅 스톡 (DOM 의존 없음)
//
// 규격(단면)별로 묶은 뒤, 원자재 1개씩 "가장 꽉 채우는 조합"을 분기한정 탐색으로
// 찾아 채워 나간다. 단순 FFD(First Fit Decreasing) 결과와 비교해 더 좋은 쪽을 쓴다.

export const EPS = 1e-6;

const NODE_BUDGET = 300000; // 분기한정 탐색 노드 상한 (초과 시 지금까지의 최선 사용)

export function normalizeLumberItems(items) {
  return (items || [])
    .map((it, i) => ({
      itemIndex: i,
      spec: String(it.spec || '').trim(),
      name: String(it.name || '').trim() || `각재 ${i + 1}`,
      len: Number(it.len),
      qty: Math.floor(Number(it.qty)),
    }))
    .filter((it) => Number.isFinite(it.len) && it.len > 0 && it.qty > 0);
}

// 남은 수량(counts)에서 원자재 1개를 최대로 채우는 조합 탐색
// dist: [{cost, len}] cost 내림차순 정렬, counts: 각 길이의 남은 개수
function bestFill(dist, counts, capEff) {
  const n = dist.length;
  // 뒤쪽 항목들로 채울 수 있는 실제 길이 합 (가지치기 상한)
  const sufLen = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) sufLen[i] = sufLen[i + 1] + dist[i].len * counts[i];

  const use = new Int32Array(n);
  let bestUse = null;
  let bestLen = -1;
  let nodes = 0;

  const dfs = (i, capLeft, lenSum) => {
    if (lenSum > bestLen + EPS) {
      bestLen = lenSum;
      bestUse = use.slice();
    }
    if (i >= n || nodes++ > NODE_BUDGET) return;
    // cost ≥ len 이므로 남은 용량 이상으로는 길이를 더 얻을 수 없다
    const bound = Math.min(capLeft, sufLen[i]);
    if (lenSum + bound <= bestLen + EPS) return;

    const d = dist[i];
    const maxK = Math.min(counts[i], Math.floor((capLeft + EPS) / d.cost));
    for (let k = maxK; k >= 0; k--) {
      use[i] = k;
      dfs(i + 1, capLeft - k * d.cost, lenSum + k * d.len);
    }
    use[i] = 0;
  };
  dfs(0, capEff, 0);
  return bestUse || new Int32Array(n);
}

// 비교용 FFD: 긴 것부터, 들어가는 첫 원자재에 배치
function packFFD(items, capEff, kerf) {
  const instances = [];
  for (const it of items) {
    for (let q = 0; q < it.qty; q++) {
      instances.push({ name: it.name, len: it.len, itemIndex: it.itemIndex });
    }
  }
  instances.sort((a, b) => b.len - a.len || a.itemIndex - b.itemIndex);
  const caps = [];
  const bars = [];
  for (const p of instances) {
    const cost = Math.ceil(p.len + kerf);
    let bi = caps.findIndex((c) => c >= cost);
    if (bi < 0) {
      caps.push(capEff);
      bars.push([]);
      bi = caps.length - 1;
    }
    caps[bi] -= cost;
    bars[bi].push(p);
  }
  return bars;
}

function packGroup(items, usable, capEff, kerf) {
  // 같은 길이끼리 묶는다 (이름이 달라도 배치상 동일 — 라벨은 나중에 인스턴스로 복원)
  const byLen = new Map();
  for (const it of items) {
    const key = it.len;
    if (!byLen.has(key)) byLen.set(key, { len: it.len, cost: Math.ceil(it.len + kerf), instances: [] });
    const g = byLen.get(key);
    for (let q = 0; q < it.qty; q++) g.instances.push(it);
  }
  const dist = [...byLen.values()].sort((a, b) => b.cost - a.cost);
  const counts = dist.map((d) => d.instances.length);
  const taken = dist.map(() => 0); // 인스턴스 라벨 복원용 포인터

  const bars = [];
  let remaining = counts.reduce((a, c) => a + c, 0);
  while (remaining > 0) {
    const use = bestFill(dist, counts, capEff);
    let picked = 0;
    const pieces = [];
    for (let i = 0; i < dist.length; i++) {
      for (let k = 0; k < use[i]; k++) {
        const src = dist[i].instances[taken[i]++];
        pieces.push({ name: src.name, len: dist[i].len, itemIndex: src.itemIndex });
      }
      counts[i] -= use[i];
      picked += use[i];
    }
    if (picked === 0) break; // 방어: 검증을 거쳤으므로 도달하지 않음
    // 긴 부재부터 배치해 보기 좋게
    pieces.sort((a, b) => b.len - a.len || a.itemIndex - b.itemIndex);
    bars.push(pieces);
    remaining -= picked;
  }
  return bars;
}

/**
 * @param {object} input
 * @param {Array}  input.items    [{spec, name, len, qty}] — spec(단면)이 같은 것끼리 묶어 최적화
 * @param {number} input.stockLen 원자재 길이(mm)
 * @param {number} input.kerf     톱날 두께(mm)
 * @param {number} input.trim     끝단 손질(mm, 양쪽 각각)
 */
export function optimizeLumber(input) {
  const stockLen = Number(input.stockLen);
  const kerf = Math.max(0, Number(input.kerf) || 0);
  const trim = Math.max(0, Number(input.trim) || 0);
  const items = normalizeLumberItems(input.items);

  const errors = [];
  if (!Number.isFinite(stockLen) || stockLen <= 0) {
    errors.push('각재 원자재 길이를 올바르게 입력해 주세요.');
    return { ok: false, errors, groups: [], barCount: 0, unplaced: [] };
  }
  const usable = stockLen - trim * 2;
  if (usable <= 0) {
    errors.push('각재 끝단 손질이 원자재 길이보다 큽니다.');
    return { ok: false, errors, groups: [], barCount: 0, unplaced: [] };
  }
  if (items.length === 0) {
    errors.push('각재 부재를 1개 이상 입력해 주세요.');
    return { ok: false, errors, groups: [], barCount: 0, unplaced: [] };
  }

  const unplaced = items.filter((it) => it.len > usable + EPS);
  const good = items.filter((it) => it.len <= usable + EPS);
  for (const it of unplaced) {
    errors.push(
      `각재 "${it.name}" (${it.len}mm)는 원자재 유효 길이(${usable}mm)보다 깁니다.`
    );
  }
  if (good.length === 0) {
    return { ok: false, errors, groups: [], barCount: 0, unplaced };
  }

  // n개 배치 시 톱질은 n-1회 → 부재당 (len + kerf)로 계산하고 용량에 kerf를 더해준다
  const capEff = Math.floor(usable + kerf);

  const bySpec = new Map();
  for (const it of good) {
    const key = it.spec || '';
    if (!bySpec.has(key)) bySpec.set(key, []);
    bySpec.get(key).push(it);
  }

  const groups = [];
  let barCount = 0;
  let totalLen = 0;
  let totalPieces = 0;

  for (const [spec, groupItems] of [...bySpec.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    let bars = packGroup(groupItems, usable, capEff, kerf);
    // FFD가 더 적은 원자재를 쓰면 그 결과를 사용 (실전에서는 드묾, 안전장치)
    const ffdBars = packFFD(groupItems, capEff, kerf);
    if (ffdBars.length < bars.length) bars = ffdBars;

    const outBars = bars.map((pieces, bi) => {
      let x = trim;
      const placed = pieces.map((p, pi) => {
        const pos = { ...p, x };
        x += p.len + (pi < pieces.length - 1 ? kerf : 0);
        return pos;
      });
      const usedLen = pieces.reduce((a, p) => a + p.len, 0);
      totalLen += usedLen;
      totalPieces += pieces.length;
      return {
        index: bi,
        pieces: placed,
        usedLen,
        leftover: Math.max(0, usable - usedLen - Math.max(0, pieces.length - 1) * kerf),
        utilization: usedLen / stockLen,
      };
    });

    barCount += outBars.length;
    groups.push({
      spec,
      bars: outBars,
      barCount: outBars.length,
      utilization: outBars.reduce((a, b) => a + b.usedLen, 0) / (outBars.length * stockLen),
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    unplaced,
    stockLen,
    kerf,
    trim,
    usable,
    items,
    groups,
    barCount,
    totalPieces,
    totalLen,
    utilization: totalLen / (barCount * stockLen),
  };
}

// 활용 가능한 자투리 길이 목록
export function collectLumberOffcuts(result, minLen = 100) {
  const offcuts = [];
  for (const g of result.groups || []) {
    for (const bar of g.bars) {
      if (bar.leftover >= minLen) {
        offcuts.push({ spec: g.spec, bar: bar.index, len: bar.leftover });
      }
    }
  }
  offcuts.sort((a, b) => b.len - a.len);
  return offcuts;
}
