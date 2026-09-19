export default function ProjetosLoading() {
  return (
    <div className="animate-pulse space-y-8">
      {/* Meus projetos */}
      <section>
        <div className="mb-4 h-5 w-32 rounded bg-[#E3E7F0]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="h-5 w-5 rounded bg-[#E3E7F0]" />
                <div className="h-5 w-20 rounded-full bg-[#E3E7F0]" />
              </div>
              <div className="mb-2 h-4 w-3/4 rounded bg-[#E3E7F0]" />
              <div className="mb-4 h-3 w-1/2 rounded bg-[#E3E7F0]" />
              <div className="h-1.5 w-full rounded-full bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </section>

      {/* Cases */}
      <section>
        <div className="mb-4 h-5 w-40 rounded bg-[#E3E7F0]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
              <div className="mb-3 h-32 rounded-xl bg-[#E3E7F0]" />
              <div className="mb-2 h-4 w-2/3 rounded bg-[#E3E7F0]" />
              <div className="h-3 w-1/2 rounded bg-[#E3E7F0]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
