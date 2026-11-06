import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/product";

export const metadata: Metadata = { title: "Política de privacidade (provisório)" };

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de privacidade: {PRODUCT_NAME}</h1>
      <p>[PROVISÓRIO: rascunho para revisão jurídica. Verificar papéis de controlador e operador com um advogado.]</p>
      <h2>1. Quais dados tratamos</h2>
      <p>
        Do motorista: nome, e-mail, telefone, documento (CPF ou CNPJ) e cidade. Dos alunos: somente nome, escola, série
        (opcional), rota e turno. Não coletamos documentos nem fotos de alunos. Dos responsáveis: nome, CPF, WhatsApp e, se
        informado, e-mail.
      </p>
      <h2>2. Para que usamos</h2>
      <p>Para gerar e acompanhar as cobranças da mensalidade do transporte escolar e enviar lembretes de pagamento.</p>
      <h2>3. Com quem compartilhamos</h2>
      <p>Com o provedor de pagamentos usado pelo motorista, apenas o necessário para emitir a cobrança Pix.</p>
      <h2>4. Segurança</h2>
      <p>O CPF e as chaves de acesso são guardados criptografados. Cada motorista só acessa os próprios dados.</p>
      <h2>5. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão dos seus dados. Algumas informações de cobranças já pagas podem precisar ser
        guardadas por obrigação legal.
      </p>
      <h2>6. Contato</h2>
      <p>[PROVISÓRIO: incluir encarregado (DPO) e canal de contato.]</p>
    </>
  );
}
