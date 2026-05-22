import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { getBrand } from "@/lib/brand";

interface Props {
  clienteNome?: string;
  ticketNumero?: number;
  ticketTitulo?: string;
  diasInatividade?: number;
  ticketUrl?: string;
  marca?: string;
}

const TicketAutoClosedEmail = ({
  clienteNome,
  ticketNumero,
  ticketTitulo,
  diasInatividade,
  ticketUrl,
  marca,
}: Props) => {
  const brand = getBrand(marca);
  const numeroFmt = ticketNumero
    ? `#${String(ticketNumero).padStart(5, "0")}`
    : "#00000";
  const dias = diasInatividade ?? 7;
  const url = ticketUrl ?? brand.siteUrl;

  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>
        Ticket {numeroFmt} fechado automaticamente por inatividade
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={{ ...brandText, color: brand.color }}>{brand.emailSiteName}</Text>
          </Section>

          <Heading style={h1}>Ticket fechado por inatividade</Heading>

          <Text style={text}>
            {clienteNome ? `Olá ${clienteNome},` : "Olá,"}
          </Text>

          <Text style={text}>
            O ticket <strong>{numeroFmt}</strong>
            {ticketTitulo ? ` — “${ticketTitulo}”` : ""} encontrava-se em{" "}
            <strong>“Aguarda Cliente”</strong> há mais de{" "}
            <strong>{dias} dias</strong> sem resposta. Por esse motivo, foi
            fechado automaticamente.
          </Text>

          <Section style={ctaWrap}>
            <Link href={url} style={{ ...button, backgroundColor: brand.color }}>
              Ver ticket
            </Link>
          </Section>

          <Text style={text}>
            Se o assunto ainda não estiver resolvido, basta responder ao ticket
            ou abrir um novo pedido — teremos todo o gosto em ajudar.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Este é um email automático enviado por {brand.emailSiteName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TicketAutoClosedEmail,
  subject: (data: Record<string, any>) => {
    const n = data?.ticketNumero
      ? `#${String(data.ticketNumero).padStart(5, "0")}`
      : "";
    return `Ticket ${n} fechado por inatividade`.trim();
  },
  displayName: "Ticket fechado automaticamente",
  previewData: {
    clienteNome: "Bombeiros Montijo",
    ticketNumero: 42,
    ticketTitulo: "Impressora não imprime",
    diasInatividade: 7,
    ticketUrl: "https://tickets.vrcf.info",
    marca: "vrcf",
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
};
const container = { padding: "24px", maxWidth: "560px" };
const header = { paddingBottom: "8px" };
const brandText = {
  fontSize: "13px",
  fontWeight: 700 as const,
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
  margin: 0,
};
const h1 = {
  fontSize: "22px",
  fontWeight: 700 as const,
  color: "#0f172a",
  margin: "12px 0 18px",
};
const text = {
  fontSize: "14px",
  color: "#334155",
  lineHeight: "1.6",
  margin: "0 0 16px",
};
const ctaWrap = { margin: "24px 0" };
const button = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600 as const,
  borderRadius: "8px",
  padding: "12px 22px",
  textDecoration: "none",
  display: "inline-block",
};
const hr = {
  border: "none",
  borderTop: "1px solid #e2e8f0",
  margin: "24px 0 16px",
};
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
