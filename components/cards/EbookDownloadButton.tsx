'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, ArrowRight, ShoppingCart, LogIn, Loader2, Clock, Coins } from 'lucide-react'
import type { Resource } from '@/types'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits } from '@/lib/credits'

/* Props do componente:
   - resource: objeto do recurso com dados de preço, caminho do arquivo protegido etc.
   - isLoggedIn: se o usuário está autenticado (define se mostra login ou compra)
   - isPurchased: se o usuário já possui este recurso (libera download direto)
   - creditBalance: saldo de créditos do usuário.
       null = ainda não carregado / deslogado — esconde o botão de créditos
       até saber o saldo, evita mostrar "comprar com créditos" que falharia.
   - onFreeDownload: callback para registrar/iniciar download de recurso gratuito
   - onBuyClick: callback que abre o fluxo de pagamento para recurso pago
   - onRedeemedWithCredits: callback chamado após resgate bem-sucedido com créditos */
interface Props {
  resource:     Resource
  isLoggedIn:   boolean
  isPurchased:  boolean
  /** null = ainda não carregado / deslogado — esconde o botão de créditos
   *  até saber o saldo, evita mostrar "comprar com créditos" que falharia. */
  creditBalance: number | null
  onFreeDownload: (resource: Resource) => void
  onBuyClick:     (resource: Resource) => void
  onRedeemedWithCredits: (resource: Resource) => void
}

/**
 * CTA de download do e-book — decide entre 5 estados possíveis:
 * gratuito, pago-em-breve, deslogado, pago-não-comprado, pago-comprado.
 * Comprado gera signed URL na hora (bucket privado materials-paid),
 * nunca expõe URL pública do arquivo pago.
 */
export default function EbookDownloadButton({ resource, isLoggedIn, isPurchased, creditBalance, onFreeDownload, onBuyClick, onRedeemedWithCredits }: Props) {
  // Estado de loading ao gerar signed URL para download (recurso já comprado)
  const [downloading, setDownloading] = useState(false)
  // Estado de loading durante resgate com créditos (RPC no Supabase)
  const [redeeming, setRedeeming] = useState(false)
  // Mensagem de erro exibida ao usuário em caso de falha em qualquer operação
  const [error, setError] = useState('')

  /* ── Estado 1: Recurso gratuito ────────────────────────────────────────
     Exibe botão "Baixar grátis" que chama o callback onFreeDownload. */
  if (!resource.isPaid) {
    return (
      <button
        type="button"
        onClick={() => onFreeDownload(resource)}
        className="group/btn mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#005BFF] transition-all hover:text-[#7B2CFF]"
      >
        <Download size={14} className="transition-transform duration-300 group-hover/btn:translate-y-0.5" aria-hidden="true" />
        Baixar grátis
        <ArrowRight size={13} className="transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
      </button>
    )
  }

  /* ── Estado 2: Recurso pago em breve (coming soon) ─────────────────────
     Exibe texto estático "Em breve" sem link de ação. */
  if (resource.saleStatus === 'coming_soon') {
    return (
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#5D6475]">
        <Clock size={14} aria-hidden="true" />
        Em breve
      </span>
    )
  }

  /* ── Estado 3: Usuário não autenticado ─────────────────────────────────
     Redireciona para login antes de permitir compra/download. */
  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="group/btn mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#D97706] transition-all hover:text-[#B45309]"
      >
        <LogIn size={14} aria-hidden="true" />
        Entrar para comprar
        <ArrowRight size={13} className="transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
      </Link>
    )
  }

  /* ── Estado 4: Logado mas ainda não comprou ────────────────────────────
     Exibe opções de compra: pagamento direto e/ou resgate com créditos. */
  if (!isPurchased) {
    // Verifica se o recurso aceita pagamento com créditos
    const canPayWithCredits = resource.creditPrice != null
    // Verifica se o usuário tem saldo suficiente para resgatar com créditos
    const hasEnoughCredits  = canPayWithCredits && creditBalance != null && creditBalance >= resource.creditPrice!

    /* handleRedeem: chama a RPC "redeem_credits_for_ebook" no Supabase.
       Desconta créditos do usuário e registra a posse do recurso, tudo em uma transação. */
    const handleRedeem = async () => {
      setRedeeming(true)
      setError('')
      try {
        const supabase = createClient()
        const { error: rpcErr } = await supabase.rpc('redeem_credits_for_ebook', { p_ebook_id: resource.id })
        if (rpcErr) throw rpcErr
        // Notifica o componente pai que o resgate foi concluído com sucesso
        onRedeemedWithCredits(resource)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível concluir a compra com créditos.')
      } finally {
        setRedeeming(false)
      }
    }

    return (
      <div className="mt-4 flex flex-col items-start gap-2">
        {/* Botão de compra via pagamento direto (Stripe/PIX etc.) */}
        <button
          type="button"
          onClick={() => onBuyClick(resource)}
          className="group/btn inline-flex items-center gap-1.5 text-sm font-bold text-[#D97706] transition-all hover:text-[#B45309]"
        >
          <ShoppingCart size={14} aria-hidden="true" />
          Comprar agora {resource.price != null ? `— ${formatCurrencyBRL(resource.price)}` : ''}
          <ArrowRight size={13} className="transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
        </button>

        {/* Opção de resgate com créditos — só exibida se o recurso aceita créditos e o saldo já foi carregado */}
        {canPayWithCredits && creditBalance != null && (
          hasEnoughCredits ? (
            // Usuário tem créditos suficientes: exibe botão de resgate
            <button
              type="button"
              onClick={handleRedeem}
              disabled={redeeming}
              className="group/btn inline-flex items-center gap-1.5 text-sm font-bold text-[#7B2CFF] transition-all hover:text-[#6021D6] disabled:opacity-60"
            >
              {/* Ícone alterna entre spinner (processando) e moeda (disponível) */}
              {redeeming ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Coins size={14} aria-hidden="true" />}
              {redeeming ? 'Processando...' : `Comprar com ${formatCredits(resource.creditPrice!)}`}
            </button>
          ) : (
            // Saldo insuficiente: exibe aviso e link para comprar mais créditos
            <div className="text-xs text-[#5D6475]">
              Saldo insuficiente para comprar com créditos ({formatCredits(creditBalance)} disponíveis).{' '}
              <Link href="/dashboard/creditos" className="font-semibold text-[#005BFF] hover:underline">Comprar créditos</Link>
            </div>
          )
        )}
        {/* Mensagem de erro do resgate com créditos */}
        {error && <p role="alert" className="text-[11px] text-red-500">{error}</p>}
      </div>
    )
  }

  /* ── Estado 5: Recurso já comprado — gera signed URL e abre o arquivo ──
     Usa o bucket privado "materials-paid" no Supabase Storage.
     A signed URL expira em 60 segundos — nunca fica exposta publicamente. */
  const handleDownload = async () => {
    if (!resource.protectedFilePath) {
      setError('Arquivo indisponível. Entre em contato com o suporte.')
      return
    }
    setDownloading(true)
    setError('')
    try {
      const supabase = createClient()
      // Gera URL temporária (60s) para o arquivo no bucket privado
      const { data, error: signErr } = await supabase.storage
        .from('materials-paid')
        .createSignedUrl(resource.protectedFilePath, 60)
      if (signErr || !data?.signedUrl) throw signErr ?? new Error('sem URL')
      // Abre o arquivo em nova aba sem referenciar a URL na página atual
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível gerar o link de download. Tente novamente.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-4">
      {/* Botão de download: desabilitado durante geração da URL; mostra spinner */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="group/btn inline-flex items-center gap-1.5 text-sm font-bold text-[#16A34A] transition-all hover:text-[#15803D] disabled:opacity-60"
      >
        {/* Alterna entre spinner (gerando link) e ícone de download */}
        {downloading
          ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          : <Download size={14} className="transition-transform duration-300 group-hover/btn:translate-y-0.5" aria-hidden="true" />
        }
        {downloading ? 'Gerando link...' : 'Baixar e-book'}
        {/* Seta só aparece quando não está carregando */}
        {!downloading && <ArrowRight size={13} className="transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />}
      </button>
      {/* Mensagem de erro do download */}
      {error && <p role="alert" className="mt-1.5 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
