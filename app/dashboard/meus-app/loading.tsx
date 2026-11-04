export default function MeusAppLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-3 w-40 rounded bg-[#E3E7F0]" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-[#E3E7F0]" />
          <div className="h-4 w-80 rounded bg-[#E3E7F0]" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-36 rounded-xl bg-[#E3E7F0]" />
          <div className="h-10 w-40 rounded-xl bg-[#E3E7F0]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-2xl border border-[#E3E7F0] bg-white" />
        ))}
      </div>
      <div className="h-11 rounded-xl bg-[#E3E7F0]" />
      <div className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
        <div className="mb-4 h-4 w-32 rounded bg-[#E3E7F0]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3 h-12 rounded-xl bg-[#F7F8FC]" />
        ))}
      </div>
    </div>
  )
}
