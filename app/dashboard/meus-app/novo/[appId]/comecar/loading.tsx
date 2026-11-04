export default function ComecarLoading() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white">
      <div className="border-b border-[#E3E7F0] px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between">
          <div className="h-6 w-24 animate-pulse rounded bg-[#E3E7F0]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[#E3E7F0]" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] flex-1 animate-pulse px-4 py-8 sm:px-8">
        <div className="mb-1 h-8 w-80 max-w-full rounded bg-[#E3E7F0]" />
        <div className="h-4 w-64 max-w-full rounded bg-[#E3E7F0]" />

        <div className="mt-6 grid gap-6 lg:grid-cols-[65fr_35fr]">
          <div className="space-y-6">
            <div className="h-28 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC]" />
            <div className="h-64 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC]" />
            <div className="h-16 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC]" />
          </div>
          <div className="space-y-6">
            <div className="h-72 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC]" />
            <div className="h-32 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC]" />
          </div>
        </div>
      </div>
    </div>
  )
}
