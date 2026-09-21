'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Copy, Plus, Trash2, Edit2, RotateCcw } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import BackButton from '@/components/ui/BackButton'

interface TeamClientProps {
  draft: any
}

const PERMISSIONS = [
  { id: 'edit_app', label: 'Editar aplicativo', description: 'Atualizar textos, imagens e informações.' },
  { id: 'respond_qa', label: 'Responder perguntas e avaliações', description: 'Publicar respostas em nome da equipe.' },
  { id: 'manage_finance', label: 'Gerenciar financeiro', description: 'Acessar funções financeiras autorizadas.' },
]

export default function TeamClient({ draft }: TeamClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'equipe' | 'revisao'>('equipe')
  const [formData, setFormData] = useState({ name: '', email: '', scope: 'app', permissions: [] as string[] })
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Load members
  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    try {
      const res = await fetch(`/api/apps/team/${draft.id}/members`)
      if (res.ok) {
        setMembers(await res.json())
      }
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim() || !formData.email.trim() || selectedPerms.length === 0) {
      setError('Preencha todos os campos')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('E-mail inválido')
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/apps/team/${draft.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invited_name: formData.name,
          invited_email: formData.email,
          permissions: selectedPerms,
          scope: formData.scope,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao enviar')
      }

      setSent(true)
      setFormData({ name: '', email: '', scope: 'app', permissions: [] })
      setSelectedPerms([])
      await loadMembers()
      setTimeout(() => setSent(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const handleResend = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/apps/team/${draft.id}/invitations/${invitationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      })

      if (res.ok) {
        await loadMembers()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleCancel = async (invitationId: string) => {
    if (confirm('Cancelar convite?')) {
      try {
        const res = await fetch(`/api/apps/team/${draft.id}/invitations/${invitationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' }),
        })

        if (res.ok) {
          await loadMembers()
        }
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleRemove = async (memberId: string) => {
    if (confirm('Remover membro?')) {
      try {
        const res = await fetch(`/api/apps/team/${draft.id}/members/${memberId}`, {
          method: 'DELETE',
        })

        if (res.ok) {
          await loadMembers()
        }
      } catch (err) {
        console.error(err)
      }
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; bg: string; color: string }> = {
      pending: { text: 'Pendente', bg: '#FEF3C7', color: '#92400E' },
      accepted: { text: 'Aceito', bg: '#DCFCE7', color: '#166534' },
      expired: { text: 'Expirado', bg: '#FEE2E2', color: '#991B1B' },
      cancelled: { text: 'Cancelado', bg: '#F3F4F6', color: '#374151' },
    }
    const badge = badges[status] || badges.pending
    return <span style={{ background: badge.bg, color: badge.color, padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{badge.text}</span>
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      {/* Back Button */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <BackButton />
      </div>

      {/* Breadcrumb + Stage */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
          Meus aplicativos / {draft.name} / Equipe
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  stage < 4 ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {stage < 4 ? '✓' : '4'}
              </div>
              {stage < 4 && <div className="w-6 h-0.5" style={{ backgroundColor: colors.primary }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="bg-white border-b px-8 py-6" style={{ borderColor: colors.border }}>
        <h1 className="text-3xl font-bold mb-1" style={{ color: colors.text }}>Quem vai trabalhar com você?</h1>
        <div className="flex items-center gap-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>Convide pessoas para ajudar a gerenciar seu aplicativo na LOBBY.</p>
          <span className="text-xs font-semibold" style={{ color: colors.primary, background: '#F0F9FF', padding: '4px 8px', borderRadius: 4 }}>Opcional</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-t mt-4" style={{ borderColor: colors.border }}>
          <button
            onClick={() => setActiveTab('equipe')}
            className={`py-3 text-sm font-semibold border-b-2 ${activeTab === 'equipe' ? 'border-primary' : 'border-transparent'}`}
            style={{ color: activeTab === 'equipe' ? colors.primary : colors.textSecondary }}
          >
            Equipe
          </button>
          <button
            onClick={() => setActiveTab('revisao')}
            className={`py-3 text-sm font-semibold border-b-2 ${activeTab === 'revisao' ? 'border-primary' : 'border-transparent'}`}
            style={{ color: activeTab === 'revisao' ? colors.primary : colors.textSecondary }}
          >
            Revisão final
          </button>
        </div>
      </div>

      {/* Owner Card */}
      {activeTab === 'equipe' && members && (
        <div className="bg-white border-b px-8 py-4" style={{ borderColor: colors.border }}>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center" style={{ backgroundColor: colors.primary, color: 'white' }}>
                {members.owner.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold" style={{ color: colors.text }}>{members.owner.name}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Sua conta</p>
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: colors.primary, background: '#F0F9FF', padding: '4px 8px', borderRadius: 4 }}>Proprietário</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-8 max-w-7xl mx-auto w-full">
        {activeTab === 'equipe' && (
          <>
            {/* Left Column - Form */}
            <div className="flex-1 space-y-6">
              {/* Convidar Form */}
              <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <h3 className="font-bold mb-4" style={{ color: colors.text }}>Convidar colaborador</h3>

                {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: colors.text }}>Nome</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome do colaborador"
                      className="w-full px-4 py-2 rounded-lg border text-sm"
                      style={{ borderColor: colors.border, color: colors.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: colors.text }}>E-mail</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="pessoa@empresa.com"
                      className="w-full px-4 py-2 rounded-lg border text-sm"
                      style={{ borderColor: colors.border, color: colors.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: colors.text }}>Acesso concedido</label>
                    <select
                      value={formData.scope}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border text-sm"
                      style={{ borderColor: colors.border, color: colors.text }}
                    >
                      <option value="app">Somente este aplicativo</option>
                    </select>
                    <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>O convite permite acesso apenas ao aplicativo selecionado.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3" style={{ color: colors.text }}>Permissões</label>
                    <div className="space-y-2">
                      {PERMISSIONS.map((perm) => (
                        <label key={perm.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPerms.includes(perm.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPerms([...selectedPerms, perm.id])
                              } else {
                                setSelectedPerms(selectedPerms.filter(p => p !== perm.id))
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm" style={{ color: colors.text }}>{perm.label}</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>{perm.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs mt-3" style={{ color: colors.textSecondary }}>Selecione somente as permissões necessárias.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm"
                    style={{ backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }}
                  >
                    {sending ? 'Enviando...' : 'Enviar convite'}
                  </button>

                  {sent && <p style={{ color: colors.primary, fontSize: 14 }}>✓ Convite enviado com sucesso!</p>}
                </form>
              </div>
            </div>

            {/* Right Column - Info */}
            <div className="w-96 shrink-0">
              <div className="bg-white rounded-lg p-6 space-y-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <div>
                  <p className="font-bold text-sm" style={{ color: colors.text }}>Como funciona</p>
                </div>

                <div className="space-y-4">
                  {[
                    { num: 1, title: 'Envie o convite por e-mail', desc: 'A pessoa receberá um convite para colaborar no escopo escolhido.' },
                    { num: 2, title: 'A pessoa aceita com sua própria conta', desc: 'Ela entra ou cria uma conta na LOBBY e confirma o convite.' },
                    { num: 3, title: 'Gerencie o acesso pelo painel', desc: 'Você acompanha os convites e ajusta os acessos permitidos.' },
                  ].map((step) => (
                    <div key={step.num} className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center" style={{ background: '#F0F9FF', color: colors.primary }}>
                        <span className="text-sm font-bold">{step.num}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm" style={{ color: colors.text }}>{step.title}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    <strong>Observação:</strong> Convite pendente não concede acesso.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Members List */}
      {activeTab === 'equipe' && members && (
        <div className="bg-white border-t px-8 py-6" style={{ borderColor: colors.border }}>
          <h3 className="font-bold mb-4" style={{ color: colors.text }}>Colaboradores e convites</h3>

          {members.invitations.length === 0 && members.members.length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: colors.textSecondary }}>Nenhum colaborador adicionado</p>
              <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Os convites enviados aparecerão aqui para acompanhamento.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.invitations.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm" style={{ color: colors.text }}>{inv.invited_name}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{inv.invited_email}</p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Permissões: {inv.permissions.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(inv.status)}
                    {inv.status === 'pending' && (
                      <>
                        <button onClick={() => handleResend(inv.id)} className="p-2 hover:bg-gray-200 rounded" title="Reenviar">
                          <RotateCcw size={16} style={{ color: colors.primary }} />
                        </button>
                        <button onClick={() => handleCancel(inv.id)} className="p-2 hover:bg-red-200 rounded">
                          <Trash2 size={16} style={{ color: '#EF4444' }} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {members.members.map((mem: any) => (
                <div key={mem.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm" style={{ color: colors.text }}>Membro</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Permissões: {mem.permissions.join(', ')}</p>
                  </div>
                  <button onClick={() => handleRemove(mem.id)} className="p-2 hover:bg-red-200 rounded">
                    <Trash2 size={16} style={{ color: '#EF4444' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom */}
      <div className="bg-white border-t px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button className="text-sm font-semibold" style={{ color: colors.text }} onClick={() => router.back()}>
          ← Voltar para ativação
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/revisao`)} className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: colors.border, color: colors.text }}>
            Pular por enquanto
          </button>
          <button onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/revisao`)} className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: colors.primary }}>
            Continuar para revisão <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
