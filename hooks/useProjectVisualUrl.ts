'use client'

import { useEffect, useState } from 'react'
import { resolveProjectVisualUrl } from '@/lib/project-visuals-upload'

/**
 * Hook: useProjectVisualUrl
 *
 * Converte a URL persistida de uma imagem/documento de projeto — armazenada
 * no bucket privado `project-visuals` do Supabase Storage — em uma
 * **signed URL** temporária e acessível pelo browser.
 *
 * Por que é necessário:
 *   Arquivos em buckets privados do Supabase não são acessíveis diretamente
 *   pela URL pública. É preciso gerar uma URL assinada (com token de acesso
 *   limitado no tempo) via `resolveProjectVisualUrl`. Este hook cuida de
 *   disparar essa resolução sempre que `storedUrl` mudar e expõe o resultado
 *   de forma reativa ao componente.
 *
 * @param storedUrl - URL persistida no banco de dados (URL original do
 *                    Supabase Storage). Pode ser:
 *                    • `string`    → URL válida a resolver
 *                    • `null`      → arquivo não definido
 *                    • `undefined` → dado ainda carregando / não disponível
 *
 * @returns
 *   • `undefined` — a URL ainda está sendo resolvida (exibir skeleton/spinner)
 *   • `null`      — resolução falhou, provavelmente por falta de permissão RLS
 *                   (Row Level Security) para o usuário atual
 *   • `string`    — signed URL pronta para uso em `<img src>` ou `<a href>`
 *
 * Quando usar:
 *   - Em qualquer componente que precise exibir imagens ou links de arquivos
 *     de projetos guardados no bucket privado `project-visuals`.
 *   - Substitui chamadas manuais a `resolveProjectVisualUrl` dentro de
 *     useEffect com lógica de cancelamento repetida nos componentes.
 *
 * Exemplo:
 *   ```tsx
 *   const signedUrl = useProjectVisualUrl(projeto.visual_url)
 *   if (signedUrl === undefined) return <Skeleton />
 *   if (signedUrl === null)      return <p>Sem permissão</p>
 *   return <img src={signedUrl} alt="Visual do projeto" />
 *   ```
 */
export function useProjectVisualUrl(storedUrl: string | null | undefined): string | null | undefined {
  /**
   * Estado interno que guarda a última URL resolvida junto com a `storedUrl`
   * que a originou. Essa estrutura evita expor uma signed URL de uma
   * `storedUrl` antiga enquanto a nova ainda está sendo buscada.
   *
   * `forUrl`  — qual `storedUrl` gerou o `value` atual (para detectar stale)
   * `value`   — a signed URL resolvida, ou null em caso de erro/sem permissão
   */
  const [result, setResult] = useState<{ forUrl: string | null | undefined; value: string | null }>({
    forUrl: undefined, value: null,
  })

  useEffect(() => {
    /*
     * Flag de cancelamento: evita que o `setResult` seja chamado se o
     * componente for desmontado ou se `storedUrl` mudar antes da Promise
     * resolver (race condition de requisições concorrentes).
     */
    let active = true

    /* Sem URL armazenada não há nada a resolver. */
    if (!storedUrl) return

    /*
     * Dispara a resolução assíncrona da URL assinada.
     * `resolveProjectVisualUrl` acessa o Supabase Storage e retorna:
     *   - a signed URL em caso de sucesso
     *   - null se o usuário não tiver permissão (RLS) ou ocorrer erro
     */
    resolveProjectVisualUrl(storedUrl).then(url => {
      /* Só atualiza o estado se o efeito ainda estiver ativo. */
      if (active) setResult({ forUrl: storedUrl, value: url })
    })

    /* Cleanup: marca o efeito como inativo ao desmontar ou ao trocar storedUrl. */
    return () => { active = false }
  }, [storedUrl])

  /*
   * Se não há URL armazenada, retorna `undefined` imediatamente (sem estado
   * de loading — não há nada a aguardar).
   */
  if (!storedUrl) return undefined

  /*
   * Retorna `undefined` (ainda carregando) enquanto o `result` armazenado
   * ainda for de uma `storedUrl` diferente da atual. Assim o componente
   * nunca exibe uma imagem desatualizada durante a transição.
   * Retorna `result.value` (string | null) quando a resolução corresponde
   * à `storedUrl` vigente.
   */
  return result.forUrl === storedUrl ? result.value : undefined
}
