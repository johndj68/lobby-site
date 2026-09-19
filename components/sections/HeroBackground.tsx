'use client'

/**
 * HeroBackground — 9 camadas decorativas para o Hero da LOBBY.
 *
 * Paleta: Blue #005BFF · Purple #7B2CFF · Cyan #00A3FF
 *
 * Guia de ajuste rápido:
 *
 *  GRADIENTES BASE   → rgba(R,G,B, OPACITY) nos quatro radial-gradient
 *  PONTOS            → opacity-[X] no div do dot-grid  |  tamanho: bg-[size:28px_28px]
 *  BLOBS             → bg-[COLOR]/[OPACITY] blur-[RADIUS]  em cada div blob
 *  ANÉIS ORBITAIS    → border-[COLOR]/[OPACITY] nos dois círculos | blur-2xl no glow
 *  ONDAS             → stopOpacity nas <stop> do waveGrad | strokeWidth nas <path>
 *  RISCOS DIAGONAIS  → stopOpacity nas <stop> do lineGrad | opacity nas <path>
 *  DOTS PULSANTES    → animationDuration (segundos) + opacity-[X] em cada <circle>
 *  MÁSCARA LEITURA   → bg-[#F7F8FC]/[X] no mobile cover | w-[X%] no desktop mask
 *  FEIXE INFERIOR    → opacity via from/via/to-[COLOR]/[OPACITY] | blur-[X]
 */
export default function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">

      {/* ── 1. BASE RADIAL GRADIENTS ────────────────────────────────────
           Quatro zonas de cor cobrindo toda a tela.
           Ajuste o terceiro número nas rgba() para intensidade.         */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(circle at 14% 22%, rgba(0,91,255,0.08)   0%, transparent 32%)',
            'radial-gradient(circle at 86% 34%, rgba(123,44,255,0.18) 0%, transparent 40%)',
            'radial-gradient(circle at 72% 90%, rgba(0,163,255,0.12)  0%, transparent 42%)',
            'radial-gradient(circle at 97% 58%, rgba(0,91,255,0.08)   0%, transparent 28%)',
          ].join(', '),
        }}
      />

      {/* ── 2. DOT GRID ─────────────────────────────────────────────────
           Malha de pontos em todo o fundo.
           opacity-[X]: brilho geral | bg-[size:Xpx_Xpx]: espaçamento  */}
      <div
        className="absolute inset-0 opacity-[0.38]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(0,91,255,0.20) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* ── 3. MÁSCARAS DE LEGIBILIDADE ─────────────────────────────────
           Mobile: cobertura uniforme que atenua todos os elementos.
           Desktop: gradiente que protege apenas o lado do texto.        */}

      {/* Mobile — cover semitransparente em toda a tela */}
      <div className="absolute inset-0 bg-[#F7F8FC]/[0.72] lg:hidden" />

      {/* Desktop — gradiente que cobre a coluna de texto (esquerda) */}
      <div className="absolute inset-y-0 left-0 hidden w-[54%] bg-gradient-to-r from-[#F7F8FC] via-[#F7F8FC]/[0.86] to-transparent lg:block" />

      {/* ── 4. BLUR BLOBS ───────────────────────────────────────────────
           Manchas grandes de cor nas laterais.
           bg-[COLOR]/[OPACITY] blur-[Xpx] para ajustar.                */}

      {/* Roxo — canto superior-direito (âncora visual principal) */}
      <div className="absolute -right-44 top-14 h-[640px] w-[640px] rounded-full bg-[#7B2CFF]/[0.18] blur-3xl" />
      {/* Azul — canto inferior-direito */}
      <div className="absolute right-16 -bottom-40 h-[560px] w-[560px] rounded-full bg-[#005BFF]/[0.14] blur-3xl" />
      {/* Ciano — canto inferior-esquerdo */}
      <div className="absolute -left-48 bottom-8 h-[460px] w-[460px] rounded-full bg-[#00A3FF]/[0.09] blur-3xl" />

      {/* ── 5. ANÉIS ORBITAIS — desktop only ────────────────────────────
           Círculos centrados no lado direito, atrás da ilustração.
           right-[X%] move os anéis  |  h/w-[Xpx] controla o tamanho.  */}
      <div className="absolute right-[6%] top-1/2 hidden h-[600px] w-[600px] -translate-y-1/2 rounded-full border border-[#005BFF]/[0.10] lg:block" />
      <div className="absolute right-[9%] top-1/2 hidden h-[488px] w-[488px] -translate-y-1/2 rounded-full border border-dashed border-[#005BFF]/[0.22] lg:block" />

      {/* Glow interno — pulsa suavemente */}
      <div
        className="absolute right-[13%] hidden h-[352px] w-[352px] rounded-full bg-[#7B2CFF]/[0.10] blur-2xl animate-pulse motion-reduce:animate-none lg:block"
        style={{
          top: 'calc(50% - 176px)',
          animationDuration: '9s',
        }}
      />

      {/* ── 6. ONDAS DE COR — SVG bottom-right (tablet+) ───────────────
           Três feixes de luz curvos em azul→roxo.
           stopOpacity nas <stop> controla intensidade das cores.
           strokeWidth em cada <path> controla espessura das ondas.      */}
      <svg
        className="absolute -right-[8%] -bottom-[8%] hidden h-[620px] w-[980px] md:block"
        viewBox="0 0 980 620"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hbg-wave" x1="0" y1="0" x2="980" y2="620" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#00A3FF" stopOpacity="0.04" />
            <stop offset="42%"  stopColor="#005BFF" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#7B2CFF" stopOpacity="0.30" />
          </linearGradient>
        </defs>

        {/* Onda 1 — mais larga e visível */}
        <path
          d="M0 420 C190 285 335 530 524 368 C698 218 788 308 980 158"
          stroke="url(#hbg-wave)"
          strokeWidth="2"
        />
        {/* Onda 2 */}
        <path
          d="M0 468 C225 320 372 552 568 402 C732 265 822 348 980 222"
          stroke="url(#hbg-wave)"
          strokeWidth="1.5"
          opacity="0.72"
        />
        {/* Onda 3 */}
        <path
          d="M0 516 C255 370 418 582 618 448 C764 332 852 395 980 292"
          stroke="url(#hbg-wave)"
          strokeWidth="1"
          opacity="0.52"
        />
        {/* Onda 4 — mais sutil */}
        <path
          d="M0 560 C278 418 462 604 666 492 C798 395 880 448 980 362"
          stroke="url(#hbg-wave)"
          strokeWidth="0.8"
          opacity="0.36"
        />
      </svg>

      {/* ── 7. RISCOS DIAGONAIS + PONTOS PULSANTES — desktop only ───────
           Linhas finas de conexão digital no lado direito.
           stopOpacity nas <stop> controla brilho das linhas.
           opacity em cada <path> controla linha individual.             */}
      <svg
        className="absolute right-0 top-0 hidden h-full w-[62%] lg:block"
        viewBox="0 0 880 760"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hbg-line" x1="0" y1="0" x2="880" y2="760" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#005BFF" stopOpacity="0"    />
            <stop offset="50%"  stopColor="#00A3FF" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7B2CFF" stopOpacity="0"    />
          </linearGradient>
        </defs>

        {/* Risco 1 — principal */}
        <path d="M110 85  L778 428" stroke="url(#hbg-line)" strokeWidth="1"   opacity="0.80" />
        {/* Risco 2 */}
        <path d="M215 26  L858 320" stroke="url(#hbg-line)" strokeWidth="1"   opacity="0.60" />
        {/* Risco 3 */}
        <path d="M48  318 L758 655" stroke="url(#hbg-line)" strokeWidth="1"   opacity="0.44" />
        {/* Risco 4 — mais sutil */}
        <path d="M304 0   L880 524" stroke="url(#hbg-line)" strokeWidth="0.8" opacity="0.32" />

        {/* Pontos luminosos nas extremidades — pulsam em ciclos defasados
             animationDuration: velocidade do pulso
             animationDelay: defasagem entre os pontos                   */}
        <circle
          cx="778" cy="428" r="4.5" fill="#00A3FF"
          className="opacity-65 animate-pulse motion-reduce:animate-none"
          style={{ animationDuration: '3.5s', animationDelay: '0s' }}
        />
        <circle
          cx="858" cy="320" r="3.5" fill="#7B2CFF"
          className="opacity-60 animate-pulse motion-reduce:animate-none"
          style={{ animationDuration: '4s', animationDelay: '1.2s' }}
        />
        <circle
          cx="758" cy="655" r="4.5" fill="#005BFF"
          className="opacity-55 animate-pulse motion-reduce:animate-none"
          style={{ animationDuration: '3.8s', animationDelay: '2.4s' }}
        />
        <circle
          cx="880" cy="524" r="3" fill="#00A3FF"
          className="opacity-50 animate-pulse motion-reduce:animate-none"
          style={{ animationDuration: '4.2s', animationDelay: '0.8s' }}
        />

        {/* Pontos de origem (extremidades esquerdas) — estáticos e menores */}
        <circle cx="110" cy="85"  r="2" fill="#005BFF" opacity="0.30" />
        <circle cx="215" cy="26"  r="2" fill="#7B2CFF" opacity="0.25" />
        <circle cx="48"  cy="318" r="2" fill="#005BFF" opacity="0.22" />
      </svg>

      {/* ── 8. FEIXE DE LUZ INFERIOR ────────────────────────────────────
           Faixa horizontal rotacionada cobrindo a base do Hero.
           Ajuste from/via/to opacity para intensidade do glow.          */}
      <div
        className="absolute -bottom-32 left-1/2 h-48 w-[120%] -translate-x-1/2 -rotate-[3deg] bg-gradient-to-r from-[#005BFF]/[0.09] via-[#7B2CFF]/[0.15] to-[#00A3FF]/[0.09] blur-2xl"
      />

      {/* ── 9. LINHA SEPARADORA INFERIOR ────────────────────────────────
           Fio fino colorido na base da seção.
           opacity-[X]: visibilidade | stops de cor: posição do gradiente */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px opacity-[0.28]"
        style={{
          background:
            'linear-gradient(to right, transparent 5%, #005BFF 35%, #7B2CFF 65%, transparent 95%)',
        }}
      />
    </div>
  )
}
