-- =============================================================================
-- Etapa 5: cobranças por competência, links públicos e cobrança híbrida.
-- =============================================================================

-- O link público serve à adesão (1ª cobrança + autorização do Pix Automático)
-- e também a cada cobrança mensal em Pix comum (o {link} dos lembretes).
create type public.link_purpose as enum ('adesao', 'cobranca');

alter table public.enrollment_links
  add column purpose public.link_purpose not null default 'adesao',
  -- Token criptografado (AES-GCM, chave da aplicação) para remontar o link nos
  -- lembretes. A busca continua sendo feita só pelo hash.
  add column token_encrypted text;

create index enrollment_links_charge on public.enrollment_links (charge_id);

-- Tentativas de autorização por contrato (compõe o contractId enviado ao provedor).
alter table public.authorizations add column attempt smallint not null default 1;

-- Cobranças: tentativa de envio ao provedor e motivo de falha (para retentar).
alter table public.charges
  add column send_attempts smallint not null default 0,
  add column last_send_error text,
  add column original_due_date date;   -- vencimento pela regra do contrato, antes de ajustes

-- O cliente pode ver o link (sem hash nem token criptografado).
revoke select on public.enrollment_links from authenticated;
grant select (id, tenant_id, contract_id, authorization_id, charge_id, purpose, expires_at, revoked_at,
              first_viewed_at, accepted_at, consent_text_version, created_at, updated_at)
  on public.enrollment_links to authenticated;

-- Contratos novos de tenants sem Pix Automático já nascem em Pix comum.
create or replace function public.contracts_default_billing_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.billing_mode = 'aguardando_adesao' and exists (
    select 1 from public.tenants t where t.id = new.tenant_id and t.pix_automatico_eligibility = 'nao_elegivel'
  ) then
    new.billing_mode := 'pix_comum';
  end if;
  return new;
end $$;

create trigger contracts_default_billing_mode
  before insert on public.contracts
  for each row execute function public.contracts_default_billing_mode();
