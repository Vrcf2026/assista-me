import * as React from "react";
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

const SITE_NAME = "VRCF — Suporte Técnico";
const BRAND_ORANGE = "#F97316";

interface Props {
  clienteNome?: string;
  ticketNumero?: number;
  ticketTitulo?: string;
  prioridade?: string;
  ticketUrl?: string;
}

const PRIO_LABELS: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

const AdminNovoTicketEmail = ({
  clienteNome, ticketNumero, ticketTitulo, prioridade, ticketUrl,
}: Props) => {
  const numeroFmt = ticketNumero ? `#${String(ticketNumero).padStart(5, "0")}` : "#00000";
  const url = ticketUrl ?? "#";
  const prio = prioridade ? PRIO_LABELS[prioridade] ?? prioridade : "—";
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Novo ticket {numeroFmt} de {clienteNome ?? "cliente"}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}><Text style={brandText}>{SITE_NAME} · Admin</Text></Section>
          <Heading style={h1}>Novo ticket recebido</Heading>
          <Text style={text}>
            Cliente: <strong>{clienteNome ?? "—"}</strong><br />
            Ticket: <strong>{numeroFmt}</strong> {ticketTitulo ? `— "${ticketTitulo}"` : ""}<br />
            Prioridade: <strong>{prio}</strong>
          </Text>
          <Section style={ctaWrap}><Link href={url} style={button}>Abrir ticket</Link></Section>
          <Hr style={hr} />
          <Text style={footer}>Notificação interna · {SITE_NAME}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: AdminNovoTicketEmail,
  subject: (d: Record<string, any>) => {
    const n = d?.ticketNumero ? `#${String(d.ticketNumero).padStart(5, "0")}` : "";
    return `[Admin] Novo ticket ${n}`.trim();
  },
  displayName: "Admin · Novo ticket",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Impressora não imprime",
    prioridade: "alta",
    ticketUrl: "https://tickets.vrcf.info",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = { fontSize: "13px", fontWeight: 700 as const, color: BRAND_ORANGE, letterSpacing: "0.5px", textTransform: "uppercase" as const, margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 700 as const, color: "#0f172a", margin: "12px 0 18px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.7", margin: "0 0 16px" };
const ctaWrap = { margin: "24px 0" };
const button = { backgroundColor: BRAND_ORANGE, color: "#ffffff", fontSize: "14px", fontWeight: 600 as const, borderRadius: "8px", padding: "12px 22px", textDecoration: "none", display: "inline-block" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
