import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { processImage, validateImageInput, ImageProcessingError, IMAGE_CONFIGS } from '@/lib/image-processing'

async function createTestImage(width: number, height: number, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    [format]()
    .toBuffer()
}

describe('image-processing', () => {
  describe('processImage', () => {
    it('should convert PNG to WebP', async () => {
      const input = await createTestImage(800, 600, 'png')
      const result = await processImage(input, 'common')

      expect(result.buffer).toBeDefined()
      expect(result.size).toBeLessThan(input.length)
      expect(result.width).toBeLessThanOrEqual(800)
      expect(result.height).toBeLessThanOrEqual(600)
      expect(result.quality).toBeGreaterThanOrEqual(IMAGE_CONFIGS.common.minQuality)
      expect(result.quality).toBeLessThanOrEqual(IMAGE_CONFIGS.common.maxQuality)
    })

    it('should convert JPEG to WebP', async () => {
      const input = await createTestImage(1024, 768, 'jpeg')
      const result = await processImage(input, 'common')

      expect(result.buffer).toBeDefined()
      expect(result.size).toBeLessThan(input.length)
    })

    it('should downscale large images', async () => {
      const input = await createTestImage(3000, 2000, 'png')
      const result = await processImage(input, 'common')

      expect(result.width).toBeLessThanOrEqual(IMAGE_CONFIGS.common.maxDimension)
      expect(result.height).toBeLessThanOrEqual(IMAGE_CONFIGS.common.maxDimension)
    })

    it('should respect avatar dimensions', async () => {
      const input = await createTestImage(1024, 1024, 'png')
      const result = await processImage(input, 'avatar')

      expect(result.width).toBeLessThanOrEqual(IMAGE_CONFIGS.avatar.maxDimension)
      expect(result.height).toBeLessThanOrEqual(IMAGE_CONFIGS.avatar.maxDimension)
    })

    it('should reduce quality if size exceeds target', async () => {
      const input = await createTestImage(2000, 2000, 'png')
      const result = await processImage(input, 'common')

      const config = IMAGE_CONFIGS.common
      expect(result.size).toBeLessThanOrEqual(config.maxSize)
    })

    it('should not enlarge small images', async () => {
      const input = await createTestImage(200, 150, 'png')
      const result = await processImage(input, 'common')

      expect(result.width).toBeLessThanOrEqual(200)
      expect(result.height).toBeLessThanOrEqual(150)
    })

    it('should reject corrupted image data', async () => {
      const corrupted = Buffer.from('not an image')
      await expect(processImage(corrupted, 'common')).rejects.toThrow(ImageProcessingError)
    })
  })

  describe('validateImageInput', () => {
    it('should accept PNG', async () => {
      const input = await createTestImage(500, 500, 'png')
      const result = await validateImageInput(input, 'image/png')
      expect(result.valid).toBe(true)
    })

    it('should accept JPEG', async () => {
      const input = await createTestImage(500, 500, 'jpeg')
      const result = await validateImageInput(input, 'image/jpeg')
      expect(result.valid).toBe(true)
    })

    it('should accept WebP', async () => {
      const input = await createTestImage(500, 500, 'png')
      const webp = await sharp(input).webp().toBuffer()
      const result = await validateImageInput(webp, 'image/webp')
      expect(result.valid).toBe(true)
    })

    it('should reject unsupported MIME types', async () => {
      const input = await createTestImage(500, 500, 'png')
      const result = await validateImageInput(input, 'image/gif')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject very small images', async () => {
      const input = await createTestImage(30, 30, 'png')
      const result = await validateImageInput(input, 'image/png')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('pequena')
    })

    it('should reject corrupted files', async () => {
      const corrupted = Buffer.from('not an image')
      const result = await validateImageInput(corrupted, 'image/png')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('corrompido')
    })
  })

  describe('compression savings', () => {
    it('should calculate realistic savings', async () => {
      const input = await createTestImage(1920, 1440, 'png')
      const result = await processImage(input, 'common')

      const savingsPercent = (1 - result.size / input.length) * 100
      expect(savingsPercent).toBeGreaterThan(30)
      expect(savingsPercent).toBeLessThan(95)
    })
  })
})
