# Anti-bot (Cloudflare Turnstile) — cadastro, login, recuperação de senha, reenvio de confirmação

Status: implementado neste repositório, **chaves reais ainda não configuradas**.
Até lá, as rotas protegidas respondem "verificação indisponível" (fail-closed) — ver
§7.

## 1. O que isso protege

| Operação | Página | Rota | Quando exige comprovante |
|---|---|---|---|
| Cadastro de cliente | `/cadastro` | `POST /api/auth/register` | Sempre |
| Login de cliente | `/login` | `POST /api/auth/login` | Adaptativo — só após o limiar de falhas (§4) |
| Recuperação de senha | `/recuperar-senha` | `POST /api/auth/forgot-password` | Sempre |
| Reenvio de confirmação de e-mail | inline em `/login`, quando o login falha por e-mail não confirmado | `POST /api/auth/resend-confirmation` | Sempre |

**Fora de escopo, deliberadamente**: `/admin/login` (login da equipe) e o 2FA da
equipe não foram tocados — são um domínio de ameaça e um fluxo separados dos
membros, e nada aqui foi alterado lá. Hoje este repositório **não tem 2FA
implementado para a equipe** (confirmado em SECURITY.md §3: "MFA for admin
accounts — not implemented"); a instrução de "preservar o 2FA obrigatório" foi
seguida no sentido de não tocar em nada da área técnica, não há 2FA existente
para quebrar.

`UpdatePasswordForm` (`/atualizar-senha`, destino do link de recuperação) **não**
ganhou um desafio novo — já é protegido por um token de uso único emitido pelo
Supabase, e o pedido de correção explicitamente não pede desafio em links já
protegidos por token sem justificativa concreta.

## 1.1 Nota sobre identidade visual

O pedido original menciona preservar "preto e laranja" e uma identidade "Núcleo".
Nenhum dos dois existe neste repositório — a marca LOBBY usa preto/petróleo
(`lib/design-tokens.ts`, `#0B1020`/`#168F9C`) e não há nenhum sistema de design
chamado "Núcleo" no código. O widget foi implementado com `theme="dark"` fixo
(exigência que se aplica independente da marca) e `language="en"`, sem inventar
uma paleta preto/laranja que não existe aqui.

## 2. Arquitetura

```
components/anti-bot/
  turnstile-loader.ts     — carrega o script oficial da Cloudflare (singleton, com retry)
  TurnstileChallenge.tsx   — widget: estados, limpeza no unmount, nunca auto-submete

lib/anti-bot/
  types.ts     — AntiBotAction ('register' | 'login' | 'forgot_password' | 'resend_confirmation')
  config.ts    — env vars, bloqueia chave de teste em produção (server-only)
  verify.ts    — chama o siteverify da Cloudflare, valida hostname/ação/resultado
  policy.ts    — desafio adaptativo de login (contadores no Redis já existente)
  respond.ts   — resposta HTTP estruturada (BOT_CHALLENGE_REQUIRED / _UNAVAILABLE)
  log.ts       — observabilidade mínima (tabela anti_bot_events)
```

Cada rota (`register`, `login`, `forgot-password`, `resend-confirmation`) chama
`verifyAntiBotToken` ela mesma, no servidor, antes de qualquer efeito (criar conta,
tentar credencial, disparar e-mail). O frontend só coleta o token e o envia —
**a decisão de exigir e a validação do comprovante são inteiramente do servidor**.
Chamar os endpoints direto (curl, Postman, script) sem passar pela UI recebe
exatamente o mesmo bloqueio — não há nenhuma checagem "só no frontend".

## 3. Como configurar as chaves

1. Crie um site Turnstile no [dashboard da Cloudflare](https://dash.cloudflare.com/)
   → Turnstile → Add widget.
2. Cadastre os hostnames do seu domínio real de produção (e `localhost` se for
   testar o widget real localmente — não precisa disso para usar as chaves de
   teste do §5).
3. Copie a **Site Key** (pública) e a **Secret Key** (privada).
4. Configure as variáveis de ambiente (nunca em arquivo versionado — só em
   `.env.local`/painel do seu host):

```bash
TURNSTILE_SECRET_KEY=sua_secret_key
NEXT_PUBLIC_TURNSTILE_SITE_KEY=sua_site_key
TURNSTILE_ALLOWED_HOSTNAMES=seudominio.com.br,www.seudominio.com.br
```

`TURNSTILE_ALLOWED_HOSTNAMES` é a lista de hostnames que o servidor aceita de
volta no campo `hostname` da resposta do siteverify — **decidida pelo servidor**,
nunca pelo cliente. Sem produção configurada, cai para `localhost` em dev e para
lista vazia (nada é aceito) em produção — nunca um default aberto.

Opcionais (valores padrão entre parênteses):

```bash
TURNSTILE_TIMEOUT_MS=5000                      # timeout da chamada ao siteverify
ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD=3           # falhas de login antes de exigir desafio
ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS=900000      # janela dessas falhas (15 min)
```

## 4. Como funciona o desafio adaptativo de login

A maioria dos logins **nunca vê o widget**. O servidor conta falhas de
`signInWithPassword` em duas chaves Redis (mesma infraestrutura Upstash já usada
pelo rate limit de login, `lib/rate-limit-redis.ts`, compartilhada entre
instâncias):

- por IP de origem (`antibot:login:ip:<ip>`)
- por e-mail normalizado (`antibot:login:acct:<email>`) — contado **mesmo se a
  conta não existir**, porque o servidor não sabe se existe até chamar o
  Supabase, e trata os dois casos de forma idêntica de propósito

Cada chave expira sozinha após `ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS` (15 min por
padrão) — não há crescimento ilimitado por e-mails arbitrários que um atacante
invente.

Quando qualquer uma das duas chaves atinge `ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD`
(3 por padrão), a próxima tentativa de login recebe:

```json
{ "code": "BOT_CHALLENGE_REQUIRED", "error": "Please complete the security check." }
```

com status 400, **antes mesmo de tentar a credencial** (evita vazar se a conta
existe pelo tempo de resposta). O frontend mostra o widget Turnstile; a pessoa
resolve e confirma o login de novo manualmente — não há auto-submit.

Comparação com o limiar existente de lockout (`lib/rate-limit-redis.ts`:
5 falhas → 1 min, 10 → 15 min, 20 → 60 min, documentado em SECURITY.md §2.1):
3 < 5, então o desafio adaptativo **sempre dispara antes** do lockout mais
severo — ele é uma camada mais cedo e mais leve, não um substituto. Resolver o
desafio **não** zera o contador de falhas nem o lockout: só uma autenticação
de fato bem-sucedida limpa os dois. Um atacante que resolve o Turnstile
repetidamente ainda bate no lockout de 5/10/20 normalmente.

## 5. Testando localmente (chaves de teste oficiais da Cloudflare)

A Cloudflare documenta chaves de teste que nunca chamam um desafio real
([docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)):

```bash
# .env.local — sempre aprova, modo visível
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_ALLOWED_HOSTNAMES=localhost
```

Outras combinações úteis: sitekey `2x00000000000000000000AB` + secret
`2x0000000000000000000000000000000AA` sempre falha (testar o caminho de erro);
secret `3x0000000000000000000000000000000AA` sempre devolve "token already
spent" (testar o caminho de comprovante reutilizado).

**Essas chaves de teste são bloqueadas em produção** — `lib/anti-bot/config.ts`
lança um erro no cold start se `NODE_ENV=production` e `TURNSTILE_SECRET_KEY`
for uma das 3 chaves de teste oficiais. Não existe (e não deve existir) um
token especial de bypass aceito pela API em produção; os testes automatizados
usam injeção de dependência (`client` em `verifyAntiBotToken`), não um bypass.

Depois de configurar, `npm run dev` e abrir `/cadastro`, `/login` ou
`/recuperar-senha` já mostra o widget de teste (tema escuro, em inglês).

## 6. Dados enviados à Cloudflare

Por chamada ao siteverify (`https://challenges.cloudflare.com/turnstile/v0/siteverify`):
o comprovante (`response`), a secret key, e o IP do visitante (`remoteip`) — este
último só quando o IP foi identificado (nunca `"unknown"`). **Nunca** e-mail,
senha, ou qualquer outro campo do formulário. Isso é o que o siteverify aceita
oficialmente — nada extra foi inventado.

No navegador, o script `challenges.cloudflare.com/turnstile/v0/api.js` roda os
próprios desafios (proof-of-work, probing de APIs do navegador) conforme a
[documentação de privacidade](https://developers.cloudflare.com/turnstile/) da
Cloudflare — fora do controle deste app.

Observabilidade interna (tabela `anti_bot_events`, migration
`20261017120000`): operação, tipo de evento, IP, categoria segura de falha,
latência, e um hash SHA-256 truncado do e-mail (nunca o e-mail em texto puro,
nunca o comprovante). Write-only via `service_role`, RLS default-deny — mesmo
padrão de `auth_rate_limit_events`.

**Pendente de decisão do time**: se o aviso de privacidade do produto precisa
mencionar a Cloudflare Turnstile como subprocessador — isto não é uma afirmação
de conformidade legal, só uma lista do que está técnicamente em uso.

## 6.1 Confiança no cabeçalho de IP (proxy)

Os contadores por IP (rate limit existente e o desafio adaptativo de login,
§4) usam `getClientIp()` (`lib/rate-limit.ts` / `lib/rate-limit-redis.ts`, não
alterado nesta entrega), que lê o primeiro valor de `x-forwarded-for`. Isso só é
seguro porque este app roda atrás do edge da Vercel, que documenta
explicitamente: "we currently overwrite the X-Forwarded-For header and do not
forward external IPs. This restriction is in place to prevent IP spoofing."
([Vercel — Request headers](https://vercel.com/docs/headers/request-headers#x-forwarded-for)).
Ou seja, o valor que a função lê em produção já não é controlável pelo
cliente — é a Vercel quem sobrescreve o cabeçalho antes do seu código rodar.

Isso deixa de valer se este app algum dia for colocado atrás de outro proxy
(ex.: Cloudflare na frente da Vercel, mencionado como opção de emergência em
`DDOS_RESPONSE.md`) sem reconfigurar qual cabeçalho é a fonte confiável de IP —
nesse cenário o cabeçalho precisaria vir de uma fonte que o novo proxy
controla (ex.: `cf-connecting-ip` do Cloudflare), não mais de
`x-forwarded-for` cru. Não implementado aqui porque esse proxy adicional não
existe hoje neste projeto (confirmado em SECURITY.md §3). O teste
`__tests__/anti-bot-client-ip-trust.test.ts` caracteriza o comportamento atual
da função (não prova a garantia da Vercel, que é externa a este repositório).

## 7. Diagnosticando falhas

| Resposta | Significado | O que fazer |
|---|---|---|
| `400 BOT_CHALLENGE_REQUIRED` | Comprovante ausente, inválido, expirado, reutilizado, ou hostname/ação incorretos | Normal — a UI já pede um novo desafio. Se acontecer sempre, confira `TURNSTILE_ALLOWED_HOSTNAMES` bate com o hostname real servido. |
| `503 BOT_CHALLENGE_UNAVAILABLE` | `TURNSTILE_SECRET_KEY` não configurada, secret inválida, timeout, ou erro da Cloudflare | Se for esperado (chaves ainda não configuradas), é o fail-closed intencional. Se inesperado em produção já configurada: checar `TURNSTILE_TIMEOUT_MS`, status da Cloudflare, e os logs de `anti_bot_events` (`event_type = 'provider_unavailable'`) para frequência. |
| Login sem desafio mesmo após várias falhas | Tentativas < `ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD`, ou rodando como `isLocalhost` (dev) | Esperado — o bypass de localhost é o mesmo já usado pelo rate limit de login, documentado em SECURITY.md. |
| Widget nunca aparece / fica em "Loading verification…" | Script bloqueado (adblock/CSP) ou `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ausente | Olhar o console do navegador; o componente cai em "unavailable" depois de 8s. Confirmar CSP (`script-src`/`frame-src` precisam de `https://challenges.cloudflare.com`, já ajustado em `next.config.ts`). |

## 8. O que falta para ativar em produção (passos externos)

1. Criar o widget Turnstile no dashboard da Cloudflare e cadastrar os hostnames
   reais de produção.
2. Definir `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
   `TURNSTILE_ALLOWED_HOSTNAMES` nas variáveis de ambiente do Vercel (produção
   e, se quiser testar lá, preview/staging com as chaves de teste do §5 —
   nunca a chave de teste em produção, é bloqueada de qualquer forma).
3. Aplicar a migration pendente (mesmo procedimento de SECURITY.md §5):
   ```bash
   npx supabase db push
   ```
   (cria `anti_bot_events` e estende o `event_type` permitido em
   `auth_rate_limit_events` para incluir `resend_confirmation_block`.)
4. Decidir se o aviso de privacidade precisa citar a Cloudflare Turnstile (§6).

Nenhum destes passos foi executado por este trabalho — nenhuma chave real foi
pedida ou usada, nenhuma migration foi aplicada, nenhum deploy foi feito.

## 9. Testes

Ver `__tests__/anti-bot-*.test.ts` e `__tests__/auth-*-route.test.ts` para a
lista completa. Resumo do que está coberto:

- `verifyAntiBotToken`: token ausente/grande demais, sucesso, hostname errado,
  ação errada, `timeout-or-duplicate`, `invalid-input-response`, secret
  inválida (tratada como indisponibilidade, não como culpa do usuário), timeout
  de rede, resposta malformada, chave de teste bloqueada em produção.
- `loginChallengeRequired`/`recordLoginFailureSignal`/`clearLoginChallengeSignal`:
  lógica do desafio adaptativo isolada do Redis real (mockado).
- Cada rota (`register`, `login`, `forgot-password`, `resend-confirmation`):
  bloqueio sem comprovante, comprovante válido, comprovante expirado/duplicado,
  hostname/ação incorretos, indisponibilidade do provedor (503, nunca abre),
  chamada direta à API sem UI, mesmo tratamento para e-mail existente/inexistente,
  rate limit pré-existente preservado, tentativa do cliente de desativar a
  exigência via campo arbitrário no body (sem efeito), e — no login — que
  resolver o desafio não zera o contador de falhas.
- `lib/anti-bot/config`: `isConfigured` correto com/sem chaves, bloqueio das 3
  chaves de teste oficiais em produção, `allowedHostnames` nunca abre por
  padrão em produção.

Rodar: `npm run test` (chama `vitest run`, ver `package.json`).

Testes de frontend (estados do widget, desmontagem, retry, teclado) e de
integração com chaves reais de teste end-to-end **não foram implementados nesta
entrega** — a suíte de testes e2e existente (`e2e/auth.spec.ts`, Playwright) não
tem fixture de captura de e-mail nem as chaves de teste configuradas no
ambiente de CI; adicionar isso é trabalho futuro, não bloqueante para o que foi
pedido (testes obrigatórios de backend + lógica, que estão cobertos).
