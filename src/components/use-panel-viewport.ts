import { useEffect, type RefObject } from "react";

export function usePanelViewport(panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = panel.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;

    const adjust = () => {
      const bottom = Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop);
      element.style.setProperty("--panel-bottom-offset", `${bottom}px`);
      element.style.setProperty("--panel-viewport-height", `${viewport.height}px`);
    };
    adjust();
    viewport.addEventListener("resize", adjust);
    viewport.addEventListener("scroll", adjust);
    return () => {
      viewport.removeEventListener("resize", adjust);
      viewport.removeEventListener("scroll", adjust);
    };
  }, [panel]);
}
