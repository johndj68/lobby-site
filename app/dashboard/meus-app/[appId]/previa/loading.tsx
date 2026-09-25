export default function PreviaLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-56 rounded bg-[#E3E7F0]" />
          <div className="h-3 w-72 rounded bg-[#E3E7F0]" />
        </div>
        <div className="h-8 w-40 rounded-lg bg-[#E3E7F0]" />
      </div>
      <div className="h-14 rounded-xl bg-[#F7F8FC]" />

      <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-[#E3E7F0]" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 rounded bg-[#E3E7F0]" />
              <div className="h-3 w-32 rounded bg-[#E3E7F0]" />
            </div>
          </div>
          <div className="aspect-video w-full rounded-xl bg-[#F7F8FC]" />
          <div className="h-24 rounded-xl bg-[#F7F8FC]" />
          <div className="h-32 rounded-xl bg-[#F7F8FC]" />
        </div>
        <div className="h-72 rounded-xl bg-[#F7F8FC]" />
      </div>
    </div>
  )
}
