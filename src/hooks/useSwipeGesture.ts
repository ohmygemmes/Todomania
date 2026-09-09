import { useCallback, useEffect, useRef, useState } from "react";

export interface SwipeState {
  dx: number;
  dy: number;
  active: boolean;
}
interface Options {
  threshold?: number;
  enabled?: boolean;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}
const IDLE: SwipeState = { dx: 0, dy: 0, active: false };
const INTERACTIVE =
  'button, input, textarea, select, a, [contenteditable="true"], [data-swipe-ignore]';

/** One pointer path for finger, pen and mouse, with horizontal intent detection. */
export function useSwipeGesture<T extends HTMLElement>(opts: Options) {
  const { enabled = true } = opts;
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<SwipeState>(IDLE);
  const callbacks = useRef(opts);
  callbacks.current = opts;
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    horizontal: boolean;
  } | null>(null);
  const ignoreClickUntil = useRef(0);
  const stopPointerTracking = useRef<(() => void) | null>(null);
  const reset = useCallback(() => {
    stopPointerTracking.current?.();
    stopPointerTracking.current = null;
    const pointerId = gesture.current?.id;
    gesture.current = null;
    const el = ref.current;
    if (pointerId !== undefined && el?.hasPointerCapture(pointerId))
      el.releasePointerCapture(pointerId);
    setState(IDLE);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) {
        reset();
        return;
      }
      const interactive = (event.target as Element).closest(INTERACTIVE);
      const title = interactive?.matches("[data-swipe-title]");
      if (event.button !== 0 || (interactive && !title)) return;
      if (event.pointerType === "mouse") {
        // A simple title click must keep its native target and focus behavior.
        if (!title) event.preventDefault();
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          focused.matches('input, textarea, [contenteditable="true"]')
        )
          focused.blur();
      }
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        horizontal: false,
      };
      // Only the row/card under the pointer listens to global movement.
      // A long list must not run one global move handler per task.
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      stopPointerTracking.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          reset();
          return;
        }
        if (Math.abs(dx) < 8) return;
        current.horizontal = true;
        // Capturing at pointerdown retargeted title clicks to the row/card,
        // preventing inline editing. Capture only once a drag is intentional.
        el.setPointerCapture(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      current.dx = dx;
      current.dy = dy;
      setState({ dx, dy, active: true });
    };
    const up = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const limit =
        callbacks.current.threshold ?? Math.min(el.clientWidth * 0.28, 112);
      const action =
        current.horizontal && current.dx > limit
          ? callbacks.current.onSwipeRight
          : current.horizontal && current.dx < -limit
            ? callbacks.current.onSwipeLeft
            : undefined;
      if (current.horizontal)
        ignoreClickUntil.current = performance.now() + 350;
      reset();
      action?.();
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < ignoreClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const lost = (event: PointerEvent) => {
      // Touch starts with implicit capture on the title's child element. Its
      // lostpointercapture bubbles while capture transfers to the card: that
      // transfer is not a cancelled swipe.
      if (
        gesture.current?.id === event.pointerId &&
        (event.type === "pointercancel" || event.target === el)
      )
        reset();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointercancel", lost);
    el.addEventListener("lostpointercapture", lost);
    el.addEventListener("click", click, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointercancel", lost);
      el.removeEventListener("lostpointercapture", lost);
      el.removeEventListener("click", click, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      reset();
    };
  }, [enabled, reset]);
  return { ref, state, reset };
}
