/* Utilitários compartilhados por toda a aplicação.
   Funções pequenas e sem dependências de domínio que podem
   ser importadas em qualquer componente, client ou server. */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/* Combina classes CSS de forma segura, mesclando classes Tailwind
   conflitantes corretamente. Aceita qualquer mix de strings,
   arrays e objetos condicionais (ex.: cn('p-4', isOpen && 'block')).
   Substitui a concatenação manual de strings de className. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* Converte uma data ISO em texto relativo legível em português
   (ex.: "há 3 min", "há 2 dias", "agora mesmo").
   Usado em feeds de atividade, cards de projetos e notificações
   para mostrar "tempo atrás" em vez de data/hora brutas.
   - d: string de data no formato aceito por Date() ou null/undefined
   - nullStr: texto de fallback quando a data não existe (padrão: "—") */
export function timeAgo(d: string | null | undefined, nullStr = '—'): string {
  if (!d) return nullStr
  // Diferença em segundos entre agora e a data fornecida
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)    return 'agora mesmo'          // menos de 1 minuto
  if (s < 3600)  return `há ${Math.floor(s / 60)} min`   // menos de 1 hora
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`    // menos de 1 dia
  // A partir de 1 dia — pluraliza "dia" conforme necessário
  const days = Math.floor(s / 86400)
  return `há ${days} dia${days > 1 ? 's' : ''}`
}
