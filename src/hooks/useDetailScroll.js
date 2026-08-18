import { useLayoutEffect, useRef, useEffect } from "react";

// Complements Tailwind's `md:` breakpoint (min-width 768px): the app shows
// list and detail side by side at md+, and swaps them in place below it.
const MOBILE_QUERY = "(max-width: 767.98px)";

/**
 * On mobile (<768px) the list and detail panes swap in place — only one is
 * visible at a time. Opening a detail while scrolled deep into the list
 * would otherwise leave the user mid-page on the freshly shown detail,
 * forced to scroll up. So on mobile: scroll to top when the detail opens,
 * and restore the saved list offset on close.
 *
 * Two subtleties handled here:
 *
 * 1. Breakpoint crossing — we only restore on close if we actually saved on
 *    open (i.e. it was opened in mobile layout), and we discard the saved
 *    offset if the viewport grows to desktop while open, where the two-pane
 *    layout keeps the list visible and there's nothing to restore.
 *
 * 2. Scroll clamping — reading window.scrollY at open time would return a
 *    value already clamped to the (shorter) detail page, so we track the
 *    list's scroll position continuously while the list is showing and
 *    restore that true offset instead.
 */
export default function useDetailScroll(detailOpen) {
  const savedY = useRef(null); // null = nothing saved (opened on desktop, or closed)
  const lastListY = useRef(0); // true list offset, tracked pre-clamp
  const openRef = useRef(detailOpen);
  const wasOpen = useRef(detailOpen);

  // Track the list's scroll position while the detail is closed, so we
  // restore the real offset rather than one the shorter detail has clamped.
  useEffect(() => {
    const onScroll = () => {
      if (!openRef.current) lastListY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // If the viewport grows to desktop while a detail is open, the saved
  // offset is no longer meaningful — drop it so closing doesn't yank the
  // page to a stale position.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => {
      if (!e.matches) savedY.current = null; // now desktop
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const prev = wasOpen.current;
    wasOpen.current = detailOpen;
    openRef.current = detailOpen;
    if (prev === detailOpen) return;

    if (detailOpen) {
      // Save + jump to top only in mobile (single-pane) layout.
      if (window.matchMedia(MOBILE_QUERY).matches) {
        savedY.current = lastListY.current;
        window.scrollTo(0, 0);
      }
    } else if (savedY.current !== null) {
      // Restore only if we saved on open and haven't since gone desktop.
      window.scrollTo(0, savedY.current);
      savedY.current = null;
    }
  }, [detailOpen]);
}
