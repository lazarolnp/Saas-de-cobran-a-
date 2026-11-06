# [NOME_DO_PRODUTO]: cobrança do transporte escolar

MVP de SaaS para motoristas de transporte escolar cobrarem a mensalidade dos pais pelo **Pix Automático**, com Pix comum e lembretes pelo WhatsApp quando não houver autorização.

> Status: **etapa 4 de 8 concluída** (cadastros de rotas, alunos, responsáveis e contratos, e importação por planilha).
> O plano completo e as decisões estão em [`docs/ETAPA-1-PLANO.md`](docs/ETAPA-1-PLANO.md).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres + Auth) com Row Level Security por tenant
- Zod (validação), Vitest (unidade e banco), Playwright (ponta a ponta)

## Como rodar localmente

Pré-requisitos: Node 22+ e Docker (para o Supabase local).

```bash
npm install
npm run db:start          # sobe o Supabase local (Docker)
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY com a saída de: npx supabase status
# Gere a chave mestra: openssl rand -base64 32  -> ENCRYPTION_KEY
npm run db:reset          # aplica as migrations
npm run db:seed           # cria o tenant de exemplo
npm run dev               # http://localhost:3000
```

Login de exemplo: `demo@exemplo.com.br` / `demo-senha-123`. São 2 rotas, 15 alunos e cobranças em vários status: paga, atrasada, enviada, agendada, cancelada e uma "precisa de revisão". O seed também mostra no terminal 3 links de adesão de exemplo.

## Variáveis de ambiente

| Variável | Onde é usada | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador e servidor | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | Chave pública. Os dados ficam protegidos pelo RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | Ignora o RLS. Usada em webhooks, cron, página pública e gravação de segredos. |
| `ENCRYPTION_KEY` | **só servidor** | 32 bytes em base64. Criptografa as chaves de API e os CPFs. **Se for perdida ou trocada, esses dados não abrem mais.** |
| `APP_URL` | servidor | URL pública, usada nos links de e-mail |
| `APP_ENV` | servidor | `development`, `test`, `staging` ou `production`. O seed é bloqueado em `production`. |
| `NEXT_PUBLIC_PRODUCT_NAME` | navegador | Nome provisório do produto |
| `DATABASE_URL` | testes | Postgres local, para os testes de RLS |

## Testes

```bash
npm test                 # unidade: criptografia, CPF/telefone, dinheiro, datas, logger
npm run test:db          # banco: isolamento entre tenants e travas do esquema (requer db:start + db:reset)
npm run build && npm run test:e2e   # ponta a ponta em 360 px (requer db:seed)
npm run lint && npm run typecheck
```

## Provedor de pagamentos (Asaas)

Toda regra de negócio fala com a interface `PaymentProvider` (`src/providers/payment-provider.ts`), nunca com o Asaas direto.

- `AsaasProvider`: segue só o que está em docs.asaas.com. Cada endpoint usado está listado no topo do arquivo.
- `MockProvider`: provedor simulado para desenvolvimento e testes. Aceita chaves começando com `mock_` (`mock_recusar` simula chave inválida). Os webhooks simulados têm o formato documentado do Asaas, e o simulador reproduz as sequências de eventos (adesão ativada, adesão recusada depois do pagamento, débito do Pix Automático e Pix comum).
- O **ambiente** vem do `APP_ENV`. Fora de `production`, só o sandbox é usado. Em `production`, o modo simulado não aparece.
- **Testar conexão:** `GET /v3/myAccount/status/`. Mostra também se o cadastro da conta já foi aprovado.

### Como configurar o sandbox do Asaas

1. Crie uma conta em https://sandbox.asaas.com (conta de teste, sem dinheiro real).
2. No site (não no app), abra a área de **Integrações** e crie uma **chave de API**. Ela só aparece uma vez.
3. No sistema, vá em **Ajustes → Onde você recebe**, escolha Asaas, cole a chave e toque em **Testar e conectar**.
4. **Webhook:** se o `APP_URL` for público (https), o sistema cadastra o webhook sozinho (`POST /v3/webhooks`) com um token próprio. Se for `localhost`, a tela mostra a URL e o token para cadastro manual. Para testar localmente, exponha a porta 3000 com um túnel https, ajuste o `APP_URL` e reconecte.

## Cadastros e importação

- **Formulário único** (`/alunos/novo`): aluno + quem paga + mensalidade. As opções avançadas (início, meses, desconto e 1º mês proporcional) ficam recolhidas.
- **Planilha** (`/alunos/importar`): modelo CSV para baixar (separador `;`, abre no Excel), pré-visualização, validação linha a linha e relatório de erros para baixar. A gravação é tudo ou nada, numa única transação (`register_students`). A planilha é validada de novo no servidor ao confirmar, e a pré-visualização nunca devolve o CPF ao navegador.
- O formulário e a planilha usam a **mesma validação** (`src/domain/registration.ts`).
- **Desconto de irmãos** (Ajustes): aplicado sozinho a partir do 2º aluno do mesmo responsável, identificado pelo hash do CPF.
- Rotas que vêm na planilha e ainda não existem são criadas automaticamente.

## Estrutura

```
src/app/(auth)        entrar, cadastrar, ações de login
src/app/(app)         área logada (layout + início)
src/app/legal         termos e privacidade (TEXTO PROVISÓRIO)
src/app/auth          confirmação de e-mail
src/domain            regras puras (cadastro, importação)
src/providers         PaymentProvider, AsaasProvider, MockProvider (+ simulador de webhooks)
src/services          regras com banco + provedor (conexão com o provedor)
src/lib               env, crypto, máscaras BR, dinheiro, datas, logger, rate limit, clientes Supabase
src/proxy.ts          renovação de sessão e checagem otimista de login
supabase/migrations   esquema + RLS
scripts/seed.ts       seed de desenvolvimento
tests/unit, tests/db, tests/e2e
```

## Decisões tomadas

- **Multi-tenant pelo banco.** O tenant do usuário vem de `public.current_tenant_id()`, que lê `auth.uid()`, e nunca de um valor enviado pelo cliente. O RLS está ligado e forçado em todas as tabelas, e um teste falha se alguma tabela nova ficar sem RLS.
- **Chaves estrangeiras compostas `(tenant_id, id)`.** Mesmo sabendo o UUID de um aluno de outro motorista, ninguém consegue ligar um contrato a ele.
- **O cliente só lê o que envolve dinheiro ou o provedor.** Cobranças, autorizações, links de adesão, conexão com o provedor e webhooks são gravados só pelo servidor (service_role), depois de validar a regra de negócio. A coluna com a chave criptografada nem pode ser lida pelo cliente (privilégio por coluna).
- **Segredos criptografados na aplicação** com AES-256-GCM e subchaves HKDF. O CPF fica criptografado, com um HMAC para achar duplicidade na importação e uma versão mascarada (`***.123.456-**`) para as telas.
- **Tokens guardados só como hash** (link de adesão e token do webhook).
- **O logger remove dados sensíveis**, tanto por nome de campo quanto por padrão: CPF, telefone, e-mail, chaves do Asaas e JWT.
- **Limite de tentativas no Postgres**, que funciona em serverless. Login: 5 erros por e-mail e IP a cada 15 minutos (o contador zera ao acertar a senha) e 30 por IP. Cadastro: 5 por IP por hora.
- **Cabeçalhos de segurança**: CSP, X-Frame-Options, HSTS, nosniff e Referrer-Policy. Contra CSRF, as Server Actions do Next já conferem a origem da requisição, e o cookie de sessão usa SameSite=Lax.
- **`cacheComponents` desligado.** No Next 16 ele é opcional, e quase todas as telas são por usuário, então o modelo clássico (renderizar a cada requisição) é mais simples.
- **Um contrato aberto por aluno e uma cobrança por competência** (`unique (contract_id, competence)`). Isso impede cobrar duas vezes o mesmo mês, mesmo se o cron rodar duas vezes.

## Para produção (anotar desde já)

- No Supabase de produção, **ligar a confirmação de e-mail**. O template do e-mail deve apontar para `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email`.
- Gerar uma `ENCRYPTION_KEY` própria de produção e guardá-la num cofre de segredos.
- Os textos de `/legal/*` são **provisórios** e precisam de revisão de um advogado.
