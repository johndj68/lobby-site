# Vendas e financeiro — Recebimento e atendimento (Etapa 5)

## Contexto

Etapa 5 do roadmap da área "Vendas e financeiro" do parceiro. Etapas 1-4
já em produção: auditoria/snapshot de prazos, entrada no dashboard,
Visão geral e Vendas, Repasses e extrato — todas com dado real, todas
hoje restritas a `partner_id = auth.uid()` **sem nenhum parâmetro** nas
7 RPCs (decisão de segurança deliberada das etapas anteriores: nenhuma
RPC aceita "de qual parceiro" exatamente pra impedir um parceiro
consultar o de outro). Isso tem uma consequência já documentada no
código da Etapa 2 (`FinanceiroSellerGate.tsx`) e nunca resolvida: um
membro de equipe (convidado em `app_team_members`, sem ser o dono do
app) passa pela guarda de vendedor normalmente, mas todas as 7 RPCs
devolvem zero/vazio pra ele — não existe HOJE nenhum mecanismo de "ver
o financeiro de outra pessoa", correto ou incorreto, simplesmente não
existe. Esta etapa fecha essa lacuna: permissões granulares de equipe
(decisão já adiada 3 vezes desde a Etapa 2) + as 7 RPCs passam a aceitar
opcionalmente "de qual parceiro", validado contra a permissão certa.

Além disso, completa a sub-página "Configurações de recebimento"
(mostrar PIX/titular já existentes, sem duplicar o formulário de edição
que já existe em `/dashboard/conta`) e adiciona um bloco de contato de
suporte financeiro.

## Objetivo

Um dono de app pode conceder, por capacidade específica, acesso a cada
sub-página da área financeira pra um membro de equipe — sem precisar
dar acesso total. Um membro de equipe com a permissão certa consegue
abrir a área financeira e ver os dados do dono (não os seus próprios,
que normalmente estariam vazios), com um seletor claro de "de quem" ele
está vendo quando tem acesso a mais de um dono. A sub-página
Configurações de recebimento mostra os dados de PIX já cadastrados
(somente leitura) com link pra editar em Conta, mais um bloco de
contato de suporte.

## Não-objetivos

- **`manage_finance`/`edit_app`/`respond_qa`** (checkboxes já existentes
  em `TeamClient.tsx`, nunca ligados a nada): não tocados por esta
  etapa — nem removidos, nem usados pras 5 capacidades novas. Ficam
  exatamente como estão, decisão de limpeza de código morto fica pra
  quem mexer neles depois.
- **Ofertas e promoções / Configurações de recebimento com dado
  real**: as capacidades `financeiro_ofertas` e
  `financeiro_configuracoes` são criadas e ficam selecionáveis no
  convite, mas **não são checadas em lugar nenhum ainda** — essas duas
  sub-páginas continuam stub (Ofertas) ou ganham só a parte de leitura
  de PIX+suporte (Configurações, ver abaixo), sem RPC própria. A
  checagem dessas 2 capacidades é trabalho de uma etapa futura, quando
  essas páginas tiverem dado real pra proteger.
- **Escopo por app individual**: um membro de equipe com
  `financeiro_vendas` vê o financeiro **inteiro** do dono (todos os
  apps dele), não só do app específico onde foi convidado — mesma
  limitação que já existia implicitamente (as RPCs agregam por
  `partner_id`, nunca por app). Corrigir isso exigiria reescrever o
  filtro de toda RPC pra also ser por `app_draft_id`, fora de escopo
  aqui.
- **Edição de PIX/titular dentro da área financeira**: a sub-página
  Configurações de recebimento é só leitura + link — o formulário de
  edição continua único, em `/dashboard/conta`.

## Capacidades novas

5 strings novas em `app_team_members.permissions`/
`app_team_invitations.permissions` (coluna `text[]` já existente, sem
migração de schema — só uso de novos valores), uma por sub-página:

```
financeiro_visao_geral    — ver Visão geral
financeiro_vendas         — ver Vendas
financeiro_repasses       — ver Repasses e extrato
financeiro_ofertas        — ver/editar Ofertas e promoções (reservada, não checada ainda)
financeiro_configuracoes  — ver/editar Configurações de recebimento (reservada, não checada ainda)
```

`TeamClient.tsx`'s `PERMISSIONS` array ganha 5 entradas novas, mesmo
formato das 3 já existentes (`{id, label, description}`), mesmo
checkbox já renderizado pelo `.map()` existente — nenhuma mudança de
UI além de crescer a lista.

Um membro com `role = 'owner'` (diferente de "dono do app" —
`app_team_members.role` tem seu próprio `'owner'`, concedido na
criação do time) tem automaticamente todas as 5 capacidades, mesmo
padrão já usado pra `'edit'` em `canEdit = membership?.role === 'owner'
|| ...includes('edit')`.

## RPCs — todas as 7 ganham `p_partner_id`

Toda RPC da Etapa 3/4 precisa de `drop function` (assinatura muda —
`create or replace` não adiciona parâmetro, mesma regra já seguida
quando `create_partner_payout` ganhou parâmetros novos em migrações
anteriores) seguido de `create function` com um parâmetro novo no
final: `p_partner_id uuid default null`.

Padrão idêntico nas 7 (só a capacidade exigida muda):

```sql
declare
  v_target_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_target_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_target_partner_id
        and (tm.role = 'owner' or '<capacidade>' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;
  -- resto do corpo idêntico ao já existente, trocando todo
  -- `auth.uid()` usado como filtro de partner_id por v_target_partner_id
  -- (os EXISTS de "coberto por payout confirmado" continuam sem
  -- referência a usuário nenhum, não mudam)
end;
```

Mapeamento RPC → capacidade exigida:

| RPC | Capacidade |
|---|---|
| `get_partner_financeiro_overview` | `financeiro_visao_geral` |
| `get_partner_sold_apps` | `financeiro_vendas` |
| `get_partner_sales` | `financeiro_vendas` |
| `get_partner_sales_count` | `financeiro_vendas` |
| `get_partner_payout_queue_main` | `financeiro_repasses` |
| `get_partner_payout_queue_reserve` | `financeiro_repasses` |
| `get_partner_payout_history` | `financeiro_repasses` |

Quando `p_partner_id` é omitido (`null`), o comportamento é
**idêntico** ao de hoje — `v_target_partner_id = auth.uid()`, nenhuma
checagem de permissão roda (você sempre pode ver o seu próprio
financeiro, sem precisar de nenhuma linha em `app_team_members`).

### RPC nova — `get_financeiro_viewable_partners()`

Lista de donos cujo financeiro o usuário logado pode ver via equipe
(exclui ele mesmo — "ver o meu" é sempre implícito, não aparece aqui):

```sql
returns table (partner_id uuid, partner_label text)
```

`partner_label` = `coalesce(company_name, full_name, email)` do dono,
de `profiles`. Filtro: `tm.user_id = auth.uid() and d.created_by <>
auth.uid() and (tm.role = 'owner' or tm.permissions && array[
'financeiro_visao_geral','financeiro_vendas','financeiro_repasses'
])`, distinct por `d.created_by`.

## UI — seletor de parceiro

Estado via query param `?parceiro=<uuid>` nas 3 rotas com RPC real
(`/dashboard/financeiro`, `/vendas`, `/repasses`) — cada `page.tsx` já
é Server Component, lê `searchParams.parceiro` e passa como
`p_partner_id` pras RPCs que já chama. Sem parâmetro = `undefined` =
RPC usa `auth.uid()` (comportamento de hoje, sem mudança quando
ninguém usa o seletor).

Seletor fica no topo da área (dentro de `FinanceiroSellerGate.tsx`,
acima da sub-navegação), um `<select>` simples:
- Busca `get_financeiro_viewable_partners()` uma vez no layout
  (`app/dashboard/financeiro/layout.tsx`, que já roda a checagem de
  vendedor — ganha mais uma query).
- Só renderiza se a lista não estiver vazia (mesmo princípio do
  seletor de app da Etapa 3: "só aparece quando faz diferença").
- Opções: "Minha conta" (sempre primeira, só se o próprio usuário for
  `isSeller`) + uma por dono retornado (rótulo `partner_label`).
- Troca de seleção: `router.push` com o query param atualizado,
  preserva a sub-rota atual (trocar o parceiro na página Vendas
  continua na página Vendas, só muda o parâmetro).

## Configurações de recebimento (sub-página)

`app/dashboard/financeiro/configuracoes/page.tsx` troca o placeholder
por: busca `profiles.payout_pix_key/payout_account_holder/payout_notes`
do usuário logado (não aceita `p_partner_id` — ver nota abaixo),
mostra os 3 campos somente leitura (ou "Não cadastrado" quando vazio),
com um botão/link "Editar em Conta" → `/dashboard/conta`. Abaixo, um
bloco fixo de contato de suporte financeiro (texto + link/e-mail já
usado em outras partes do dashboard pro canal de suporte — reaproveitar
o mesmo contato, não inventar um novo canal).

**Nota:** esta sub-página não entra no seletor de parceiro — dado
bancário é sempre o do próprio usuário logado, nunca "visualizado em
nome de outro parceiro" (faria sentido um membro de equipe editar o
PIX do dono? Não — e nem é permitido hoje em `/dashboard/conta`, que já
é sempre "a própria conta"). Por isso esta página ignora
`?parceiro=` mesmo que o query param exista na URL.

## Erros e casos de borda

- **Membro de equipe sem nenhuma capacidade financeira concedida**:
  `get_financeiro_viewable_partners()` não devolve o dono em questão,
  logo ele nunca aparece no seletor — sem acesso, sem erro visível
  (mesmo padrão de "não oferece o que não pode usar").
- **URL manipulada manualmente** (`?parceiro=<uuid-arbitrário>`): a RPC
  faz a checagem de qualquer forma (a UI não é a fonte de verdade) —
  sem a permissão, a RPC lança exceção, a página mostra o mesmo bloco
  de erro já usado pra falha de RPC (Etapa 3/4: "Não foi possível
  carregar..." — não precisa diferenciar "sem permissão" de "erro
  técnico" pro usuário, mas internamente é importante que a RPC rejeite
  de verdade, não devolva vazio silenciosamente).
- **Dono remove a permissão de um membro enquanto ele está com a
  página aberta**: próxima navegação/reload já reflete (sem realtime,
  mesmo padrão de todo o resto do dashboard).
- **Dono vira também membro de equipe de outro dono**: os dois
  contextos coexistem — "Minha conta" continua sendo ele mesmo, o outro
  dono aparece como opção adicional no seletor.

## Testes

Mesma lacuna documentada nas etapas anteriores — sem teste
automatizado novo pra `app/dashboard/**`. Verificação: `npx tsc
--noEmit` + checagem manual no navegador com 2 contas de teste (dono +
membro de equipe convidado com só `financeiro_vendas`, por exemplo) —
confirmar que o membro vê o seletor, consegue trocar pra ver o
financeiro do dono, vê só Vendas (não Visão geral/Repasses, já que não
tem essas 2 capacidades — nesse caso as outras 2 sub-páginas devem
mostrar o erro de permissão ao tentar carregar), e que removendo a
permissão o acesso para de funcionar no próximo reload.
