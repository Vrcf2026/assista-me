import * as React from "react";
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { getBrand } from "@/lib/brand";

interface Props {
  clienteNome?: string;
  ticketNumero?: number;
  ticketTitulo?: string;
  motivoFecho?: string;
  solucaoAplicada?: string;
  ticketUrl?: string;
  marca?: string;
}

const MOTIVO_LABELS: Record<string, string> = {
  resolvido: "Resolvido",
  nao_reproduzivel: "Não reproduzível",
  duplicado: "Duplicado",
  fechado_pelo_cliente: "Fechado pelo cliente",
  inatividade: "Inatividade",
};

const TicketFechadoEmail = ({
  clienteNome, ticketNumero, ticketTitulo, motivoFecho, solucaoAplicada, ticketUrl, marca,
}: Props) => {
  const brand = getBrand(marca);
  const numeroFmt = ticketNumero ? `#${String(ticketNumero).padStart(5, "0")}` : "#00000";
  const url = ticketUrl ?? brand.siteUrl;
  const motivo = motivoFecho ? MOTIVO_LABELS[motivoFecho] ?? motivoFecho : "Resolvido";

  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Ticket {numeroFmt} fechado</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}><Text style={{ ...brandText, color: brand.color }}>{brand.emailSiteName}</Text></Section>
          <Heading style={h1}>O seu ticket foi fechado</Heading>
          <Text style={text}>{clienteNome ? `Olá ${clienteNome},` : "Olá,"}</Text>
          <Text style={text}>
            O ticket <strong>{numeroFmt}</strong>
            {ticketTitulo ? ` — “${ticketTitulo}”` : ""} foi marcado como{" "}
            <strong>{motivo}</strong>.
          </Text>
          {solucaoAplicada && (
            <Section style={{ ...quote, borderLeft: `3px solid ${brand.color}`, backgroundColor: brand.colorSoft }}>
              <Text style={{ ...quoteLabel, color: brand.color }}>Solução aplicada</Text>
              <Text style={quoteText}>{solucaoAplicada}</Text>
            </Section>
          )}
          <Section style={ctaWrap}>
            <Link href={url} style={{ ...button, backgroundColor: brand.color }}>Ver detalhe</Link>
          </Section>
          <Text style={text}>
            Se precisar de algo mais, basta abrir um novo ticket — estamos cá para ajudar.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Email automático enviado por {brand.emailSiteName}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TicketFechadoEmail,
  subject: (d: Record<string, any>) => {
    const n = d?.ticketNumero ? `#${String(d.ticketNumero).padStart(5, "0")}` : "";
    return `Ticket ${n} fechado`.trim();
  },
  displayName: "Ticket fechado",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Impressora não imprime",
    motivoFecho: "resolvido",
    solucaoAplicada: "Substituído tambor e calibrado o equipamento.",
    ticketUrl: "https://tickets.vrcf.info",
    marca: "vrcf",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = { fontSize: "13px", fontWeight: 700 as const, letterSpacing: "0.5px", textTransform: "uppercase" as const, margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 700 as const, color: "#0f172a", margin: "12px 0 18px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const quote = { padding: "8px 14px", margin: "0 0 16px" };
const quoteLabel = { fontSize: "11px", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "0 0 4px" };
const quoteText = { fontSize: "14px", color: "#475569", lineHeight: "1.6", margin: 0, whiteSpace: "pre-wrap" as const };
const ctaWrap = { margin: "24px 0" };
const button = { color: "#ffffff", fontSize: "14px", fontWeight: 600 as const, borderRadius: "8px", padding: "12px 22px", textDecoration: "none", display: "inline-block" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
