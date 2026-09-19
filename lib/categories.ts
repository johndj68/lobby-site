/* Configurações visuais das 4 categorias de serviço da LOBBY:
   Software, Automação, Dados e Cibersegurança.
   Centraliza cores, ícones e estilos para que qualquer componente
   possa exibir badges e cards de categoria de forma consistente
   sem duplicar valores de cor espalhados pelo código. */

import { Code2, Settings2, BarChart3, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* Formato dos estilos de badge usados no site público (fundo claro).
   Cada campo é uma string CSS direto para uso em style={{}} inline. */
export interface CategoryStyle {
  bg:     string  // cor de fundo semitransparente do badge
  text:   string  // cor do texto/label da categoria
  border: string  // cor da borda do badge
}

/* Formato das configurações usadas na área administrativa (tema escuro).
   Inclui ícone Lucide além das cores, pois o painel admin exibe ícones
   ao lado do nome da categoria em cards e listas de projetos. */
export interface CategoryCfg {
  icon:   LucideIcon  // componente de ícone representando a categoria
  color:  string      // cor principal do ícone/texto no tema escuro
  bg:     string      // fundo semitransparente para destaque no admin
  accent: string      // cor de acento para botões e bordas ativas
}

/** Light-theme badge — client-facing UI (bg/text/border). */
/* Mapa de estilos de badge para o site público (tema claro).
   Cada chave é o nome exato da categoria conforme salvo no banco.
   Usado em cards de portfólio, listas de projetos e filtros visíveis
   para clientes (empresas) na área pública. */
export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  'Software':       { bg: 'rgba(0,91,255,0.08)',   text: '#005BFF', border: 'rgba(0,91,255,0.22)'   },
  'Automação':      { bg: 'rgba(123,44,255,0.08)', text: '#7B2CFF', border: 'rgba(123,44,255,0.22)' },
  'Dados':          { bg: 'rgba(0,163,255,0.08)',  text: '#007ACC', border: 'rgba(0,163,255,0.22)'  },
  'Cibersegurança': { bg: 'rgba(5,150,105,0.08)',  text: '#059669', border: 'rgba(5,150,105,0.22)'  },
}

/* Estilo de fallback usado quando a categoria do item não corresponde
   a nenhuma chave do mapa acima (evita erros de renderização). */
export const DEFAULT_CATEGORY_STYLE: CategoryStyle = CATEGORY_STYLE['Software']

/** Dark-theme icon + color — admin UI (icon/color/bg/accent). */
/* Mapa de configurações para a área administrativa (tema escuro).
   Usado em dashboards de Líderes e Técnicos onde cada categoria
   precisa de ícone + paleta de cores adaptada ao fundo escuro. */
export const CATEGORY_CFG: Record<string, CategoryCfg> = {
  'Software':       { icon: Code2,     color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  accent: '#3B82F6' },
  'Automação':      { icon: Settings2, color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', accent: '#8B5CF6' },
  'Dados':          { icon: BarChart3, color: '#38BDF8', bg: 'rgba(56,189,248,0.12)',  accent: '#0EA5E9' },
  'Cibersegurança': { icon: Shield,    color: '#34D399', bg: 'rgba(52,211,153,0.12)',  accent: '#10B981' },
}

/* Configuração de fallback para o admin quando a categoria é desconhecida. */
export const DEFAULT_CATEGORY_CFG: CategoryCfg = CATEGORY_CFG['Software']

/* Lista ordenada dos nomes de categoria válidos no sistema.
   Usada para popular filtros, selects e loops que precisam
   iterar pelas categorias em ordem canônica.
   O "as const" garante tipagem literal (não só string[]). */
export const CATEGORY_NAMES = ['Software', 'Automação', 'Dados', 'Cibersegurança'] as const
