'use client'

/*
 * Pagination — controle de paginação customizado do projeto LOBBY.
 *
 * ATENÇÃO: Este é um componente próprio do projeto, NÃO gerado pelo shadcn/ui.
 * Ele não usa primitivos Radix/Base UI — é construído com <button> e <span>
 * nativos estilizados com Tailwind CSS.
 *
 * ─────────────────────────────────────────────
 * COMPORTAMENTO:
 * ─────────────────────────────────────────────
 *   — Retorna null se totalPages <= 1 (não renderiza nada com uma única página).
 *   — Exibe botões de página com elipses ("…") para intervalos de páginas distantes.
 *   — Algoritmo de elipse: mostra sempre a primeira, a última e as páginas
 *     vizinhas da atual (Math.abs(i - page) <= 1). As demais viram "…".
 *   — Botões Anterior/Próxima ficam desabilitados nas extremidades.
 *
 * ─────────────────────────────────────────────
 * ÍNDICE DE PÁGINAS:
 * ─────────────────────────────────────────────
 *   A prop `page` é 0-indexed internamente, mas exibe 1-indexed para o usuário.
 *   Ex: page=0 → mostra "1", page=4 → mostra "5".
 *   onPageChange recebe o índice 0-indexed da nova página.
 *
 * ─────────────────────────────────────────────
 * VARIANTES (prop `variant`):
 * ─────────────────────────────────────────────
 *   "light" (padrão) — para fundos claros (branco/cinza claro)
 *     • Página ativa : gradiente azul-roxo com sombra
 *     • Página normal: borda cinza, texto cinza, hover azul
 *     • Seta        : borda cinza, hover azul
 *
 *   "dark"           — para fundos escuros
 *     • Página ativa : mesmo gradiente azul-roxo (sombra mais forte)
 *     • Página normal: borda/fundo brancos translúcidos, hover mais opaco
 *     • Seta        : estilo branco translúcido
 *
 * ─────────────────────────────────────────────
 * ACESSIBILIDADE:
 * ─────────────────────────────────────────────
 *   — role="navigation" + aria-label="Paginação" no contêiner
 *   — aria-label em cada botão ("Página anterior", "Próxima página", "Página N")
 *   — aria-current="page" na página ativa
 *   — aria-hidden="true" nas elipses (decorativas, não interativas)
 *   — disabled nativo nos botões de seta quando nas extremidades
 *
 * ─────────────────────────────────────────────
 * INTERFACE (props):
 * ─────────────────────────────────────────────
 *   page         — índice atual (0-indexed)
 *   totalPages   — total de páginas
 *   onPageChange — (page: number) => void — chamado com o novo índice
 *   variant?     — "light" | "dark" (padrão: "light")
 *   className?   — classes extras para o contêiner
 *
 * ─────────────────────────────────────────────
 * EXEMPLO DE USO:
 * ─────────────────────────────────────────────
 *   const [pagina, setPagina] = useState(0)
 *
 *   <Pagination
 *     page={pagina}
 *     totalPages={Math.ceil(total / porPagina)}
 *     onPageChange={setPagina}
 *     variant="light"
 *     className="mt-8"
 *   />
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page:         number          // 0-indexed
  totalPages:   number
  onPageChange: (p: number) => void
  variant?:     'light' | 'dark'
  className?:   string
}

export default function Pagination({ page, totalPages, onPageChange, variant = 'light', className = '' }: PaginationProps) {
  // Não renderiza quando há apenas uma página
  if (totalPages <= 1) return null

  const isDark = variant === 'dark'

  // Gera array de páginas com ellipsis
  // Inclui sempre: primeira, última e vizinhas da página atual (±1)
  // Demais posições viram '…' (apenas um por intervalo consecutivo)
  const pages: (number | '…')[] = []
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…')
    }
  }

  // Classes base compartilhadas por todos os botões (tamanho, forma, transição)
  const btnBase = `inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-150`

  // Botão de página ATIVA — gradiente azul → roxo com sombra colorida
  const btnActive = isDark
    ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.30)]'
    : 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.22)]'

  // Botão de página NORMAL (não ativa)
  const btnNormal = isDark
    ? 'border border-white/[0.08] bg-white/[0.04] text-white/50 hover:border-white/20 hover:text-white/80'
    : 'border border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'

  // Botões de seta (Anterior / Próxima) — com estado desabilitado
  const btnArrow = isDark
    ? 'border border-white/[0.08] bg-white/[0.04] text-white/40 hover:border-white/20 hover:text-white/80 disabled:opacity-25 disabled:cursor-not-allowed'
    : 'border border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF] disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`} role="navigation" aria-label="Paginação">
      {/* Anterior */}
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        aria-label="Página anterior"
        className={`${btnBase} ${btnArrow}`}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      {/* Páginas — números e elipses */}
      {pages.map((p, idx) =>
        p === '…' ? (
          // Elipse não-interativa entre intervalos de páginas
          <span
            key={`ellipsis-${idx}`}
            className={`flex h-9 w-9 items-center justify-center text-sm ${isDark ? 'text-white/25' : 'text-[#5D6475]/40'}`}
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          // Botão de página numérica
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p as number)}
            aria-label={`Página ${(p as number) + 1}`}
            aria-current={page === p ? 'page' : undefined}
            className={`${btnBase} ${page === p ? btnActive : btnNormal}`}
          >
            {/* Exibe 1-indexed para o usuário */}
            {(p as number) + 1}
          </button>
        )
      )}

      {/* Próxima */}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages - 1}
        aria-label="Próxima página"
        className={`${btnBase} ${btnArrow}`}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
