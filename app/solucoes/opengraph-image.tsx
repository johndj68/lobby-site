import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OGLayout } from '../_og/layout'

export const alt = 'Soluções LOBBY'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), 'public/logowhite.png'))
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    <OGLayout
      logoSrc={logoSrc}
      title="Soluções que transformam negócios"
      subtitle="Software, Automação, Análise de Dados e Cibersegurança sob medida para a sua empresa."
    />,
    { ...size },
  )
}
