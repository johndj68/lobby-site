export default function MensagensLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] animate-pulse flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="mb-1 h-6 w-36 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Thread list */}
        <div className="w-72 shrink-0 space-y-2 overflow-y-auto rounded-2xl border border-[#E3E7F0] bg-white p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-[#E3E7F0]" />
              <div className="flex-1">
                <div className="mb-1.5 h-3 w-3/4 rounded bg-[#E3E7F0]" />
                <div className="h-2.5 w-1/2 rounded bg-[#E3E7F0]" />
              </div>
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col rounded-2xl border border-[#E3E7F0] bg-white">
          <div className="border-b border-[#E3E7F0] p-4">
            <div className="h-4 w-40 rounded bg-[#E3E7F0]" />
          </div>
          <div className="flex-1 space-y-4 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`h-10 rounded-2xl bg-[#E3E7F0] ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
              </div>
            ))}
          </div>
          <div className="border-t border-[#E3E7F0] p-3">
            <div className="h-10 w-full rounded-xl bg-[#E3E7F0]" />
          </div>
        </div>
      </div>
    </div>
  )
}
