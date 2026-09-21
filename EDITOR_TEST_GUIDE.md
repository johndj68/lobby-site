# 🧪 Guia de Teste: Editor "Crie a página do seu aplicativo"

**Versão**: 2.0 - Especificação Completa  
**Data**: 2026-09-20  
**Estado**: Pronto para Teste Manual

---

## 🚀 Setup Inicial

### 1. Iniciar servidor
```bash
npm run dev
```
Aguardar até "Server ready at http://localhost:3000"

### 2. Autenticar no app
- Acessar http://localhost:3000
- Login com credenciais de desenvolvedor
- Navegação após auth bem-sucedida

### 3. Acessar editor (precisa draft existente)
```
http://localhost:3000/vendedor/aplicativos/{DRAFT_ID}/editar
```

**Onde obter DRAFT_ID**:
- Via `/vendedor/aplicativos` → listar drafts existentes
- Via Supabase Studio → tabela `app_drafts`
- Criar novo via `/cadastro-meuapp` (Step 1)

---

## 📋 Checklist de Teste

### A. COMPONENTES VISUAIS

#### ✅ Cabeçalho
- [ ] Logo LOBBY visível à esquerda
- [ ] "PARCEIROS" identificação visível
- [ ] Breadcrumb: "Meus aplicativos / [App] / Editar"
- [ ] Botão "Salvar rascunho" à direita
- [ ] Status salvamento: "Salvando…" / "✓ Salvo" / "✗ Erro"

#### ✅ Título + Descrição
- [ ] "Crie a página do seu aplicativo" visível
- [ ] "Edite as informações e acompanhe a prévia do anúncio."

#### ✅ AI Help Banner
- [ ] Aparece abaixo do header (azul claro)
- [ ] Ícone ⚡ visível
- [ ] Título: "Quer ajuda para escrever?"
- [ ] Botão "Copiar prompt" funciona (clipboard)
- [ ] Botão X fecha o banner

#### ✅ Indicador de Etapas
- [ ] Mostrado em local apropriado
- [ ] Etapa 2 (Produto e mídia) marcada como ativa
- [ ] Outras etapas acessíveis (desativadas visualmente)

#### ✅ Tab Navigation (6 abas)
- [ ] "Informações básicas" 
- [ ] "Mídia"
- [ ] "Funcionalidades"
- [ ] "História do produto"
- [ ] "Sinais de confiança"
- [ ] "Perguntas frequentes"
- [ ] Abas incompletas mostram ◯ (círculo)
- [ ] Abas completas mostram ✓ (check)
- [ ] "(opcional)" label nas abas opcionais

#### ✅ Pending Items Box
- [ ] Aparece quando há campos obrigatórios faltantes
- [ ] Lista campos com "→" (chevron para abrir)
- [ ] Clique em item abre aba correspondente
- [ ] Desaparece quando todos preenchidos

#### ✅ Preview Column (Desktop)
- [ ] Visível à direita em desktop
- [ ] Hidden em mobile
- [ ] Sticky (acompanha scroll)
- [ ] Título "Prévia do anúncio"

#### ✅ Bottom Action Bar
- [ ] Fixado ao fundo
- [ ] "Seu rascunho ainda não foi publicado"
- [ ] Botão "Voltar"
- [ ] Botão "Salvar e sair"
- [ ] Botão "Continuar para planos" (cinza se pendências)
- [ ] Save state ("Salvando…" / "✓ Salvo")

---

### B. ABA: INFORMAÇÕES BÁSICAS

#### Seção "Informações Básicas"

- [ ] **Nome do aplicativo** *
  - Input visible
  - Placeholder "Ex: FlowPilot"
  - Contador: 0/75
  - Obrigatório para completar
  - Max length 75 enforced

- [ ] **Categoria** *
  - Dropdown funcional
  - 8 opções visíveis: IA, Automação, Marketing, etc
  - Obrigatório
  - Mostra aviso "Escolha a categoria"

- [ ] **Subcategoria** (opcional)
  - Input text
  - Sem obrigatoriedade
  - Aparência dimmed (opcional)

- [ ] **Descrição curta** *
  - Textarea 2 linhas
  - Contador: 0/100
  - Obrigatório
  - Max length enforced

- [ ] **Chamada complementar** (opcional)
  - Input text
  - Contador: 0/140
  - Label "Opcional" visível
  - NOVO campo (verificar presença)

- [ ] **Diferencial do produto** *
  - Textarea 3 linhas
  - Contador: 0/255
  - Obrigatório
  - Min 30 chars (validar mensagem)
  - NOVO campo (verificar presença)

- [ ] **Descrição completa** *
  - Textarea 6 linhas
  - Contador: 0/2000
  - Obrigatório
  - Max length enforced

- [ ] **Benefícios** *
  - TWO INPUTS (NOVO)
  - Cada um até 128 chars
  - Contadores para cada
  - Ambos obrigatórios
  - Labels: "Benefício 1", "Benefício 2"

#### Seção "Visão Geral"

- [ ] **Website do produto** *
  - URL input
  - Obrigatório
  - Placeholder: "https://seuapp.com"
  - Validação HTTP/HTTPS

- [ ] **Ideal para** *
  - Dropdown com 6 públicos
  - Obrigatório
  - Valores: Pequenas empresas, Médias, Startups, Devs, Agências, Tech

- [ ] **Alternativas a** (opcional, NOVO)
  - Input + Enter para adicionar
  - Chips com X para remover
  - Até 3 produtos max
  - Contador: 0/3
  - NOVO campo (verificar presença)

- [ ] **Integrações** (opcional, NOVO)
  - Grid de toggle buttons
  - Opciones: Zapier, Slack, Teams, Salesforce, HubSpot, Jira, Asana, Monday, Airtable, Google
  - Até 5 selecionáveis
  - Contador: 0/5
  - NOVO campo (verificar presença)
  - Buttons mudam de cor ao selecionar

- [ ] **Idiomas disponíveis** (opcional)
  - Input text
  - Comma-separated
  - Placeholder: "pt, en, es"
  - Sem obrigatoriedade

---

### C. ABA: MÍDIA

#### Upload Fields
- [ ] **Logo do aplicativo** *
  - Drag-drop area visível
  - Clique abre file picker
  - Preview após upload
  - Botão X remove
  - Max 10MB validado
  - Obrigatório

- [ ] **Imagem principal** *
  - Drag-drop area (16:9 recomendado)
  - Aspect ratio 16:9 mantido
  - Preview full-width
  - Botão X (top-right) remove
  - Obrigatório

- [ ] **Galeria de capturas** (até 4)
  - Grid 2 colunas
  - Contador: "X/4 restantes"
  - Cada imagem tem X remove button
  - Upload area desaparece após 4

- [ ] **Vídeo demonstrativo** (opcional)
  - Input URL
  - Placeholder YouTube/Vimeo
  - Sem obrigatoriedade

#### Upload States
- [ ] Uploading: spinner + "Enviando… X%"
- [ ] Success: preview imediato
- [ ] Error: mensagem em vermelho + retry button
- [ ] Disabled estado: opacity-50 durante upload

---

### D. ABA: FUNCIONALIDADES

- [ ] **Lista de funcionalidades**
  - Cada uma em card
  - Título: "Funcionalidade 1", "Funcionalidade 2", etc

- [ ] **Por funcionalidade**
  - Input "Título" required
  - Textarea "Descrição"
  - Botão X remove com feedback visual

- [ ] **Adicionar funcionalidade**
  - Botão "+ Adicionar funcionalidade"
  - Adiciona novo item ao final

- [ ] **Validação**
  - Mínimo 2 exigido
  - Mensagem: "Mínimo de 2 funcionalidades necessárias" se < 2
  - Aba mostra ◯ se < 2, ✓ se ≥ 2

---

### E. ABA: HISTÓRIA DO PRODUTO

- [ ] **Título da apresentação** (opcional)
  - Input text
  - Placeholder "Ex: Conheça nossa história"

- [ ] **História e objetivo** (até 2000 chars)
  - Textarea 6 linhas
  - Contador: 0/2000
  - Optional (não bloqueia)

- [ ] **Problema que motivou a criação** (até 1000 chars)
  - Textarea 4 linhas
  - Contador: 0/1000
  - Optional

- [ ] **Sobre os criadores** (até 1000 chars, NOVO)
  - Textarea 3 linhas
  - Contador: 0/1000
  - Optional
  - NOVO campo (verificar presença)

- [ ] **Indicador**
  - Aba mostra ◯ (opcional) mesmo vazia

---

### F. ABA: SINAIS DE CONFIANÇA

- [ ] **Cada sinal (item)**
  - Tipo (dropdown): Docs, Suporte, Privacidade, Termos
  - Título (input)
  - URL (input URL)
  - Botão X remove

- [ ] **Adicionar sinal**
  - Botão "+ Adicionar sinal de confiança"
  - Adiciona novo item vazio

- [ ] **Validação**
  - Tipo + título + URL = válido
  - Nenhuma obrigatoriedade de preenchimento

---

### G. ABA: PERGUNTAS FREQUENTES

- [ ] **Cada FAQ (item)**
  - Input "Pergunta"
  - Textarea "Resposta"
  - Botão X remove

- [ ] **Adicionar FAQ**
  - Botão "+ Adicionar pergunta"
  - Adiciona novo item vazio

- [ ] **Validação**
  - Opcional (não bloqueia)
  - Sem mínimo de FAQs

---

### H. PREVIEW SINCRONIZADA

#### Conteúdo Exibido
- [ ] Logo (pequeno, 12x12)
- [ ] Nome do app (título)
- [ ] Categoria (badge azul)
- [ ] Descrição curta
- [ ] Chamada complementar (se preenchida) - NOVO
- [ ] Diferencial (seção) - NOVO
- [ ] Benefícios com ✓ (se preenchidos) - NOVO
- [ ] Imagem principal (aspect video)
- [ ] Screenshots (até 4 em grid)
- [ ] Vídeo (ícone Play)
- [ ] Funcionalidades (até 3)
- [ ] Integrações (chips) - NOVO
- [ ] Público-alvo
- [ ] Idiomas
- [ ] Links de confiança
- [ ] Status "Rascunho"

#### Sincronização
- [ ] Digitar no campo → preview atualiza imediatamente
- [ ] Sem delay perceptível
- [ ] Sem reload necessário
- [ ] Mudança em um campo só afeta aquele conteúdo

#### Desktop vs Mobile
- [ ] Desktop: Sticky à direita
- [ ] Mobile: Hidden (toggle manual se implementado)
- [ ] Tablet: Abaixo dos tabs

---

### I. SALVAMENTO E PERSISTÊNCIA

#### Auto-save
- [ ] Digitar campo → Estado "Salvando…" após 1s
- [ ] Após salvamento → "✓ Salvo" por 2s
- [ ] Não envia request a cada keystroke
- [ ] Múltiplas edições = 1 requisição (debounce)

#### Botão "Salvar rascunho"
- [ ] Força salvamento imediato
- [ ] Mostra spinner durante salvamento
- [ ] Confirma "✓ Salvo"
- [ ] Disabled durante salvamento

#### Persistência
- [ ] Refresh página → dados preservados
- [ ] Navegar para abas diferentes → dados não perdidos
- [ ] Voltar para abas anteriores → dados intactos

#### Error Handling
- [ ] Erro ao salvar → exibe mensagem em vermelho
- [ ] Mensagem inclui motivo do erro (server response)
- [ ] Botão "Tentar novamente" funciona
- [ ] Conteúdo preservado após erro

---

### J. NAVEGAÇÃO E PENDÊNCIAS

#### Pending Items
- [ ] Box "Antes de continuar" mostra lista
- [ ] Cada item clicável abre aba correspondente
- [ ] Foco visual no campo obrigatório (highlight ou scroll)
- [ ] Lista desaparece quando tudo preenchido

#### Botão "Continuar para planos"
- [ ] **Desativado** se há pendências (cor cinza)
- [ ] **Ativado** quando todos campos obrigatórios preenchidos
- [ ] Tooltip ou label explicando desativação
- [ ] Clique navega para `/vendedor/aplicativos/{id}/editar-planos`

#### Botão "Voltar"
- [ ] Navega para `/vendedor/aplicativos`
- [ ] Sem perder dados (salva antes se pendente)

#### Botão "Salvar e sair"
- [ ] Força save imediato
- [ ] Após sucesso → navega para `/vendedor/aplicativos`
- [ ] Se erro → permanece na tela com mensagem

---

### K. RESPONSIVIDADE

#### Desktop (1440px)
- [ ] 2 colunas visíveis lado a lado
- [ ] Sem scroll horizontal
- [ ] Preview sticky na direita
- [ ] Espaçamento confortável

#### Tablet (768px)
- [ ] Editor fullwidth
- [ ] Preview abaixo (scrollable)
- [ ] Abas não hidden
- [ ] Bottom bar adaptado

#### Mobile (390px)
- [ ] Editor fullwidth
- [ ] Preview hidden (ou toggle)
- [ ] Tabs não scrollam horizontalmente
- [ ] Bottom bar respeita safe area
- [ ] Sem scroll horizontal da página

#### Teste em breakpoints
- [ ] 360px (mínimo)
- [ ] 390px (padrão)
- [ ] 768px (tablet)
- [ ] 1024px (desktop pequeno)
- [ ] 1440px (desktop padrão)

---

### L. SEGURANÇA E AUTORIZAÇÃO

#### RLS Verification
- [ ] Usuário A vê apenas seus apps
- [ ] Usuário B não vê apps de A
- [ ] Outra organização → acesso negado

#### Upload Validation
- [ ] File type válido (PNG, JPEG, WebP)
- [ ] File size < 10MB
- [ ] Invalid type → mensagem de erro
- [ ] Oversized → mensagem de erro

#### Data Integrity
- [ ] Stage salvo como 2
- [ ] Timestamp `last_edited_at` atualizado
- [ ] Versão pública não afetada (só rascunho)

---

### M. VALIDAÇÕES DE CAMPO

#### Contadores
- [ ] "Nome do app": 0/75 atualiza ao digitar
- [ ] "Descrição curta": 0/100 em tempo real
- [ ] "Diferencial": 0/255 sincronizado
- [ ] Todos contadores precisos

#### Max Length
- [ ] Nome: 75 chars hard limit
- [ ] Descrição curta: 100 chars hard limit
- [ ] Diferencial: 255 chars hard limit
- [ ] Não permite digitar além do limite

#### Required Fields
- [ ] Nome: obrigatório
- [ ] Categoria: obrigatório
- [ ] Descrição curta: obrigatório
- [ ] Descrição completa: obrigatório
- [ ] Diferencial: obrigatório
- [ ] Benefícios (2x): ambos obrigatórios
- [ ] Website: obrigatório
- [ ] Público-alvo: obrigatório
- [ ] Logo: obrigatório
- [ ] Imagem principal: obrigatório
- [ ] Funcionalidades: mínimo 2

#### Optional Fields
- [ ] Subcategoria: não bloqueia
- [ ] Chamada complementar: não bloqueia
- [ ] Alternativas: não bloqueia
- [ ] Integrações: não bloqueia
- [ ] Idiomas: não bloqueia
- [ ] História: não bloqueia
- [ ] Trust signals: não bloqueia
- [ ] FAQs: não bloqueia

---

## 🎬 Teste de Fluxo Completo

### Cenário 1: Novo Rascunho (Mínimo)
1. [ ] Preencher "Nome do app"
2. [ ] Escolher "Categoria"
3. [ ] Escrever "Descrição curta"
4. [ ] Escrever "Descrição completa"
5. [ ] Escrever "Diferencial"
6. [ ] Escrever "Benefício 1" e "Benefício 2"
7. [ ] Escrever "Website"
8. [ ] Escolher "Público-alvo"
9. [ ] Upload "Logo"
10. [ ] Upload "Imagem principal"
11. [ ] Adicionar 2 funcionalidades
12. [ ] Refresh página → dados persistem
13. [ ] Clique "Continuar" → navega para `/editar-planos`

### Cenário 2: Erros e Recuperação
1. [ ] Desconectar internet (DevTools)
2. [ ] Tentar salvar → "Erro"
3. [ ] Reconectar internet
4. [ ] Clique "Tentar novamente" → sucesso
5. [ ] Dados não foram perdidos

### Cenário 3: Múltiplas Abas
1. [ ] Preencher algo em "Informações básicas"
2. [ ] Ir para "Mídia"
3. [ ] Voltar para "Informações básicas"
4. [ ] Dados ainda lá (não perdidos)

### Cenário 4: Integração com AI
1. [ ] Clicar "Copiar prompt"
2. [ ] Verificar clipboard (colar em teste)
3. [ ] Prompt inclui dados atuais do form

---

## 📊 Métricas de Sucesso

| Critério | Esperado | Status |
|----------|----------|--------|
| Todos os 6 tabs renderizam | ✅ | [ ] |
| Novos campos presentes | ✅ | [ ] |
| Contadores sincronizados | ✅ | [ ] |
| Auto-save 1s debounce | ✅ | [ ] |
| Preview real-time | ✅ | [ ] |
| Pendências bloqueiam continuar | ✅ | [ ] |
| RLS funciona | ✅ | [ ] |
| Sem scroll horizontal | ✅ | [ ] |
| Mobile responsivo | ✅ | [ ] |
| Build zero errors | ✅ | [ ] |

---

## 🐛 Bugs Conhecidos / Pendências

- [ ] Reordenação drag-drop: Estrutura pronta, UI pendente
- [ ] Integração com agente de IA: Apenas copy-prompt por agora
- [ ] Imagens em funcionalidades: Structure ready, association pending
- [ ] Full localization: Português OK, outros idiomas não testados

---

## 📞 Suporte

**Documentação técnica**: `COMPLETE_EDITOR_IMPLEMENTATION.md`  
**Código-fonte**: `components/vendor/editor/`  
**Banco de dados**: Supabase `app_drafts` table

