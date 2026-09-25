/* Ícones permitidos para app_categories.icon — allowlist fechada (nunca
 * HTML/SVG livre). Nome salvo no banco é a chave; o mapa resolve pro
 * componente Lucide correspondente, usado tanto no admin (árvore/painel)
 * quanto no site público (seção de categorias da home). */

import {
  Sparkles, Settings2, TrendingUp, BarChart3, Shield, Grid3x3, Palette, Wrench,
  Code2, Database, MessageSquare, Users, ShoppingCart, FileText, CalendarClock,
  Mail, Globe, Lock, Zap, Rocket, Star, Tag, Boxes, Headphones,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles, Settings2, TrendingUp, BarChart3, Shield, Grid3x3, Palette, Wrench,
  Code2, Database, MessageSquare, Users, ShoppingCart, FileText, CalendarClock,
  Mail, Globe, Lock, Zap, Rocket, Star, Tag, Boxes, Headphones,
}

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP)

export const DEFAULT_CATEGORY_ICON: LucideIcon = Tag

export function resolveCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return DEFAULT_CATEGORY_ICON
  return CATEGORY_ICON_MAP[name] ?? DEFAULT_CATEGORY_ICON
}
