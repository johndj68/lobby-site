// Server Component — roda no servidor, sem estado ou interatividade direta.
// Responsabilidade: ler o query param 'q' da URL e gerar metadata de SEO.
import type { Metadata } from 'next'
import BuscaClient from './BuscaClient'

// Props da página — searchParams é uma Promise no Next.js 15 (async server component)
// q: termo de busca passado via query string (?q=...)
interface Props {
  searchParams: Promise<{ q?: string }>
}

// Gera o <title> dinamicamente conforme o termo buscado para melhor SEO
// Ex: '"automação" — Busca | LOBBY' ou 'Busca | LOBBY' quando sem termo
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams
  return {
    title: q ? `"${q}" — Busca | LOBBY` : 'Busca | LOBBY',
    description: 'Pesquise projetos e materiais da LOBBY.',
  }
}

export default async function BuscaPage({ searchParams }: Props) {
  const { q } = await searchParams
  // Server component apenas lê o searchParam e passa para o client.
  // O client busca direto no Supabase (browser → Supabase, sem hop extra).
  // initialQ é a string vazia quando 'q' não existe na URL
  return <BuscaClient initialQ={q ?? ''} />
}
