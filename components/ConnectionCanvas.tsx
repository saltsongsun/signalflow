'use client';
import { useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import type { Device, Connection, Layer } from '../lib/supabase';

type CableInfo = {
  fromId: string;
  toId: string;
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  strokeWidth: number;
  isTraced: boolean;
  isPatch: boolean;
  isPgm: boolean;
  dashArray?: number[];
};

type VirtualCableInfo = CableInfo & { isVirtual: true };

type Props = {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  cables: CableInfo[];
  virtualCables?: VirtualCableInfo[];
};

export type ConnectionCanvasHandle = {
  /** 드래그 중 호출 — React 재렌더 없이 Canvas만 다시 그림 */
  updateDragOffset: (dragOffset: { ids: Set<string>; worldDx: number; worldDy: number } | null) => void;
  /** 팬/줌 중 호출 — offset/scale만 바뀔 때도 빠르게 */
  updateTransform: (scale: number, offsetX: number, offsetY: number) => void;
};

/**
 * Connection을 canvas에 그리는 렌더러. Imperative handle로 React 재렌더 없이 업데이트 가능.
 */
const ConnectionCanvas = forwardRef<ConnectionCanvasHandle, Props>(function ConnectionCanvas({
  width, height, scale: initScale, offsetX: initOffsetX, offsetY: initOffsetY, cables, virtualCables = []
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const flowOffsetRef = useRef(0);

  // 최신 데이터를 ref로 유지 (re-render 없이도 draw에서 접근 가능)
  const stateRef = useRef({
    cables, virtualCables,
    scale: initScale, offsetX: initOffsetX, offsetY: initOffsetY,
    dragOffset: null as { ids: Set<string>; worldDx: number; worldDy: number } | null,
    width, height,
  });

  // props 변경 시 ref 업데이트 + 즉시 redraw — useLayoutEffect로 commit 직후 동기 실행
  useLayoutEffect(() => {
    stateRef.current.cables = cables;
    stateRef.current.virtualCables = virtualCables;
    stateRef.current.scale = initScale;
    stateRef.current.offsetX = initOffsetX;
    stateRef.current.offsetY = initOffsetY;
    stateRef.current.width = width;
    stateRef.current.height = height;
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, virtualCables, initScale, initOffsetX, initOffsetY, width, height]);

  // 고DPI 세팅
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const s = stateRef.current;
    const { cables: cs, virtualCables: vcs, scale, offsetX, offsetY, width: w, height: h, dragOffset } = s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // DPR 재설정 — 매 프레임 초기화 (ctx.scale이 누적되지 않도록)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const applyOffset = (c: CableInfo): CableInfo => {
      if (!dragOffset || dragOffset.ids.size === 0) return c;
      const fromMoved = dragOffset.ids.has(c.fromId);
      const toMoved = dragOffset.ids.has(c.toId);
      if (!fromMoved && !toMoved) return c;
      return {
        ...c,
        x1: fromMoved ? c.x1 + dragOffset.worldDx : c.x1,
        y1: fromMoved ? c.y1 + dragOffset.worldDy : c.y1,
        x2: toMoved ? c.x2 + dragOffset.worldDx : c.x2,
        y2: toMoved ? c.y2 + dragOffset.worldDy : c.y2,
      };
    };

    // 일반 케이블 먼저
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.isTraced) continue;
      drawCable(ctx, applyOffset(c), flowOffsetRef.current, false, scale);
    }
    for (let i = 0; i < vcs.length; i++) {
      const c = vcs[i];
      if (c.isTraced) continue;
      drawCable(ctx, applyOffset(c), flowOffsetRef.current, false, scale);
    }

    // Trace 케이블
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.isTraced) continue;
      drawCable(ctx, applyOffset(c), flowOffsetRef.current, true, scale);
    }
    for (let i = 0; i < vcs.length; i++) {
      const c = vcs[i];
      if (!c.isTraced) continue;
      drawCable(ctx, applyOffset(c), flowOffsetRef.current, true, scale);
    }

    const hasTraced = cs.some(c => c.isTraced) || vcs.some(c => c.isTraced);
    if (hasTraced) {
      flowOffsetRef.current -= 0.6;
      if (flowOffsetRef.current < -36) flowOffsetRef.current += 36;
      rafRef.current = requestAnimationFrame(draw);
    } else {
      rafRef.current = null;
    }
  };

  const requestDraw = () => {
    if (rafRef.current != null) return; // 이미 pending
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  useImperativeHandle(ref, () => ({
    updateDragOffset(dragOffset) {
      stateRef.current.dragOffset = dragOffset;
      requestDraw();
    },
    updateTransform(scale, offsetX, offsetY) {
      stateRef.current.scale = scale;
      stateRef.current.offsetX = offsetX;
      stateRef.current.offsetY = offsetY;
      requestDraw();
    },
  }));

  // cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
});

export default ConnectionCanvas;

function drawCable(ctx: CanvasRenderingContext2D, c: CableInfo, flowOffset: number, isTraced: boolean, scale: number = 1) {
  const { x1, y1, x2, y2, color } = c;

  // 부드러운 곡선 — 수평 우선 elbow.
  // 베지어로 그리되, 컨트롤 포인트는 두 점 사이 가로 중간 위치에 둠 → 위/아래로 솟구침 없음
  const midX = (x1 + x2) / 2;
  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    // 첫 컨트롤 (midX, y1) — 출발점 y에서 가로 중간으로
    // 두번째 컨트롤 (midX, y2) — 도착점 y에서 가로 중간으로
    // → S 모양 곡선이 두 점 사이 박스 안에서만 그려짐
    ctx.bezierCurveTo(midX, y1, midX, y2, x2, y2);
  };

  if (isTraced) {
    // Glow (바깥쪽 굵은 선, 반투명)
    ctx.save();
    drawPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // 베이스 라인 (두꺼움)
    ctx.save();
    drawPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // 흐름 애니메이션 (점선, animated dash offset)
    ctx.save();
    drawPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 12]);
    ctx.lineDashOffset = flowOffset;
    ctx.stroke();
    ctx.restore();
  } else {
    // 평상시: 얇은 실선 하나만
    ctx.save();
    drawPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = c.isPgm || c.isPatch ? 0.85 : 0.55;
    ctx.lineWidth = c.strokeWidth;
    ctx.lineCap = 'round';
    if (c.dashArray) {
      ctx.setLineDash(c.dashArray);
    }
    ctx.stroke();
    ctx.restore();
  }
}
