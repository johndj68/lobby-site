// Skeleton exibido dentro do <main> do DashboardShell enquanto a página carrega.
// NÃO renderiza sidebar/header — esses vêm do layout.tsx (DashboardShell).
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Hero / boas-vindas skeleton */}
      <div className="rounded-3xl border border-[#E3E7F0] bg-white p-6 sm:p-8">
        <div className="mb-4 h-4 w-32 rounded-full bg-[#E3E7F0]" />
        <div className="mb-3 h-7 w-64 rounded-lg bg-[#E3E7F0]" />
        <div className="mb-2 h-3 w-48 rounded bg-[#E3E7F0]" />
        <div className="mb-6 h-3 w-80 rounded bg-[#E3E7F0]" />
        <div className="flex gap-2">
          <div className="h-8 w-32 rounded-xl bg-[#E3E7F0]" />
          <div className="h-8 w-36 rounded-xl bg-[#005BFF]/20" />
          <div className="h-8 w-32 rounded-xl bg-[#E3E7F0]" />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
            <div className="mb-3 h-9 w-9 rounded-xl bg-[#E3E7F0]" />
            <div className="mb-2 h-6 w-12 rounded bg-[#E3E7F0]" />
            <div className="h-3 w-20 rounded bg-[#E3E7F0]" />
          </div>
        ))}
      </div>

      {/* Content columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E3E7F0] bg-white p-6">
          <div className="mb-4 h-5 w-36 rounded bg-[#E3E7F0]" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#E3E7F0]" />
                <div className="flex-1">
                  <div className="mb-1.5 h-3 w-3/4 rounded bg-[#E3E7F0]" />
                  <div className="h-2.5 w-1/2 rounded bg-[#E3E7F0]" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E3E7F0] bg-white p-6">
          <div className="mb-4 h-5 w-44 rounded bg-[#E3E7F0]" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#E3E7F0] p-3">
                <div className="mb-2 h-3 w-1/2 rounded bg-[#E3E7F0]" />
                <div className="h-1.5 w-full rounded-full bg-[#E3E7F0]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
