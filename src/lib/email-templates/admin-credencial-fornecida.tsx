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
  tipo?: string;
  ticketUrl?: string;
}

const AdminCredencialFornecidaEmail = ({
  clienteNome, ticketNumero, ticketTitulo, tipo, ticketUrl,
}: Props) => {
  const numeroFmt = ticketNumero ? `#${String(ticketNumero).padStart(5, "0")}` : "#00000";
  const url = ticketUrl ?? "#";
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Credencial recebida no ticket {numeroFmt}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}><Text style={brandText}>{SITE_NAME} · Admin</Text></Section>
          <Heading style={h1}>🔒 Credencial fornecida</Heading>
          <Text style={text}>
            <strong>{clienteNome ?? "Cliente"}</strong> forneceu a credencial pedida
            ({tipo ?? "outro"}) no ticket <strong>{numeroFmt}</strong>
            {ticketTitulo ? ` — "${ticketTitulo}"` : ""}.
          </Text>
          <Text style={text}>
            A password está encriptada e disponível no painel de credenciais do ticket.
            Será apagada automaticamente quando o ticket for fechado.
          </Text>
          <Section style={ctaWrap}><Link href={url} style={button}>Ver ticket</Link></Section>
          <Hr style={hr} />
          <Text style={footer}>Notificação interna · {SITE_NAME}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: AdminCredencialFornecidaEmail,
  subject: (d: Record<string, any>) => {
    const n = d?.ticketNumero ? `#${String(d.ticketNumero).padStart(5, "0")}` : "";
    return `[Admin] 🔒 Credencial fornecida em ${n}`.trim();
  },
  displayName: "Admin · Credencial fornecida",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Erro VPN",
    tipo: "vpn",
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
