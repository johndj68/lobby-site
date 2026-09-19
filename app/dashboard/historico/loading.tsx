export default function HistoricoLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div>
        <div className="mb-1 h-7 w-32 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-[#E3E7F0]" />
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="h-8 w-8 rounded-full bg-[#E3E7F0]" />
              {i < 4 && <div className="mt-1 h-16 w-0.5 bg-[#E3E7F0]" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="mb-1 h-4 w-2/3 rounded bg-[#E3E7F0]" />
              <div className="h-3 w-1/3 rounded bg-[#E3E7F0]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
