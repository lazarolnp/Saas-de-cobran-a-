/** Rótulos em português para os enums do banco. */
export const SHIFT_LABEL = { manha: "Manhã", tarde: "Tarde", integral: "Integral", noite: "Noite" } as const;
export const STUDENT_STATUS_LABEL = { ativo: "Ativo", pausado: "Pausado", encerrado: "Encerrado" } as const;
export const BILLING_MODE_LABEL = {
  aguardando_adesao: "Aguardando o pai autorizar",
  pix_automatico: "Pix Automático",
  pix_comum: "Pix comum",
} as const;
export const MONTHS_POLICY_LABEL = { doze: "12 meses", dez: "10 meses (sem janeiro e julho)", personalizada: "Meses escolhidos" } as const;
export const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const CHARGE_STATUS_LABEL = { agendada: "Agendada", enviada: "Em aberto", paga: "Paga", atrasada: "Atrasada", cancelada: "Cancelada" } as const;
