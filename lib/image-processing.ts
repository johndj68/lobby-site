import sharp from 'sharp'

export class ImageProcessingError extends Error {}

export interface ProcessingConfig {
  maxQuality: number
  minQuality: number
  targetSize: number
  maxSize: number
  maxDimension: number
  minDimensionThreshold: number
}

export const IMAGE_CONFIGS: Record<'common' | 'avatar' | 'document', ProcessingConfig> = {
  common: {
    maxQuality: 80,
    minQuality: 70,
    targetSize: 500 * 1024,
    maxSize: 2 * 1024 * 1024,
    maxDimension: 1920,
    minDimensionThreshold: 100,
  },
  avatar: {
    maxQuality: 80,
    minQuality: 70,
    targetSize: 150 * 1024,
    maxSize: 500 * 1024,
    maxDimension: 512,
    minDimensionThreshold: 100,
  },
  document: {
    maxQuality: 85,
    minQuality: 75,
    targetSize: 2 * 1024 * 1024,
    maxSize: 8 * 1024 * 1024,
    maxDimension: 2560,
    minDimensionThreshold: 100,
  },
}

interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
  size: number
  quality: number
}

export async function processImage(
  inputBuffer: Buffer,
  kind: 'common' | 'avatar' | 'document' = 'common',
): Promise<ProcessedImage> {
  const config = IMAGE_CONFIGS[kind]

  try {
    const image = sharp(inputBuffer)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new ImageProcessingError('Não foi possível ler as dimensões da imagem.')
    }

    if (metadata.width * metadata.height > 50_000_000) {
      throw new ImageProcessingError('Imagem contém muitos pixels (máx. 50MP).')
    }

    let width = metadata.width
    let height = metadata.height

    if (Math.max(width, height) > config.maxDimension) {
      const scale = config.maxDimension / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    let quality = config.maxQuality
    let processed = await tryProcess(image, width, height, quality)

    if (processed.size > config.targetSize && quality > config.minQuality) {
      let attempts = 0
      const maxAttempts = 5

      while (processed.size > config.targetSize && quality > config.minQuality && attempts < maxAttempts) {
        quality = Math.max(config.minQuality, quality - 5)
        processed = await tryProcess(image, width, height, quality)
        attempts++
      }
    }

    if (processed.size > config.maxSize) {
      let dimScale = Math.sqrt(config.maxSize / processed.size)
      const newWidth = Math.max(100, Math.round(width * dimScale))
      const newHeight = Math.max(100, Math.round(height * dimScale))
      processed = await tryProcess(image, newWidth, newHeight, quality)
    }

    if (processed.size > config.maxSize) {
      throw new ImageProcessingError(
        `Imagem muito grande mesmo com compressão máxima (${Math.round(processed.size / 1024 / 1024)} MB). Máximo: ${config.maxSize / 1024 / 1024} MB.`,
      )
    }

    return {
      buffer: processed.buffer,
      width: processed.width,
      height: processed.height,
      size: processed.size,
      quality,
    }
  } catch (err) {
    if (err instanceof ImageProcessingError) throw err
    throw new ImageProcessingError(`Erro ao processar imagem: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function tryProcess(
  image: ReturnType<typeof sharp>,
  width: number,
  height: number,
  quality: number,
): Promise<{ buffer: Buffer; width: number; height: number; size: number }> {
  const buffer = await image
    .rotate()
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()

  return { buffer, width, height, size: buffer.length }
}

export async function validateImageInput(
  buffer: Buffer,
  mimeType: string,
): Promise<{ valid: boolean; error?: string }> {
  const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!acceptedTypes.includes(mimeType)) {
    return { valid: false, error: 'Tipo de imagem não aceito. Use JPEG, PNG ou WebP.' }
  }

  try {
    const metadata = await sharp(buffer).metadata()
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Não foi possível validar a imagem.' }
    }
    if (metadata.width < 50 || metadata.height < 50) {
      return { valid: false, error: 'Imagem muito pequena (mínimo 50x50).' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, error: 'Arquivo de imagem corrompido ou inválido.' }
  }
}
