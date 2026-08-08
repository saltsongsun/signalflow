// 재단 엔진 테스트 — 실행: node --test woodcut/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { optimize, collectOffcuts } from '../js/optimizer.js';

function totalPlaced(result) {
  return result.sheets.reduce((a, s) => a + s.placements.length, 0);
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.w - 1e-6 &&
    b.x < a.x + a.w - 1e-6 &&
    a.y < b.y + b.h - 1e-6 &&
    b.y < a.y + a.h - 1e-6
  );
}

test('부재 1개는 원장 1장 좌상단에 배치된다', () => {
  const r = optimize({
    parts: [{ name: 'a', w: 600, h: 400, qty: 1 }],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.ok, true);
  assert.equal(r.sheetCount, 1);
  assert.deepEqual(
    r.sheets[0].placements.map((p) => [p.x, p.y, p.w, p.h]),
    [[0, 0, 600, 400]]
  );
});

test('톱날 두께가 정확히 반영된다 (딱 맞는 경우)', () => {
  // 47.5 + 5 + 47.5 = 100 → 100×100 원장에 4개가 정확히 들어감
  const r = optimize({
    parts: [{ name: 'a', w: 47.5, h: 47.5, qty: 4 }],
    stock: { w: 100, h: 100 },
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.sheetCount, 1);
  assert.equal(totalPlaced(r), 4);
});

test('톱날 두께 때문에 안 들어가는 경우를 놓치지 않는다', () => {
  // 48 + 5 + 48 = 101 > 100 → 장당 1개씩만 가능
  const r = optimize({
    parts: [{ name: 'a', w: 48, h: 48, qty: 4 }],
    stock: { w: 100, h: 100 },
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.sheetCount, 4);
  assert.equal(totalPlaced(r), 4);
});

test('회전 허용 시 눕혀서 배치된다', () => {
  const r = optimize({
    parts: [{ name: 'a', w: 100, h: 200, qty: 1, rot: true }],
    stock: { w: 200, h: 100 },
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.ok, true);
  assert.equal(r.sheetCount, 1);
  assert.equal(r.sheets[0].placements[0].rotated, true);
});

test('회전 금지(결 방향 고정) 부재는 배치 불가로 보고된다', () => {
  const r = optimize({
    parts: [{ name: 'a', w: 100, h: 200, qty: 1, rot: false }],
    stock: { w: 200, h: 100 },
    kerf: 5,
    trim: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.unplaced.length, 1);
  assert.ok(r.errors.length >= 1);
});

test('가장자리 손질(trim)이 유효 영역을 줄인다', () => {
  const r = optimize({
    parts: [{ name: 'a', w: 2440, h: 1220, qty: 1 }],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 10,
  });
  assert.equal(r.ok, false);
  assert.equal(r.unplaced.length, 1);

  const r2 = optimize({
    parts: [{ name: 'a', w: 2420, h: 1200, qty: 1 }],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 10,
  });
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.sheets[0].placements[0].x, 10);
  assert.deepEqual(r2.sheets[0].placements[0].y, 10);
});

test('무작위 입력에서도 겹침·이탈이 없다', () => {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let run = 0; run < 5; run++) {
    const parts = [];
    for (let i = 0; i < 40; i++) {
      parts.push({
        name: `p${i}`,
        w: Math.floor(50 + rand() * 900),
        h: Math.floor(50 + rand() * 500),
        qty: 1 + Math.floor(rand() * 3),
        rot: rand() < 0.8,
      });
    }
    const r = optimize({ parts, stock: { w: 2440, h: 1220 }, kerf: 4, trim: 8 });
    assert.equal(r.ok, true);
    const totalQty = parts.reduce((a, p) => a + p.qty, 0);
    assert.equal(totalPlaced(r), totalQty);

    for (const sheet of r.sheets) {
      for (const p of sheet.placements) {
        assert.ok(p.x >= 8 - 1e-6 && p.y >= 8 - 1e-6, '트림 안쪽에 배치');
        assert.ok(p.x + p.w <= 2440 - 8 + 1e-6, '가로 이탈 없음');
        assert.ok(p.y + p.h <= 1220 - 8 + 1e-6, '세로 이탈 없음');
      }
      for (let i = 0; i < sheet.placements.length; i++) {
        for (let j = i + 1; j < sheet.placements.length; j++) {
          assert.ok(
            !overlaps(sheet.placements[i], sheet.placements[j]),
            `겹침: ${JSON.stringify(sheet.placements[i])} vs ${JSON.stringify(sheet.placements[j])}`
          );
        }
      }
    }
  }
});

test('결과가 결정적이다 (같은 입력 → 같은 결과)', () => {
  const input = {
    parts: [
      { name: '측판', w: 300, h: 1200, qty: 2, rot: false },
      { name: '선반', w: 764, h: 280, qty: 4 },
      { name: '뒷판', w: 1164, h: 768, qty: 1 },
    ],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 10,
  };
  const a = optimize(input);
  const b = optimize(input);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('책장 예시가 원장 1장에 들어간다', () => {
  const r = optimize({
    parts: [
      { name: '측판', w: 300, h: 1200, qty: 2, rot: false },
      { name: '상하판', w: 764, h: 300, qty: 2 },
      { name: '선반', w: 764, h: 280, qty: 4 },
      { name: '뒷판', w: 1164, h: 768, qty: 1 },
      { name: '서랍 앞판', w: 380, h: 180, qty: 2 },
    ],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 10,
  });
  assert.equal(r.ok, true);
  assert.equal(totalPlaced(r), 11);
  assert.ok(r.sheetCount <= 2, `원장 ${r.sheetCount}장 사용`);
  assert.ok(r.utilization > 0.3);
});

test('자투리 목록은 최소 변 기준으로 걸러진다', () => {
  const r = optimize({
    parts: [{ name: 'a', w: 1000, h: 1000, qty: 1 }],
    stock: { w: 2440, h: 1220 },
    kerf: 5,
    trim: 0,
  });
  const offcuts = collectOffcuts(r, 50);
  assert.ok(offcuts.length >= 1);
  for (const o of offcuts) assert.ok(Math.min(o.w, o.h) >= 50);
});
