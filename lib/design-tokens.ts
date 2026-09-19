/**
 * Design tokens da marca LOBBY
 * Centralizados aqui para evitar hardcoding de cores/valores em componentes
 * Espelham as variáveis CSS definidas em app/globals.css
 */

export const colors = {
  // Primários da marca
  primary: '#005BFF',        // Azul primário — botões CTA, links ativos
  primaryLight: '#00A3FF',   // Azul claro — gradientes, destaques
  secondary: '#6D28D9',      // Roxo base — tom sólido
  secondaryLight: '#7B2CFF', // Roxo vibrante — gradientes, badges

  // Background e texto
  background: '#FFFFFF',     // Fundo claro (card, page)
  backgroundAlt: '#F7F8FC',  // Fundo ligeiramente mais escuro
  backgroundAlt2: '#EEF1F7', // Fundo alternativo
  text: '#0B1020',           // Texto escuro principal
  textSecondary: '#5D6475',  // Texto secundário / subtextos
  textMuted: '#94A3B8',      // Texto silenciado

  // Bordas e divisores
  border: '#E3E7F0',         // Bordas sutis de cards
  borderLight: '#F1F5F9',    // Bordas muito claras
  divider: '#E2E8F0',        // Divisores

  // Dark mode
  dark: '#05070D',           // Fundo escuro profundo
  darkText: '#F8FAFC',       // Texto no modo escuro
}

export const shadows = {
  card: '0_8px_40px_rgba(11,16,32,0.06)',
  sm: '0_1px_2px_rgba(0,0,0,0.05)',
  md: '0_4px_6px_rgba(0,0,0,0.07)',
  lg: '0_10px_15px_rgba(0,0,0,0.1)',
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
}

export const borderRadius = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  '2xl': '18px',
  '3xl': '22px',
  '4xl': '26px',
}

export const gradients = {
  primary: `linear-gradient(135deg, ${colors.primary}18, ${colors.secondaryLight}18)`,
  primaryBold: `linear-gradient(135deg, ${colors.primary}, ${colors.secondaryLight})`,
  blue: `linear-gradient(135deg, ${colors.primary}15, ${colors.primaryLight}15)`,
}

// Service card accent variants
export const serviceAccents = {
  blue: {
    topGrad: 'from-[#005BFF] to-[#00A3FF]',
    iconBg: 'rgba(0,91,255,0.11)',
    iconColor: '#005BFF',
    glowColor: 'rgba(0,91,255,0.10)',
    checkBg: 'rgba(0,91,255,0.10)',
    checkColor: '#005BFF',
    pillBg: 'rgba(0,91,255,0.07)',
    pillText: '#005BFF',
    pillBorder: 'rgba(0,91,255,0.18)',
    ctaColor: '#005BFF',
    hoverBorder: 'hover:border-[#005BFF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(0,91,255,0.13)]',
  },
  purple: {
    topGrad: 'from-[#7B2CFF] to-[#005BFF]',
    iconBg: 'rgba(123,44,255,0.11)',
    iconColor: '#7B2CFF',
    glowColor: 'rgba(123,44,255,0.10)',
    checkBg: 'rgba(123,44,255,0.10)',
    checkColor: '#7B2CFF',
    pillBg: 'rgba(123,44,255,0.07)',
    pillText: '#7B2CFF',
    pillBorder: 'rgba(123,44,255,0.18)',
    ctaColor: '#7B2CFF',
    hoverBorder: 'hover:border-[#7B2CFF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(123,44,255,0.13)]',
  },
  cyan: {
    topGrad: 'from-[#00A3FF] to-[#7B2CFF]',
    iconBg: 'rgba(0,163,255,0.11)',
    iconColor: '#00A3FF',
    glowColor: 'rgba(0,163,255,0.10)',
    checkBg: 'rgba(0,163,255,0.10)',
    checkColor: '#00A3FF',
    pillBg: 'rgba(0,163,255,0.07)',
    pillText: '#00A3FF',
    pillBorder: 'rgba(0,163,255,0.18)',
    ctaColor: '#00A3FF',
    hoverBorder: 'hover:border-[#00A3FF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(0,163,255,0.13)]',
  },
  mixed: {
    topGrad: 'from-[#005BFF] to-[#7B2CFF]',
    iconBg: 'rgba(0,91,255,0.11)',
    iconColor: '#005BFF',
    glowColor: 'rgba(123,44,255,0.10)',
    checkBg: 'rgba(0,91,255,0.10)',
    checkColor: '#005BFF',
    pillBg: 'rgba(91,77,255,0.07)',
    pillText: '#5B4DFF',
    pillBorder: 'rgba(91,77,255,0.18)',
    ctaColor: '#005BFF',
    hoverBorder: 'hover:border-[#005BFF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(91,77,255,0.13)]',
  },
} as const
