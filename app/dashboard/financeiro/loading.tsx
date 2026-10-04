// Fallback do Next.js pra TODA a área /dashboard/financeiro/** (Visão
// geral, Vendas, Repasses, Ofertas, Configurações — nenhuma das outras 4
// tem loading.tsx próprio). Por isso o skeleton aqui é deliberadamente
// genérico — sem grade de 4 cards, sem bloco de gráfico — pra não
// destoar visualmente de nenhuma das 5 abas durante o flash inicial
// (achado #6: a versão anterior era moldada só pra Visão geral).
export default function FinanceiroLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div>
        <div className="mb-1 h-6 w-40 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      </div>
      <div className="h-24 rounded-xl bg-[#E3E7F0]" />
      <div className="h-40 rounded-xl bg-[#E3E7F0]" />
      <div className="h-16 rounded-xl bg-[#E3E7F0]" />
    </div>
  )
}
