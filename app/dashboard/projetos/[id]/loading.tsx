export default function ProjectDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Back link + title */}
      <div>
        <div className="mb-3 h-3 w-24 rounded bg-[#E3E7F0]" />
        <div className="mb-1 h-8 w-1/2 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-72 rounded bg-[#E3E7F0]" />
      </div>

      {/* Status + progress bar */}
      <div className="rounded-2xl border border-[#E3E7F0] bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-6 w-20 rounded-full bg-[#E3E7F0]" />
          <div className="h-3 w-32 rounded bg-[#E3E7F0]" />
        </div>
        <div className="h-2 w-full rounded-full bg-[#E3E7F0]">
          <div className="h-2 w-2/3 rounded-full bg-[#005BFF]/20" />
        </div>
        <div className="mt-2 h-2.5 w-16 rounded bg-[#E3E7F0]" />
      </div>

      {/* Module grid */}
      <div>
        <div className="mb-4 h-5 w-24 rounded bg-[#E3E7F0]" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-[#E3E7F0]" />
                <div className="h-4 w-1/2 rounded bg-[#E3E7F0]" />
              </div>
              <div className="h-3 w-full rounded bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div className="mb-4 h-5 w-28 rounded bg-[#E3E7F0]" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-7 w-7 rounded-full bg-[#E3E7F0]" />
              <div className="flex-1">
                <div className="mb-1 h-3 w-1/2 rounded bg-[#E3E7F0]" />
                <div className="h-2.5 w-1/3 rounded bg-[#E3E7F0]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
