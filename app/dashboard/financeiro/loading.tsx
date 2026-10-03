export default function FinanceiroLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div>
        <div className="mb-1 h-6 w-40 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      </div>
      <div className="h-14 rounded-xl bg-[#E3E7F0]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#E3E7F0]" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#E3E7F0]" />)}
      </div>
      <div className="h-64 rounded-xl bg-[#E3E7F0]" />
    </div>
  )
}
