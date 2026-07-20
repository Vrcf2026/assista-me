import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BRANDS, getBrand, loadBrandLogoDataUrl, type BrandConfig } from "@/lib/brand";

export type Tipo = "cliente" | "interno";

// Marca activa partilhada por todos os módulos de PDF.
let activeBrand: BrandConfig = BRANDS.vrcf;
let activeLogoDataUrl: string | null = null;

export function getActiveBrand(): BrandConfig {
  return activeBrand;
}

export function getActiveLogo(): string | null {
  return activeLogoDataUrl;
}

export async function setActiveBrand(marca?: string | null) {
  activeBrand = getBrand(marca);
  try {
    activeLogoDataUrl = await loadBrandLogoDataUrl(activeBrand);
  } catch {
    activeLogoDataUrl = null;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function addHeader(doc: jsPDF, titulo: string, subtitulo?: string) {
  const [r, g, b] = hexToRgb(activeBrand.color);
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, 210, 25, "F");
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

export function addFooters(doc: jsPDF, tipo: Tipo) {
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

export function save(doc: jsPDF, tipo: Tipo, filename: string) {
  addFooters(doc, tipo);
  doc.save(filename);
}

export function getY(doc: jsPDF): number {
  // @ts-expect-error lastAutoTable injected
  return (doc.lastAutoTable?.finalY ?? 25) + 8;
}

export function infoBox(doc: jsPDF, y: number, rows: { label: string; value: string }[]) {
  autoTable(doc, {
    startY: y,
    body: rows.map((r) => [r.label, r.value]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold", textColor: [100, 100, 100], cellWidth: 45 } },
  });
}

export function section(doc: jsPDF, titulo: string, y?: number) {
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
