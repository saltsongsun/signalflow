'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  opacity: number;        // 0~100
  x: number;
  y: number;
  width: number;          // 픽셀 단위 (도면 좌표계 기준)
  height: number;
  locked: boolean;
  keepAspectRatio: boolean;  // true면 모서리 드래그 시 종횡비 유지
  // x, y, width, height 변경 콜백
  onTransform: (next: { x: number; y: number; width: number; height: number }) => void;
  onCommit: () => void;   // 드래그 종료 시 DB 저장
  onNaturalSize: (size: { w: number; h: number } | null) => void;
};

// 핸들 위치 — 어떤 변/모서리를 잡았는지
type HandlePos =
  | 'move'
  | 'n' | 's' | 'e' | 'w'
  | 'ne' | 'nw' | 'se' | 'sw';

type DragState = {
  pos: HandlePos;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  // 모서리 드래그 시 종횡비 보존 기준값
  aspect: number;
};

export default function BackgroundImageLayer({
  src, opacity, x, y, width, height, locked, keepAspectRatio,
  onTransform, onCommit, onNaturalSize,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [hovering, setHovering] = useState(false);

  const handleLoad = () => {
    if (imgRef.current) {
      onNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const point = 'touches' in e ? e.touches[0] : e;
      if (!point) return;
      const dx = point.clientX - drag.startClientX;
      const dy = point.clientY - drag.startClientY;

      // 화면 좌표 → 도면 좌표 변환은 캔버스의 transform scale에 영향받음.
      // BackgroundImageLayer는 world 컨테이너 (transform: scale(scale))의 자식이므로,
      // dx, dy는 화면 픽셀이지만 우리는 world 픽셀로 변환해야 함.
      // 단, 부모의 scale을 직접 알기 어려우니 — `scale-aware delta` 계산을
      // CSS transform 자체가 흡수하도록 둠. 즉, 그대로 dx/dy를 world delta처럼 사용.
      // (실용상 큰 차이 없음. 사용자가 원하는 만큼 끌면 됨.)
      // 더 정확히 하려면 부모 transform을 측정해야 하지만 복잡도만 늘어남.
      // 여기서는 부모 transform이 적용되기 전 좌표계로 보정.
      const parent = (e.target as HTMLElement)?.closest('[data-bg-img-root]')?.parentElement;
      let scale = 1;
      if (parent) {
        const transform = window.getComputedStyle(parent).transform;
        if (transform && transform !== 'none') {
          const m = transform.match(/matrix\(([^,]+),/);
          if (m) scale = parseFloat(m[1]) || 1;
        }
      }
      const wdx = dx / scale;
      const wdy = dy / scale;

      let nx = drag.origX;
      let ny = drag.origY;
      let nw = drag.origW;
      let nh = drag.origH;

      switch (drag.pos) {
        case 'move':
          nx = drag.origX + wdx;
          ny = drag.origY + wdy;
          break;
        case 'e':
          nw = Math.max(20, drag.origW + wdx);
          break;
        case 'w':
          nw = Math.max(20, drag.origW - wdx);
          nx = drag.origX + (drag.origW - nw);
          break;
        case 's':
          nh = Math.max(20, drag.origH + wdy);
          break;
        case 'n':
          nh = Math.max(20, drag.origH - wdy);
          ny = drag.origY + (drag.origH - nh);
          break;
        case 'se':
          nw = Math.max(20, drag.origW + wdx);
          nh = Math.max(20, drag.origH + wdy);
          if (keepAspectRatio) {
            // 더 큰 변화량을 따라가도록
            const ratioW = nw / drag.origW;
            const ratioH = nh / drag.origH;
            const r = Math.abs(ratioW - 1) > Math.abs(ratioH - 1) ? ratioW : ratioH;
            nw = drag.origW * r;
            nh = drag.origH * r;
          }
          break;
        case 'ne':
          nw = Math.max(20, drag.origW + wdx);
          nh = Math.max(20, drag.origH - wdy);
          if (keepAspectRatio) {
            const ratioW = nw / drag.origW;
            const ratioH = nh / drag.origH;
            const r = Math.abs(ratioW - 1) > Math.abs(ratioH - 1) ? ratioW : ratioH;
            nw = drag.origW * r;
            nh = drag.origH * r;
          }
          ny = drag.origY + (drag.origH - nh);
          break;
        case 'sw':
          nw = Math.max(20, drag.origW - wdx);
          nh = Math.max(20, drag.origH + wdy);
          if (keepAspectRatio) {
            const ratioW = nw / drag.origW;
            const ratioH = nh / drag.origH;
            const r = Math.abs(ratioW - 1) > Math.abs(ratioH - 1) ? ratioW : ratioH;
            nw = drag.origW * r;
            nh = drag.origH * r;
          }
          nx = drag.origX + (drag.origW - nw);
          break;
        case 'nw':
          nw = Math.max(20, drag.origW - wdx);
          nh = Math.max(20, drag.origH - wdy);
          if (keepAspectRatio) {
            const ratioW = nw / drag.origW;
            const ratioH = nh / drag.origH;
            const r = Math.abs(ratioW - 1) > Math.abs(ratioH - 1) ? ratioW : ratioH;
            nw = drag.origW * r;
            nh = drag.origH * r;
          }
          nx = drag.origX + (drag.origW - nw);
          ny = drag.origY + (drag.origH - nh);
          break;
      }

      onTransform({ x: nx, y: ny, width: nw, height: nh });
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        onCommit();
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [onTransform, onCommit, keepAspectRatio]);

  const startDrag = (pos: HandlePos, e: React.MouseEvent | React.TouchEvent, cursor: string) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const point = 'touches' in e ? e.touches[0] : e;
    dragRef.current = {
      pos,
      startClientX: point.clientX,
      startClientY: point.clientY,
      origX: x,
      origY: y,
      origW: width,
      origH: height,
      aspect: height > 0 ? width / height : 1,
    };
    document.body.style.cursor = cursor;
  };

  const handleSize = 14;
  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: handleSize,
    height: handleSize,
    background: 'rgba(34, 197, 94, 0.95)',
    border: '2px solid white',
    borderRadius: 3,
    cursor,
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    zIndex: 2,
    pointerEvents: 'auto',
  });
  const edgeStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    background: 'rgba(34, 197, 94, 0.85)',
    border: '1.5px solid white',
    borderRadius: 2,
    cursor,
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
    zIndex: 2,
    pointerEvents: 'auto',
  });

  // 변(edge) 핸들 크기
  const edgeLong = 24;
  const edgeShort = 10;

  return (
    <div
      data-bg-img-root
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        zIndex: 0,
        pointerEvents: locked ? 'none' : 'auto',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <img
        ref={imgRef}
        src={src}
        onLoad={handleLoad}
        alt="배경"
        draggable={false}
        onMouseDown={e => startDrag('move', e, 'grabbing')}
        onTouchStart={e => startDrag('move', e, 'grabbing')}
        style={{
          opacity: opacity / 100,
          width: '100%',
          height: '100%',
          objectFit: 'fill',  // 자유 비율 — 종횡비 무시하고 채움
          display: 'block',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: locked ? 'default' : 'grab',
        }}
      />
      {/* 잠금 해제 시 핸들 표시 */}
      {!locked && (
        <>
          {/* 4개 모서리 (corners) */}
          <div onMouseDown={e => startDrag('nw', e, 'nwse-resize')} onTouchStart={e => startDrag('nw', e, 'nwse-resize')}
               style={{ ...handleStyle('nwse-resize'), left: -handleSize / 2, top: -handleSize / 2 }} title="좌상단 — 끌어 크기 조정" />
          <div onMouseDown={e => startDrag('ne', e, 'nesw-resize')} onTouchStart={e => startDrag('ne', e, 'nesw-resize')}
               style={{ ...handleStyle('nesw-resize'), right: -handleSize / 2, top: -handleSize / 2 }} title="우상단" />
          <div onMouseDown={e => startDrag('sw', e, 'nesw-resize')} onTouchStart={e => startDrag('sw', e, 'nesw-resize')}
               style={{ ...handleStyle('nesw-resize'), left: -handleSize / 2, bottom: -handleSize / 2 }} title="좌하단" />
          <div onMouseDown={e => startDrag('se', e, 'nwse-resize')} onTouchStart={e => startDrag('se', e, 'nwse-resize')}
               style={{ ...handleStyle('nwse-resize'), right: -handleSize / 2, bottom: -handleSize / 2 }} title="우하단" />
          {/* 4개 변 (edges) */}
          <div onMouseDown={e => startDrag('n', e, 'ns-resize')} onTouchStart={e => startDrag('n', e, 'ns-resize')}
               style={{ ...edgeStyle('ns-resize'), left: '50%', top: -edgeShort / 2, width: edgeLong, height: edgeShort, transform: 'translateX(-50%)' }} title="상단 변 — 위로/아래로 끌어 높이 조정" />
          <div onMouseDown={e => startDrag('s', e, 'ns-resize')} onTouchStart={e => startDrag('s', e, 'ns-resize')}
               style={{ ...edgeStyle('ns-resize'), left: '50%', bottom: -edgeShort / 2, width: edgeLong, height: edgeShort, transform: 'translateX(-50%)' }} title="하단 변" />
          <div onMouseDown={e => startDrag('w', e, 'ew-resize')} onTouchStart={e => startDrag('w', e, 'ew-resize')}
               style={{ ...edgeStyle('ew-resize'), top: '50%', left: -edgeShort / 2, width: edgeShort, height: edgeLong, transform: 'translateY(-50%)' }} title="좌측 변" />
          <div onMouseDown={e => startDrag('e', e, 'ew-resize')} onTouchStart={e => startDrag('e', e, 'ew-resize')}
               style={{ ...edgeStyle('ew-resize'), top: '50%', right: -edgeShort / 2, width: edgeShort, height: edgeLong, transform: 'translateY(-50%)' }} title="우측 변" />
          {/* 잠금 해제 표시 + 크기 표시 */}
          <div
            style={{
              position: 'absolute',
              left: 4, top: 4,
              padding: '3px 7px',
              background: 'rgba(34, 197, 94, 0.95)',
              color: 'white',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              borderRadius: 3,
              pointerEvents: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}
          >
            🔓 BG · {Math.round(width)}×{Math.round(height)}
          </div>
        </>
      )}
    </div>
  );
}
