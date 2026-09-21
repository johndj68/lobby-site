# QA Test: Admin Central Marketplace

**Status:** MVP Completo - Pronto para teste

## Setup Inicial

### 1. Criar Dados de Teste

No Supabase Studio, executar:

```sql
-- Verificar app_drafts disponíveis
SELECT id, name FROM app_drafts LIMIT 3;

-- Criar submissions de teste (substituir <app_id> e <user_id>)
INSERT INTO app_submissions (status, submitted_at, app_draft_id, submitted_by, data)
VALUES 
  ('pending', NOW(), '<app_id>', '<user_id>', '{"name":"Test App 1","category":"Productivity"}'),
  ('in_review', NOW() - INTERVAL '1 day', '<app_id>', '<user_id>', '{"name":"Test App 2","category":"CRM"}'),
  ('approved', NOW() - INTERVAL '2 days', '<app_id>', '<user_id>', '{"name":"Test App 3","category":"Analytics"}')
RETURNING id, status;
```

Salvar os IDs das submissions criadas.

### 2. Fazer Login Admin

- Usar conta com role: `admin` ou `technician`
- Ir para: http://localhost:3000/admin/marketplace/solicitacoes

---

## Testes Funcionais

### ✅ Test 1: Listagem com Status Cards

**URL:** http://localhost:3000/admin/marketplace/solicitacoes

**Steps:**
1. Página carrega com tema escuro (#10151F background)
2. Verificar 5 cards de status aparecem:
   - Aguardando análise: X
   - Em análise: X
   - Aguardando ajustes: X
   - Aprovadas: X
   - Rejeitadas: X
3. Cada card mostra ícone + contador
4. Click em card filtra tabela por status
5. Click em "Limpar" reseta filtro

**Expected:** Todos os 3 status cards carregam com contadores corretos

---

### ✅ Test 2: Search e Filtro

**Steps:**
1. Digitar nome do app no search box
2. Tabela filtra em tempo real
3. Limpar search restaura todos
4. Combinar search + status filter funciona

**Expected:** Search case-insensitive, filtra nome do app

---

### ✅ Test 3: Tabela Submissions

**Steps:**
1. Verificar colunas: Aplicativo, Desenvolvedor, Categoria, Enviado em, Status, Ação
2. Cada linha mostra:
   - Logo + nome + descrição curta
   - Categoria do app
   - Data envio formatada (pt-BR)
   - Badge status com cor apropriada
   - Button "Analisar"
3. Hover em linha muda background pra #171F2D

**Expected:** Todos os dados carregam corretamente

---

### ✅ Test 4: Navegar Detalhe

**Steps:**
1. Click em "Analisar" de qualquer submission
2. URL muda para `/admin/marketplace/solicitacoes/[id]`
3. Header mostra app info:
   - Logo
   - Nome
   - Descrição curta
   - Versão ID
   - Data envio
4. Button "Voltar às solicitações" funciona (volta pra listagem)

**Expected:** Detalhe carrega sem erros

---

### ✅ Test 5: Tabs Conteúdo

**Steps:**
1. Click em "Conteúdo" tab
2. Mostra:
   - Descrição longa
   - Logo em destaque
   - Galeria de screenshots (grid)
   - Features em lista
3. Cada tab é independente e mantém conteúdo

**Expected:** Todos os dados exibem corretamente

---

### ✅ Test 6: Tabs Oferta

**Steps:**
1. Click em "Oferta" tab
2. Mostra cards para cada plano:
   - Nome do plano
   - Descrição
   - Preço + período (cor verde)
   - Período de teste (se houver)

**Expected:** Planos renderizam com layout card correto

---

### ✅ Test 7: Tabs Ativação

**Steps:**
1. Click em "Ativação" tab
2. Mostra:
   - Método de ativação
   - Link de ativação (clicável)
   - Email suporte

**Expected:** Dados carregam, link é clickável

---

### ✅ Test 8: Mensagens Dev vs Internas

**Steps:**
1. Em "Visão geral" tab, ir pra seção Mensagens
2. Dois buttons de tab:
   - "Mensagem ao desenvolvedor" (ativo)
   - "Nota interna"
3. Click em "Nota interna":
   - Textarea muda pro valor de internal_notes
   - Button fica azul (ativo)
4. Toggle entre os dois funciona

**Expected:** Ambas abas funcionam, valores são independentes

---

### ✅ Test 9: Ação "Solicitar Ajustes"

**Steps:**
1. Click button "Solicitar ajustes" (azul)
2. Modal aparece com:
   - Título "Solicitar ajustes"
   - Textarea "Feedback ao desenvolvedor"
   - Textarea "Notas internas"
   - Button "Confirmar" (azul)
   - Button "Cancelar"
3. Editar feedback + notas
4. Click "Confirmar"
5. Button fica "Enviando..."
6. Wait ~2s
7. Redirect para listagem
8. Verificar DB: `app_submissions.status` = 'changes_requested'

**Expected:** 
- Modal funciona
- POST /api/admin/submissions/[id]/review com action='request_changes'
- Banco atualizado
- Email enviado ao dev

---

### ✅ Test 10: Ação "Rejeitar"

**Steps:**
1. De volta na listagem, clicar "Analisar" em outra submission
2. Click "Rejeitar solicitação" (vermelho)
3. Modal aparece com título "Rejeitar solicitação"
4. Adicionar feedback
5. Click "Confirmar"
6. Redirect após sucesso
7. Verificar DB: `app_submissions.status` = 'rejected'

**Expected:** Workflow igual a Test 9

---

### ✅ Test 11: Ação "Aprovar" (Bloqueada)

**Steps:**
1. De volta na listagem, clicar "Analisar" em submission "Aguardando análise"
2. No painel direito, button "Aprovar aplicativo" deve estar:
   - Cor cinza/desabilitado (se há blockers)
   - Verde (se sem blockers)
3. Se há blockers, alertbox mostra: "X pendência impede a aprovação"
4. Se sem blockers, click "Aprovar":
   - Modal aparece com título "Aprovar aplicativo"
   - Feedback + notas
   - Click "Confirmar"
   - Status muda pra 'approved'

**Expected:** Bloqueia aprovação corretamente se há blockers

---

### ✅ Test 12: Email Notificação

**Steps:**
1. Após qualquer ação (approve/reject/request_changes)
2. Verificar logs Resend (console do projeto)
3. Email recebido no developer:
   - To: developer@example.com
   - Subject: "Seu aplicativo foi [aprovado|rejeitado|requer ajustes] - LOBBY"
   - Body contém:
     - Nome app
     - Feedback
     - Link dashboard

**Expected:** Email enviado com informações corretas

---

### ✅ Test 13: Salvar Análise

**Steps:**
1. Em qualquer detalhe, editar campos:
   - Mensagem ao dev
   - Nota interna
2. Click "Salvar análise" (button inferior)
3. Button fica "Salvando..."
4. Alert "Análise salva" aparece
5. Verificar DB: `app_submissions.public_feedback` e `internal_notes` atualizados

**Expected:** Salva sem efetuar decisão final

---

### ✅ Test 14: Dark Theme Completo

**Steps:**
1. Verificar cores em todos os elementos:
   - Background: #10151F
   - Cards: #171F2D
   - Borders: #2B3547
   - Text: #F1F5F9
   - Primary (azul): #1765FF
   - Success (verde): #10B981
   - Error (vermelho): #EF4444
   - Warning (laranja): #F59E0B
2. Hover states funcionam
3. Sem jittering ou flash de cores

**Expected:** Dark theme consistente em toda UI

---

## Testes de Erro

### ❌ Test 15: Modal Cancelar

**Steps:**
1. Abrir modal ação (qualquer um)
2. Click "Cancelar"
3. Modal fecha
4. Nenhuma request enviada (verificar Network tab)
5. Valores feedback não são salvos

**Expected:** Modal fecha sem efeitos

---

### ❌ Test 16: Sem Permissão

**Steps:**
1. Fazer logout
2. Tentar acessar http://localhost:3000/admin/marketplace/solicitacoes
3. Deve redirecionar ou mostrar error page

**Expected:** 404 ou redirect login

---

### ❌ Test 17: Submission Não Existe

**Steps:**
1. URL direto: http://localhost:3000/admin/marketplace/solicitacoes/invalid-id
2. Deve mostrar error page

**Expected:** 404

---

## Performance

### ⚡ Test 18: Tempo Carregamento

**Steps:**
1. Abrir DevTools > Performance
2. Carregar listagem
3. Tempo total deve ser < 2s
4. Carregar detalhe deve ser < 1.5s
5. Click ação não deve travar UI

**Expected:** Rápido + responsivo

---

## Checklist Final

- [x] Compilação: `npm run build` passa sem erros
- [x] TypeScript: Sem type errors
- [x] Rotas existem e funcionam
- [x] Dark theme implementado
- [x] Dados carregam do DB
- [x] Ações funcionam (approve/reject/request_changes)
- [x] Emails são enviados
- [x] Modal de confirmação funciona
- [x] Search e filtro funcionam
- [x] Tabs funcionam
- [x] Messages dev/internas funcionam
- [x] Save análise funciona

---

## Notas

1. **Dados de Teste:** Use IDs reais do seu DB
2. **Emails:** Configure RESEND_API_KEY se testar emails
3. **Auth:** Certifique que user tem role `admin` ou `technician`
4. **Browser:** Chrome/Firefox recomendados (dark theme completo)

---

**Último Update:** 2026-09-21
**Status:** MVP - Ready for QA
