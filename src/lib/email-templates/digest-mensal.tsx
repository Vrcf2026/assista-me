import * as React from "react";
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text, Row, Column,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { getBrand } from "@/lib/brand";

interface TicketResumo {
  numero: number;
  titulo: string;
  estado: string;
  minutos: number;
}

interface Props {
  clienteNome?: string;
  mesAno?: string;           // ex: "Agosto 2026"
  totalTickets?: number;
  ticketsResolvidos?: number;
  ticketsAbertos?: number;
  totalMinutos?: number;
  tempoMedioResolucaoHoras?: number;
  saldoHorasContrato?: number | null; // null = sem contrato de horas
  horasContratoTotal?: number | null;
  ticketsDestaque?: TicketResumo[];
  siteUrl?: string;
  marca?: string;
}

function formatMinutos(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

const ESTADO_LABELS: Record<string, string> = {
  fechado: "Resolvido",
  aberto: "Em aberto",
  em_progresso: "Em progresso",
  aguarda_cliente: "Aguarda cliente",
};

const DigestMensalEmail = ({
  clienteNome,
  mesAno = "Este mês",
  totalTickets = 0,
  ticketsResolvidos = 0,
  ticketsAbertos = 0,
  totalMinutos = 0,
  tempoMedioResolucaoHoras,
  saldoHorasContrato,
  horasContratoTotal,
  ticketsDestaque = [],
  siteUrl,
  marca,
}: Props) => {
  const brand = getBrand(marca);
  const url = siteUrl ?? brand.siteUrl;
  const temContrato = saldoHorasContrato !== null && saldoHorasContrato !== undefined;

  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Resumo de suporte — {mesAno}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Cabeçalho */}
          <Section style={header}>
            <Text style={{ ...brandText, color: brand.color }}>{brand.emailSiteName}</Text>
          </Section>

          <Heading style={h1}>Resumo de suporte — {mesAno}</Heading>

          <Text style={text}>
            {clienteNome ? `Olá ${clienteNome},` : "Olá,"} aqui fica o resumo do suporte técnico prestado durante {mesAno}.
          </Text>

          {/* Cards de métricas */}
          <Section style={metricsSection}>
            <Row>
              <Column style={metricCard}>
                <Text style={{ ...metricValue, color: brand.color }}>{totalTickets}</Text>
                <Text style={metricLabel}>Tickets abertos</Text>
              </Column>
              <Column style={metricCard}>
                <Text style={{ ...metricValue, color: "#16a34a" }}>{ticketsResolvidos}</Text>
                <Text style={metricLabel}>Resolvidos</Text>
              </Column>
              <Column style={metricCard}>
                <Text style={{ ...metricValue, color: "#0f172a" }}>{formatMinutos(totalMinutos)}</Text>
                <Text style={metricLabel}>Tempo de suporte</Text>
              </Column>
            </Row>
          </Section>

          {/* Tempo médio */}
          {tempoMedioResolucaoHoras !== undefined && tempoMedioResolucaoHoras > 0 && (
            <Section style={infoBox}>
              <Text style={infoText}>
                ⏱ Tempo médio de resolução:{" "}
                <strong>{tempoMedioResolucaoHoras.toFixed(1)}h</strong>
              </Text>
            </Section>
          )}

          {/* Saldo de contrato */}
          {temContrato && (
            <Section style={{ ...infoBox, borderColor: brand.color, backgroundColor: brand.colorSoft }}>
              <Text style={{ ...infoText, color: brand.color }}>
                📋 Contrato de horas:{" "}
                <strong>
                  {formatMinutos(Math.max(0, saldoHorasContrato! * 60))} restantes
                </strong>
                {horasContratoTotal ? ` de ${horasContratoTotal}h/mês` : ""}
              </Text>
            </Section>
          )}

          {/* Tickets em aberto */}
          {ticketsAbertos > 0 && (
            <Text style={text}>
              Tem atualmente <strong>{ticketsAbertos} ticket{ticketsAbertos !== 1 ? "s" : ""} em aberto</strong>.
              {" "}Pode acompanhar o estado em qualquer altura na plataforma.
            </Text>
          )}

          {/* Destaque de tickets */}
          {ticketsDestaque.length > 0 && (
            <>
              <Text style={{ ...sectionTitle, color: brand.color }}>Tickets do mês</Text>
              {ticketsDestaque.map((t) => (
                <Section key={t.numero} style={ticketRow}>
                  <Row>
                    <Column style={{ width: "48px" }}>
                      <Text style={ticketNumero}>#{String(t.numero).padStart(5, "0")}</Text>
                    </Column>
                    <Column>
                      <Text style={ticketTitulo}>{t.titulo}</Text>
                    </Column>
                    <Column style={{ width: "80px", textAlign: "right" as const }}>
                      <Text style={ticketEstado}>{ESTADO_LABELS[t.estado] ?? t.estado}</Text>
                      {t.minutos > 0 && (
                        <Text style={ticketTempo}>{formatMinutos(t.minutos)}</Text>
                      )}
                    </Column>
                  </Row>
                </Section>
              ))}
            </>
          )}

          {/* CTA */}
          <Section style={ctaWrap}>
            <Link href={url} style={{ ...button, backgroundColor: brand.color }}>
              Ver todos os tickets
            </Link>
          </Section>

          <Text style={text}>
            Qualquer questão, basta responder a este email ou abrir um novo ticket. Estamos sempre disponíveis.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            Email automático enviado por {brand.emailSiteName}. Relatório gerado automaticamente no início de cada mês.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: DigestMensalEmail,
  subject: (d: Record<string, any>) =>
    `Resumo de suporte — ${d?.mesAno ?? "Este mês"} | ${d?.clienteNome ?? ""}`.trim().replace(/\s*\|?\s*$/, ""),
  displayName: "Digest mensal",
  previewData: {
    clienteNome: "Bombeiros de Montijo",
    mesAno: "Agosto 2026",
    totalTickets: 8,
    ticketsResolvidos: 7,
    ticketsAbertos: 1,
    totalMinutos: 345,
    tempoMedioResolucaoHoras: 3.2,
    saldoHorasContrato: 4.25,
    horasContratoTotal: 10,
    ticketsDestaque: [
      { numero: 312, titulo: "Impressora não imprime na sala 2", estado: "fechado", minutos: 45 },
      { numero: 318, titulo: "VPN lenta após atualização", estado: "fechado", minutos: 90 },
      { numero: 321, titulo: "Email com anexo não abre", estado: "aberto", minutos: 20 },
    ],
    siteUrl: "https://tickets.vrcf.info",
    marca: "vrcf",
  },
} satisfies TemplateEntry;

// Estilos
const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = { fontSize: "13px", fontWeight: 700 as const, letterSpacing: "0.5px", textTransform: "uppercase" as const, margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 700 as const, color: "#0f172a", margin: "12px 0 18px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const metricsSection = { margin: "0 0 20px" };
const metricCard = { textAlign: "center" as const, padding: "12px 8px", backgroundColor: "#f8fafc", borderRadius: "8px" };
const metricValue = { fontSize: "28px", fontWeight: 700 as const, margin: "0 0 2px", lineHeight: "1" };
const metricLabel = { fontSize: "11px", color: "#64748b", margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.4px" };
const infoBox = { border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px", margin: "0 0 16px" };
const infoText = { fontSize: "14px", color: "#334155", margin: 0 };
const sectionTitle = { fontSize: "12px", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "20px 0 8px" };
const ticketRow = { borderBottom: "1px solid #f1f5f9", padding: "8px 0" };
const ticketNumero = { fontSize: "11px", fontFamily: "monospace", color: "#94a3b8", margin: 0 };
const ticketTitulo = { fontSize: "13px", color: "#1e293b", margin: "2px 0 0", lineHeight: "1.4" };
const ticketEstado = { fontSize: "11px", color: "#64748b", margin: 0, textAlign: "right" as const };
const ticketTempo = { fontSize: "11px", color: "#94a3b8", margin: "2px 0 0", textAlign: "right" as const };
const ctaWrap = { margin: "24px 0" };
const button = { color: "#ffffff", fontSize: "14px", fontWeight: 600 as const, borderRadius: "8px", padding: "12px 22px", textDecoration: "none", display: "inline-block" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
