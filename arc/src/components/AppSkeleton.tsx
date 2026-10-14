/** Placeholder shaped like the dashboard, shown for the moment the app and sign-in are starting up. */
export default function AppSkeleton() {
  const block = "animate-pulse rounded-2xl border border-line bg-card";
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading Stash">
      <div className={`${block} h-20`} />
      <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)_300px] lg:gap-8">
        <div className="hidden space-y-2 lg:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
        <div className="space-y-4">
          <div className={`${block} h-48`} />
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${block} h-40`} />
            <div className={`${block} h-40`} />
          </div>
        </div>
        <div className={`${block} hidden h-64 lg:block`} />
      </div>
    </div>
  );
}
