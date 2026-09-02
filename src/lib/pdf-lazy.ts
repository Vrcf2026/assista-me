/**
 * Lazy wrappers para as funções de geração de PDF.
 * O módulo @/lib/pdf (jsPDF + jspdf-autotable) só é carregado quando
 * o utilizador clica num botão de exportação — reduz o bundle inicial ~600KB.
 */

export async function gerarRelatorioTicketCliente(ticketId: string): Promise<void> {
  const { gerarRelatorioTicketCliente: fn } = await import("@/lib/pdf");
  return fn(ticketId);
}

export async function gerarRelatorioTicketInterno(ticketId: string): Promise<void> {
  const { gerarRelatorioTicketInterno: fn } = await import("@/lib/pdf");
  return fn(ticketId);
}

export async function gerarRelatorioMensalCliente(
  clientId: string,
  mes: number,
  ano: number,
): Promise<void> {
  const { gerarRelatorioMensalCliente: fn } = await import("@/lib/pdf");
  return fn(clientId, mes, ano);
}

export async function gerarRelatorioMensalInterno(mes: number, ano: number): Promise<void> {
  const { gerarRelatorioMensalInterno: fn } = await import("@/lib/pdf");
  return fn(mes, ano);
}

export async function gerarArquivoCliente(
  clientId: string,
  inicio: string,
  fim: string,
): Promise<void> {
  const { gerarArquivoCliente: fn } = await import("@/lib/pdf");
  return fn(clientId, inicio, fim);
}

export async function gerarOrcamentoPDF(orcamentoId: string): Promise<void> {
  const { gerarOrcamentoPDF: fn } = await import("@/lib/pdf");
  return fn(orcamentoId);
}

export async function gerarOrcamentoIndependentePDF(orcamentoId: string): Promise<void> {
  const { gerarOrcamentoIndependentePDF: fn } = await import("@/lib/pdf");
  return fn(orcamentoId);
}
