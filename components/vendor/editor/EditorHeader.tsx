'use client'

import { colors } from '@/lib/design-tokens'
import { ChevronLeft, Save, Clock } from 'lucide-react'
import Link from 'next/link'

interface EditorHeaderProps {
  draftName: string
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  onSave: () => void
}

export default function EditorHeader({
  draftName,
  saveState,
  onSave,
}: EditorHeaderProps) {
  return (
    <div
      style={{
        backgroundColor: colors.background,
        borderBottom: `1px solid ${colors.border}`,
      }}
      className="sticky top-0 z-40"
    >
      <div className="px-6 py-4 max-w-7xl mx-auto">
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/vendedor/aplicativos"
              className="p-2 hover:opacity-70 transition"
            >
              <ChevronLeft size={20} style={{ color: colors.primary }} />
            </Link>
            <div>
              <p
                className="text-sm"
                style={{ color: colors.textSecondary }}
              >
                Meus aplicativos / {draftName} / Editar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveState === 'saving' && (
              <div className="flex items-center gap-2">
                <Clock
                  size={16}
                  style={{ color: colors.primary }}
                  className="animate-spin"
                />
                <span style={{ color: colors.textSecondary }} className="text-sm">
                  Salvando…
                </span>
              </div>
            )}
            {saveState === 'saved' && (
              <span style={{ color: colors.primary }} className="text-sm font-semibold">
                ✓ Salvo
              </span>
            )}
            {saveState === 'error' && (
              <span style={{ color: '#DC2626' }} className="text-sm font-semibold">
                ✗ Erro
              </span>
            )}

            <button
              onClick={onSave}
              disabled={saveState === 'saving'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50 transition"
              style={{ backgroundColor: colors.primary }}
            >
              <Save size={16} />
              Salvar rascunho
            </button>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: colors.text }}
          >
            Crie a página do seu aplicativo
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: colors.textSecondary }}
          >
            Edite as informações e acompanhe a prévia do anúncio.
          </p>
        </div>
      </div>
    </div>
  )
}
