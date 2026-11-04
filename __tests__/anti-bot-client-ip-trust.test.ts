import { describe, it, expect } from 'vitest'
import { getClientIp as getClientIpSync } from '@/lib/rate-limit'
import { getClientIp as getClientIpRedis } from '@/lib/rate-limit-redis'

// getClientIp() alimenta diretamente as chaves do rate limit E do desafio
// adaptativo (lib/anti-bot/policy.ts) — se um atacante pudesse controlar o valor
// que ela devolve, poderia trocar de "identidade" a cada request e nunca acumular
// falhas em nenhum contador por IP.
//
// A função em si confia cegamente no PRIMEIRO valor de x-forwarded-for (depois
// cai para x-real-ip, depois 'unknown'). Isso só é seguro porque este app roda
// atrás do edge da Vercel, que documenta explicitamente que sobrescreve
// X-Forwarded-For e "do not forward external IPs... to prevent IP spoofing"
// (https://vercel.com/docs/headers/request-headers#x-forwarded-for) — ou seja, o
// valor que chega à function já não é controlável pelo cliente em produção.
// Este teste caracteriza o contrato atual da função (mesmo comportamento nas duas
// cópias, lib/rate-limit.ts e lib/rate-limit-redis.ts) — não prova a garantia da
// Vercel, que é externa a este repositório.
describe('getClientIp — contrato de confiança do cabeçalho de IP', () => {
  for (const [label, getClientIp] of [
    ['lib/rate-limit', getClientIpSync],
    ['lib/rate-limit-redis', getClientIpRedis],
  ] as const) {
    describe(label, () => {
      it('usa o primeiro IP de uma cadeia x-forwarded-for (proxy legítimo: cliente, depois proxies)', () => {
        const req = { headers: new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }) }
        expect(getClientIp(req)).toBe('198.51.100.7')
      })

      it('remove espaços em volta do IP', () => {
        const req = { headers: new Headers({ 'x-forwarded-for': '  198.51.100.7  , 10.0.0.1' }) }
        expect(getClientIp(req)).toBe('198.51.100.7')
      })

      it('cai para x-real-ip quando x-forwarded-for está ausente', () => {
        const req = { headers: new Headers({ 'x-real-ip': '203.0.113.9' }) }
        expect(getClientIp(req)).toBe('203.0.113.9')
      })

      it('cai para "unknown" sem nenhum dos dois cabeçalhos — nunca lança erro', () => {
        const req = { headers: new Headers() }
        expect(getClientIp(req)).toBe('unknown')
      })

      it('dois valores "forjados" diferentes de x-forwarded-for produzem chaves de IP diferentes', () => {
        // Caracteriza o limite real do app: SE um valor de x-forwarded-for chegasse
        // sem passar pelo edge da Vercel (que a documentação garante não
        // acontecer em produção — comentário acima), um atacante trocando esse
        // valor a cada request obteria um contador por-IP novo a cada vez. Este
        // teste documenta esse comportamento para quem for revisar a confiança
        // de proxy em um ambiente diferente de Vercel (ver docs/ANTI-BOT.md §... ,
        // SECURITY.md "proxies confiáveis").
        const reqA = { headers: new Headers({ 'x-forwarded-for': '1.1.1.1' }) }
        const reqB = { headers: new Headers({ 'x-forwarded-for': '2.2.2.2' }) }
        expect(getClientIp(reqA)).not.toBe(getClientIp(reqB))
      })
    })
  }
})
