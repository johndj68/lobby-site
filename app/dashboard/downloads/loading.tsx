export default function DownloadsLoading() {
  return (
    <div className="animate-pulse space-y-10">
      {/* My downloads */}
      <section>
        <div className="mb-4 h-5 w-36 rounded bg-[#E3E7F0]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <div className="mb-3 h-32 rounded-xl bg-[#E3E7F0]" />
              <div className="mb-2 h-4 w-3/4 rounded bg-[#E3E7F0]" />
              <div className="h-3 w-1/2 rounded bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </section>

      {/* Library */}
      <section>
        <div className="mb-2 h-5 w-44 rounded bg-[#E3E7F0]" />
        <div className="mb-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-full bg-[#E3E7F0]" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <div className="mb-3 h-36 rounded-xl bg-[#E3E7F0]" />
              <div className="mb-2 h-4 w-3/4 rounded bg-[#E3E7F0]" />
              <div className="mb-3 h-3 w-full rounded bg-[#E3E7F0]" />
              <div className="h-8 w-full rounded-xl bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
