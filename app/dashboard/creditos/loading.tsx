export default function CreditosLoading() {
  return (
    <div className="animate-pulse space-y-7">
      {/* Title */}
      <div className="h-8 w-44 rounded bg-[#E3E7F0]" />

      {/* Wallet card */}
      <div className="rounded-3xl border border-[#E3E7F0] bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 h-3 w-24 rounded bg-[#E3E7F0]" />
            <div className="h-10 w-32 rounded bg-[#E3E7F0]" />
          </div>
          <div className="h-14 w-14 rounded-2xl bg-[#E3E7F0]" />
        </div>
      </div>

      {/* Package grid */}
      <div>
        <div className="mb-4 h-5 w-40 rounded bg-[#E3E7F0]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
              <div className="mb-3 h-8 w-24 rounded-xl bg-[#E3E7F0]" />
              <div className="mb-2 h-6 w-20 rounded bg-[#E3E7F0]" />
              <div className="mb-4 h-3 w-full rounded bg-[#E3E7F0]" />
              <div className="h-9 w-full rounded-xl bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      <div>
        <div className="mb-4 h-5 w-36 rounded bg-[#E3E7F0]" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-[#E3E7F0] bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#E3E7F0]" />
                <div>
                  <div className="mb-1 h-3 w-32 rounded bg-[#E3E7F0]" />
                  <div className="h-2.5 w-20 rounded bg-[#E3E7F0]" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
