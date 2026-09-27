'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Store, Loader2 } from 'lucide-react'
import Container from '@/components/layout/Container'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'

interface MarketplaceAppRow {
  id: string
  name: string
  slug: string
  short_description: string | null
  logo_url: string | null
  developer_name: string
  is_lobby_made: boolean
  category: string
  starting_price: number | null
  starting_price_currency: string | null
}

/**
 * Vitrine pública mínima — lista apps publicados via RPC
 * get_public_marketplace_apps (app_plans não tem policy pública, então a
 * lista de preço vem por uma função SECURITY DEFINER escopada, não por
 * select direto). Sem filtro/busca ainda — só o suficiente pra provar o
 * checkout de ponta a ponta.
 */
export default function MarketplacePage() {
  const [apps, setApps]       = useState<MarketplaceAppRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.rpc('get_public_marketplace_apps').then(({ data }) => {
      if (active) setApps((data as MarketplaceAppRow[]) ?? [])
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <Container className="py-16">
      <div className="mb-10">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-[#0B1020] sm:text-4xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          <Store size={30} className="text-[#005BFF]" aria-hidden="true" />
          Marketplace
        </h1>
        <p className="mt-2 text-sm text-[#5D6475]">Aplicativos prontos pra usar, da LOBBY e de parceiros.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[#005BFF]" aria-hidden="true" />
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] p-12 text-center">
          <p className="text-sm text-[#5D6475]">Nenhum aplicativo disponível no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, i) => (
            <motion.div key={app.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
              <Link href={`/marketplace/${app.slug}`}
                className="flex h-full flex-col rounded-2xl border border-[#E3E7F0] bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(11,16,32,0.08)]">
                <div className="mb-3 flex items-center gap-3">
                  {app.logo_url ? (
                    <Image src={app.logo_url} alt="" width={44} height={44} className="rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F7F8FC] text-lg font-bold text-[#005BFF]">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0B1020]">{app.name}</p>
                    <p className="truncate text-xs text-[#5D6475]">{app.is_lobby_made ? 'LOBBY' : app.developer_name}</p>
                  </div>
                </div>
                <p className="mb-4 line-clamp-2 flex-1 text-xs text-[#5D6475]">{app.short_description || app.category}</p>
                <p className="text-sm font-bold text-[#005BFF]">
                  {app.starting_price != null ? `A partir de ${formatCurrencyBRL(app.starting_price)}` : 'Ver preços'}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </Container>
  )
}
