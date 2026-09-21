'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/design-tokens'

interface AcceptInviteClientProps {
  appId: string
  token: string
  invitation: any
  draft: any
  user: any
}

const PERMISSION_LABELS: Record<string, string> = {
  edit_app: 'Editar aplicativo',
  respond_qa: 'Responder perguntas e avaliações',
  manage_finance: 'Gerenciar financeiro',
}

export default function AcceptInviteClient({
  appId,
  token,
  invitation,
  draft,
  user,
}: AcceptInviteClientProps) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Check email match
    if (user && user.email?.toLowerCase() !== invitation.invited_email.toLowerCase()) {
      setError(
        `Este convite foi enviado para ${invitation.invited_email}. ` +
        `Você está conectado como ${user.email}. Troque de conta ou peça um novo convite.`
      )
    }

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      setError('Este convite expirou. Peça ao proprietário para reenviar.')
    }

    // Check status
    if (invitation.status !== 'pending') {
      setError(`Este convite já foi ${invitation.status}.`)
    }
  }, [invitation, user])

  const handleAccept = async () => {
    if (error) return

    setAccepting(true)
    try {
      const res = await fetch(`/api/apps/team/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao aceitar')
      }

      setSuccess(true)
      setTimeout(() => {
        router.push(`/dashboard/meus-app`)
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full" style={{ border: `1px solid ${colors.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h1 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>Aceitar convite</h1>
          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>Você foi convidado para colaborar</p>

          {error ? (
            <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <p className="text-sm">{error}</p>
            </div>
          ) : success ? (
            <div style={{ background: '#DCFCE7', color: '#166534', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <p className="text-sm">✓ Convite aceito! Redirecionando...</p>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium" style={{ color: colors.text }}>Aplicativo</p>
                <p className="text-lg font-bold" style={{ color: colors.primary }}>{draft?.name}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium mb-2" style={{ color: colors.text }}>Permissões</p>
                <ul className="space-y-1">
                  {invitation.permissions.map((perm: string) => (
                    <li key={perm} className="text-sm" style={{ color: colors.text }}>
                      ✓ {PERMISSION_LABELS[perm] || perm}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium" style={{ color: colors.text }}>Escopo</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {invitation.scope === 'app' ? 'Somente este aplicativo' : 'Toda a organização'}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleAccept}
            disabled={Boolean(error) || accepting || success}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm"
            style={{
              backgroundColor: error || success ? '#D1D5DB' : colors.primary,
              cursor: error || success || accepting ? 'not-allowed' : 'pointer',
              opacity: accepting ? 0.6 : 1,
            }}
          >
            {accepting ? 'Aceitando...' : error || success ? 'Concluído' : 'Aceitar convite'}
          </button>

          <p className="text-xs mt-4 text-center" style={{ color: colors.textSecondary }}>
            Você será redirecionado para o painel após aceitar.
          </p>
        </div>
      </div>
    </div>
  )
}
