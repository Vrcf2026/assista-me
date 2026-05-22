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
  satisfacaoUrl?: string;
  marca?: string;
}

const TicketSatisfacaoEmail = ({
  clienteNome, ticketNumero, ticketTitulo, satisfacaoUrl, marca,
}: Props) => {
  const brand = getBrand(marca);
  const numeroFmt = ticketNumero ? `#${String(ticketNumero).padStart(5, "0")}` : "#00000";
  const url = satisfacaoUrl ?? "#";
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Como avalia o atendimento do ticket {numeroFmt}?</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}><Text style={{ ...brandText, color: brand.color }}>{brand.emailSiteName}</Text></Section>
          <Heading style={h1}>A sua opinião é importante</Heading>
          <Text style={text}>{clienteNome ? `Olá ${clienteNome},` : "Olá,"}</Text>
          <Text style={text}>
            O ticket <strong>{numeroFmt}</strong>{ticketTitulo ? ` — "${ticketTitulo}"` : ""}{" "}
            foi fechado. Pode partilhar como correu o nosso atendimento?
            Demora menos de 30 segundos.
          </Text>
          <Section style={ctaWrap}><Link href={url} style={{ ...button, backgroundColor: brand.color }}>Avaliar atendimento</Link></Section>
          <Hr style={hr} />
          <Text style={footer}>Email automático enviado por {brand.emailSiteName}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TicketSatisfacaoEmail,
  subject: (d: Record<string, any>) => {
    const n = d?.ticketNumero ? `#${String(d.ticketNumero).padStart(5, "0")}` : "";
    return `Como avalia o ticket ${n}?`.trim();
  },
  displayName: "Pedido de satisfação",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Impressora não imprime",
    satisfacaoUrl: "https://tickets.vrcf.info/satisfacao/abc",
    marca: "vrcf",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = { fontSize: "13px", fontWeight: 700 as const, letterSpacing: "0.5px", textTransform: "uppercase" as const, margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 700 as const, color: "#0f172a", margin: "12px 0 18px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const ctaWrap = { margin: "24px 0" };
const button = { color: "#ffffff", fontSize: "14px", fontWeight: 600 as const, borderRadius: "8px", padding: "12px 22px", textDecoration: "none", display: "inline-block" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
