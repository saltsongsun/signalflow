'use client';
import { useRef, useEffect } from 'react';
import type { Device, Connection, Layer } from '../lib/supabase';

type CableInfo = {
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

/**
 * Connection을 SVG 대신 canvas에 그리는 렌더러.
 * 큰 수의 케이블(~수백 개)에서도 60fps 달성.
 */
export default function ConnectionCanvas({
  width, height, scale, offsetX, offsetY, cables, virtualCables = []
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const flowOffsetRef = useRef(0); // 점선 흐름 애니메이션 오프셋

  // 실제 화면 크기와 canvas 픽셀 크기 맞춤 (Retina/고DPI 대응)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2x 캡으로 과도한 해상도 방지
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  // 메인 드로잉 — cables/transform 변경 시 실행
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const hasTraced = cables.some(c => c.isTraced) || virtualCables.some(c => c.isTraced);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      // 월드 좌표 변환 (scale + offset) — 장비 카드 transform과 일치
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // 일반 케이블 먼저 (배경 뒤로)
      cables.forEach(c => {
        if (c.isTraced) return; // trace는 마지막에 그려 glow 우선
        drawCable(ctx, c, flowOffsetRef.current, false);
      });
      virtualCables.forEach(c => {
        if (c.isTraced) return;
        drawCable(ctx, c, flowOffsetRef.current, false);
      });

      // Trace 케이블 (glow + 점선 애니메이션)
      cables.forEach(c => {
        if (!c.isTraced) return;
        drawCable(ctx, c, flowOffsetRef.current, true);
      });
      virtualCables.forEach(c => {
        if (!c.isTraced) return;
        drawCable(ctx, c, flowOffsetRef.current, true);
      });

      ctx.restore();

      // 애니메이션: trace 있을 때만 계속 redraw
      if (hasTraced) {
        flowOffsetRef.current -= 0.6;
        if (flowOffsetRef.current < -36) flowOffsetRef.current += 36;
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = null;
      }
    };

    // 이전 애니메이션 정리
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    draw();

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cables, virtualCables, scale, offsetX, offsetY, width, height]);

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
}

function drawCable(ctx: CanvasRenderingContext2D, c: CableInfo, flowOffset: number, isTraced: boolean) {
  const { x1, y1, x2, y2, color } = c;

  // 베지어 곡선 경로
  const dxAbs = Math.abs(x2 - x1);
  const dyAbs = Math.abs(y2 - y1);
  const ctrl = Math.max(80, dxAbs / 1.8, dyAbs / 2.5);

  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + ctrl, y1, x2 - ctrl, y2, x2, y2);
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
