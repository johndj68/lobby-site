# 📸 Media Upload Setup Guide

**Status**: ✅ **IMPLEMENTADO**

---

## 🚀 Como Configurar

### 1. Criar Bucket no Supabase Storage

```bash
# Via Supabase Dashboard:
# 1. Storage → New Bucket
# 2. Nome: app-uploads
# 3. Privacidade: Public
# 4. Clique "Create bucket"
```

### 2. Configurar CORS (Supabase Dashboard)

```json
{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
  "AllowedOrigins": [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://seu-dominio.com"
  ],
  "ExposeHeaders": ["*"],
  "MaxAgeSeconds": 3600
}
```

### 3. RLS Policy

```sql
-- App media is public (anyone can read)
CREATE POLICY "Public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'app-uploads');

-- Only authenticated users can upload
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'app-uploads'
    AND auth.role() = 'authenticated'
  );

-- Users can delete only their own uploads
CREATE POLICY "Own delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'app-uploads'
    AND auth.uid() = owner_id
  );
```

---

## 📁 Estrutura de Storage

```
app-uploads/
  └── [draft-id]/
      ├── logo/
      │   └── [uuid].webp
      ├── main/
      │   └── [uuid].webp
      └── gallery/
          ├── [uuid].webp
          ├── [uuid].webp
          └── ...
```

**Naming**: UUID + extensão original  
**Path**: `app-media/{draftId}/{type}/{fileName}`  
**Públicos**: Sim (qualquer um acessa a URL)  
**Privados**: Apenas rascunhos não publicados

---

## 🔌 API Endpoint

### POST `/api/upload-app-media`

**Request**:
```bash
curl -X POST http://localhost:3000/api/upload-app-media \
  -F "file=@screenshot.png" \
  -F "draftId=draft-123" \
  -F "type=gallery"
```

**Campos**:
- `file` (required) — PNG, JPEG ou WebP
- `draftId` (required) — ID do rascunho
- `type` (required) — `logo` | `main` | `gallery`

**Response Success (200)**:
```json
{
  "success": true,
  "url": "https://..../app-uploads/draft-123/gallery/uuid.png",
  "path": "app-media/draft-123/gallery/uuid.png",
  "fileName": "screenshot.png",
  "type": "gallery",
  "uploadedAt": "2026-09-20T..."
}
```

**Response Error (400/403/500)**:
```json
{
  "error": "Tipo de arquivo não permitido. Use PNG, JPEG ou WebP."
}
```

---

## ✅ Validações Implementadas

| Validação | Implementado | Onde |
|-----------|--------------|------|
| Tipo de arquivo | ✅ | API + Frontend |
| Tamanho (10MB) | ✅ | API |
| Autenticação | ✅ | API |
| Autorização draft | ✅ | API |
| Preview upload | ✅ | Frontend |
| Erro recovery | ✅ | Frontend |
| Limite galeria (4) | ✅ | Frontend |

---

## 🎯 Funcionalidades

### Logo
- Upload único
- Preview 64x64
- Substitui automaticamente
- Remove com botão X

### Imagem Principal
- Uma imagem 16:9
- Full width preview
- Remove com botão X
- Reordenação (estrutura pronta)

### Galeria
- Até 4 screenshots
- Grid 2x2 preview
- Drag-drop order (estrutura pronta)
- Remove individual
- Contador "N restantes"

### Vídeo
- URL YouTube/Vimeo apenas
- Sem validação backend (TBD)
- Preview em prévia

---

## 🧪 Teste Manual

```bash
# 1. Abrir editor
# http://localhost:3000/vendedor/aplicativos/[id]/editar

# 2. Ir para aba "Mídia"

# 3. Clicar em "Logo do aplicativo"

# 4. Selecionar arquivo PNG/JPEG/WebP (<10MB)

# 5. Observar:
#    - Spinner "Enviando…"
#    - Preview com imagem
#    - Botão X para remover

# 6. Verificar:
#    - Auto-save atualiza app_drafts
#    - URL salva em logo_url
#    - Refresh mantém imagem
```

---

## 🔧 Troubleshooting

### "CORS error"
- Verificar CORS policy no Supabase Storage
- Adicionar origem atual à lista
- Limpar cache do navegador

### "401 Unauthorized"
- Verificar se usuário está autenticado
- Token expirou? Fazer login novamente

### "403 Forbidden"
- Verificar se draft pertence à organização do usuário
- RLS policy bloqueou acesso

### "Upload timeout"
- Arquivo muito grande? (máx 10MB)
- Conexão lenta? Tentar novamente
- Server error? Verificar logs

---

## 📊 Data Flow

```
Frontend (MediaTab)
  ↓ (FormData: file, draftId, type)
POST /api/upload-app-media
  ↓ (validate auth, draft, file)
Supabase Storage
  ↓ (upload and get public URL)
Response { url, path, ... }
  ↓ (update form state)
ProductMediaEditor
  ↓ (auto-save after 1s)
app_drafts { logo_url, media_gallery, ... }
```

---

## 🚀 Próximos Passos

1. **Processamento de imagem**
   - Resize para dimensões padrão
   - Compressão automática
   - EXIF metadata removal

2. **Validação de dimensões**
   - Logo: quadrado (100x100 min)
   - Principal: 16:9 (1280x720 min)
   - Gallery: 16:9

3. **Thumbnails**
   - Gerar previews pequenas
   - Cache for performance

4. **Drag-drop reorder**
   - Implementar para galeria
   - Implementar para funcionalidades
   - Persistir ordem no banco

5. **Múltiplos uploads**
   - Enviar vários de uma vez
   - Progress bar por arquivo
   - Retry individual

---

## 📝 Environment

Nenhuma env var nova necessária.

Usa credenciais existentes:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## ✨ Resumo

✅ Upload funcional (logo, principal, galeria)  
✅ Validações (tipo, tamanho, autorização)  
✅ Error handling com retry  
✅ Preview em tempo real  
✅ Auto-save integrado  
✅ Limites de quantidade (4 gallery, 1 principal, 1 logo)  

---

**Commits relacionados**:
- `feat: implement product & media editor with 2-column layout and 6 tabs`
- `feat: implement media upload with validation and storage`

**Setup**: Criar bucket `app-uploads` no Supabase Storage
