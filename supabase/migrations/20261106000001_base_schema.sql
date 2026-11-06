-- =============================================================================
-- Etapa 2: esquema base multi-tenant.
--
-- Princípios:
--   * Toda tabela de negócio tem tenant_id, created_at e updated_at.
--   * RLS ligado em TODAS as tabelas. O tenant do usuário logado vem de
--     public.current_tenant_id(), nunca de um valor enviado pelo cliente.
--   * Chaves estrangeiras compostas (tenant_id, id) garantem que um registro
--     nunca aponte para um registro de outro tenant, mesmo que alguém adivinhe
--     um UUID.
--   * Valores em centavos (integer). Datas de negócio em `date`; instantes em
--     timestamptz (exibidos em America/Sao_Paulo pela aplicação).
--   * Segredos (chave do provedor, CPF) chegam aqui já criptografados pela
--     aplicação (AES-256-GCM). O banco nunca vê o texto puro.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.saas_plan as enum ('trial', 'ate_20', 'ate_50', 'ate_100');
create type public.subscription_status as enum ('trial', 'ativa', 'vencida', 'cancelada');
create type public.eligibility as enum ('desconhecida', 'elegivel', 'nao_elegivel');
create type public.provider_kind as enum ('asaas', 'mock');
create type public.provider_env as enum ('sandbox', 'producao');
create type public.connection_status as enum ('nao_testada', 'ok', 'erro');
create type public.shift as enum ('manha', 'tarde', 'integral', 'noite');
create type public.student_status as enum ('ativo', 'pausado', 'encerrado');
create type public.months_policy as enum ('doze', 'dez', 'personalizada');
create type public.discount_type as enum ('nenhum', 'valor', 'percentual');
create type public.billing_mode as enum ('aguardando_adesao', 'pix_automatico', 'pix_comum');
create type public.contract_status as enum ('ativo', 'pausado', 'encerrado');
create type public.authorization_status as enum ('pendente', 'ativa', 'recusada', 'cancelada', 'expirada');
create type public.charge_status as enum ('agendada', 'enviada', 'paga', 'atrasada', 'cancelada');
create type public.charge_method as enum ('pix_automatico', 'pix_comum');
create type public.template_kind as enum (
  'pre_vencimento', 'no_dia', 'atraso_1', 'atraso_3', 'atraso_7', 'boas_vindas', 'confirmacao_pagamento'
);
create type public.message_status as enum ('pendente', 'aberto_whatsapp', 'enviado', 'descartado');
create type public.webhook_status as enum ('pendente', 'processando', 'processado', 'erro', 'ignorado');

-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- tenants (raiz do multi-tenant: o próprio id é o tenant_id)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  document text check (document ~ '^[0-9]{11}$|^[0-9]{14}$'),     -- CPF ou CNPJ, só dígitos
  phone text check (phone ~ '^[0-9]{10,13}$'),
  city text,
  plan public.saas_plan not null default 'trial',
  subscription_status public.subscription_status not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  pix_automatico_eligibility public.eligibility not null default 'desconhecida',
  onboarding_completed_at timestamptz,
  -- Marca dados de demonstração; o seed se recusa a rodar em produção.
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users (1 por tenant no MVP; id = auth.users.id)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_one_per_tenant on public.users (tenant_id); -- MVP: 1 usuário por tenant

-- Resolve o tenant do usuário logado. SECURITY DEFINER para não depender da
-- própria política de RLS de users (evita recursão).
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select u.tenant_id from public.users u where u.id = auth.uid()
$$;
revoke all on function public.current_tenant_id() from public;
grant execute on function public.current_tenant_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- provider_connections: chave de API criptografada. O cliente só lê metadados;
-- escrita apenas pelo servidor (service_role), que criptografa a chave.
-- ---------------------------------------------------------------------------
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider public.provider_kind not null,
  environment public.provider_env not null default 'sandbox',
  api_key_encrypted text not null,
  api_key_hint text,                       -- últimos 4 caracteres, para o usuário reconhecer a chave
  status public.connection_status not null default 'nao_testada',
  validated_at timestamptz,
  last_error_message text,                 -- mensagem amigável; detalhe técnico só no log interno
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- URL de webhook por tenant: /api/webhooks/{provider}/{public_id}. Guardamos só o hash do token.
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider public.provider_kind not null,
  public_id text not null unique,
  token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- ---------------------------------------------------------------------------
-- routes
-- ---------------------------------------------------------------------------
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  schools text[] not null default '{}',
  shift public.shift not null,
  vehicle text,
  capacity smallint check (capacity is null or capacity between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- students: dados MÍNIMOS (menor de idade). Sem documentos, sem fotos,
-- sem data de nascimento.
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  school text,
  grade text,
  route_id uuid,
  shift public.shift not null,
  status public.student_status not null default 'ativo',
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, route_id) references public.routes (tenant_id, id) on delete set null (route_id)
);
create index students_tenant_route on public.students (tenant_id, route_id);

-- ---------------------------------------------------------------------------
-- guardians: CPF criptografado + hash (HMAC) para detectar duplicidade na
-- importação + versão mascarada para exibir. Nunca guardamos CPF em claro.
-- ---------------------------------------------------------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  cpf_encrypted text,
  cpf_hash text,
  cpf_masked text,                                       -- ex.: ***.123.456-**
  whatsapp text check (whatsapp ~ '^55[0-9]{10,11}$'),   -- E.164 sem "+", Brasil
  email text,
  notes text,
  provider_customer_id text,                             -- id do cliente no provedor
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index guardians_tenant_cpf on public.guardians (tenant_id, cpf_hash) where cpf_hash is not null;

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  student_id uuid not null,
  guardian_id uuid not null,
  is_primary_payer boolean not null default false,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, guardian_id),
  foreign key (tenant_id, student_id) references public.students (tenant_id, id) on delete cascade,
  foreign key (tenant_id, guardian_id) references public.guardians (tenant_id, id) on delete cascade
);
-- No máximo um pagador principal por aluno.
create unique index student_guardians_one_primary on public.student_guardians (student_id) where is_primary_payer;

-- ---------------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  student_id uuid not null,
  payer_guardian_id uuid not null,
  monthly_amount_cents integer not null check (monthly_amount_cents between 100 and 10000000),
  due_day smallint not null check (due_day between 1 and 31),  -- dia > fim do mês vira o último dia
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  months_policy public.months_policy not null default 'doze',
  -- Meses (1..12) em que HÁ cobrança quando a política é personalizada.
  custom_months smallint[] check (custom_months is null or custom_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  prorata_first_month boolean not null default false,
  discount_type public.discount_type not null default 'nenhum',
  -- 'valor': centavos. 'percentual': pontos-base (1000 = 10,00%).
  discount_value integer not null default 0 check (discount_value >= 0),
  billing_mode public.billing_mode not null default 'aguardando_adesao',
  status public.contract_status not null default 'ativo',
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, student_id) references public.students (tenant_id, id),  -- NO ACTION: impede apagar aluno/responsável com contrato, mas permite a cascata do tenant
  foreign key (tenant_id, payer_guardian_id) references public.guardians (tenant_id, id),  -- NO ACTION: impede apagar aluno/responsável com contrato, mas permite a cascata do tenant
  check (months_policy <> 'personalizada' or (custom_months is not null and cardinality(custom_months) > 0)),
  check (discount_type <> 'percentual' or discount_value <= 10000),
  check (discount_type <> 'nenhum' or discount_value = 0)
);
create index contracts_tenant_status on public.contracts (tenant_id, status);
-- Um contrato ativo/pausado por aluno.
create unique index contracts_one_open_per_student on public.contracts (tenant_id, student_id) where status <> 'encerrado';

-- Histórico de valores (reajuste anual e alterações manuais).
create table public.contract_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  contract_id uuid not null,
  old_amount_cents integer,
  new_amount_cents integer not null,
  effective_from date not null,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contract_id) references public.contracts (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- authorizations (Pix Automático)
-- ---------------------------------------------------------------------------
create table public.authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  contract_id uuid not null,
  status public.authorization_status not null default 'pendente',
  provider public.provider_kind not null,
  provider_authorization_id text,
  min_limit_cents integer,          -- piso que enviamos (minLimitValue)
  max_amount_cents integer,         -- teto que o pagador escolheu, quando o provedor informar
  starts_on date,
  activated_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contract_id) references public.contracts (tenant_id, id) on delete cascade
);
create unique index authorizations_provider_id on public.authorizations (provider, provider_authorization_id)
  where provider_authorization_id is not null;
-- Só uma autorização pendente ou ativa por contrato.
create unique index authorizations_one_live on public.authorizations (contract_id) where status in ('pendente', 'ativa');

-- ---------------------------------------------------------------------------
-- charges
-- ---------------------------------------------------------------------------
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  contract_id uuid not null,
  authorization_id uuid,
  competence date not null check (extract(day from competence) = 1),  -- sempre o dia 1 do mês
  amount_cents integer not null check (amount_cents > 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  due_date date not null,
  status public.charge_status not null default 'agendada',
  method public.charge_method not null,
  is_enrollment boolean not null default false,  -- 1ª cobrança, paga junto com a adesão
  provider public.provider_kind,
  provider_charge_id text,
  pix_payload text,                -- "copia e cola"
  payment_link text,
  paid_at timestamptz,
  paid_amount_cents integer,
  review_reason text,              -- preenchido = "precisa de revisão"
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Impede cobrança duplicada da mesma competência, mesmo se o cron rodar 2x.
  unique (contract_id, competence),
  foreign key (tenant_id, contract_id) references public.contracts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, authorization_id) references public.authorizations (tenant_id, id) on delete set null (authorization_id),
  check (status <> 'paga' or paid_at is not null)
);
create unique index charges_provider_id on public.charges (provider, provider_charge_id) where provider_charge_id is not null;
create index charges_tenant_due on public.charges (tenant_id, due_date);
create index charges_tenant_status on public.charges (tenant_id, status);
create index charges_needs_review on public.charges (tenant_id) where review_reason is not null and reviewed_at is null;

-- ---------------------------------------------------------------------------
-- enrollment_links: link público de adesão. Só o hash do token fica no banco.
-- Sem política para anon: a página pública lê pelo servidor (service_role).
-- ---------------------------------------------------------------------------
create table public.enrollment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  contract_id uuid not null,
  authorization_id uuid,
  charge_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_ip_hash text,
  consent_text_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contract_id) references public.contracts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, authorization_id) references public.authorizations (tenant_id, id) on delete set null (authorization_id),
  foreign key (tenant_id, charge_id) references public.charges (tenant_id, id) on delete set null (charge_id)
);

-- ---------------------------------------------------------------------------
-- message_templates e message_log
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  kind public.template_kind not null,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);

create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  charge_id uuid,
  template_kind public.template_kind not null,
  channel text not null default 'whatsapp',
  body text not null,
  status public.message_status not null default 'pendente',
  scheduled_for date not null,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, charge_id) references public.charges (tenant_id, id) on delete cascade,
  -- Um lembrete de cada tipo por cobrança.
  unique (charge_id, template_kind)
);
create index message_log_tenant_day on public.message_log (tenant_id, scheduled_for, status);

-- ---------------------------------------------------------------------------
-- webhook_events: auditoria do payload bruto + fila de processamento.
-- Sem nenhuma política para o cliente: só o servidor acessa.
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider public.provider_kind not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status public.webhook_status not null default 'pendente',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotência: o mesmo evento entregue N vezes vira 1 linha.
  unique (provider, event_id)
);
create index webhook_events_queue on public.webhook_events (next_attempt_at) where status in ('pendente', 'erro');

-- ---------------------------------------------------------------------------
-- audit_log: somente inserção e leitura.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}',   -- NUNCA colocar CPF, telefone ou chaves aqui
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_log_tenant_time on public.audit_log (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Limite de tentativas (login e páginas públicas). Só service_role usa.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,          -- hash do identificador (ex.: ip + rota); nunca o IP em claro
  window_start timestamptz not null,
  hits integer not null
);

create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean   -- true = permitido
language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers de updated_at em todas as tabelas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users','provider_connections','webhook_endpoints','routes','students','guardians',
    'student_guardians','contracts','contract_price_history','authorizations','charges',
    'enrollment_links','message_templates','message_log','webhook_events','audit_log'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Templates padrão de mensagens. Tom educado, nunca constrangedor.
-- ---------------------------------------------------------------------------
create or replace function public.default_templates()
returns table (kind public.template_kind, body text)
language sql immutable as $$
  values
    ('boas_vindas'::public.template_kind,
     'Olá, {responsavel}! Aqui é do transporte escolar do(a) {aluno}. Para facilitar, a mensalidade de {valor} agora pode ser paga por Pix. Pelo link abaixo você paga o primeiro mês e, se quiser, autoriza os próximos para caírem sozinhos todo mês: {link}. Qualquer dúvida, é só me chamar.'),
    ('pre_vencimento',
     'Olá, {responsavel}! Passando para lembrar que a mensalidade do transporte do(a) {aluno}, no valor de {valor}, vence em {vencimento}. Se preferir, pode pagar pelo Pix neste link: {link}. Obrigado!'),
    ('no_dia',
     'Bom dia, {responsavel}! Hoje, {vencimento}, é o dia do pagamento do transporte do(a) {aluno} ({valor}). O Pix está aqui: {link}. Se já pagou, pode desconsiderar. Obrigado!'),
    ('atraso_1',
     'Olá, {responsavel}, tudo bem? Não identifiquei ainda o pagamento do transporte do(a) {aluno} que venceu em {vencimento} ({valor}). Pode ser só um esquecimento ou o banco ainda vai tentar debitar. O Pix está aqui, se precisar: {link}.'),
    ('atraso_3',
     'Oi, {responsavel}! Ainda consta em aberto a mensalidade do transporte do(a) {aluno}, de {valor}, com vencimento em {vencimento}. Segue o link para pagar pelo Pix: {link}. Se tiver alguma dificuldade, me avise que a gente combina.'),
    ('atraso_7',
     'Olá, {responsavel}. A mensalidade do transporte do(a) {aluno} ({valor}, vencida em {vencimento}) ainda está em aberto. Consegue verificar para mim? O link do Pix é este: {link}. Se precisar conversar sobre a data, estou à disposição.'),
    ('confirmacao_pagamento',
     'Olá, {responsavel}! Recebi o pagamento de {valor} referente ao transporte do(a) {aluno}. Muito obrigado!')
$$;

-- ---------------------------------------------------------------------------
-- Novo usuário no Auth => cria tenant + users + templates padrão.
-- O nome do negócio vem de raw_user_meta_data.business_name (cadastro).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  insert into public.tenants (name)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 'Meu transporte escolar'))
  returning id into v_tenant;

  insert into public.users (id, tenant_id, name, email)
  values (new.id, v_tenant, nullif(trim(new.raw_user_meta_data ->> 'name'), ''), coalesce(new.email, ''));

  insert into public.message_templates (tenant_id, kind, body)
  select v_tenant, d.kind, d.body from public.default_templates() d;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
