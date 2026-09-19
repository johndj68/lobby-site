import { Resend } from 'resend'

// SERVER-ONLY. Nunca importar em componente 'use client'.
// Init preguiçoso: importar este módulo não deve quebrar a página se as
// envs ainda não estiverem configuradas — só falha quando de fato tenta enviar.
export function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY não configurada.')
  }
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL não configurada.')
  }
  return { resend: new Resend(process.env.RESEND_API_KEY), from: process.env.RESEND_FROM_EMAIL }
}
