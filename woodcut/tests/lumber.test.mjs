// 각재(1D) 재단 엔진 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLumber, collectLumberOffcuts } from '../js/lumber.js';

function allPieces(r) {
  return r.groups.flatMap((g) => g.bars.flatMap((b) => b.pieces));
}

test('기본 배치: 3개가 원자재 1개에 들어간다', () => {
  const r = optimizeLumber({
    items: [{ name: 'a', len: 1000, qty: 3 }],
    stockLen: 3600,
    kerf: 0,
    trim: 0,
  });
  assert.equal(r.ok, true);
  assert.equal(r.barCount, 1);
  assert.equal(r.totalPieces, 3);
});

test('톱날 두께가 정확히 반영된다 (딱 맞는 경우)', () => {
  // 330×3 + 톱질 2회×5 = 1000 → 원자재 1개
  const r = optimizeLumber({
    items: [{ name: 'a', len: 330, qty: 3 }],
    stockLen: 1000,
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.barCount, 1);

  // 332×3 + 10 = 1006 > 1000 → 원자재 2개
  const r2 = optimizeLumber({
    items: [{ name: 'a', len: 332, qty: 3 }],
    stockLen: 1000,
    kerf: 5,
    trim: 0,
  });
  assert.equal(r2.barCount, 2);
});

test('끝단 손질(trim)이 유효 길이를 줄인다', () => {
  const r = optimizeLumber({
    items: [{ name: 'a', len: 950, qty: 1 }],
    stockLen: 1000,
    kerf: 3,
    trim: 50,
  });
  assert.equal(r.ok, false);
  assert.equal(r.unplaced.length, 1);

  const r2 = optimizeLumber({
    items: [{ name: 'a', len: 900, qty: 1 }],
    stockLen: 1000,
    kerf: 3,
    trim: 50,
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.groups[0].bars[0].pieces[0].x, 50);
});

test('규격(단면)이 다르면 원자재를 섞어 쓰지 않는다', () => {
  const r = optimizeLumber({
    items: [
      { spec: '30×30', name: 'a', len: 500, qty: 2 },
      { spec: '38×89', name: 'b', len: 500, qty: 2 },
    ],
    stockLen: 3600,
    kerf: 3,
    trim: 0,
  });
  assert.equal(r.groups.length, 2);
  assert.equal(r.barCount, 2);
  assert.deepEqual(r.groups.map((g) => g.spec).sort(), ['30×30', '38×89']);
});

test('작은 조합 최적성: 꽉 채우는 조합을 찾는다', () => {
  // [70,30] + [50,50] → 2개 (FFD식 단순 배치보다 나쁘지 않아야 함)
  const r = optimizeLumber({
    items: [
      { name: 'a', len: 70, qty: 1 },
      { name: 'b', len: 50, qty: 2 },
      { name: 'c', len: 30, qty: 1 },
    ],
    stockLen: 100,
    kerf: 0,
    trim: 0,
  });
  assert.equal(r.barCount, 2);
  assert.equal(r.utilization, 1);
});

test('위치가 겹치지 않고 톱날 간격이 유지된다', () => {
  const r = optimizeLumber({
    items: [
      { name: 'a', len: 720, qty: 4 },
      { name: 'b', len: 450, qty: 5 },
      { name: 'c', len: 1200, qty: 2 },
      { name: 'd', len: 90, qty: 7 },
    ],
    stockLen: 3600,
    kerf: 3,
    trim: 10,
  });
  assert.equal(r.ok, true);
  assert.equal(r.totalPieces, 18);
  for (const g of r.groups) {
    for (const bar of g.bars) {
      for (let i = 0; i < bar.pieces.length; i++) {
        const p = bar.pieces[i];
        assert.ok(p.x >= 10 - 1e-6, '끝단 손질 안쪽');
        assert.ok(p.x + p.len <= 3600 - 10 + 1e-6, '원자재 밖으로 이탈 없음');
        if (i > 0) {
          const prev = bar.pieces[i - 1];
          assert.ok(p.x >= prev.x + prev.len + 3 - 1e-6, '톱날 간격 유지');
        }
      }
    }
  }
});

test('너무 긴 부재는 오류로 보고하고 나머지는 배치한다', () => {
  const r = optimizeLumber({
    items: [
      { name: 'ok', len: 500, qty: 1 },
      { name: 'bad', len: 5000, qty: 1 },
    ],
    stockLen: 3600,
    kerf: 3,
    trim: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.unplaced.length, 1);
  assert.equal(r.barCount, 1);
  assert.equal(r.totalPieces, 1);
});

test('결과가 결정적이다', () => {
  const input = {
    items: [
      { spec: '30×30', name: '다리', len: 120, qty: 4 },
      { spec: '30×30', name: '가로대', len: 764, qty: 2 },
      { spec: '30×30', name: '세로대', len: 264, qty: 2 },
    ],
    stockLen: 3600,
    kerf: 3,
    trim: 10,
  };
  assert.equal(JSON.stringify(optimizeLumber(input)), JSON.stringify(optimizeLumber(input)));
});

test('자투리 길이가 올바르게 계산된다', () => {
  const r = optimizeLumber({
    items: [{ name: 'a', len: 1000, qty: 2 }],
    stockLen: 3600,
    kerf: 3,
    trim: 0,
  });
  assert.equal(r.barCount, 1);
  // 3600 - (1000+1000) - 톱질 1회(3) = 1597
  assert.equal(r.groups[0].bars[0].leftover, 1597);
  const offcuts = collectLumberOffcuts(r, 100);
  assert.equal(offcuts.length, 1);
  assert.equal(offcuts[0].len, 1597);
});
