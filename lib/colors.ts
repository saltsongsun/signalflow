// 흰색 도면(라이트) 모드용 색 보정
// 어두운 배경에 맞춰진 밝은 색(흰색·노랑 등)을 흰 배경에서도 잘 보이도록 어둡게 조정한다.
const cache = new Map<string, string>();

export function inkFor(color: string | undefined, light: boolean): string {
  if (!color) return color as any;
  if (!light) return color;
  const hit = cache.get(color);
  if (hit) return hit;
  let out = color;
  const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > 0.85) {
      out = '#64748B';                       // 흰색 계열 → 슬레이트 회색
    } else {
      const k = lum > 0.6 ? 0.45 : lum > 0.45 ? 0.3 : 0.12;   // 밝은 색일수록 더 어둡게
      const f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
      out = `#${f(r)}${f(g)}${f(b)}`;
    }
  }
  cache.set(color, out);
  return out;
}

// 라이트 모드의 장비 타입 색 (TYPE_COLORS 대응)
export const LIGHT_TYPE_COLORS: Record<string, { main: string; glow: string; bg: string; border: string }> = {
  video:    { main: '#2563EB', glow: '#3B82F6', bg: 'rgba(37,99,235,0.06)',  border: 'rgba(37,99,235,0.40)' },
  audio:    { main: '#DC2626', glow: '#EF4444', bg: 'rgba(220,38,38,0.06)',  border: 'rgba(220,38,38,0.40)' },
  combined: { main: '#9333EA', glow: '#A855F7', bg: 'rgba(147,51,234,0.06)', border: 'rgba(147,51,234,0.40)' },
  power:    { main: '#CA8A04', glow: '#EAB308', bg: 'rgba(202,138,4,0.08)',  border: 'rgba(202,138,4,0.45)' },
  network:  { main: '#475569', glow: '#64748B', bg: 'rgba(71,85,105,0.06)',  border: 'rgba(71,85,105,0.40)' },
};
