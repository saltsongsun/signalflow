// 재단 배치도 SVG 렌더링

import { fmt } from './optimizer.js';

export const PALETTE = [
  '#cfdec4', '#f2d5a8', '#bdd4e7', '#e8c6c2', '#d7c9e8', '#f2e3a4',
  '#c2e0d5', '#e9cbaa', '#ccd6a0', '#dfc0d6', '#b9d8c9', '#eecdb2',
];

const INK = '#39301f';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fitFont(w, h, len) {
  return Math.min(h * 0.4, (w * 0.92) / Math.max(len, 1) / 0.6, 46);
}

export function renderSheetSVG(sheet, result) {
  const { stock, trim } = result;
  const W = stock.w, H = stock.h;
  const hid = `hatch-s${sheet.index}`;
  const out = [];

  out.push(
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" ` +
      `aria-label="원장 ${sheet.index + 1} 재단 배치도">`
  );
  out.push(
    `<defs><pattern id="${hid}" width="60" height="60" patternUnits="userSpaceOnUse" ` +
      `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="60" ` +
      `stroke="#8a7a5c" stroke-opacity="0.28" stroke-width="6"/></pattern></defs>`
  );
  // 원장 바탕
  out.push(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#f8f3e6" stroke="#7c6844" ` +
      `stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
  );
  // 남는 영역(빗금)
  for (const fr of sheet.freeRects) {
    out.push(
      `<rect x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.h}" fill="url(#${hid})"/>`
    );
  }
  // 가장자리 손질 영역
  if (trim > 0) {
    out.push(
      `<rect x="${trim}" y="${trim}" width="${W - trim * 2}" height="${H - trim * 2}" ` +
        `fill="none" stroke="#b39b6e" stroke-width="1" stroke-dasharray="18 14" ` +
        `vector-effect="non-scaling-stroke"/>`
    );
  }

  for (const p of sheet.placements) {
    const color = PALETTE[p.partIndex % PALETTE.length];
    const dims = `${fmt(p.w)}×${fmt(p.h)}${p.rotated ? ' ↻' : ''}`;
    out.push(
      `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${color}" ` +
        `stroke="#6d5c3d" stroke-width="1" vector-effect="non-scaling-stroke">` +
        `<title>${esc(p.name)} — ${dims}</title></rect>`
    );

    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const fsName = fitFont(p.w, p.h, [...p.name].length);
    const fsDims = fitFont(p.w, p.h, dims.length);

    if (fsName >= 15 && fsDims >= 13 && p.h >= (fsName + fsDims) * 1.9) {
      out.push(
        `<text x="${cx}" y="${cy}" fill="${INK}" font-size="${fsName.toFixed(1)}" ` +
          `text-anchor="middle" dominant-baseline="auto" dy="-0.18em">${esc(p.name)}</text>`
      );
      out.push(
        `<text x="${cx}" y="${cy}" fill="${INK}" fill-opacity="0.78" ` +
          `font-size="${(fsDims * 0.88).toFixed(1)}" text-anchor="middle" ` +
          `dominant-baseline="hanging" dy="0.25em">${dims}</text>`
      );
    } else if (fsDims >= 11) {
      out.push(
        `<text x="${cx}" y="${cy}" fill="${INK}" font-size="${fsDims.toFixed(1)}" ` +
          `text-anchor="middle" dominant-baseline="middle">${dims}</text>`
      );
    } else {
      const fsNo = Math.min(p.h * 0.6, p.w * 0.6, 34);
      if (fsNo >= 9) {
        out.push(
          `<text x="${cx}" y="${cy}" fill="${INK}" font-size="${fsNo.toFixed(1)}" ` +
            `text-anchor="middle" dominant-baseline="middle">${p.partIndex + 1}</text>`
        );
      }
    }
    out.push('</g>');
  }

  out.push('</svg>');
  return out.join('');
}

// 각재 1개(bar)의 길이 재단 배치도
export function renderBarSVG(bar, group, result, uid) {
  const L = result.stockLen;
  const H = Math.max(150, Math.min(240, L / 14)); // 원자재가 짧아도 라벨이 들어갈 높이 확보
  const y0 = 6, bh = H - 12;
  const trim = result.trim;
  const hid = `hatch-${uid}`;
  const out = [];

  out.push(
    `<svg viewBox="0 0 ${L} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" ` +
      `aria-label="각재 ${esc(group.spec || '')} 원자재 ${bar.index + 1} 재단 배치도">`
  );
  out.push(
    `<defs><pattern id="${hid}" width="60" height="60" patternUnits="userSpaceOnUse" ` +
      `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="60" ` +
      `stroke="#8a7a5c" stroke-opacity="0.28" stroke-width="6"/></pattern></defs>`
  );
  out.push(
    `<rect x="0" y="${y0}" width="${L}" height="${bh}" fill="#f8f3e6" stroke="#7c6844" ` +
      `stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
  );

  // 남는 길이(자투리) 영역: 마지막 부재 끝 ~ 끝단 손질 직전
  const last = bar.pieces[bar.pieces.length - 1];
  const usedEnd = last ? last.x + last.len : trim;
  const leftoverStart = Math.min(usedEnd + (bar.pieces.length ? result.kerf : 0), L - trim);
  if (L - trim - leftoverStart > 0.5) {
    out.push(
      `<rect x="${leftoverStart}" y="${y0}" width="${L - trim - leftoverStart}" height="${bh}" fill="url(#${hid})"/>`
    );
  }
  // 끝단 손질 영역
  if (trim > 0) {
    out.push(
      `<rect x="${trim}" y="${y0}" width="${L - trim * 2}" height="${bh}" fill="none" ` +
        `stroke="#b39b6e" stroke-width="1" stroke-dasharray="18 14" vector-effect="non-scaling-stroke"/>`
    );
  }

  bar.pieces.forEach((p, i) => {
    const color = PALETTE[p.itemIndex % PALETTE.length];
    const label = `${p.name} ${fmt(p.len)}`;
    out.push(
      `<g><rect x="${p.x}" y="${y0}" width="${p.len}" height="${bh}" fill="${color}" ` +
        `stroke="#6d5c3d" stroke-width="1" vector-effect="non-scaling-stroke">` +
        `<title>${esc(p.name)} — ${fmt(p.len)}mm</title></rect>`
    );
    const cx = p.x + p.len / 2;
    const cy = y0 + bh / 2;
    const fsH = Math.min(bh * 0.36, (p.len * 0.9) / Math.max(label.length, 1) / 0.6);
    if (fsH >= 26) {
      out.push(
        `<text x="${cx}" y="${cy}" fill="${INK}" font-size="${fsH.toFixed(1)}" ` +
          `text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`
      );
    } else {
      // 좁은 부재는 세로 라벨 (길이만)
      const lv = fmt(p.len);
      const fsV = Math.min(p.len * 0.5, (bh * 0.9) / Math.max(lv.length, 1) / 0.6, 44);
      if (fsV >= 18) {
        out.push(
          `<text x="${cx}" y="${cy}" fill="${INK}" font-size="${fsV.toFixed(1)}" ` +
            `text-anchor="middle" dominant-baseline="middle" ` +
            `transform="rotate(-90 ${cx} ${cy})">${lv}</text>`
        );
      }
    }
    out.push('</g>');
    // 톱날 자리 표시
    if (i < bar.pieces.length - 1 && result.kerf > 0) {
      out.push(
        `<rect x="${p.x + p.len}" y="${y0}" width="${result.kerf}" height="${bh}" fill="#6d5c3d" fill-opacity="0.5"/>`
      );
    }
  });

  out.push('</svg>');
  return out.join('');
}
