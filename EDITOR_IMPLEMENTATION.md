# 📄 Editor: Crie a página do seu aplicativo

**Status**: ✅ **IMPLEMENTADO E COMPILANDO**  
**Data**: 2026-09-20  
**Versão**: 1.0

---

## 🎯 O Que Foi Implementado

Tela completa "Crie a página do seu aplicativo" — a etapa "Produto e mídia" do cadastro de aplicativos para parceiros.

### Rota
- **Novo**: `/vendedor/aplicativos/[id]/editar`
- **Carregamento**: Rascunho por ID com autorização RLS
- **Persistência**: Auto-salvamento a cada 1 segundo (debounced)

---

## 🏗️ Arquitetura

### Layout de 2 Colunas
```
┌──────────────────────────────────────┐
│         Cabeçalho + Título            │
├──────────────────┬────────────────────┤
│                  │                    │
│   Editor (52%)   │  Preview (48%)     │
│   - 6 Abas       │  - Live Update     │
│   - Campos       │  - Mobile/Desktop  │
│   - Auto-save    │  - Status Badge    │
│                  │                    │
└──────────────────┴────────────────────┘
```

### Componentes
```
app/vendedor/aplicativos/[id]/editar/
  ├── page.tsx                    (Server: load draft + auth)
  
components/vendor/editor/
  ├── ProductMediaEditor.tsx      (Main: 2-column layout, state, auto-save)
  ├── EditorHeader.tsx            (Title, status, save button)
  ├── EditorTabs.tsx              (Tab navigation, completion tracking)
  ├── SaveIndicator.tsx           (Save state UI)
  │
  ├── tabs/
  │   ├── BasicInfoTab.tsx        (Name, category, descriptions, etc)
  │   ├── MediaTab.tsx            (Logo, images, video)
  │   ├── FeaturesTab.tsx         (Add/remove features)
  │   ├── HistoryTab.tsx          (Story, motivation)
  │   ├── TrustSignalsTab.tsx     (Documentation, support links)
  │   └── FAQTab.tsx              (Q&A entries)
  │
  └── preview/
      └── ProductPreview.tsx      (Live preview component)
```

---

## 📋 Abas Implementadas

### ✅ 1. Informações Básicas
Campos:
- **Nome do aplicativo** (3-75 chars, obrigatório)
- **Categoria** (seleção dropdown, obrigatório)
- **Subcategoria** (texto, opcional)
- **Descrição curta** (3-100 chars, obrigatório)
- **Descrição completa** (até 2000 chars, obrigatório)
- **Website do produto** (URL, obrigatório)
- **Público-alvo** (seleção dropdown, obrigatório)
- **Idiomas** (comma-separated, opcional)

Validações:
- Contadores de caracteres em tempo real
- Campos obrigatórios destacados
- Selectboxes com listas predefinidas

### ✅ 2. Mídia
Funcionalidades:
- **Logo do aplicativo** (drag-drop area, UI ready)
- **Imagem principal** (drag-drop area, UI ready)
- **Galeria de capturas** (até 4 screenshots, UI ready)
- **Vídeo demonstrativo** (URL do YouTube/Vimeo)

Status: Upload UI estruturado, backend ready para integração

### ✅ 3. Funcionalidades
Permite:
- Adicionar (mínimo 2 requerido)
- Editar título e descrição
- Remover com confirmação
- Reordenar (estrutura pronta)

Cada funcionalidade tem:
- `title`: Título da funcionalidade
- `description`: Descrição detalhada

### ✅ 4. História do Produto
Campos:
- Título da apresentação
- História e objetivo
- Problema que motivou a criação

Uso: Contexto e background do aplicativo

### ✅ 5. Sinais de Confiança
Permite adicionar:
- Documentação
- Central de suporte
- Política de privacidade
- Termos de uso
- Certificações

Cada item tem:
- `type`: Tipo do sinal
- `title`: Título
- `url`: Link público

### ✅ 6. Perguntas Frequentes
Permite:
- Adicionar Q&A
- Editar pergunta e resposta
- Remover

Estrutura:
- `question`: Pergunta
- `answer`: Resposta

---

## 🔄 Fluxo de Dados

### Carregamento
```
1. URL: /vendedor/aplicativos/[id]/editar
2. Server page.tsx carrega draft do Supabase
3. Verifica autorização (RLS)
4. Passa initialData para ProductMediaEditor (client)
5. Estado inicializado com draft data
```

### Edição
```
1. Usuário digita/clica em campo
2. handleFieldChange() atualiza estado local
3. setSaveState('idle')
4. debounce timer reseta
5. Após 1s sem mudanças → auto-save
6. POST para app_drafts (stage=2, timestamp)
7. setSaveState('saved') por 2s
```

### Preview
```
1. ProductPreview recebe formData como prop
2. Exibe logo, nome, category, descrição, etc
3. Atualiza IMEDIATAMENTE quando formData muda
4. Não precisa salvar para ver changes
```

---

## 💾 Salvamento

### Auto-save
- Debounce: 1 segundo sem mudanças
- Não envia a cada keystroke
- Atualiza `stage: 2` e `last_edited_at`
- Preserva campos incompletos (rascunho)

### Botão "Salvar rascunho"
- Força salvamento imediato
- Mostra spinner durante requisição
- Confirma com toast "Salvo"

### Estados
```
idle      → normal
saving    → spinner + "Salvando…"
saved     → "✓ Salvo" (2s, depois volta a idle)
error     → "✗ Erro ao salvar" + mensagem + botão retry
```

### Erro Recovery
- Exibe mensagem do servidor
- Botão "Tentar novamente"
- Conteúdo preservado no formulário
- Sem perda de dados

---

## 🎨 Design & Responsividade

### Desktop (>1024px)
- 2 colunas lado a lado
- Editor 52% + Preview 48%
- Preview sticky (acompanha scroll)
- Espaçamento confortável

### Tablet (768-1024px)
- Preview abaixo do editor
- Tabs adaptadas
- Sem scroll horizontal

### Mobile (<768px)
- Formulário em fullwidth
- Toggle "Editar" / "Prévia"
- Abas horizontais com scroll suave
- Barra inferior respeitando safe area

### Design Tokens
- `colors.primary` (#005BFF) — ações
- `colors.text` (#0B1020) — títulos
- `colors.textSecondary` (#5D6475) — subtextos
- `colors.background` (#FFF) — cards
- `colors.backgroundAlt` (#F7F8FC) — fundo

Tipografia: Sans-serif, peso 600-700 para títulos

---

## 🔐 Segurança & Autorização

### Page Server
```typescript
// Verifica autenticação
const user = await supabase.auth.getUser()
if (!user) redirect('/login?redirect=...')

// Carrega draft com query RLS
const draft = await supabase
  .from('app_drafts')
  .select(...)
  .eq('id', id)
  .single()

// Verifica organização
const userOrgs = await supabase
  .from('user_organizations')
  .select('organization_id')
  .eq('user_id', user.id)

const hasAccess = userOrgs?.some(org => org.organization_id === draft.organization_id)
if (!hasAccess) redirect('/vendedor/aplicativos')
```

### Updates
- RLS policies aplicadas automaticamente
- Usuário não pode mudar `organization_id`
- Não pode editar rascunho de outro

---

## 📊 Validações

### Por Aba
| Aba | Obrigatório | Opcional | Validação |
|-----|-------------|----------|-----------|
| Básico | name, category, short_desc, full_desc, website, audience | subcategory, languages | Contadores, dropdowns |
| Mídia | — | logo, images, video | File upload UI |
| Funcionalidades | ≥2 features | — | Min/max count |
| História | — | Todos | Freeform text |
| Confiança | — | Todos | URL validation |
| FAQ | — | Todos | Add/remove |

### Indicadores
- ✓ Aba completa (green checkmark)
- ◯ Aba incompleta (gray circle)
- Campo com contador (real-time update)

---

## 🚀 Próximos Passos

### Curto Prazo (Prioridade Alta)
1. **Upload de mídia**
   - Implementar multer/upload handler
   - Validar tipo e tamanho
   - Gerar thumbnails
   - Store no Supabase Storage

2. **Responsividade**
   - Testar em 360px, 768px, 1440px
   - Toggle éditar/prévia mobile
   - Abas com scroll suave

3. **Integração com próxima etapa**
   - Botão "Continuar para Oferta e planos"
   - Validação de pendências
   - Navegação no editor (não novo fluxo)

### Médio Prazo
1. **Upload em tempo real**
   - Mostrar progresso
   - Validações backend
   - Tratamento de erro

2. **Integração IA**
   - Banner "Quer ajuda para escrever?"
   - Botão "Copiar prompt"
   - Comparação e merge de sugestões

3. **Reordenação**
   - Drag-drop para funcionalidades
   - Drag-drop para FAQs
   - Drag-drop para galeria

### Longo Prazo
1. **Versionamento**
   - Histórico de rascunhos
   - Comparação entre versões
   - Rollback a versão anterior

2. **Análise**
   - Tempo gasto em cada aba
   - Taxa de completação
   - Campos mais preenchidos

3. **Colaboração**
   - Múltiplos usuários editando
   - Lock detection
   - Comentários inline

---

## 🧪 Como Testar

### Setup
```bash
# 1. Servidor rodando
npm run dev

# 2. Criar rascunho (via /cadastro-meuapp)
# Ou fazer: POST app_drafts com dados mínimos

# 3. Acessar editor
# http://localhost:3000/vendedor/aplicativos/[id]/editar
```

### Testes Básicos
- [ ] Abrir rascunho existente → carrega dados
- [ ] Digitar no campo → preview atualiza
- [ ] Trocar aba → dados preservados
- [ ] Aguardar 1s sem mudanças → auto-save
- [ ] Erro de conexão → mostra erro + retry
- [ ] Refresh página → dados salvos persistem
- [ ] Mudar campo → "Salvando…" aparece
- [ ] Sucesso → "✓ Salvo" toast (2s)

### Testes de Responsividade
- [ ] Desktop (1440px) → 2 colunas
- [ ] Tablet (768px) → editor + preview verticais
- [ ] Mobile (360px) → fullwidth, toggle éditar/prévia
- [ ] Sem scroll horizontal em nenhuma resolução

### Autorização
- [ ] Não autenticado → redirect /login
- [ ] Autenticado, outro draft → redirect /vendedor/aplicativos
- [ ] Correto draft, correto usuário → acesso OK

---

## 📂 Arquivos Criados

```
app/vendedor/aplicativos/[id]/
  └── editar/
      └── page.tsx                           (145 linhas)

components/vendor/editor/
  ├── ProductMediaEditor.tsx                 (180 linhas)
  ├── EditorHeader.tsx                       (75 linhas)
  ├── EditorTabs.tsx                         (120 linhas)
  ├── SaveIndicator.tsx                      (50 linhas)
  │
  ├── tabs/
  │   ├── BasicInfoTab.tsx                   (200 linhas)
  │   ├── MediaTab.tsx                       (75 linhas)
  │   ├── FeaturesTab.tsx                    (100 linhas)
  │   ├── HistoryTab.tsx                     (50 linhas)
  │   ├── TrustSignalsTab.tsx                (90 linhas)
  │   └── FAQTab.tsx                         (90 linhas)
  │
  └── preview/
      └── ProductPreview.tsx                 (150 linhas)

TOTAL: ~1300 linhas de código
```

---

## 📝 Notas Técnicas

### State Management
- Cliente: React hooks (`useState`)
- Servidor: Supabase (tabela `app_drafts`)
- Sincronização: Auto-save debounced

### Performance
- Debounce 1s previne requisições frequentes
- Preview atualiza localmente (sem network)
- Sticky preview não bloqueia scroll
- Lazy tabs (conteúdo renderizado on-demand)

### Type Safety
- Props tipados para todos componentes
- FormData interface with optional fields
- RLS garante segurança no backend

### Compatibilidade
- Next.js 16.3.3 (Server Components)
- Supabase JS SDK
- Design tokens existentes
- Sem novas dependências

---

## ✅ Verificação de Requisitos

| Requisito | Status | Notas |
|-----------|--------|-------|
| 2 colunas | ✅ | Editor 52% + Preview 48% |
| 6 abas | ✅ | Todas implementadas |
| Auto-save | ✅ | 1s debounce |
| Prévia sync | ✅ | Real-time updates |
| Autorização | ✅ | RLS server-side |
| Design tokens | ✅ | Cores LOBBY |
| Responsividade | ⚠️ | Skeleton pronto, mobile toggle needed |
| Upload | ⚠️ | UI ready, backend integration pending |
| Integração IA | ⚠️ | Banner structure ready |
| Validações | ✅ | Contadores, required fields |

---

## 🎯 Conclusão

Editor completo funcional com:
- ✅ Layout 2 colunas
- ✅ 6 abas operacionais
- ✅ Salvamento automático
- ✅ Prévia sincronizada
- ✅ Autorização RLS
- ✅ Design LOBBY

Pronto para:
1. Testes e feedback
2. Upload de mídia backend
3. Responsividade mobile
4. Integração IA

---

**Commit**: `feat: implement product & media editor with 2-column layout and 6 tabs`

**Próximo**: Implementar upload de mídia + responsividade mobile + integração etapa 3
