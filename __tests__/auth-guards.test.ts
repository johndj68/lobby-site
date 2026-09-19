import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`) }),
}))

import {
  requireClientSession,
  requireTechnicianSession,
  requireLeaderSession,
} from '@/lib/services/profile'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1', email: 'test@lobby.com' }

function makeSupa(
  user: { id: string; email: string } | null,
  profile: { role?: string; is_leader?: boolean } | null,
): SupabaseClient {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    single: vi.fn().mockResolvedValue({ data: profile, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient
}

// ── requireClientSession ──────────────────────────────────────────────────────

describe('requireClientSession', () => {
  it('redireciona para /login quando não há usuário autenticado', async () => {
    await expect(requireClientSession(makeSupa(null, null)))
      .rejects.toThrow('redirect:/login')
  })

  it('redireciona para /admin quando usuário tem role "technician"', async () => {
    await expect(requireClientSession(makeSupa(mockUser, { role: 'technician' })))
      .rejects.toThrow('redirect:/admin')
  })

  it('retorna { user, profile } para cliente autenticado', async () => {
    const result = await requireClientSession(makeSupa(mockUser, { role: 'client' }))
    expect(result.user.id).toBe('user-1')
    expect(result.profile?.role).toBe('client')
  })

  it('retorna { user, profile } quando perfil é null (sem role definida)', async () => {
    const result = await requireClientSession(makeSupa(mockUser, null))
    expect(result.user.id).toBe('user-1')
    expect(result.profile).toBeNull()
  })
})

// ── requireTechnicianSession ──────────────────────────────────────────────────

describe('requireTechnicianSession', () => {
  it('redireciona para /admin/login quando não há usuário autenticado', async () => {
    await expect(requireTechnicianSession(makeSupa(null, null)))
      .rejects.toThrow('redirect:/admin/login')
  })

  it('redireciona para /admin/login quando role é "client"', async () => {
    await expect(requireTechnicianSession(makeSupa(mockUser, { role: 'client' })))
      .rejects.toThrow('redirect:/admin/login')
  })

  it('redireciona para /admin/login quando profile é null', async () => {
    await expect(requireTechnicianSession(makeSupa(mockUser, null)))
      .rejects.toThrow('redirect:/admin/login')
  })

  it('retorna { user, profile } para técnico autenticado', async () => {
    const result = await requireTechnicianSession(makeSupa(mockUser, { role: 'technician' }))
    expect(result.user.id).toBe('user-1')
    expect(result.profile?.role).toBe('technician')
  })
})

// ── requireLeaderSession ──────────────────────────────────────────────────────

describe('requireLeaderSession', () => {
  it('redireciona para /admin quando técnico tem is_leader=false', async () => {
    await expect(
      requireLeaderSession(makeSupa(mockUser, { role: 'technician', is_leader: false }))
    ).rejects.toThrow('redirect:/admin')
  })

  it('redireciona para /admin quando is_leader não está definido', async () => {
    await expect(
      requireLeaderSession(makeSupa(mockUser, { role: 'technician' }))
    ).rejects.toThrow('redirect:/admin')
  })

  it('redireciona para /admin/login quando usuário não é técnico', async () => {
    await expect(
      requireLeaderSession(makeSupa(mockUser, { role: 'client', is_leader: true }))
    ).rejects.toThrow('redirect:/admin/login')
  })

  it('retorna { user, profile } para técnico líder', async () => {
    const result = await requireLeaderSession(
      makeSupa(mockUser, { role: 'technician', is_leader: true })
    )
    expect(result.user.id).toBe('user-1')
    expect(result.profile?.is_leader).toBe(true)
  })
})
