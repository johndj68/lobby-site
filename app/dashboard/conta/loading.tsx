export default function ContaLoading() {
  return (
    <div className="animate-pulse max-w-2xl space-y-6">
      <div>
        <div className="mb-1 h-7 w-36 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-48 rounded bg-[#E3E7F0]" />
      </div>

      <div className="rounded-2xl border border-[#E3E7F0] bg-white p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="mb-1.5 h-3 w-24 rounded bg-[#E3E7F0]" />
            <div className="h-10 w-full rounded-xl bg-[#E3E7F0]" />
          </div>
        ))}
        <div className="h-10 w-32 rounded-xl bg-[#005BFF]/20" />
      </div>
    </div>
  )
}
