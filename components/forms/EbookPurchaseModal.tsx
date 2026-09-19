'use client'

// Componente Client: exige interatividade (estados de UI, eventos de clique)
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { X, ShoppingCart, Loader2, CheckCircle2, MessageCircle } from 'lucide-react'
import type { Resource } from '@/types'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'

// Props recebidas pelo componente
// resource: e-book a ser comprado (título, preço, descrição de venda)
// userId:   ID do usuário autenticado — obrigatório para registrar a compra
// onClose:  callback para fechar o modal (controla AnimatePresence no pai)
interface Props {
  resource: Resource
  userId:   string
  onClose:  () => void
}

/**
 * Fluxo de compra do e-book — não existe gateway de pagamento real ainda
 * (lib/stripe.ts é só um stub, sem checkout/webhook). Registra a intenção
 * de compra como 'pending' em ebook_purchases e orienta o usuário a
 * finalizar por contato direto; o técnico líder confirma manualmente
 * depois em /admin/financeiro, o que libera o download.
 */
export default function EbookPurchaseModal({ resource, userId, onClose }: Props) {
  // Estados de UI do fluxo de compra
  const [loading, setLoading] = useState(false) // evita duplo clique no botão Continuar
  const [done, setDone]       = useState(false)  // controla qual tela exibir (formulário ou confirmação)
  const [error, setError]     = useState('')      // mensagem de erro do insert no banco

  /* Registra o interesse de compra na tabela ebook_purchases com status 'pending'.
   * O pagamento real é processado manualmente pelo time; após confirmação o status
   * muda para 'paid', liberando o download para o usuário. */
  const handleContinue = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: dbError } = await supabase.from('ebook_purchases').insert({
        ebook_id: resource.id,
        user_id:  userId,
        amount:   resource.price ?? 0, // armazena 0 se preço não definido
        status:   'pending',           // aguarda confirmação manual pelo admin
      })
      if (dbError) throw dbError
      setDone(true) // muda para tela de confirmação de pedido registrado
    } catch {
      setError('Não foi possível registrar seu pedido. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    // Overlay fixo cobrindo toda a viewport — z-50 fica acima do header/navbar
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Fundo semi-transparente com blur — clique fecha o modal */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card do modal — animação de entrada com scale + slide */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
      >
        {/* Botão X para fechar no canto superior direito */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020]"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* ── TELA DE CONFIRMAÇÃO (após registrar pedido com sucesso) ── */}
        {done ? (
          <div className="py-6 text-center">
            {/* Ícone de sucesso */}
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16A34A]/10">
              <CheckCircle2 className="text-[#16A34A]" size={26} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Pedido registrado!
            </h3>
            <p className="mb-6 text-sm leading-relaxed text-[#5D6475]">
              Pagamento online em implantação. Entre em contato para concluir a compra
              e liberar o download de <span className="font-semibold text-[#0B1020]">{resource.title}</span>.
            </p>
            {/* CTA para contato — equipe confirma manualmente e libera o download */}
            <Link
              href="/contato"
              className="inline-flex items-center gap-2 rounded-xl lobby-gradient px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle size={16} />
              Falar com a equipe
            </Link>
          </div>
        ) : (
          /* ── TELA INICIAL: detalhes do e-book + botão de compra ── */
          <>
            {/* Cabeçalho: ícone, título e descrição do e-book */}
            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D97706]/10">
                <ShoppingCart className="text-[#D97706]" size={20} />
              </div>
              <h3 className="mb-1 text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {resource.title}
              </h3>
              {/* Usa saleDescription quando disponível, caso contrário usa description genérica */}
              <p className="text-sm text-[#5D6475]">{resource.saleDescription || resource.description}</p>
            </div>

            {/* Linha de preço — usa formatCurrencyBRL para formatar em R$ */}
            <div className="mb-6 flex items-center justify-between rounded-xl border border-[#E3E7F0] bg-[#F7F8FC] px-4 py-3">
              <span className="text-sm font-medium text-[#5D6475]">Valor</span>
              <span className="text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {resource.price != null ? formatCurrencyBRL(resource.price) : '—'}
              </span>
            </div>

            {/* Aviso em destaque: pagamento online ainda não disponível */}
            <p className="mb-6 rounded-xl bg-[#FFFBEB] px-4 py-3 text-xs leading-relaxed text-[#92400E]">
              O pagamento online ainda está em implantação. Ao continuar, registramos seu
              interesse e nossa equipe entra em contato para concluir a compra com segurança.
            </p>

            {/* Mensagem de erro exibida se o insert no banco falhar */}
            {error && <p role="alert" className="mb-4 text-xs text-red-500">{error}</p>}

            {/* Botões de ação: cancelar (fecha o modal) ou continuar (registra pedido) */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[#E3E7F0] py-3 text-sm font-semibold text-[#5D6475] transition-colors hover:bg-[#F7F8FC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={loading} // desabilita durante a requisição ao Supabase
                className="flex flex-1 items-center justify-center gap-2 rounded-xl lobby-gradient py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {/* Alterna entre spinner de loading e ícone de carrinho */}
                {loading ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
                {loading ? 'Enviando...' : 'Continuar'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
