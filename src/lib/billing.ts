export const TIPO_INTERVENCAO_LABELS: Record<string, string> = {
  remota: "Remota",
  presencial: "Presencial",
  preventiva: "Preventiva",
  critica: "Crítica",
};

export const TIPO_INTERVENCAO_COLORS: Record<string, string> = {
  remota: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200",
  presencial: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200",
  preventiva: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200",
  critica: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200",
};

export const ESTADO_FATURACAO_LABELS: Record<string, string> = {
  pendente: "Pendente",
  incluido_avenca: "Incluído na avença",
  para_faturar: "Para faturar",
  faturado: "Faturado",
};

export const ESTADO_FATURACAO_COLORS: Record<string, string> = {
  pendente: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-200",
  incluido_avenca: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200",
  para_faturar: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
  faturado: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200",
};
