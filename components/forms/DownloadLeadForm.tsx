'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Download, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Resource } from '@/types'
import { createClient } from '@/lib/supabase'

/* Props do componente:
 * - resource: dados do recurso (ebook/material) que será baixado
 * - onClose: callback para fechar o modal pelo componente pai */
interface DownloadLeadFormProps {
  resource: Resource
  onClose: () => void
}

/* Opções de área de interesse — usadas para segmentar o lead captado */
const interestOptions = ['Software', 'Automação', 'Dados', 'Cibersegurança']

/**
 * Modal de captura de lead antes de liberar o download de material gratuito.
 * Registra nome, e-mail, empresa e área de interesse na tabela `downloads`
 * e então exibe o link para download do arquivo. A captura de lead é o
 * objetivo principal — o download é liberado apenas após o preenchimento.
 */
export default function DownloadLeadForm({ resource, onClose }: DownloadLeadFormProps) {
  /* Estado único para os campos do formulário de lead */
  const [form, setForm] = useState({ name: '', email: '', company: '', interest_area: '' })

  // Indica se o insert no banco está em andamento
  const [loading, setLoading] = useState(false)

  // Controla exibição da tela de sucesso com o botão de download
  const [success, setSuccess] = useState(false)

  // Mensagem de erro exibida em caso de falha na validação ou na API
  const [error, setError] = useState('')

  /**
   * Valida nome e e-mail (obrigatórios) e registra o lead na tabela `downloads`.
   * Se a área de interesse não for selecionada, usa a categoria do recurso como fallback.
   * Após inserção bem-sucedida, exibe a tela de download.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: dbError } = await supabase.from('downloads').insert({
        resource_id:   resource.id,
        name:          form.name,
        email:         form.email,
        company:       form.company,
        // Usa a categoria do recurso como fallback se o usuário não selecionou interesse
        interest_area: form.interest_area || resource.category,
      })

      if (dbError) throw dbError

      // Lead registrado — libera a tela de download
      setSuccess(true)
    } catch {
      setError('Erro ao registrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Overlay fixo cobrindo toda a tela — z-50 garante que fique sobre o conteúdo */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay escurecido com blur — clique fora fecha o modal */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Caixa do modal — anima com scale e fade ao abrir/fechar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.25 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8"
      >
        {/* Botão de fechar no canto superior direito */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[#5D6475] hover:text-[#0B1020] hover:bg-[#F7F8FC] transition-colors"
        >
          <X size={18} />
        </button>

        {/* Tela de sucesso — exibida após lead registrado com sucesso */}
        {success ? (
          <div className="text-center py-6">
            {/* Ícone de download com gradiente da marca */}
            <div className="w-14 h-14 rounded-2xl lobby-gradient flex items-center justify-center mx-auto mb-5">
              <Download className="text-white" size={24} />
            </div>
            <h3
              className="text-xl font-bold text-[#0B1020] mb-2"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Pronto para baixar!
            </h3>
            <p className="text-sm text-[#5D6475] mb-6">
              Seu material está disponível. Clique para baixar.
            </p>
            {/* Link direto para o arquivo — atributo download força o salvamento local */}
            <a
              href={resource.fileUrl}
              download
              className="inline-flex items-center gap-2 px-6 py-3 lobby-gradient text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Download size={16} />
              Baixar {resource.title}
            </a>
          </div>
        ) : (
          /* Formulário de captura de lead */
          <>
            {/* Cabeçalho do modal com título e nome do recurso */}
            <div className="mb-6">
              <h3
                className="text-xl font-bold text-[#0B1020] mb-1"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Baixar material gratuito
              </h3>
              <p className="text-sm text-[#5D6475]">{resource.title}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campo: Nome completo — obrigatório para identificação do lead */}
              <div>
                <Label htmlFor="dl-name" className="text-sm font-medium text-[#0B1020]">Nome *</Label>
                <Input
                  id="dl-name"
                  placeholder="Seu nome completo"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1.5 border-[#E3E7F0] focus-visible:ring-[#005BFF]"
                />
              </div>

              {/* Campo: E-mail — obrigatório, usado para contato e nutrição de leads */}
              <div>
                <Label htmlFor="dl-email" className="text-sm font-medium text-[#0B1020]">E-mail *</Label>
                <Input
                  id="dl-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1.5 border-[#E3E7F0] focus-visible:ring-[#005BFF]"
                />
              </div>

              {/* Campo: Empresa — opcional, enriquece o perfil do lead */}
              <div>
                <Label htmlFor="dl-company" className="text-sm font-medium text-[#0B1020]">Empresa</Label>
                <Input
                  id="dl-company"
                  placeholder="Nome da sua empresa"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="mt-1.5 border-[#E3E7F0] focus-visible:ring-[#005BFF]"
                />
              </div>

              {/* Chips de área de interesse — opcional, segmenta o lead para marketing */}
              <div>
                <Label className="text-sm font-medium text-[#0B1020]">Área de interesse</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {interestOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm({ ...form, interest_area: opt })}
                      // Destaca visualmente a opção selecionada
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.interest_area === opt
                          ? 'border-[#005BFF] bg-[#005BFF]/5 text-[#005BFF]'
                          : 'border-[#E3E7F0] text-[#5D6475] hover:border-[#005BFF]/40'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mensagem de erro de validação ou falha na API */}
              {error && <p role="alert" className="text-xs text-red-500">{error}</p>}

              {/* Botão de submissão — desabilitado enquanto processa */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 lobby-gradient text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Baixar agora
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  )
}
