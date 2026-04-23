import * as React from "react";
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

const SITE_NAME = "VRCF — Suporte Técnico";
const SITE_URL = "https://tickets.vrcf.info";
const BRAND_ORANGE = "#F97316";

interface Props {
  clienteNome?: string;
  ticketNumero?: number;
  ticketTitulo?: string;
  prioridade?: string;
  ticketUrl?: string;
}

const PRIO_LABELS: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta",
};

const TicketCriadoEmail = ({
  clienteNome, ticketNumero, ticketTitulo, prioridade, ticketUrl,
}: Props) => {
  const numeroFmt = ticketNumero ? `#${String(ticketNumero).padStart(5, "0")}` : "#00000";
  const url = ticketUrl ?? SITE_URL;
  const prio = prioridade ? PRIO_LABELS[prioridade] ?? prioridade : "—";

  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Ticket {numeroFmt} aberto — recebemos o seu pedido</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}><Text style={brandText}>{SITE_NAME}</Text></Section>
          <Heading style={h1}>Recebemos o seu pedido</Heading>
          <Text style={text}>{clienteNome ? `Olá ${clienteNome},` : "Olá,"}</Text>
          <Text style={text}>
            O seu ticket <strong>{numeroFmt}</strong>
            {ticketTitulo ? ` — “${ticketTitulo}”` : ""} foi aberto com sucesso
            (prioridade: <strong>{prio}</strong>). A nossa equipa irá analisá-lo
            o mais brevemente possível.
          </Text>
          <Section style={ctaWrap}>
            <Link href={url} style={button}>Ver ticket</Link>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>Email automático enviado por {SITE_NAME}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TicketCriadoEmail,
  subject: (d: Record<string, any>) => {
    const n = d?.ticketNumero ? `#${String(d.ticketNumero).padStart(5, "0")}` : "";
    return `Ticket ${n} aberto`.trim();
  },
  displayName: "Ticket criado",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Impressora não imprime",
    prioridade: "media",
    ticketUrl: "https://tickets.vrcf.info",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = { fontSize: "13px", fontWeight: 700 as const, color: BRAND_ORANGE, letterSpacing: "0.5px", textTransform: "uppercase" as const, margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 700 as const, color: "#0f172a", margin: "12px 0 18px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const ctaWrap = { margin: "24px 0" };
const button = { backgroundColor: BRAND_ORANGE, color: "#ffffff", fontSize: "14px", fontWeight: 600 as const, borderRadius: "8px", padding: "12px 22px", textDecoration: "none", display: "inline-block" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
