import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMinutes, formatCurrency, calcValor, TIPO_LABELS, ESTADO_LABELS } from "@/lib/format";
import { ESTADO_FATURACAO_LABELS } from "@/lib/billing";
import { BRANDS, getBrand, loadBrandLogoDataUrl, type BrandConfig } from "@/lib/brand";

type Tipo = "cliente" | "interno";

// Marca activa do PDF que está a ser gerado.
// Cada gerador (gerarRelatorio*, etc.) chama setActiveBrand() no início.
let activeBrand: BrandConfig = BRANDS.vrcf;
let activeLogoDataUrl: string | null = null;
async function setActiveBrand(marca?: string | null) {
  activeBrand = getBrand(marca);
  try {
    activeLogoDataUrl = await loadBrandLogoDataUrl(activeBrand);
  } catch {
    activeLogoDataUrl = null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function addHeader(doc: jsPDF, titulo: string, subtitulo?: string) {
  const [r, g, b] = hexToRgb(activeBrand.color);
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, 210, 25, "F");
  // Logo (à esquerda, dentro da barra escura)
  let textX = 14;
  if (activeLogoDataUrl) {
    try {
      doc.addImage(activeLogoDataUrl, "PNG", 14, 4, 17, 17);
      textX = 35;
    } catch { /* ignore */ }
  }
  doc.setTextColor(r, g, b);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(activeBrand.fullName, textX, 10);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(titulo, textX, 17);
  if (subtitulo) doc.text(subtitulo, textX, 22);
  doc.setTextColor(0, 0, 0);
}

function addFooters(doc: jsPDF, tipo: Tipo) {
  const [r, g, b] = hexToRgb(activeBrand.color);
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const y = 287;
    doc.setDrawColor(r, g, b);
    doc.line(14, y - 3, 196, y - 3);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(activeBrand.fullName, 14, y);
    if (tipo === "interno") {
      doc.setTextColor(200, 50, 50);
      doc.text("DOCUMENTO INTERNO — CONFIDENCIAL", 80, y);
      doc.setTextColor(120, 120, 120);
    } else {
      doc.text("Documento confidencial", 80, y);
    }
    doc.text(`Página ${i} de ${total}`, 196, y, { align: "right" });
  }
}

function save(doc: jsPDF, tipo: Tipo, filename: string) {
  addFooters(doc, tipo);
  doc.save(filename);
}


function getY(doc: jsPDF): number {
  // @ts-expect-error lastAutoTable injected
  return (doc.lastAutoTable?.finalY ?? 25) + 8;
}

function infoBox(doc: jsPDF, y: number, rows: { label: string; value: string }[]) {
  autoTable(doc, {
    startY: y,
    body: rows.map((r) => [r.label, r.value]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold", textColor: [100, 100, 100], cellWidth: 45 } },
  });
}

function section(doc: jsPDF, titulo: string, y?: number) {
  const yy = y ?? getY(doc);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(titulo, 14, yy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  return yy + 5;
}

// ============ PDF 1 + 2 — Ticket ============

async function loadTicketData(ticketId: string) {
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
  setActiveBrand(ticket.client?.marca);
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

  // Resolução: último comentário público do admin (ou solucao_aplicada)
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
  setActiveBrand(ticket.client?.marca);
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

  // Comentários
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

  // Tempo + Faturação
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

// ============ PDF 3 + 4 — Mensal ============

function monthRange(mes: number, ano: number) {
  const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

export async function gerarRelatorioMensalCliente(clientId: string, mes: number, ano: number) {
  const { inicio, fim } = monthRange(mes, ano);
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();
  if (!client) throw new Error("Cliente não encontrado");
  setActiveBrand((client as { marca?: string }).marca);

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, numero, titulo, tipo_intervencao, estado, created_at, tempo_gasto_minutos")
    .eq("client_id", clientId)
    .gte("created_at", inicio + "T00:00:00")
    .lte("created_at", fim + "T23:59:59")
    .order("numero");

  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: entries } = ticketIds.length
    ? await supabase.from("time_entries").select("ticket_id, minutos, nao_contabilizar").in("ticket_id", ticketIds)
    : { data: [] as any[] };
  const minPorTicket = new Map<string, number>();
  (entries ?? []).filter((e: any) => !e.nao_contabilizar).forEach((e: any) => {
    minPorTicket.set(e.ticket_id, (minPorTicket.get(e.ticket_id) ?? 0) + e.minutos);
  });

  const { data: prevs } = await supabase
    .from("preventiva_execucoes")
    .select("data_execucao, minutos, template:preventiva_templates(nome)")
    .eq("client_id", clientId)
    .gte("data_execucao", inicio)
    .lte("data_execucao", fim);

  const doc = new jsPDF();
  const mesNome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  addHeader(doc, "Relatório Mensal", `${client.nome} — ${mesNome}`);

  const tipoContrato = client.tipo_contrato === "avenca" ? "Avença" : "Pontual";
  infoBox(doc, 32, [
    { label: "Cliente", value: client.nome },
    { label: "Período", value: mesNome },
    { label: "Tipo de contrato", value: tipoContrato },
  ]);

  let y = getY(doc);
  if (client.tipo_contrato === "avenca" && client.horas_pacote_anual) {
    const { data: consum } = await supabase.rpc("client_horas_consumidas_anual", { _client_id: clientId });
    const usadasH = Math.round(((consum as number) ?? 0) / 60 * 10) / 10;
    const pacoteH = Number(client.horas_pacote_anual);
    const pct = Math.min(100, Math.round((usadasH / pacoteH) * 100));
    doc.setFontSize(10);
    doc.text(`Horas anuais: ${usadasH}h de ${pacoteH}h (${pct}%)`, 14, y);
    y += 3;
    doc.setFillColor(230, 230, 230);
    doc.rect(14, y, 182, 5, "F");
    doc.setFillColor(231, 119, 34);
    doc.rect(14, y, (182 * pct) / 100, 5, "F");
    y += 10;
  }

  y = section(doc, "Tickets do mês", y);
  autoTable(doc, {
    startY: y,
    head: [["#", "Data", "Título", "Tipo", "Duração", "Estado"]],
    body: (tickets ?? []).map((t) => [
      `#${String(t.numero).padStart(4, "0")}`,
      formatDate(t.created_at),
      t.titulo,
      TIPO_LABELS[t.tipo_intervencao] ?? t.tipo_intervencao,
      formatMinutes(minPorTicket.get(t.id) ?? 0),
      ESTADO_LABELS[t.estado] ?? t.estado,
    ]),
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 8 },
  });

  const totalMes = Array.from(minPorTicket.values()).reduce((s, m) => s + m, 0);
  y = getY(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total de horas no mês: ${formatMinutes(totalMes)}`, 14, y);
  doc.setFont("helvetica", "normal");
  y += 6;

  if ((prevs ?? []).length) {
    y = section(doc, "Manutenções preventivas no mês", y);
    autoTable(doc, {
      startY: y,
      head: [["Data", "Template", "Duração"]],
      body: (prevs ?? []).map((p: any) => [formatDate(p.data_execucao), p.template?.nome ?? "—", formatMinutes(p.minutos ?? 0)]),
      headStyles: { fillColor: [231, 119, 34] },
      styles: { fontSize: 9 },
    });
  }

  save(doc, "cliente", `relatorio-${client.nome}-${ano}-${String(mes).padStart(2, "0")}.pdf`);
}

export async function gerarRelatorioMensalInterno(mes: number, ano: number) {
  const { inicio, fim } = monthRange(mes, ano);
  const { data: clients } = await supabase.from("clients").select("*").order("nome");
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, numero, titulo, client_id, tipo_intervencao, estado, created_at")
    .gte("created_at", inicio + "T00:00:00")
    .lte("created_at", fim + "T23:59:59");
  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: entries } = ticketIds.length
    ? await supabase.from("time_entries").select("*").in("ticket_id", ticketIds)
    : { data: [] as any[] };

  const ticketsById = new Map((tickets ?? []).map((t) => [t.id, t]));
  const minPorCliente = new Map<string, { total: number; faturavel: number; valor: number; tickets: Set<string>; entries: any[] }>();
  (entries ?? []).forEach((e: any) => {
    const t = ticketsById.get(e.ticket_id);
    if (!t) return;
    const c = (clients ?? []).find((cc: any) => cc.id === t.client_id);
    const tarifa = Number(c?.tarifa_hora ?? 0);
    const slot = minPorCliente.get(t.client_id) ?? { total: 0, faturavel: 0, valor: 0, tickets: new Set(), entries: [] };
    slot.total += e.minutos;
    slot.tickets.add(t.id);
    slot.entries.push({ ...e, _ticket: t });
    if (!e.nao_contabilizar && e.estado_faturacao === "para_faturar") {
      slot.faturavel += e.minutos;
      slot.valor += calcValor(e.minutos, tarifa);
    }
    minPorCliente.set(t.client_id, slot);
  });

  const doc = new jsPDF();
  const mesNome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  addHeader(doc, "Relatório Mensal Interno", mesNome);

  const totalTickets = (tickets ?? []).length;
  const totalMin = (entries ?? []).reduce((s: number, e: any) => s + e.minutos, 0);
  const totalFat = Array.from(minPorCliente.values()).reduce((s, v) => s + v.faturavel, 0);
  const totalValor = Array.from(minPorCliente.values()).reduce((s, v) => s + v.valor, 0);

  let y = section(doc, "Resumo executivo", 32);
  autoTable(doc, {
    startY: y,
    body: [
      ["Total de tickets", String(totalTickets)],
      ["Total de horas", formatMinutes(totalMin)],
      ["Horas faturáveis", formatMinutes(totalFat)],
      ["Valor pendente", formatCurrency(totalValor)],
    ],
    theme: "grid",
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [240, 240, 240] } },
  });

  y = getY(doc);
  y = section(doc, "Por cliente", y);
  autoTable(doc, {
    startY: y,
    head: [["Cliente", "Tickets", "Horas", "Contrato", "Faturável", "Estado"]],
    body: (clients ?? []).map((c: any) => {
      const slot = minPorCliente.get(c.id);
      const tCount = slot?.tickets.size ?? 0;
      if (tCount === 0) return null;
      let estado = "—";
      if (c.tipo_contrato === "avenca" && c.horas_pacote_anual) {
        estado = ">80% pacote?";
      }
      return [
        c.nome,
        String(tCount),
        formatMinutes(slot?.total ?? 0),
        c.tipo_contrato,
        formatCurrency(slot?.valor ?? 0),
        estado,
      ];
    }).filter(Boolean) as any[],
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 9 },
  });

  // Página 2 — detalhe
  doc.addPage();
  addHeader(doc, "Detalhe por cliente", mesNome);
  let yy = 32;
  for (const c of clients ?? []) {
    const slot = minPorCliente.get(c.id);
    if (!slot || slot.tickets.size === 0) continue;
    if (yy > 250) { doc.addPage(); addHeader(doc, "Detalhe por cliente (cont.)", mesNome); yy = 32; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${c.nome} — ${c.tipo_contrato}`, 14, yy);
    doc.setFont("helvetica", "normal");
    yy += 3;
    const clientTickets = (tickets ?? []).filter((t) => t.client_id === c.id);
    autoTable(doc, {
      startY: yy,
      head: [["#", "Título", "Tipo", "Duração", "Estado fat."]],
      body: clientTickets.map((t) => {
        const tEntries = slot.entries.filter((e) => e.ticket_id === t.id);
        const mins = tEntries.reduce((s, e) => s + e.minutos, 0);
        const fats = [...new Set(tEntries.map((e) => e.estado_faturacao))].map((f) => ESTADO_FATURACAO_LABELS[f as string] ?? f).join(", ");
        return [`#${String(t.numero).padStart(4, "0")}`, t.titulo, TIPO_LABELS[t.tipo_intervencao], formatMinutes(mins), fats || "—"];
      }),
      headStyles: { fillColor: [231, 119, 34] },
      styles: { fontSize: 8 },
    });
    yy = getY(doc);
    doc.setFont("helvetica", "bold");
    doc.text(`Subtotal: ${formatMinutes(slot.total)} — Faturável: ${formatCurrency(slot.valor)}`, 14, yy);
    doc.setFont("helvetica", "normal");
    yy += 8;
  }

  // Página 3 — faturação pendente
  doc.addPage();
  addHeader(doc, "Faturação pendente", mesNome);
  let yp = section(doc, "Registos para faturar", 32);
  const linhas: any[] = [];
  for (const c of clients ?? []) {
    const slot = minPorCliente.get(c.id);
    if (!slot || slot.faturavel === 0) continue;
    const tarifa = Number(c.tarifa_hora ?? 0);
    linhas.push([c.nome, formatMinutes(slot.faturavel), formatCurrency(tarifa) + "/h", formatCurrency(slot.valor)]);
  }
  autoTable(doc, {
    startY: yp,
    head: [["Cliente", "Horas", "Tarifa", "Valor"]],
    body: linhas,
    headStyles: { fillColor: [231, 119, 34] },
    foot: [["", "", "TOTAL", formatCurrency(totalValor)]],
    footStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9 },
  });

  save(doc, "interno", `relatorio-mensal-interno-${ano}-${String(mes).padStart(2, "0")}.pdf`);
}

// ============ PDF 5 — Arquivo cliente ============

export async function gerarArquivoCliente(clientId: string, dataInicio: string, dataFim: string) {
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();
  if (!client) throw new Error("Cliente não encontrado");
  setActiveBrand((client as { marca?: string }).marca);

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .eq("client_id", clientId)
    .gte("created_at", dataInicio + "T00:00:00")
    .lte("created_at", dataFim + "T23:59:59")
    .order("numero");

  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: entries } = ticketIds.length
    ? await supabase.from("time_entries").select("*").in("ticket_id", ticketIds)
    : { data: [] as any[] };
  const { data: comments } = ticketIds.length
    ? await supabase.from("comments").select("*").in("ticket_id", ticketIds)
    : { data: [] as any[] };

  const { data: agendamentos } = await supabase
    .from("preventiva_agendamentos")
    .select("id, template:preventiva_templates(nome, periodicidade)")
    .eq("client_id", clientId);
  const agIds = (agendamentos ?? []).map((a: any) => a.id);
  const { data: execucoes } = agIds.length
    ? await supabase.from("preventiva_execucoes")
      .select("agendamento_id, data_execucao, minutos, estado")
      .in("agendamento_id", agIds)
      .gte("data_execucao", dataInicio).lte("data_execucao", dataFim)
    : { data: [] as any[] };

  const tarifa = Number(client.tarifa_hora ?? 0);
  const totalMin = (entries ?? []).filter((e: any) => !e.nao_contabilizar).reduce((s: number, e: any) => s + e.minutos, 0);
  const totalValor = calcValor(
    (entries ?? []).filter((e: any) => !e.nao_contabilizar && e.estado_faturacao !== "incluido_avenca").reduce((s: number, e: any) => s + e.minutos, 0),
    tarifa,
  );

  const doc = new jsPDF();
  addHeader(doc, `Arquivo Cliente`, `${client.nome} — ${formatDate(dataInicio)} a ${formatDate(dataFim)}`);

  infoBox(doc, 32, [
    { label: "Cliente", value: client.nome },
    { label: "NIF", value: client.nif ?? "—" },
    { label: "Tipo de contrato", value: client.tipo_contrato },
    { label: "Tarifa/hora", value: formatCurrency(tarifa) },
    { label: "Período", value: `${formatDate(dataInicio)} a ${formatDate(dataFim)}` },
    { label: "Total tickets", value: String((tickets ?? []).length) },
    { label: "Total horas", value: formatMinutes(totalMin) },
    { label: "Total faturado", value: formatCurrency(totalValor) },
    { label: "Total preventivas", value: String((execucoes ?? []).length) },
  ]);

  // Tickets
  doc.addPage();
  addHeader(doc, "Tickets", client.nome);
  autoTable(doc, {
    startY: 32,
    head: [["#", "Data", "Título", "Tipo", "Duração", "Estado"]],
    body: (tickets ?? []).map((t: any) => {
      const tEnts = (entries ?? []).filter((e: any) => e.ticket_id === t.id);
      const mins = tEnts.reduce((s: number, e: any) => s + e.minutos, 0);
      return [
        `#${String(t.numero).padStart(4, "0")}`,
        formatDate(t.created_at),
        t.titulo,
        TIPO_LABELS[t.tipo_intervencao],
        formatMinutes(mins),
        ESTADO_LABELS[t.estado],
      ];
    }),
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 8 },
  });

  // Detalhe ticket por ticket
  for (const t of tickets ?? []) {
    doc.addPage();
    addHeader(doc, `Ticket #${String(t.numero).padStart(4, "0")}`, t.titulo);
    let y = 32;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold"); doc.text("Descrição:", 14, y); doc.setFont("helvetica", "normal");
    y += 5;
    const dl = doc.splitTextToSize(t.descricao ?? "—", 180);
    doc.text(dl, 14, y); y += dl.length * 4 + 4;
    if (t.solucao_aplicada) {
      doc.setFont("helvetica", "bold"); doc.text("Resolução:", 14, y); doc.setFont("helvetica", "normal");
      y += 5;
      const sl = doc.splitTextToSize(t.solucao_aplicada, 180);
      doc.text(sl, 14, y); y += sl.length * 4 + 4;
    }
    const tComments = (comments ?? []).filter((c: any) => c.ticket_id === t.id);
    if (tComments.length) {
      autoTable(doc, {
        startY: y,
        head: [["Data", "Tipo", "Mensagem"]],
        body: tComments.map((c: any) => [formatDate(c.created_at), c.is_internal ? "INT" : "Pub", c.mensagem]),
        headStyles: { fillColor: [231, 119, 34] },
        styles: { fontSize: 8 },
      });
    }
  }

  // Preventivas
  if ((agendamentos ?? []).length) {
    doc.addPage();
    addHeader(doc, "Manutenções preventivas", client.nome);
    let y = 32;
    for (const a of agendamentos ?? []) {
      const aExec = (execucoes ?? []).filter((e: any) => e.agendamento_id === (a as any).id);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(`${(a as any).template?.nome ?? "—"} — ${(a as any).template?.periodicidade ?? ""}`, 14, y);
      doc.setFont("helvetica", "normal"); y += 3;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Duração", "Estado"]],
        body: aExec.map((e: any) => [formatDate(e.data_execucao), formatMinutes(e.minutos), e.estado]),
        headStyles: { fillColor: [231, 119, 34] },
        styles: { fontSize: 8 },
      });
      y = getY(doc);
    }
  }

  // Resumo financeiro
  doc.addPage();
  addHeader(doc, "Resumo financeiro", client.nome);
  autoTable(doc, {
    startY: 32,
    head: [["Métrica", "Valor"]],
    body: [
      ["Total horas registadas", formatMinutes(totalMin)],
      ["Total faturado (período)", formatCurrency(totalValor)],
      ["Tarifa horária", formatCurrency(tarifa) + "/h"],
      ["Tickets no período", String((tickets ?? []).length)],
      ["Manutenções preventivas", String((execucoes ?? []).length)],
    ],
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 10 },
  });

  save(doc, "interno", `arquivo-${client.nome}-${dataInicio}-${dataFim}.pdf`);
}

// ============ PDF — Orçamento ============
export async function gerarOrcamentoPDF(orcamentoId: string) {
  const { data: orc } = await supabase
    .from("ticket_orcamentos")
    .select("*, ticket:tickets(numero, titulo, client:clients(nome, nif, marca))")
    .eq("id", orcamentoId)
    .single();
  if (!orc) throw new Error("Orçamento não encontrado");
  const { data: itens } = await supabase
    .from("ticket_orcamento_itens")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .order("ordem");

  const ticket = (orc as any).ticket;
  const client = ticket?.client;
  setActiveBrand(client?.marca);

  const doc = new jsPDF();
  addHeader(doc, `Orçamento v${(orc as any).versao}`, `Ticket #${String(ticket?.numero ?? "").padStart(4, "0")} — ${ticket?.titulo ?? ""}`);

  let y = 32;
  infoBox(doc, y, [
    { label: "Cliente", value: client?.nome ?? "—" },
    ...(client?.nif ? [{ label: "NIF", value: client.nif }] : []),
    { label: "Data", value: formatDate((orc as any).created_at) },
    ...((orc as any).validade ? [{ label: "Válido até", value: formatDate((orc as any).validade) }] : []),
    { label: "Estado", value: ((orc as any).estado as string).toUpperCase() },
  ]);
  y = getY(doc);

  const rows = (itens ?? []).map((it: any) => [
    it.descricao,
    String(Number(it.quantidade)),
    formatCurrency(Number(it.valor_unitario)),
    formatCurrency(Number(it.quantidade) * Number(it.valor_unitario)),
  ]);
  const total = (itens ?? []).reduce((s: number, it: any) => s + Number(it.quantidade) * Number(it.valor_unitario), 0);

  autoTable(doc, {
    startY: y,
    head: [["Descrição", "Qtd", "Unit.", "Total"]],
    body: rows,
    headStyles: { fillColor: [231, 119, 34] },
    styles: { fontSize: 9 },
    columnStyles: {
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "right", cellWidth: 32, fontStyle: "bold" },
    },
  });
  y = getY(doc);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(231, 119, 34);
  doc.text(`Total: ${formatCurrency(total)}`, 196, y + 4, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  y += 14;

  if ((orc as any).notas) {
    y = section(doc, "Notas", y);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize((orc as any).notas as string, 180);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 4;
  }

  y = section(doc, "Termos", y);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("• Validade do orçamento: 15 dias a contar da data de emissão.", 14, y); y += 4;
  doc.text("• Valores apresentados com IVA incluído à taxa em vigor.", 14, y); y += 4;
  doc.text("• Pagamento na conclusão dos trabalhos.", 14, y);
  doc.setTextColor(0, 0, 0);

  save(doc, "cliente", `orcamento-${ticket?.numero ?? orcamentoId.slice(0, 6)}-v${(orc as any).versao}.pdf`);
}

// ============ PDF — Orçamento Independente ============
export async function gerarOrcamentoIndependentePDF(orcamentoId: string) {
  const { data: orc, error } = await supabase
    .from("orcamentos")
    .select("*, clients(id, nome, nif, marca)")
    .eq("id", orcamentoId)
    .single();
  if (error || !orc) throw new Error(error?.message ?? "Orçamento não encontrado");
  setActiveBrand(((orc as any).clients?.marca) ?? "vrcf");

  const { data: itens } = await supabase
    .from("orcamento_itens")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .order("ordem");

  const o = orc as any;
  const cliNome = o.clients?.nome ?? o.cliente_nome ?? "—";
  const cliContacto = o.cliente_contacto ?? "";
  const cliNif = o.clients?.nif ?? o.cliente_nif ?? "";

  const doc = new jsPDF();

  // ===== Cabeçalho (estilo claro, igual ao modelo) =====
  doc.setTextColor(36, 41, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(activeBrand.fullName, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Rua Luis Calado Nunes 15 LJ B  ·  NIF: 515237205  ·  911564243  ·  geral@vrcf.pt", 14, 24);
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 28, 196, 28);

  // ===== Título ORÇAMENTO =====
  let y = 40;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(36, 41, 61);
  doc.text("ORÇAMENTO", 14, y);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Ref.: ORC-${String(o.numero).padStart(2, "0")}`, 14, y + 6);
  doc.text(`Data: ${formatDate(o.created_at)}`, 196, y + 6, { align: "right" });
  y += 14;

  // ===== Dados do cliente =====
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text("DADOS DO CLIENTE", 14, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.setFontSize(10);
  doc.text(`Nome: ${cliNome}`, 14, y); y += 5;
  doc.text(`Contacto: ${cliContacto || "—"}`, 14, y); y += 5;
  if (cliNif) { doc.text(`NIF: ${cliNif}`, 14, y); y += 5; }
  y += 2;

  if (o.notas) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("DESCRIÇÃO", 14, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
    const lns = doc.splitTextToSize(o.notas, 180);
    doc.text(lns, 14, y);
    y += lns.length * 4 + 3;
  }

  doc.setFontSize(9);
  doc.text("IBAN: PT50 0007 0200 0000 5140 0080 2", 14, y);
  y += 6;

  // ===== Tabela de itens =====
  const ivaIncluido = o.iva_incluido !== false; // default true
  let subtotal = 0;
  let totalIva = 0;
  let total = 0;
  const rows = (itens ?? []).map((it: any, idx: number) => {
    const qtd = Number(it.quantidade);
    const vUnit = Number(it.valor_unitario);
    const taxa = Number(it.iva_taxa ?? 23) / 100;
    const bruto = qtd * vUnit;
    let liq: number;
    let iva: number;
    let linhaTotal: number;
    if (ivaIncluido) {
      liq = bruto / (1 + taxa);
      iva = bruto - liq;
      linhaTotal = bruto;
    } else {
      liq = bruto;
      iva = bruto * taxa;
      linhaTotal = bruto + iva;
    }
    subtotal += liq;
    totalIva += iva;
    total += linhaTotal;
    return [
      String(idx + 1),
      it.descricao,
      String(qtd),
      formatCurrency(vUnit),
      `${Number(it.iva_taxa ?? 23)}%`,
      formatCurrency(linhaTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Descrição", "Qtd.", "Preço Unit.", "IVA", "Total"]],
    body: rows,
    headStyles: { fillColor: [231, 119, 34], textColor: [255, 255, 255] },
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
  });
  y = getY(doc);

  // ===== Totais =====
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Subtotal:`, 150, y + 5, { align: "right" });
  doc.text(formatCurrency(subtotal), 196, y + 5, { align: "right" });
  doc.text(`IVA:`, 150, y + 10, { align: "right" });
  doc.text(formatCurrency(totalIva), 196, y + 10, { align: "right" });
  y += 14;

  doc.setFillColor(36, 41, 61);
  doc.rect(120, y, 76, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`TOTAL: ${formatCurrency(total)}`, 192, y + 8, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  y += 16;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    ivaIncluido
      ? "Valores apresentados com IVA incluído à taxa indicada por linha."
      : "Valores apresentados sem IVA. O IVA acresce à taxa indicada por linha.",
    14, y,
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  // ===== Termos e condições =====
  if (y > 200) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(231, 119, 34);
  doc.text("Termos e condições", 14, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  y += 6;

  const condPag =
    "Opção A — 10% de desconto sobre o valor total a pronto pagamento na adjudicação.\n" +
    "Opção B — 50% na adjudicação + 50% na entrega/conclusão dos trabalhos.";

  const garantia = o.tipo_cliente === "particular"
    ? "Os produtos fornecidos beneficiam de garantia legal de 3 anos (2 anos base + 1 ano adicional), nos termos do DL 84/2021."
    : "Os produtos fornecidos beneficiam de garantia legal de 6 meses, nos termos do Código Comercial.";

  const termos: [string, string][] = [
    ["1. Validade", "O presente orçamento é válido por 15 dias úteis a contar da data de emissão, salvo ruptura de stock."],
    ["2. IVA", ivaIncluido
      ? "Os valores apresentados incluem IVA à taxa indicada por linha."
      : "Aos valores apresentados acresce IVA à taxa indicada por linha."],
    ["3. Condições de pagamento", condPag],
    ["4. Garantia de produtos", garantia],
    ["5. Garantia de serviços", "A mão de obra tem garantia de 90 dias após a conclusão dos trabalhos."],
    ["6. Responsabilidade", "Não nos responsabilizamos pela perda de dados durante a intervenção. Recomendamos a realização de backup prévio."],
    ["7. RGPD", "Os dados recolhidos são tratados exclusivamente para gestão deste orçamento, nos termos do Regulamento (UE) 2016/679."],
  ];

  doc.setFontSize(8);
  for (const [titulo, texto] of termos) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text(titulo, 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(texto, 145);
    doc.text(lines, 55, y);
    y += Math.max(4, lines.length * 4) + 2;
  }

  // ===== Rodapé =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(231, 119, 34);
    doc.line(14, 284, 196, 284);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `VRCF — Informática & Segurança · NIF: 515237205 · 911564243 · geral@vrcf.pt · Documento gerado em ${new Date().toLocaleString("pt-PT")}`,
      14, 288,
    );
    doc.text(`Página ${i} de ${totalPages}`, 196, 288, { align: "right" });
  }

  doc.save(`orcamento-ORC-${String(o.numero).padStart(5, "0")}.pdf`);
}
