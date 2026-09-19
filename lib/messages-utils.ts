export function timeLabel(d: string) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function relTime(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)    return 'agora'
  if (s < 3600)  return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function dateLabel(d: string) {
  const date  = new Date(d)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}
