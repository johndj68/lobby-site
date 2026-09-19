export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#070D1A]">

      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-72 flex-col border-r border-white/[0.08] bg-[#08101F] lg:flex">
        {/* Logo area */}
        <div className="flex flex-col gap-2 border-b border-white/[0.08] px-6 py-5">
          <div className="h-11 w-32 animate-pulse rounded-lg bg-white/[0.07]" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.05]" />
        </div>

        {/* Nav items */}
        <div className="flex-1 px-3 py-5">
          <div className="mb-3 h-2 w-8 animate-pulse rounded bg-white/[0.06]" />
          <div className="space-y-0.5">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <div className="h-4 w-4 animate-pulse rounded bg-white/[0.07]" />
                <div
                  className="h-3 animate-pulse rounded bg-white/[0.07]"
                  style={{ width: `${55 + (i % 4) * 18}px` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] p-4 space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.08]" />
            <div className="flex-1">
              <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.06]" />
            </div>
          </div>
          <div className="h-9 w-full animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:pl-72">

        {/* Header skeleton */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#070D1A]/95 px-4 sm:px-6">
          {/* Mobile hamburger */}
          <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.07] lg:hidden" />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* "Ver site" */}
            <div className="hidden h-7 w-16 animate-pulse rounded-xl bg-white/[0.06] sm:block" />
            {/* "Exportar leads" */}
            <div className="hidden h-7 w-24 animate-pulse rounded-xl bg-white/[0.06] sm:block" />
            {/* "Nova solicitação" */}
            <div className="hidden h-7 w-32 animate-pulse rounded-xl bg-white/[0.08] sm:block" />
            {/* Chat icon */}
            <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.07]" />
            {/* Bell */}
            <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.07]" />
          </div>
        </header>

        {/* Page content skeleton */}
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">
          {/* Stats row */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
                <div className="mb-3 h-9 w-9 animate-pulse rounded-xl bg-white/[0.07]" />
                <div className="mb-2 h-6 w-12 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
          {/* Content area */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
              <div className="mb-4 h-5 w-32 animate-pulse rounded bg-white/[0.08]" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.07]" />
                    <div className="flex-1">
                      <div className="mb-1.5 h-3 w-3/4 animate-pulse rounded bg-white/[0.08]" />
                      <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/[0.05]" />
                    </div>
                    <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
              <div className="mb-4 h-5 w-24 animate-pulse rounded bg-white/[0.08]" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-white/[0.08]" />
                    <div
                      className="h-3 animate-pulse rounded bg-white/[0.07]"
                      style={{ width: `${50 + (i % 3) * 20}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
