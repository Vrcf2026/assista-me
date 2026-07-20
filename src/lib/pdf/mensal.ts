import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMinutes, formatCurrency, calcValor, TIPO_LABELS, ESTADO_LABELS } from "@/lib/format";
import { ESTADO_FATURACAO_LABELS } from "@/lib/billing";
import { addHeader, getY, infoBox, save, section, setActiveBrand } from "./base";

function monthRange(mes: number, ano: number) {
  const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

export async function gerarRelatorioMensalCliente(clientId: string, mes: number, ano: number) {
  const { inicio, fim } = monthRange(mes, ano);
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();
  if (!client) throw new Error("Cliente não encontrado");
  await setActiveBrand((client as { marca?: string }).marca);

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

export async function gerarArquivoCliente(clientId: string, dataInicio: string, dataFim: string) {
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();
  if (!client) throw new Error("Cliente não encontrado");
  await setActiveBrand((client as { marca?: string }).marca);

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
