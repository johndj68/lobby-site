-- E-books pagos: metadados continuam públicos (título/descrição/preço já
-- eram, via public_read_metadata), mas o arquivo protegido vai pra um
-- bucket PRIVADO — o bucket "materials" existente é público de propósito
-- (materiais gratuitos), não dá pra misturar arquivo pago nele sem expor
-- a URL pra qualquer um com o link.

alter table public.resource_metadata
  add column if not exists is_paid              boolean not null default false,
  add column if not exists price                numeric(12,2) check (price is null or price > 0),
  add column if not exists sale_description      text,
  add column if not exists sale_status           text not null default 'active' check (sale_status in ('active', 'inactive', 'coming_soon')),
  add column if not exists delivery_type         text not null default 'automatic' check (delivery_type in ('automatic', 'manual', 'external_link')),
  add column if not exists payment_product_id    text,
  add column if not exists protected_file_path   text,
  add column if not exists created_by            uuid references public.profiles(id),
  add column if not exists updated_by            uuid references public.profiles(id),
  add column if not exists updated_at            timestamptz not null default now();

-- Compras (registra intenção mesmo sem gateway real — status fica
-- 'pending' até o técnico líder confirmar manualmente, ou até um gateway
-- real existir e atualizar via webhook).
create table if not exists public.ebook_purchases (
  id                 uuid primary key default gen_random_uuid(),
  ebook_id           uuid not null references public.resource_metadata(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  amount             numeric(12,2) not null,
  currency           text not null default 'BRL',
  status             text not null default 'pending' check (status in ('pending', 'paid', 'canceled', 'refunded', 'failed')),
  payment_provider   text,
  payment_reference  text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists ebook_purchases_user_idx  on public.ebook_purchases (user_id);
create index if not exists ebook_purchases_ebook_idx on public.ebook_purchases (ebook_id);

alter table public.ebook_purchases enable row level security;

drop policy if exists "user_select_own_purchases" on public.ebook_purchases;
create policy "user_select_own_purchases" on public.ebook_purchases for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
  );

drop policy if exists "user_insert_own_purchase" on public.ebook_purchases;
create policy "user_insert_own_purchase" on public.ebook_purchases for insert
  to authenticated
  with check (user_id = auth.uid());

-- Só o técnico líder pode confirmar/alterar status de uma compra (marcar
-- como paga manualmente, cancelar etc.) — usuário não pode se auto-marcar
-- como pago.
drop policy if exists "leader_update_purchases" on public.ebook_purchases;
create policy "leader_update_purchases" on public.ebook_purchases for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));

-- resource_metadata tinha uma policy solta "technician_manage_metadata"
-- (ALL, sem restrição) — mesmo problema já corrigido em client_projects
-- (20260704140000): uma policy ampla convive com regras mais restritas e
-- anula a restrição. Aqui nunca existiu a parte restrita — split agora,
-- direto: só líder mexe em linha com is_paid = true (na leitura da linha
-- atual E na linha resultante, pra impedir técnico comum "destravar" um
-- item pago só trocando o campo).
drop policy if exists "technician_manage_metadata" on public.resource_metadata;

drop policy if exists "technician_insert_metadata" on public.resource_metadata;
create policy "technician_insert_metadata" on public.resource_metadata for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician')
    and (
      is_paid is not true
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
    )
  );

drop policy if exists "technician_update_metadata" on public.resource_metadata;
create policy "technician_update_metadata" on public.resource_metadata for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician')
    and (
      is_paid is not true
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician')
    and (
      is_paid is not true
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
    )
  );

drop policy if exists "technician_delete_metadata" on public.resource_metadata;
create policy "technician_delete_metadata" on public.resource_metadata for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician')
    and (
      is_paid is not true
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
    )
  );
-- public_read_metadata (select true) fica como está — metadados
-- (título/descrição/preço) são públicos por design, só o arquivo é que
-- precisa de proteção.

-- Bucket privado só pro arquivo do e-book pago.
insert into storage.buckets (id, name, public)
values ('materials-paid', 'materials-paid', false)
on conflict (id) do nothing;

drop policy if exists "leader_insert_paid_materials" on storage.objects;
create policy "leader_insert_paid_materials" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'materials-paid'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
  );

drop policy if exists "leader_delete_paid_materials" on storage.objects;
create policy "leader_delete_paid_materials" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'materials-paid'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
  );

-- Leitura (necessária pra gerar signed URL): só líder, ou quem tem compra
-- 'paid' desse e-book específico.
drop policy if exists "paid_materials_select_authorized" on storage.objects;
create policy "paid_materials_select_authorized" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'materials-paid'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true)
      or exists (
        select 1 from public.resource_metadata rm
        join public.ebook_purchases ep on ep.ebook_id = rm.id
        where rm.protected_file_path = storage.objects.name
          and ep.user_id = auth.uid()
          and ep.status = 'paid'
      )
    )
  );
