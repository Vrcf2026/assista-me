// Barrel: mantém a API pública histórica de @/lib/pdf após o split em src/lib/pdf/*.
export { gerarRelatorioTicketCliente, gerarRelatorioTicketInterno } from "./pdf/tickets";
export { gerarRelatorioMensalCliente, gerarRelatorioMensalInterno, gerarArquivoCliente } from "./pdf/mensal";
export { gerarOrcamentoPDF, gerarOrcamentoIndependentePDF } from "./pdf/orcamentos";
