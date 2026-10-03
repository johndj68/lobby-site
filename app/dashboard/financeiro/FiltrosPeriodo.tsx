'use client'

import { colors } from '@/lib/design-tokens'
import { PERIODO_LABEL, type PeriodoPreset } from '@/lib/services/financeiro-periodo'

export interface AppOption {
  application_id:   string
  application_name: string
}

interface Props {
  preset:          PeriodoPreset
  onPresetChange:  (preset: PeriodoPreset) => void
  customFrom:      string
  customTo:        string
  onCustomChange:  (from: string, to: string) => void
  apps:            AppOption[]
  applicationId:   string
  onAppChange:     (id: string) => void
}

const PRESETS: PeriodoPreset[] = ['este_mes', 'mes_anterior', 'ultimos_30_dias', 'personalizado']

export default function FiltrosPeriodo({
  preset, onPresetChange, customFrom, customTo, onCustomChange, apps, applicationId, onAppChange,
}: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
      <div>
        <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Período</label>
        <select
          value={preset}
          onChange={e => onPresetChange(e.target.value as PeriodoPreset)}
          className="h-9 rounded-lg border px-3 text-sm"
          style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          aria-label="Período"
        >
          {PRESETS.map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
        </select>
      </div>

      {preset === 'personalizado' && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>De</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => onCustomChange(e.target.value, customTo)}
              className="h-9 rounded-lg border px-3 text-sm"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
              aria-label="Data inicial"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Até</label>
            <input
              type="date"
              value={customTo}
              onChange={e => onCustomChange(customFrom, e.target.value)}
              className="h-9 rounded-lg border px-3 text-sm"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
              aria-label="Data final"
            />
          </div>
        </div>
      )}

      {apps.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Aplicativo</label>
          <select
            value={applicationId}
            onChange={e => onAppChange(e.target.value)}
            className="h-9 rounded-lg border px-3 text-sm"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            aria-label="Filtrar por aplicativo"
          >
            <option value="">Todos os apps</option>
            {apps.map(a => (
              <option key={a.application_id} value={a.application_id}>{a.application_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
