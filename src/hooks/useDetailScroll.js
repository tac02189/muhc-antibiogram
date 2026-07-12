import { useLayoutEffect, useRef } from "react";

/**
 * On mobile (<768px) the list and detail panes swap in place — only one
 * is visible at a time. Opening a detail while scrolled deep into the
 * list would otherwise leave the user mid-page on the freshly shown
 * detail, forced to scroll up. Scroll to top when the detail opens, and
 * restore the saved list offset when the user comes back.
 *
 * No-op on md+ screens, where both panes are visible side by side and
 * jumping the scroll would be disruptive.
 */
export default function useDetailScroll(detailOpen) {
  const listScrollY = useRef(0);
  const wasOpen = useRef(detailOpen);

  useLayoutEffect(() => {
    const prev = wasOpen.current;
    wasOpen.current = detailOpen;
    if (prev === detailOpen) return;
    if (window.innerWidth >= 768) return;
    if (detailOpen) {
      listScrollY.current = window.scrollY;
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, listScrollY.current);
    }
  }, [detailOpen]);
}
