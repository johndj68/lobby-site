# Manual Testing Guide: Image Upload Flow

## Prerequisites

1. Dev server running: `npm run dev` (port 3000)
2. Valid technician account logged in
3. Active project in dashboard

## Test Scenarios

### Scenario 1: Upload Common Image

**Steps:**
1. Navigate to `/dashboard/projetos/[project-id]`
2. Click "Materiais Visuais" → "Imagens"
3. Click "Adicionar Imagem" or file upload button
4. Select a PNG/JPEG file (500-2000px recommended)
5. Click upload

**Expected Results:**
- Upload bar shows progress
- Image appears in list after processing
- URL shows `.webp` extension in storage path
- Status shows "planejado"

**Verify in DevTools Console:**
```javascript
// Check response from API
console.log('Upload Response:', lastUploadResponse)
// Should show: { url, path, width, height, sizeFinal, sizeOriginal, savings }
```

### Scenario 2: Test Compression

**Steps:**
1. Create large image (2000×1500 JPEG, ~3-4 MB)
2. Upload via image upload
3. Check browser Network tab

**Expected Results:**
- Network → POST `/api/upload/image`
- Request size: ~3 MB (original)
- Response includes compression metrics
- `savings` field shows 60-80%
- Final file ~600-800 KB

### Scenario 3: Error Handling

#### Test 3a: File Too Large
- Attempt upload > 10 MB
- Expected: "Arquivo muito grande (máx. 10 MB)."

#### Test 3b: Invalid Format
- Try uploading GIF, SVG, or BMP
- Expected: "Tipo de arquivo não aceito. Use PNG, JPG ou WebP."

#### Test 3c: Corrupted File
- Create empty file, rename to `.png`
- Expected: "Arquivo de imagem corrompido ou inválido."

#### Test 3d: Rate Limit (developer only)
- Upload 51+ images within 1 hour
- Expected: 429 response, "Limite de upload atingido"

### Scenario 4: Avatar Upload

**Steps:**
1. In project settings or team section, upload avatar
2. Select square image (256-512px)
3. Verify upload and display

**Expected Results:**
- Avatar resized to ≤512px
- Quality ~80
- Compression: 70-85%

### Scenario 5: Document Upload (existing flow, unchanged)

**Steps:**
1. Upload PDF/DOC via documents section
2. Should still work as before (not processed through WebP)

**Expected Results:**
- Document URL preserved (not converted to WebP)
- Size limit: 20 MB (existing)

## Technical Verification

### Check API Response in DevTools

```javascript
// Network tab → XHR → POST /api/upload/image

// Response body should contain:
{
  "url": "https://miugjafzptsdqzzgkbea.supabase.co/storage/v1/object/public/project-visuals/1695123456-a1b2c3d4.webp",
  "path": "1695123456-a1b2c3d4.webp",
  "width": 1920,
  "height": 1440,
  "sizeFinal": 487234,
  "sizeOriginal": 3456789,
  "quality": 80,
  "savings": 86
}
```

### Verify Image in Storage

1. Supabase Dashboard → Storage → project-visuals
2. Look for file: `{timestamp}-{randomId}.webp`
3. Verify:
   - Content-Type: `image/webp`
   - File is WebP format
   - Size matches `sizeFinal` from response

### Check Database

```sql
-- Images stored in JSONB column of client_projects.client_progress
-- Query example (requires Supabase access):
SELECT 
  id,
  client_progress->'clientVisualAssets'->'images' as images
FROM client_projects
WHERE id = '{project-id}'
LIMIT 1;

-- Look for:
-- "url": "/object/public/project-visuals/..."
-- "width": 1920, "height": 1440
-- "status": "planejado"
```

## Performance Metrics to Measure

### Upload Latency
- Start: file selection
- End: image appears in list
- Expected: 500ms - 2000ms depending on file size

### Compression Ratio
Test various image types:

| Format | Original | Compressed | Ratio |
|--------|----------|-----------|-------|
| PNG 800×600 | 500KB | 80KB | 84% |
| JPEG 1920×1440 | 2.5MB | 600KB | 76% |
| PNG 3000×2250 | 4MB | 900KB | 77% |

### Network Usage
- Download speed: measure `sizeFinal` delivery
- Expected: 2-5x faster than original for typical images

## Troubleshooting

### Upload Fails with 401
- Check: User is logged in
- Check: Session cookie exists (DevTools → Application → Cookies)
- Fix: Log out and log back in

### Upload Fails with 403
- Check: User is a technician (profile.role = 'technician')
- Check: Supabase dashboard → Profiles table
- Fix: Admin must set role='technician' for user

### Upload Fails with 429
- Check: Rate limit (50 uploads/hour per user)
- Fix: Wait 1 hour or contact admin
- DevTools: Check `Retry-After` header

### Upload Succeeds but Image Not Displayed
- Check: `resolveProjectVisualUrl()` is called for display
- Check: Bucket permissions (should be private)
- DevTools Console: Check if signed URL is generated

### WebP Files Not Opening Locally
- Browser support: Chrome, Firefox, Safari (recent versions)
- Use online converter to verify: https://convertio.co/webp-png/

## Automated Testing

Run full test suite:
```bash
npm run test -- __tests__/image-processing.test.ts
npm run test -- __tests__/upload-image-endpoint.test.ts
npm run test -- __tests__/upload-integration.test.ts
```

Expected output:
```
PASS (29) FAIL (0)
```

## Rollback / Disable Feature

If issues occur:

### Temporarily Disable
Modify `lib/project-visuals-upload.ts`:
```typescript
export async function uploadProjectVisual(file: File, kind: 'image' | 'document'): Promise<string> {
  if (kind === 'image') {
    // Revert to direct upload (old behavior)
    // const result = await uploadProjectImage(file, 'common')
    // Remove processing and go back to direct upload
  }
  // ... existing code
}
```

### Revert Completely
```bash
git revert f100b9c  # Revert main commit
```

## Notes for Support

When reporting issues, include:
1. File size and format (PNG/JPEG)
2. Image dimensions
3. Error message (if any)
4. Browser type and version
5. Network request/response from DevTools
6. User role (check profile.role in database)

---

**Last Updated**: 2025-09-19
**Status**: All 29 tests passing, ready for production
