// Ações protegidas pelo desafio anti-bot. O valor é o mesmo enviado como
// `data-action`/`action` ao Turnstile e cobrado de volta no siteverify — nunca
// aceito do cliente como fonte de verdade (ver lib/anti-bot/verify.ts).
export type AntiBotAction = 'register' | 'login' | 'forgot_password' | 'resend_confirmation'
