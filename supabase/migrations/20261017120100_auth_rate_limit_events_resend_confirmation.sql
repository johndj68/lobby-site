-- Reenvio de confirmação de e-mail (app/api/auth/resend-confirmation/route.ts) usa o
-- mesmo padrão de log fail-open do forgot-password, na mesma tabela
-- (20260823160000_auth_rate_limit_events.sql) — precisa do novo event_type permitido
-- pelo check constraint.
alter table public.auth_rate_limit_events
  drop constraint if exists auth_rate_limit_events_event_type_check;

alter table public.auth_rate_limit_events
  add constraint auth_rate_limit_events_event_type_check
  check (event_type in (
    'login_fail', 'admin_login_fail',
    'forgot_password_block', 'resend_confirmation_block'
  ));
