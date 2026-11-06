-- =============================================================================
-- Etapa 4: cadastros e importação.
-- =============================================================================

-- Desconto padrão para irmãos (D6): aplicado a partir do 2º aluno do mesmo
-- pagador principal. 'valor' em centavos; 'percentual' em pontos-base.
alter table public.tenants
  add column sibling_discount_type public.discount_type not null default 'nenhum',
  add column sibling_discount_value integer not null default 0 check (sibling_discount_value >= 0),
  add constraint tenants_sibling_percent check (sibling_discount_type <> 'percentual' or sibling_discount_value <= 10000),
  add constraint tenants_sibling_none check (sibling_discount_type <> 'nenhum' or sibling_discount_value = 0);

grant update (sibling_discount_type, sibling_discount_value) on public.tenants to authenticated;

-- Nome normalizado do aluno, para detectar cadastro duplicado.
create or replace function public.normalize_name(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(translate(p,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '\s+', ' ', 'g'))
$$;

-- -----------------------------------------------------------------------------
-- register_students: grava aluno + responsável + vínculo + contrato de uma ou
-- várias linhas numa ÚNICA transação (tudo ou nada).
--
-- SECURITY INVOKER: roda com o usuário logado, então o RLS vale para tudo e o
-- tenant_id vem do default current_tenant_id(). O CPF chega já criptografado
-- (cpf_encrypted), com hash (cpf_hash) e máscara (cpf_masked) calculados pela
-- aplicação: o banco nunca vê o CPF em claro.
--
-- Cada item de p_rows:
--   student_name, school, grade, shift, route_id | route_name,
--   guardian_name, cpf_encrypted, cpf_hash, cpf_masked, whatsapp, email,
--   monthly_amount_cents, due_day, start_date, months_policy, custom_months[],
--   discount_type, discount_value, prorata_first_month
-- -----------------------------------------------------------------------------
create or replace function public.register_students(p_rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_route uuid;
  v_guardian uuid;
  v_student uuid;
  v_contract uuid;
  v_created_routes int := 0;
  v_new_guardians int := 0;
  v_ids uuid[] := '{}';
begin
  if public.current_tenant_id() is null then
    raise exception 'sem tenant' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    -- Rota: por id, ou por nome (cria se ainda não existir).
    v_route := nullif(r ->> 'route_id', '')::uuid;
    if v_route is null and coalesce(trim(r ->> 'route_name'), '') <> '' then
      select id into v_route from public.routes
        where public.normalize_name(name) = public.normalize_name(r ->> 'route_name') and archived_at is null
        order by created_at limit 1;
      if v_route is null then
        insert into public.routes (name, shift) values (trim(r ->> 'route_name'), (r ->> 'shift')::public.shift)
          returning id into v_route;
        v_created_routes := v_created_routes + 1;
      end if;
    end if;

    -- Responsável: reaproveita pelo hash do CPF (irmãos têm o mesmo pagador).
    v_guardian := null;
    select id into v_guardian from public.guardians where cpf_hash = r ->> 'cpf_hash' and anonymized_at is null;
    if v_guardian is null then
      insert into public.guardians (name, cpf_encrypted, cpf_hash, cpf_masked, whatsapp, email)
      values (trim(r ->> 'guardian_name'), r ->> 'cpf_encrypted', r ->> 'cpf_hash', r ->> 'cpf_masked',
              r ->> 'whatsapp', nullif(trim(r ->> 'email'), ''))
      returning id into v_guardian;
      v_new_guardians := v_new_guardians + 1;
    end if;

    insert into public.students (name, school, grade, route_id, shift)
    values (trim(r ->> 'student_name'), nullif(trim(r ->> 'school'), ''), nullif(trim(r ->> 'grade'), ''), v_route,
            (r ->> 'shift')::public.shift)
    returning id into v_student;
    v_ids := v_ids || v_student;

    insert into public.student_guardians (student_id, guardian_id, is_primary_payer)
    values (v_student, v_guardian, true);

    insert into public.contracts (
      student_id, payer_guardian_id, monthly_amount_cents, due_day, start_date, months_policy, custom_months,
      discount_type, discount_value, prorata_first_month
    ) values (
      v_student, v_guardian, (r ->> 'monthly_amount_cents')::int, (r ->> 'due_day')::smallint, (r ->> 'start_date')::date,
      (r ->> 'months_policy')::public.months_policy,
      case when jsonb_typeof(r -> 'custom_months') = 'array'
           then array(select jsonb_array_elements_text(r -> 'custom_months')::smallint) end,
      coalesce(r ->> 'discount_type', 'nenhum')::public.discount_type, coalesce((r ->> 'discount_value')::int, 0),
      coalesce((r ->> 'prorata_first_month')::boolean, false)
    ) returning id into v_contract;
    -- (O valor inicial fica no próprio contrato; o histórico registra só reajustes.)

  end loop;

  return jsonb_build_object('created', jsonb_array_length(p_rows), 'routes_created', v_created_routes,
                            'guardians_created', v_new_guardians, 'student_ids', to_jsonb(v_ids));
end $$;

revoke all on function public.register_students(jsonb) from public, anon;
grant execute on function public.register_students(jsonb) to authenticated;
