-- =============================================================================
-- Row Level Security.
--
-- Regra única: o usuário autenticado só enxerga linhas do próprio tenant
-- (public.current_tenant_id()). `anon` não tem acesso a nenhuma tabela: as
-- páginas públicas (adesão) e os webhooks leem pelo servidor com service_role,
-- sempre filtrando por tenant_id explicitamente.
-- =============================================================================

-- RLS em todas as tabelas do schema public, sem exceção.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- tenants: lê e atualiza o próprio. Campos de plano/assinatura/elegibilidade só
-- o servidor altera (privilégio por coluna).
-- ---------------------------------------------------------------------------
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.current_tenant_id());
create policy tenants_update on public.tenants for update to authenticated
  using (id = public.current_tenant_id()) with check (id = public.current_tenant_id());

revoke insert, update, delete on public.tenants from authenticated;
grant update (name, document, phone, city, onboarding_completed_at) on public.tenants to authenticated;

-- ---------------------------------------------------------------------------
-- users: lê o próprio registro; altera só o nome.
-- ---------------------------------------------------------------------------
create policy users_select on public.users for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and tenant_id = public.current_tenant_id());
revoke insert, update, delete on public.users from authenticated;
grant update (name) on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- provider_connections: cliente lê só metadados (NUNCA a coluna criptografada).
-- Escrita somente pelo servidor.
-- ---------------------------------------------------------------------------
create policy provider_connections_select on public.provider_connections for select to authenticated
  using (tenant_id = public.current_tenant_id());
revoke all on public.provider_connections from authenticated;
grant select (id, tenant_id, provider, environment, api_key_hint, status, validated_at,
              last_error_message, created_at, updated_at)
  on public.provider_connections to authenticated;

-- webhook_endpoints: cliente lê o public_id (para montar a URL); nunca o hash.
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (tenant_id = public.current_tenant_id());
revoke all on public.webhook_endpoints from authenticated;
grant select (id, tenant_id, provider, public_id, created_at, updated_at) on public.webhook_endpoints to authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas de negócio com CRUD completo pelo dono do tenant.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'routes','students','guardians','student_guardians','contracts',
    'message_templates','message_log'
  ] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (tenant_id = public.current_tenant_id());
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (tenant_id = public.current_tenant_id());
      create policy %1$s_update on public.%1$I for update to authenticated
        using (tenant_id = public.current_tenant_id())
        with check (tenant_id = public.current_tenant_id());
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (tenant_id = public.current_tenant_id());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tabelas que mexem com dinheiro ou com o provedor: o cliente LÊ; quem escreve
-- é o servidor (services/), que valida a regra de negócio antes.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['authorizations','charges','enrollment_links','contract_price_history'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (tenant_id = public.current_tenant_id());
    $f$, t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

-- enrollment_links: nem o dono lê o hash do token.
revoke select on public.enrollment_links from authenticated;
grant select (id, tenant_id, contract_id, authorization_id, charge_id, expires_at, revoked_at,
              first_viewed_at, accepted_at, consent_text_version, created_at, updated_at)
  on public.enrollment_links to authenticated;

-- ---------------------------------------------------------------------------
-- audit_log: lê e insere (como ele mesmo); nunca altera nem apaga.
-- ---------------------------------------------------------------------------
create policy audit_log_select on public.audit_log for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and actor_user_id = auth.uid());
revoke update, delete on public.audit_log from authenticated;

-- webhook_events e rate_limits: nenhuma política => nenhum acesso pelo cliente.
revoke all on public.webhook_events from authenticated;
revoke all on public.rate_limits from authenticated;
