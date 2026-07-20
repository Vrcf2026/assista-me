import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMinutes, formatCurrency, calcValor, TIPO_LABELS, ESTADO_LABELS } from "@/lib/format";
import { ESTADO_FATURACAO_LABELS } from "@/lib/billing";
import { addHeader, getY, infoBox, save, section, setActiveBrand } from "./base";

export async function loadTicketData(ticketId: string) {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*, client:clients(id, nome, nif, tarifa_hora, marca)")
    .eq("id", ticketId)
    .single();
  if (!ticket) throw new Error("Ticket não encontrado");

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const { data: entries } = await supabase
    .from("time_entries")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("data_trabalho", { ascending: true });

  const { data: satisfaction } = await supabase
    .from("ticket_satisfaction")
    .select("rating, comentario")
    .eq("ticket_id", ticketId)
    .not("submitted_at", "is", null)
    .maybeSingle();

  const userIds = [...new Set([...(comments ?? []).map((c) => c.user_id), ...(entries ?? []).map((e) => e.user_id)])];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id, nome, email").in("user_id", userIds)
    : { data: [] as any[] };
  const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.nome ?? p.email]));

  return { ticket, comments: comments ?? [], entries: entries ?? [], satisfaction, pmap };
}

export async function gerarRelatorioTicketCliente(ticketId: string) {
  const { ticket, comments, entries, satisfaction } = await loadTicketData(ticketId);
  await setActiveBrand(ticket.client?.marca);
  const doc = new jsPDF();
  addHeader(doc, `Relatório de Ticket #${String(ticket.numero).padStart(4, "0")}`, ticket.client?.nome ?? "");

  infoBox(doc, 32, [
    { label: "Nº ticket", value: `#${String(ticket.numero).padStart(4, "0")}` },
    { label: "Título", value: ticket.titulo },
    { label: "Data criação", value: formatDate(ticket.created_at) },
    { label: "Data resolução", value: ticket.fechado_em ? formatDate(ticket.fechado_em) : "—" },
    { label: "Tipo de intervenção", value: TIPO_LABELS[ticket.tipo_intervencao] ?? ticket.tipo_intervencao },
    { label: "Estado", value: ESTADO_LABELS[ticket.estado] ?? ticket.estado },
  ]);

  let y = section(doc, "Descrição do problema");
  const descLines = doc.splitTextToSize(ticket.descricao ?? "—", 180);
  doc.text(descLines, 14, y);
  y += descLines.length * 4 + 4;

  const resolucao = ticket.solucao_aplicada
    ?? [...comments].reverse().find((c) => !c.is_internal)?.mensagem
    ?? "—";
  y = section(doc, "Resolução", y);
  const resLines = doc.splitTextToSize(resolucao, 180);
  doc.text(resLines, 14, y);
  y += resLines.length * 4 + 4;

  const entriesPub = entries.filter((e) => !e.nao_contabilizar);
  const totalMin = entriesPub.reduce((s, e) => s + e.minutos, 0);

  autoTable(doc, {
    startY: y + 2,
    head: [["Data", "Tipo", "Duração"]],
    body: entriesPub.map((e) => [
      formatDate(e.data_trabalho),
      TIPO_LABELS[e.tipo_intervencao] ?? e.tipo_intervencao,
      formatMinutes(e.minutos),
    ]),
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 9 },
  });

  y = getY(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Tempo total: ${formatMinutes(totalMin)}`, 14, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  if (satisfaction?.rating) {
    doc.setFontSize(10);
    doc.text(`Avaliação do cliente: ${"★".repeat(satisfaction.rating)}${"☆".repeat(5 - satisfaction.rating)} ${satisfaction.rating}/5`, 14, y);
    if (satisfaction.comentario) {
      y += 5;
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(`"${satisfaction.comentario}"`, 180), 14, y);
    }
  }

  save(doc, "cliente", `ticket-${ticket.numero}-cliente.pdf`);
}

export async function gerarRelatorioTicketInterno(ticketId: string) {
  const { ticket, comments, entries, satisfaction, pmap } = await loadTicketData(ticketId);
  await setActiveBrand(ticket.client?.marca);
  const doc = new jsPDF();
  addHeader(doc, `Relatório Interno — Ticket #${String(ticket.numero).padStart(4, "0")}`, ticket.client?.nome ?? "");

  infoBox(doc, 32, [
    { label: "Nº ticket", value: `#${String(ticket.numero).padStart(4, "0")}` },
    { label: "Título", value: ticket.titulo },
    { label: "Cliente", value: ticket.client?.nome ?? "—" },
    { label: "Data criação", value: formatDate(ticket.created_at) },
    { label: "Data resolução", value: ticket.fechado_em ? formatDate(ticket.fechado_em) : "—" },
    { label: "Tipo", value: TIPO_LABELS[ticket.tipo_intervencao] ?? ticket.tipo_intervencao },
    { label: "Estado", value: ESTADO_LABELS[ticket.estado] ?? ticket.estado },
    { label: "Técnico", value: ticket.tecnico_responsavel ?? "—" },
  ]);

  let y = section(doc, "Descrição");
  const descLines = doc.splitTextToSize(ticket.descricao ?? "—", 180);
  doc.text(descLines, 14, y);
  y += descLines.length * 4 + 4;

  if (ticket.solucao_aplicada) {
    y = section(doc, "Solução aplicada", y);
    const sl = doc.splitTextToSize(ticket.solucao_aplicada, 180);
    doc.text(sl, 14, y);
    y += sl.length * 4 + 4;
  }

  y = section(doc, "Comentários", y);
  autoTable(doc, {
    startY: y,
    head: [["Data", "Utilizador", "Tipo", "Mensagem"]],
    body: comments.map((c) => [
      formatDate(c.created_at),
      pmap.get(c.user_id) ?? "—",
      c.is_internal ? "INTERNO" : "Público",
      c.mensagem,
    ]),
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: { 3: { cellWidth: 100 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && data.cell.raw === "INTERNO") {
        data.cell.styles.textColor = [200, 50, 50];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = getY(doc);
  y = section(doc, "Tempo registado & Faturação", y);
  const tarifa = Number(ticket.client?.tarifa_hora ?? 0);
  autoTable(doc, {
    startY: y,
    head: [["Data", "Técnico", "Tipo", "Minutos", "Estado fat.", "Valor"]],
    body: entries.map((e) => [
      formatDate(e.data_trabalho),
      pmap.get(e.user_id) ?? "—",
      TIPO_LABELS[e.tipo_intervencao] ?? e.tipo_intervencao,
      String(e.minutos),
      e.nao_contabilizar ? "Não contab." : (ESTADO_FATURACAO_LABELS[e.estado_faturacao] ?? e.estado_faturacao),
      e.nao_contabilizar ? "—" : formatCurrency(calcValor(e.minutos, tarifa)),
    ]),
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 8 },
  });

  const totalMin = entries.filter((e) => !e.nao_contabilizar).reduce((s, e) => s + e.minutos, 0);
  const totalValor = calcValor(totalMin, tarifa);
  y = getY(doc);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatMinutes(totalMin)} — ${formatCurrency(totalValor)} (tarifa: ${formatCurrency(tarifa)}/h)`, 14, y);
  doc.setFont("helvetica", "normal");

  if (satisfaction?.rating) {
    y += 8;
    doc.text(`Satisfação: ${satisfaction.rating}/5${satisfaction.comentario ? ` — "${satisfaction.comentario}"` : ""}`, 14, y);
  }

  save(doc, "interno", `ticket-${ticket.numero}-interno.pdf`);
}
