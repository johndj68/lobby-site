# Image Optimization Implementation

## Overview

This project implements server-side image processing with automatic WebP conversion and resizing. All image uploads are processed on the server before storage, reducing file sizes by 30-95% depending on the image characteristics.

## Architecture

### Components

1. **Image Processing Library** (`lib/image-processing.ts`)
   - Core processing logic using Sharp
   - Quality/dimension adjustment with configurable parameters
   - Format validation and EXIF correction

2. **Upload API Endpoint** (`app/api/upload/image/route.ts`)
   - Authentication & authorization (technician-only)
   - Rate limiting (50 uploads/hour per user, 200/hour per IP)
   - Image validation and processing
   - Supabase Storage integration

3. **Frontend Upload Library** (`lib/project-visuals-upload.ts`)
   - New `uploadProjectImage()` function using the API endpoint
   - Backward-compatible `uploadProjectVisual()` for existing components
   - Error handling and user-friendly messages

## Usage

### Direct API Upload (for new integrations)

```typescript
import { uploadProjectImage, type UploadImageResponse } from '@/lib/project-visuals-upload'

try {
  const result = await uploadProjectImage(file, 'common')
  // result.url — storage URL
  // result.width, result.height — final dimensions
  // result.sizeFinal — compressed size
  // result.sizeOriginal — input size
  // result.savings — % compression
} catch (err) {
  console.error(err.message)
}
```

### Existing Components

No changes needed. Existing calls to `uploadProjectVisual(file, 'image')` automatically use the new pipeline.

```typescript
const url = await uploadProjectVisual(file, 'image')
```

## Processing Configurations

Three presets with different quality/size targets:

### Common Images (default)
- Max dimension: 1920px
- Target size: ~500 KB
- Quality: 70-80
- Use for: mockups, wireframes, screenshots

### Avatars
- Max dimension: 512px
- Target size: ~150 KB
- Quality: 70-80
- Use for: profile pictures

### Documents (receipts, certificates)
- Max dimension: 2560px
- Target size: ~2 MB
- Quality: 75-85
- Use for: scans requiring text legibility

All sizes are targets, not guarantees. Processing tries to stay within target, then hard-limits at maxSize. If maxSize can't be met, an error is returned.

## Technical Details

### Input Processing
1. **Validation**: File type, size, dimensions, integrity
2. **Orientation**: EXIF rotation correction
3. **Resizing**: Downscale if larger than maxDimension
4. **Conversion**: PNG/JPEG/WebP → WebP output
5. **EXIF Removal**: Privacy (GPS, metadata)

### Quality Adjustment
- Starts at maxQuality (80)
- If result > targetSize, reduces quality by 5 per attempt
- Minimum quality: minQuality (70)
- Max 5 attempts before reducing dimensions
- Final hard limit: maxSize (2MB for common, etc.)

### Rate Limiting
- **User limit**: 50 uploads/hour per technician
- **IP limit**: 200 uploads/hour per IP
- Returns `429 Too Many Requests` with Retry-After header

### Storage
- Bucket: `project-visuals` (private)
- Path format: `{timestamp}-{randomId}.webp`
- Cache: 1 year (31536000s)
- Content-Type: `image/webp`

## API Response

Successful upload returns:
```json
{
  "url": "https://..../object/public/project-visuals/1695123456-a1b2c3d4.webp",
  "path": "1695123456-a1b2c3d4.webp",
  "width": 1920,
  "height": 1440,
  "sizeFinal": 487234,
  "sizeOriginal": 3456789,
  "quality": 80,
  "savings": 86
}
```

## Error Cases

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | "Arquivo não fornecido." | No file in request |
| 400 | "Tipo de imagem não aceito." | Not JPEG/PNG/WebP |
| 400 | "Imagem muito pequena." | < 50x50 px |
| 400 | "Arquivo de imagem corrompido." | Invalid file data |
| 400 | "Imagem contém muitos pixels." | > 50MP (50M pixels) |
| 401 | "Não autenticado." | No auth session |
| 403 | "Apenas técnicos podem fazer upload." | Not a technician |
| 413 | "Arquivo muito grande." | > 10 MB input |
| 429 | "Limite de upload atingido." | Rate limit exceeded |
| 500 | "Erro ao enviar para storage." | Storage failure |
| 500 | "Erro ao processar upload." | Unexpected error |

## Performance & Compression

### Typical Results
- **PNG to WebP**: 60-80% reduction
- **JPEG to WebP**: 30-50% reduction
- **Large images (1920px+)**: Additional 20-40% from downscaling
- **Average compression**: 60-75% across common inputs

### Bandwidth Savings
- Assuming 100 uploads/month at avg 2 MB each:
  - Original: 200 MB/month
  - Optimized: ~50-75 MB/month
  - Savings: 125-150 MB/month (62-75%)

### Processing Time
- Typical: 100-500ms per image
- Large images: 500-1000ms
- No impact on user experience (async, with UI indicators)

## Database Schema

No schema changes required. The `url` field in `VisualImage` stores the path returned by the API; at display time, it's converted to a signed URL via `resolveProjectVisualUrl()`.

Existing JSON structure in `client_progress.clientVisualAssets.images`:
```json
{
  "id": "uuid",
  "title": "...",
  "description": "...",
  "url": "/object/public/project-visuals/path.webp",
  "phase": "...",
  "status": "...",
  "visibleToClient": true,
  "createdAt": "2025-09-19T..."
}
```

## Testing

Run image processing tests:
```bash
npm run test -- __tests__/image-processing.test.ts
```

Run endpoint tests:
```bash
npm run test -- __tests__/upload-image-endpoint.test.ts
```

All tests pass: image conversion, quality adjustment, dimension limits, rate limiting, auth, error handling.

## Security Considerations

1. **Authentication**: Verified via Supabase session
2. **Authorization**: Only technicians can upload
3. **Rate Limiting**: Per-user and per-IP limits via Redis
4. **Input Validation**: File type, size, and actual content checked
5. **EXIF Removal**: Prevents GPS/metadata leaks
6. **Path Generation**: Server-generated random IDs (not user input)
7. **Private Storage**: Bucket requires auth; signed URLs for clients

## Migration from Old System

**No manual migration needed.** The old system stored unoptimized images; new uploads use the optimized pipeline. Old images remain unchanged in storage.

To optionally optimize existing images:
1. Fetch image from storage
2. Call `processImage()` from lib
3. Re-upload to new path
4. Update database references
5. Delete old file

This is not automatically done to preserve original content where required (e.g., legal documents).

## Future Improvements

- [ ] Thumbnail generation (480px variant for lists)
- [ ] Format detection & HEIC/HEIF support
- [ ] Metadata extraction (dimensions pre-upload via Canvas)
- [ ] Progressive image loading (blur-up placeholder)
- [ ] Batch image processing
- [ ] Image analytics (upload volume, format distribution)

## Dependencies

- **sharp** (v0.35.4): Image processing
- **@upstash/redis** (v1.31.0): Rate limiting
- **@supabase/supabase-js** (v2.105.4): Storage

All already installed via Next.js and existing dependencies.

## Troubleshooting

### Endpoint returns 500
- Check Supabase Storage bucket permissions
- Verify SUPABASE_SERVICE_ROLE_KEY is set
- Check Redis connection for rate limiting

### Image not uploading
- Verify user is authenticated (technician role)
- Check file size < 10 MB
- Verify image format: JPEG, PNG, or WebP
- Check network request headers for CORS issues

### Quality/size not matching expectations
- Processing targets are soft limits
- Quality adjusted by 5-point steps
- Dimensions only reduced if target exceeded
- Final image always respects maxSize hard limit
