"use client";

/**
 * Placeholder for the idle right-panel design — you said you'll build
 * this yourself as a standalone page. Kept intentionally minimal so
 * swapping in the real design later means replacing only this file's
 * contents; nothing in ResultsPanel needs to change to accommodate it,
 * since it's already treated as an opaque slot that just needs to
 * exist and be blur-able (see ResultsPanel's blur wrapper).
 */
export function RightPanelIdle() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center text-sm text-neutral-500">
      <p className="max-w-xs">
        Describe a scene on the left to start scouting locations.
      </p>
    </div>
  );
}