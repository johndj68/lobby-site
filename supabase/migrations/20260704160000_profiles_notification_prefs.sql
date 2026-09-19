-- app/dashboard/conta/AccountForm.tsx tinha um estado local `prefs`
-- (materiais/atualizações de projeto/recomendações) que nunca era
-- carregado nem salvo — o usuário via "Alterações salvas com sucesso!"
-- ao alternar os checkboxes, mas nada persistia porque não havia coluna
-- pra isso. Adiciona notification_prefs em profiles; RLS de
-- own_profile_update/own_profile_insert já cobre esta coluna (é só mais
-- um campo da própria linha do usuário).

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"materials":true,"projectUpdates":true,"recommendations":false}'::jsonb;
