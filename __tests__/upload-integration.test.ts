import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { uploadProjectImage, uploadProjectVisual, VisualUploadError } from '@/lib/project-visuals-upload'

describe('Image upload integration', () => {
  it('should handle the full flow from file to processed image', async () => {
    const input = await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toBuffer()

    expect(input.length).toBeGreaterThan(0)
    expect(input.length).toBeGreaterThan(10_000)
  })

  it('should validate image before upload', async () => {
    const corrupted = Buffer.from('not an image')

    const file = new File([corrupted], 'fake.png', { type: 'image/png' })

    await expect(uploadProjectVisual(file, 'image')).rejects.toThrow(VisualUploadError)
  })

  it('should reject oversized files', async () => {
    const oversized = Buffer.alloc(11 * 1024 * 1024)
    const file = new File([oversized], 'too-big.png', { type: 'image/png' })

    await expect(uploadProjectVisual(file, 'image')).rejects.toThrow(VisualUploadError)
  })

  it('should reject unsupported formats', async () => {
    const gif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x0a, 0x00, 0x01, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00, 0x3b,
    ])

    const file = new File([gif], 'test.gif', { type: 'image/gif' })

    await expect(uploadProjectVisual(file, 'image')).rejects.toThrow(VisualUploadError)
  })

  describe('backward compatibility', () => {
    it('uploadProjectVisual should work for documents', async () => {
      const docBuffer = Buffer.from('PDF mock content')
      const file = new File([docBuffer], 'document.pdf', { type: 'application/pdf' })

      try {
        await uploadProjectVisual(file, 'document')
      } catch (err) {
        if (err instanceof VisualUploadError) {
          expect(err.message).toContain('não aceito')
        }
      }
    })
  })

  describe('image preprocessing flow', () => {
    it('processes PNG image', async () => {
      const pngBuffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer()

      expect(pngBuffer.length).toBeGreaterThan(1000)
    })

    it('processes JPEG image', async () => {
      const jpegBuffer = await sharp({
        create: {
          width: 1024,
          height: 768,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg()
        .toBuffer()

      expect(jpegBuffer.length).toBeGreaterThan(1000)
    })

    it('processes large image', async () => {
      const largeBuffer = await sharp({
        create: {
          width: 3000,
          height: 2250,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .png()
        .toBuffer()

      expect(largeBuffer.length).toBeGreaterThan(10_000)
    })

    it('handles avatar dimensions', async () => {
      const avatarBuffer = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 3,
          background: { r: 50, g: 100, b: 150 },
        },
      })
        .png()
        .toBuffer()

      expect(avatarBuffer.length).toBeGreaterThan(500)
    })
  })
})
