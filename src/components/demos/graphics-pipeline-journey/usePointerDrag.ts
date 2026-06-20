import { useEffect, useRef } from 'react';

/**
 * 캔버스 포인터 드래그 공용 훅 (모바일/iOS Safari 안전판).
 *
 * 왜 React의 onPointer* 합성 핸들러를 안 쓰나:
 * iOS Safari는 React 합성 포인터 핸들러 + 터치 조합에서, 드래그 도중
 * pointercancel을 던지거나 pointermove를 흘려보내 "터치는 인식되는데
 * 점이 안 따라오는" 증상이 난다. drei OrbitControls가 모바일에서 잘 되는 건
 * 캔버스에 네이티브 리스너를 { passive: false }로 직접 붙이고 preventDefault를
 * 호출하기 때문 — 여기서도 같은 방식을 쓴다.
 *
 * - pointerdown/move를 passive:false로 붙여 preventDefault 가능 (브라우저 제스처 차단)
 * - 드래그 상태를 ref로 동기 관리 (리렌더 stale closure 방지)
 * - setPointerCapture는 드래그 상태 설정 "후"에, try/catch로 감싸 호출
 *   (iOS 일부 버전에서 throw 시 드래그가 통째로 무력화되는 것 방지)
 *
 * (raymarching-sdf/usePointerDrag.ts와 동일 — 자급자족 폴더로 복사.)
 */
export interface DragHandlers {
  /** 드래그 시작 판정. false를 반환하면 그 포인터다운은 드래그로 보지 않음. */
  onDown: (e: PointerEvent, canvas: HTMLCanvasElement) => boolean | void;
  /** 드래그 중 이동 */
  onMove?: (e: PointerEvent, canvas: HTMLCanvasElement) => void;
  /** 드래그 종료(up/cancel) */
  onUp?: (e: PointerEvent, canvas: HTMLCanvasElement) => void;
  /** 버튼 안 누른 마우스 호버(데스크톱 전용) */
  onHover?: (e: PointerEvent, canvas: HTMLCanvasElement) => void;
  /** 포인터가 캔버스를 벗어남 */
  onLeave?: () => void;
}

export function usePointerDrag(
  ref: React.RefObject<HTMLCanvasElement | null>,
  handlers: DragHandlers,
): void {
  const hRef = useRef(handlers);
  hRef.current = handlers;
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // 드래그가 필요한 캔버스에만 touch-action:none(드래그가 페이지 스크롤에 안 먹힘).
    // 정적 도식 캔버스는 이 훅을 안 써서 기본 스크롤이 유지된다(global.css 참고).
    canvas.style.touchAction = 'none';
    canvas.style.minWidth = '0';

    const onDown = (e: PointerEvent) => {
      // iOS Safari: 기본 제스처(스크롤/줌)를 막아 드래그가 pointercancel로 끊기지 않게.
      e.preventDefault();
      const started = hRef.current.onDown(e, canvas);
      if (started === false) return;
      dragging.current = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* iOS 일부 버전에서 throw 가능 — 캡처 실패해도 window 리스너로 추적되므로 무시 */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (dragging.current) {
        e.preventDefault();
        hRef.current.onMove?.(e, canvas);
      } else if (e.pointerType === 'mouse') {
        hRef.current.onHover?.(e, canvas);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      hRef.current.onUp?.(e, canvas);
    };

    const onLeave = () => {
      if (!dragging.current) hRef.current.onLeave?.();
    };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [ref]);
}
