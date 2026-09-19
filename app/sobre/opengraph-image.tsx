import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OGLayout } from '../_og/layout'

export const alt = 'Sobre a LOBBY'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), 'public/logowhite.png'))
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    <OGLayout
      logoSrc={logoSrc}
      title="Quem somos e o que fazemos"
      subtitle="Conheça a LOBBY — empresa de tecnologia estratégica para empresas que querem crescer."
    />,
    { ...size },
  )
}
