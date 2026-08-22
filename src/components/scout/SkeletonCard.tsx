export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface p-4">
      <div className="h-32 w-full animate-shimmer-sweep rounded-md bg-linear-to-br from-surface-raised via-border to-surface-raised bg-size-[200%_200%]" />
      <div className="mt-4 space-y-2.5">
        <div className="h-3 w-3/4 animate-shimmer-sweep rounded bg-surface-raised" />
        <div className="h-3 w-full animate-shimmer-sweep rounded bg-surface-raised" />
        <div className="h-3 w-5/6 animate-shimmer-sweep rounded bg-surface-raised" />
        <div className="mt-3 h-8 w-full animate-shimmer-sweep rounded bg-surface-raised" />
      </div>
    </div>
  );
}