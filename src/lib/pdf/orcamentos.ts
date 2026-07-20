import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatCurrency } from "@/lib/format";
import {
  addHeader, getActiveBrand, getActiveLogo, getY, hexToRgb,
  infoBox, save, section, setActiveBrand,
} from "./base";

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
  await setActiveBrand(client?.marca);

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

export async function gerarOrcamentoIndependentePDF(orcamentoId: string) {
  const { data: orc, error } = await supabase
    .from("orcamentos")
    .select("*, clients(id, nome, nif, marca)")
    .eq("id", orcamentoId)
    .single();
  if (error || !orc) throw new Error(error?.message ?? "Orçamento não encontrado");
  await setActiveBrand(((orc as any).clients?.marca) ?? "vrcf");

  const { data: itens } = await supabase
    .from("orcamento_itens")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .order("ordem");

  const o = orc as any;
  const activeBrand = getActiveBrand();
  const activeLogoDataUrl = getActiveLogo();
  const cliNome = o.clients?.nome ?? o.cliente_nome ?? "—";
  const cliContacto = o.cliente_contacto ?? "";
  const cliNif = o.clients?.nif ?? o.cliente_nif ?? "";

  const doc = new jsPDF();

  // Cabeçalho claro
  let headerTextX = 14;
  if (activeLogoDataUrl) {
    try {
      doc.addImage(activeLogoDataUrl, "PNG", 14, 10, 16, 16);
      headerTextX = 34;
    } catch { /* ignore */ }
  }
  doc.setTextColor(36, 41, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(activeBrand.fullName, headerTextX, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `${activeBrand.address}  ·  NIF: ${activeBrand.nif}  ·  ${activeBrand.contactPhone}  ·  ${activeBrand.contactEmail}`,
    headerTextX, 24,
  );
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 28, 196, 28);

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
  doc.text(`IBAN: ${activeBrand.iban}`, 14, y);
  y += 6;

  const ivaIncluido = o.iva_incluido !== false;
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
    headStyles: { fillColor: hexToRgb(activeBrand.color), textColor: [255, 255, 255] },
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

  if (y > 200) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  {
    const [r, g, b] = hexToRgb(activeBrand.color);
    doc.setTextColor(r, g, b);
  }
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

  const totalPages = doc.getNumberOfPages();
  const [fr, fg, fb] = hexToRgb(activeBrand.color);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(fr, fg, fb);
    doc.line(14, 284, 196, 284);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${activeBrand.fullName} · NIF: ${activeBrand.nif} · ${activeBrand.contactPhone} · ${activeBrand.contactEmail} · Documento gerado em ${new Date().toLocaleString("pt-PT")}`,
      14, 288,
    );
    doc.text(`Página ${i} de ${totalPages}`, 196, 288, { align: "right" });
  }

  doc.save(`orcamento-ORC-${String(o.numero).padStart(5, "0")}.pdf`);
}
