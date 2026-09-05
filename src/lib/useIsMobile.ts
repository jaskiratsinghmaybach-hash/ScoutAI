"use client";

import { useEffect, useState } from "react";

// Single breakpoint for the whole app: below this width, ScoutApp
// renders the single-pane mobile layout (ScoutAppMobile) instead of
// the three-column desktop layout (ScoutAppDesktop). Kept in one
// place so both the JS check here and any matching CSS stay in sync.
const MOBILE_BREAKPOINT_PX = 768;

// IMPORTANT: this must always start as `false` (desktop) on every
// environment — server AND the client's very first render — even
// though that means a real phone briefly renders the desktop shell.
// React hydration requires the client's first render to produce the
// exact same tree the server sent down; if the lazy initialiser below
// read window.innerWidth synchronously, a phone's first client render
// would already say `true` while the server said `false`, which
// swaps the entire ScoutAppDesktop/ScoutAppMobile subtree and throws
// a hydration error (this bit us once — see the hydration-mismatch
// fix). The matchMedia effect corrects `isMobile` to the real value
// immediately after mount, i.e. one tick after hydration, which is
// unnoticeable in practice and is the standard safe pattern for any
// window-dependent value used in SSR'd client components.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);

    const update = () => setIsMobile(mql.matches);
    // Sync immediately on mount — this is what actually applies the
    // real value post-hydration, since the initial state above is
    // always false regardless of the real viewport.
    update();

    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}