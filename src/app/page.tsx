import { redirect } from "next/navigation";

// O proxy manda para /entrar quem não está logado.
export default function Home() {
  redirect("/inicio");
}
