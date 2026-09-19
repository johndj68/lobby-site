export default function SuporteLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="mb-1 h-7 w-24 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-40 rounded bg-[#E3E7F0]" />
      </div>

      {/* Contact channel cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
            <div className="mb-3 h-10 w-10 rounded-xl bg-[#E3E7F0]" />
            <div className="mb-1 h-4 w-2/3 rounded bg-[#E3E7F0]" />
            <div className="mb-3 h-3 w-full rounded bg-[#E3E7F0]" />
            <div className="h-3 w-1/2 rounded bg-[#E3E7F0]" />
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div>
        <div className="mb-4 h-5 w-44 rounded bg-[#E3E7F0]" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <div className="mb-2 h-4 w-3/4 rounded bg-[#E3E7F0]" />
              <div className="h-3 w-full rounded bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
