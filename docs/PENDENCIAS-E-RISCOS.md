# Pendências e riscos (atualizado na etapa 5)

## Dependem de confirmação com o Asaas

| # | Assunto | O que a documentação não diz | Como o código está hoje |
|---|---|---|---|
| A1 | **Ligar a 1ª cobrança à autorização** | A criação da autorização devolve o QR, mas não o `id` da cobrança imediata. O payload documentado de `PAYMENT_*` não traz `pixAutomaticAuthorizationId`. | A decidir na etapa 6. Hipótese: casar pelo cliente + valor + `conciliationIdentifier`. **Perguntar ao suporte do Asaas.** |
| A2 | Pix Automático no sandbox | O sandbox simula o pagamento de QR Pix comum (com duas contas de teste), mas não diz se autoriza o Pix Automático. | O fluxo completo é testado com o `MockProvider`. |
| A3 | Teto escolhido pelo pai | A resposta da autorização não traz o valor máximo que o pagador definiu. | `authorizations.max_amount_cents` fica vazio. Uma cobrança acima do teto é tratada quando a instrução for recusada. |
| A4 | Cancelar autorização ainda pendente | O `DELETE` é descrito para autorização "ativa". | D8 não precisa disso: o QR expira em 7 dias (`expirationSeconds`) e a doc diz que aí chega `REFUSED`. |
| A5 | Formato do celular em `POST /customers` | A doc não diz o formato. | Enviamos DDD + número, sem o 55. |
| A7 | Validade máxima do QR imediato | A doc não diz o máximo de `expirationSeconds`. | Usamos 7 dias (604.800 s). Se o Asaas recusar, o link cai para Pix comum. |
| A8 | Reenvio depois de falha | Não verificamos se dá para buscar cobrança por `externalReference` antes de reenviar. | Se a chamada ao provedor der certo mas o banco não salvar a resposta, o reenvio pode duplicar a cobrança no Asaas (raro). |
| A6 | Elegibilidade ao Pix Automático | Não há endpoint de consulta para a conta raiz. O evento `ELIGIBILITY_UPDATED` é "usado em operações com subcontas". | O motorista responde na tela (D2). O evento também atualiza o status, se chegar. |

## Dependem de advogado

- Termos de uso e política de privacidade (`/legal/*`) são provisórios.
- Texto de aceite e base legal na página de adesão do responsável (etapa 5).
- Papel de controlador/operador entre o motorista e o SaaS.

## Riscos técnicos

- **Perda da `ENCRYPTION_KEY`** torna ilegíveis as chaves de API e os CPFs. Guardar em cofre de segredos e ter backup.
- O estado do `MockProvider` fica em memória: serve só para desenvolvimento e testes.
- Na Vercel, o limite de tentativas depende do `x-forwarded-for` repassado pela plataforma.

## Pendências de produto (para revisar no final)

- **Importação só em CSV.** Arquivos .xlsx não são lidos: o motorista precisa salvar como CSV. A tela explica como fazer. Dá para ler .xlsx depois com uma biblioteca.
- **Assistente de onboarding em passos (7.1).** As peças já existem (cadastro, conexão, rota, alunos), mas o assistente que guia passo a passo entra na etapa 7, junto com o painel.
- **Trocar o CPF de quem paga** não é permitido na edição: é preciso encerrar o contrato e cadastrar de novo, porque o CPF fica ligado às cobranças no provedor.
- **Mesmo CPF com nomes diferentes** na planilha gera só um aviso. O sistema usa o primeiro responsável cadastrado.
- **Feriados estaduais e municipais** não entram no cálculo de dias úteis (só os nacionais e os bancários móveis). A folga de 8 dias úteis cobre esse caso.
- **Pausar, encerrar e reajuste anual (seção 6)** ainda não têm tela. Entram nas próximas etapas.
- **Texto de aceite da página pública** está marcado como PROVISÓRIO (base legal: execução de contrato, LGPD art. 7º, V). Precisa de revisão de um advogado.
