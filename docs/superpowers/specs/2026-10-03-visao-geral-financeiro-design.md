# Vendas e financeiro — redesenho da "Visão geral" e filtros compartilhados

## Contexto

A tela `/dashboard/financeiro` (Visão geral) hoje é 1 card externo com 6
indicadores (retido, elegível, já repassado, reserva, vendas do mês,
reembolsos do mês), todos vindo de uma única RPC sem filtro de período
(`get_partner_financeiro_overview`). As outras 4 abas (`Vendas`,
`Repasses e extrato`, `Ofertas e promoções`, `Configurações de
recebimento`) já existem e funcionam — este redesenho não as toca,
exceto pelo compartilhamento de um cabeçalho/filtro comum.

Este documento cobre a Visão geral + a barra de filtros compartilhada
por toda `/dashboard/financeiro/**`. Vendas, Repasses, Ofertas e
Configurações continuam exatamente como estão.

## Objetivo

Dar ao parceiro uma resposta visual rápida pra: quanto vendeu, qual sua
participação, quanto está retido/em reserva, quanto está disponível
pra repasse, quando a próxima liberação acontece, e se existe alguma
pendência que exige ação dele.

## Decisões de arquitetura (confirmadas)

1. **Moeda e Organização**: nenhum filtro construído. 100% das vendas
   reais são BRL (coluna `currency` existe, nunca varia na prática); não
   existe conceito de "organização" no schema (só parceiro=profile +
   delegação via `app_team_members`, já coberta pelo seletor
   "Visualizando financeiro de" da Etapa 5). Documentado aqui como a
   razão de omitir — não é esquecimento.
2. **RPCs de período são novas, paralelas às 7 já existentes** — nenhuma
   RPC/página/componente hoje em produção (Vendas, Repasses, a própria
   Visão geral atual) é alterada ou tem assinatura trocada.
3. **Correção pós-pergunta ao usuário**: a pesquisa inicial dissera que
   não existia coluna de data de reembolso — errado. `app_purchases.refunded_at`
   existe desde `20260930110000_reembolso_app_purchase.sql:18` e **já é
   o critério usado hoje** pelo card "Reembolsos do mês" em produção
   (`get_partner_financeiro_overview`, linha `and ap.refunded_at >=
   v_month_start`). **"Reembolsos do período" usa `refunded_at` (a data
   real do reembolso)**, não `paid_at` — mais simples (zero migração
   nova) e consistente com o que já está em produção. A pergunta feita
   ao usuário partiu de uma premissa errada; corrigido aqui antes do
   plano, sem precisar de nova pergunta (a opção certa — usar a data
   real — já era a mais simples das duas, não uma mudança de
   direção).
4. **Biblioteca de gráfico: Recharts** — nenhuma lib de gráfico existe
   hoje no projeto (admin incluso); Recharts é a nova dependência.
5. **"Ver detalhes" de uma venda linka pra `/dashboard/financeiro/vendas?venda=<id>`**
   — não existe nem será criada uma rota de detalhe por venda; a aba
   Vendas já mostra tudo numa linha expansível, só precisa abrir com
   essa linha em foco.
6. **Export é 1 CSV com seções rotuladas** (metadados + "RESULTADOS DO
   PERÍODO" + "SALDOS ATUAIS (em DD/MM/AAAA)" + "VENDAS DO PERÍODO"),
   não múltiplos arquivos.
7. **Export usa a mesma capacidade `financeiro_visao_geral`** — sem
   capacidade nova de equipe.
8. **Pendências**: "repasse com falha" mapeia pra
   `partner_payouts.status='revertido'` recente (não existe um estado
   real de "falha de envio" — repasse é PIX/TED manual confirmado por
   admin); "disputa" é aviso informativo com link pra suporte, sem ação
   própria no sistema hoje.
9. **Saldos atuais filtram por app via correspondência de
   `application_name`** nas filas existentes (`get_partner_payout_queue_main`/
   `_reserve` não retornam `application_id`) — limitação documentada,
   aceitável pois nome de app é praticamente único por parceiro.

## Modelo de dados — 4 RPCs novas

Mesmo padrão de permissão das 7 RPCs já existentes de
`20261002140000_recebimento_atendimento_equipe.sql`: `p_partner_id uuid
default null` (null = `auth.uid()`), checagem
`role='owner' or 'financeiro_visao_geral' = any(tm.permissions)` quando
`p_partner_id <> auth.uid()`, `security definer`, `set search_path to
'public'`, `revoke ... from public, anon, authenticated` +
`grant execute ... to authenticated`.

A assinatura exata de cada função (parâmetros, tipos, corpo SQL
completo) é detalhada na etapa de plano, não neste spec; aqui ficam
contrato e campos de retorno de cada uma. Todas recebem
`p_partner_id uuid default null`; as 3 primeiras recebem também
`p_from timestamptz, p_to timestamptz, p_application_id uuid default null`.

### 1. `get_partner_financeiro_periodo_resumo(p_partner_id, p_from, p_to, p_application_id)`

Uma linha:

| coluna | tipo | definição |
|---|---|---|
| `vendas_confirmadas_valor` | numeric(12,2) | soma de `amount` de `app_purchases.status='paid'` + `subscription_invoices` pagas, `paid_at` no período |
| `vendas_confirmadas_qtd` | integer | contagem das mesmas linhas |
| `comissao_valor` | numeric(12,2) | soma de `commission_amount` das mesmas linhas |
| `reembolsos_valor` | numeric(12,2) | soma de `refunded_amount` onde `refunded_at` caiu no período (mesmo critério de `get_partner_financeiro_overview`, decisão #3) |
| `reembolsos_qtd` | integer | contagem de linhas com `refunded_amount > 0` e `refunded_at` no período |
| `participacao_valor` | numeric(12,2) | soma de `partner_amount` (já é `amount - commission_amount`, nunca subtrair de novo) |

### 2. `get_partner_financeiro_periodo_serie(p_partner_id, p_from, p_to, p_application_id, p_granularidade)`

`p_granularidade` = `'day'` ou `'month'` (decidido no servidor Next.js
antes de chamar: período ≤ 31 dias → `'day'`, maior → `'month'`).
Linhas por bucket:

| coluna | tipo |
|---|---|
| `bucket` | date |
| `vendas_valor` | numeric(12,2) |
| `participacao_valor` | numeric(12,2) |

### 3. `get_partner_financeiro_periodo_por_app(p_partner_id, p_from, p_to)`

Uma linha por app (sem `p_application_id` — é inerentemente
cross-app):

| coluna | tipo |
|---|---|
| `application_id` | uuid |
| `application_name` | text |
| `vendas_confirmadas_qtd` | integer |
| `vendas_confirmadas_valor` | numeric(12,2) |
| `participacao_valor` | numeric(12,2) |

Ordenado por `vendas_confirmadas_valor desc`.

### 4. `get_partner_financeiro_periodo_vendas(p_partner_id, p_from, p_to, p_application_id, p_limit, p_offset)`

Mesma forma de `get_partner_sales` (já existe, não tocada) **menos**
`buyer_name`/`buyer_email` (minimização de PII — seção 8 do pedido
original), **mais** filtro de período:

| coluna | tipo |
|---|---|
| `sale_id` | uuid |
| `sale_kind` | text (`'app_purchase'`\|`'subscription_invoice'`) |
| `application_name` | text |
| `plan_name` | text |
| `amount` | numeric(12,2) |
| `partner_amount` | numeric(12,2) |
| `paid_at` | timestamptz |
| `payout_status` | text (`'retido'`\|`'elegivel'`\|`'pago'`\|`'reembolsado'`) |

Usada por "Últimas vendas" (limit 5) e pelo export (limit maior,
paginado).

## Layout da página

### Cabeçalho (compartilhado por toda `/dashboard/financeiro/**`)

- Título "Vendas e financeiro" + descrição, como hoje.
- Ações à direita: **Atualizar** (re-busca os dados da aba atual, só
  leitura — nunca dispara repasse/lançamento) e **Exportar relatório**
  (só visível com `financeiro_visao_geral`; na Visão geral exporta
  conforme decisão #6; nas outras abas, desabilitado/oculto por ora —
  fora de escopo deste spec).
- "Última atualização: HH:MM" abaixo das ações.
- Abas existentes intocadas, com estado ativo preservado.

### Barra de filtros (nova, compartilhada)

- **Período**: este mês / mês anterior / últimos 30 dias / personalizado
  (date-range picker). Afeta Resultados do período, gráfico, Últimas
  vendas, Desempenho por app.
- **Aplicativo**: todos / um app autorizado (populado por
  `get_partner_sold_apps`, já existe). Afeta período E saldos atuais
  (decisão #9 pra saldos).
- Sem moeda, sem organização (decisão #1).
- Filtros propagados via querystring (`?periodo=...&app=...`, além do
  `?parceiro=` já existente da Etapa 5) — preservados ao trocar de aba
  quando fizer sentido (Vendas já tem filtro de app próprio hoje; a
  Visão geral não força esse valor nela, só preserva `?parceiro=`).
- Dois rótulos explícitos acima das respectivas seções: **"Resultados
  do período"** e **"Saldos atuais"**.

### Resultados do período — 4 cards

Grid 2×2 desktop, 1 coluna mobile. Fundo cinza claro da página, cards
brancos com borda suave — sem o card externo grande que existe hoje.

1. **Vendas confirmadas** — valor + "N vendas" + texto pequeno "Valor
   pago, vendas confirmadas no período selecionado."
2. **Comissão da plataforma** — valor.
3. **Reembolsos** — valor + "N reembolsos" + texto "Reembolsos efetuados
   no período selecionado."
4. **Sua participação** — valor + ícone de tooltip: "Valor de venda menos
   a comissão da plataforma. Não é lucro — ainda não desconta custos
   próprios do parceiro." Nunca rotulado "lucro".

Sem comparação com período anterior nesta primeira versão — a RPC não
calcula isso e não existe consulta pronta; adicionar um "+12% vs mês
anterior" sem essa base seria inventar número (regra explícita do
pedido original).

### Saldos atuais — seção separada

4 indicadores, não-período:

- **Disponível para repasse** (destaque azul suave, maior, com link "Ver
  repasses" → aba Repasses) — de `get_partner_financeiro_overview.elegivel_amount`.
- **Em retenção** — `retido_amount`.
- **Reserva de segurança** — `reserva_retida_amount`.
- **Repasse em processamento** — **novo conceito**: hoje não existe um
  estado "processando" distinto de confirmado/revertido no schema
  (`partner_payouts.status` só tem esses 2). Mapeado como 0/oculto por
  enquanto, com nota no spec — não inventar um número sem lastro.

"Já repassado" (`repassado_amount`) sai da Visão geral — já existe
listado em "Repasses e extrato" (histórico). Não duplicado aqui.

Sem botão "Sacar agora" (não existe esse fluxo — repasse é sempre
iniciado pelo time LOBBY, nunca self-service).

### Gráfico de evolução + Próximas liberações (lado a lado no desktop)

- **Gráfico** (Recharts, `LineChart` ou `AreaChart`): 2 séries (vendas
  confirmadas, participação do parceiro), tooltip com data+valores,
  legenda. Granularidade diária/mensal conforme período (decisão #2).
  Estado vazio: "Suas vendas aparecerão aqui" (sem curva fictícia).
  Resumo textual/tabela abaixo do gráfico pra acessibilidade (lista
  simples dos pontos, pode ficar visualmente oculta mas acessível, ou
  um `<details>` "Ver dados em tabela").
- **Próximas liberações**: reaproveita `get_partner_payout_queue_main`
  + `_reserve` (já existem), mostrando as ~5 mais próximas por
  `days_remaining`, com app, valor, tipo (retenção/reserva), data
  prevista, "Disponível em N dias". Deixa explícito que fim da retenção
  ≠ pagamento realizado (texto: "Liberado do saldo — o repasse em si é
  feito pelo time LOBBY"). Link "Ver todas as liberações" → aba
  Repasses. Estado vazio: "Nenhuma liberação prevista".

### Últimas vendas

Tabela compacta (5 linhas) de `get_partner_financeiro_periodo_vendas`:
app/plano, data, valor pago, participação, status (texto+ícone, mesmo
mapeamento de cores já usado em `VendasClient.tsx`), "Ver detalhes"
(decisão #5). Sem buyer_name/email. Link "Ver todas as vendas" → aba
Vendas (preservando filtro de app/período quando a aba Vendas suportar
— ela já tem filtro de app próprio; período fica só na Visão geral por
ora). Estado vazio: "Você ainda não tem vendas neste período."

### Desempenho por aplicativo

Tabela/lista compacta de `get_partner_financeiro_periodo_por_app`,
ordenada por valor vendido (rótulo explícito da ordenação). Se o
parceiro só tem 1 app (ou o filtro de app está ativo), a seção
simplifica: não mostra ranking, só reafirma o número já visível nos
cards (ou oculta a seção inteiramente — decisão de UI na etapa de
plano, não precisa nova pergunta). Sem conversão/visitantes/campanha —
dado que não é coletado.

### Pendências e avisos

Só aparece quando há condição real:

1. **Configuração de recebimento incompleta** — `profiles.payout_pix_key`
   nulo → aviso com link pra Configurações de recebimento.
2. **Repasse com falha** — `partner_payouts` com `status='revertido'`
   recente (ex: últimos 30 dias) → aviso com `revert_reason` visível,
   link pra Repasses (decisão #8).
3. **Valor bloqueado** — `app_purchases.status='disputed'` existente →
   aviso explicando que o valor está retido por disputa.
4. **Disputa que exige atenção** — mesmo dado do item 3, texto
   informativo + link "Fale com o suporte" (decisão #8, sem ação
   própria).
5. **Dados temporariamente indisponíveis** — não é um dado persistido,
   é a resposta a uma falha de consulta (ver Carregamento e erros).

Cada aviso: o que aconteceu, impacto, ação disponível, link. Sem
avisos permanentes sem necessidade.

### Estado sem vendas

Quando as RPCs confirmam ausência de dados (não erro):

- Cards mostram R$ 0,00 reais.
- Gráfico: "Suas vendas aparecerão aqui".
- Liberações: "Nenhuma liberação prevista".
- Últimas vendas: "Você ainda não tem vendas neste período."
- Ação principal adaptada: sem app → "Cadastrar meu aplicativo"; com
  rascunho → "Continuar cadastro"; com app publicado (mas 0 vendas) →
  "Ver meus aplicativos"; filtro ativo sem resultado → "Limpar
  filtros". Lógica de qual estado mostrar já existe em partes do
  dashboard (`app_drafts` por `created_by`/`status`) — reaproveitada,
  não reinventada.

### Carregamento e erros

- `loading.tsx` novo pra `/dashboard/financeiro` (não existe hoje) —
  skeleton `animate-pulse` no padrão já usado em
  `app/dashboard/historico/loading.tsx`.
- Atualização (botão "Atualizar" ou troca de filtro): mantém o
  conteúdo anterior visível com um indicador discreto de
  carregando, não apaga tudo.
- Falha de consulta: mensagem + "Tentar novamente" (padrão já usado em
  `VendasClient.tsx`), por seção — se só a série do gráfico falhar, o
  resto da página continua normal. Erro de consulta nunca vira
  R$ 0,00 (estados distintos: `loading` / `error` / `empty` / `ok`).
- Botão "Atualizar" no cabeçalho não fica marcado como concluído se
  qualquer consulta obrigatória da aba falhou.

## Export

Rota nova `GET /api/financeiro/export?from=&to=&application_id=&parceiro=`
(sessão autenticada, mesma checagem de permissão das RPCs — delega pra
elas, não reimplementa a checagem). Monta 1 CSV (mesmo padrão
`csvSafe` + `Content-Disposition: attachment` de
`app/api/admin/offers/export/route.ts`) com:

```
# Relatório Vendas e financeiro — LOBBY
# Parceiro: <nome>
# Período: DD/MM/AAAA a DD/MM/AAAA
# Aplicativo: <nome ou "Todos">
# Gerado em: DD/MM/AAAA HH:MM
# Saldos atuais referem-se à data de geração, não ao período acima.

RESULTADOS DO PERÍODO
<linhas dos 4 indicadores>

SALDOS ATUAIS (em DD/MM/AAAA)
<linhas dos indicadores de saldo>

VENDAS DO PERÍODO
<cabeçalho + linhas de get_partner_financeiro_periodo_vendas, sem paginação/limit>
```

Reaproveita as mesmas 4 RPCs novas + `get_partner_financeiro_overview`
— nenhuma lógica de cálculo nova exclusiva do export.

## Permissões

- Visualizar Visão geral + exportar: `financeiro_visao_geral` ou
  `role='owner'` (decisão #7) — checado dentro de cada RPC, nunca só no
  frontend.
- Delegação (`?parceiro=`) continua via `get_financeiro_viewable_partners`
  (já atualizada na Etapa 8 pra incluir `financeiro_ofertas`, aqui
  recebe mais nenhuma mudança — `financeiro_visao_geral` já estava na
  allowlist desde a Etapa 5).
- Nenhum dado bancário completo ou nota interna de admin exposto —
  `payout_pix_key` etc já são tratados hoje em "Configurações de
  recebimento", esta tela só referencia "configuração incompleta" sem
  mostrar o valor.

## Responsividade

- Desktop: cards 2×2 ou 4×1 conforme espaço, gráfico+liberações lado a
  lado (60/40), tabelas com espaço de leitura.
- Tablet: indicadores em 2 colunas, gráfico e liberações empilham.
- Celular: cards em 1 coluna, abas com scroll horizontal (já existe
  nas abas atuais, confirmar que novo cabeçalho não quebra isso),
  filtros empilhados, tabela de vendas em cards ou com scroll interno
  (nunca scroll horizontal da página inteira). Sidebar intocada.

## Não-objetivos

- Não cria carteira paralela, livro financeiro novo, nem confirma
  repasse pelo frontend — toda escrita financeira continua
  exclusivamente nas RPCs/rotas admin já existentes.
- Não soma créditos internos (`Meus créditos`) ao saldo de vendas.
- Não implementa filtro de moeda nem de organização (decisão #1).
- Não cria "Repasse em processamento" com número real (estado não
  existe no schema hoje — fica em 0/oculto, documentado).
- Não adiciona comparação percentual com período anterior.
- Não toca nas RPCs/páginas existentes de Vendas, Repasses, Ofertas,
  Configurações — só compartilha o novo cabeçalho/filtro.

## Testes

Sem suíte automatizada pra RPCs financeiras neste projeto (mesma
lacuna documentada em toda etapa anterior). Verificação manual:
contas de teste (parceiro com vendas reais simuladas via
`app_purchases`/`subscription_invoices` inseridas por service-role,
cobrindo paga/reembolsada/disputada/em retenção/elegível/com reserva),
checar os 4 cards, saldos, gráfico, liberações, últimas vendas,
desempenho por app, pendências (cada uma das condições reais), estados
vazio/erro, export, responsivo mobile/tablet/desktop, delegação de
equipe (igual Etapa 8), nenhuma escrita financeira disparada pela
consulta.
