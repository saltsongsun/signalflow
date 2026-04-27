'use client';
import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  opacity: number;        // 0~100
  x: number;
  y: number;
  scale: number;
  locked: boolean;
  onMove: (x: number, y: number) => void;
  onScale: (s: number) => void;
  onCommit: () => void;   // DB 저장
  onNaturalSize: (size: { w: number; h: number } | null) => void;
  naturalSize: { w: number; h: number } | null;
};

export default function BackgroundImageLayer({
  src, opacity, x, y, scale, locked,
  onMove, onScale, onCommit, onNaturalSize, naturalSize,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; origX: number; origY: number; origScale: number } | null>(null);

  // 자연 크기 측정
  const handleLoad = () => {
    if (imgRef.current) {
      onNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const point = 'touches' in e ? e.touches[0] : e;
      if (!point) return;
      const dx = point.clientX - drag.startX;
      const dy = point.clientY - drag.startY;
      if (drag.type === 'move') {
        onMove(drag.origX + dx, drag.origY + dy);
      } else if (drag.type === 'resize' && naturalSize) {
        // 모서리 끌기 — 대각선 거리 비율로 scale 변경
        const initialDist = Math.hypot(naturalSize.w * drag.origScale, naturalSize.h * drag.origScale);
        const newDist = Math.hypot(naturalSize.w * drag.origScale + dx, naturalSize.h * drag.origScale + dy);
        const newScale = drag.origScale * (newDist / initialDist);
        onScale(Math.max(0.1, Math.min(10, newScale)));
      }
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        onCommit();
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [onMove, onScale, onCommit, naturalSize]);

  const startMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const point = 'touches' in e ? e.touches[0] : e;
    draggingRef.current = {
      type: 'move',
      startX: point.clientX,
      startY: point.clientY,
      origX: x,
      origY: y,
      origScale: scale,
    };
    document.body.style.cursor = 'grabbing';
  };

  const startResize = (e: React.MouseEvent | React.TouchEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const point = 'touches' in e ? e.touches[0] : e;
    draggingRef.current = {
      type: 'resize',
      startX: point.clientX,
      startY: point.clientY,
      origX: x,
      origY: y,
      origScale: scale,
    };
    document.body.style.cursor = 'nwse-resize';
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        zIndex: 0,        // 가장 아래
        pointerEvents: locked ? 'none' : 'auto',
      }}
    >
      <img
        ref={imgRef}
        src={src}
        onLoad={handleLoad}
        alt="배경"
        draggable={false}
        onMouseDown={startMove}
        onTouchStart={startMove}
        style={{
          opacity: opacity / 100,
          display: 'block',
          maxWidth: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: locked ? 'default' : 'grab',
        }}
      />
      {/* 잠금 해제 시 모서리에 리사이즈 핸들 표시 */}
      {!locked && naturalSize && (
        <>
          <div
            onMouseDown={startResize}
            onTouchStart={startResize}
            style={{
              position: 'absolute',
              right: -8,
              bottom: -8,
              width: 18,
              height: 18,
              background: 'rgba(34, 197, 94, 0.9)',
              border: '2px solid white',
              borderRadius: 3,
              cursor: 'nwse-resize',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              zIndex: 2,
            }}
            title="크기 조절"
          />
          {/* 잠금 해제 표시 (좌상단) */}
          <div
            style={{
              position: 'absolute',
              left: 4,
              top: 4,
              padding: '2px 6px',
              background: 'rgba(34, 197, 94, 0.9)',
              color: 'white',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              borderRadius: 3,
              pointerEvents: 'none',
            }}
          >
            🔓 BG
          </div>
        </>
      )}
    </div>
  );
}
