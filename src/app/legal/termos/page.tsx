import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/product";

export const metadata: Metadata = { title: "Termos de uso (provisório)" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de uso: {PRODUCT_NAME}</h1>
      <p>[PROVISÓRIO: rascunho para revisão jurídica.]</p>
      <h2>1. O que é o serviço</h2>
      <p>
        O {PRODUCT_NAME} é uma ferramenta para motoristas e empresas de transporte escolar organizarem a cobrança das
        mensalidades. Nós não somos uma instituição de pagamento: todo o dinheiro é movimentado pelo provedor de pagamentos
        escolhido pelo próprio motorista, na conta dele.
      </p>
      <h2>2. Responsabilidades do motorista</h2>
      <p>
        O motorista é responsável pelos dados que cadastra, pela relação com os responsáveis pelos alunos e por ter base legal
        para tratar esses dados.
      </p>
      <h2>3. Teste grátis e plano</h2>
      <p>O teste grátis dura 14 dias. Depois disso, a continuidade depende da contratação de um plano.</p>
      <h2>4. Contato</h2>
      <p>[PROVISÓRIO: incluir canal de contato oficial.]</p>
    </>
  );
}
