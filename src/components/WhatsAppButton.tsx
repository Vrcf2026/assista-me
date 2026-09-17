import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const WHATSAPP_NUMBER = "351964602891"; // número VRCF sem +
const SITE_URL = "https://tickets.vrcf.info";

interface Props {
  /** Número do ticket — pré-preenche a mensagem */
  ticketNumero?: number;
  ticketTitulo?: string;
  /** Se true, abre uma conversa nova sem contexto de ticket */
  newTicket?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function WhatsAppButton({
  ticketNumero,
  ticketTitulo,
  newTicket = false,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const message = newTicket
    ? `Olá VRCF! Preciso de suporte técnico. Podem ajudar?`
    : ticketNumero
    ? `Olá! Estou a acompanhar o ticket #${String(ticketNumero).padStart(5, "0")}${ticketTitulo ? ` — ${ticketTitulo}` : ""}. Podem ajudar?`
    : `Olá VRCF! Preciso de suporte técnico.`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  return (
    <Button
      variant={variant}
      size={size}
      className={`gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950 ${className ?? ""}`}
      onClick={() => window.open(url, "_blank", "noopener")}
    >
      {/* Ícone WhatsApp SVG (não usa emoji ou lib externa) */}
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.112 1.524 5.84L.057 23.448c-.073.28.013.577.225.773.166.153.382.232.6.232.063 0 .127-.007.188-.022l5.768-1.504A11.948 11.948 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.102-1.43l-.364-.218-3.774.985 1.003-3.67-.238-.377A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
      </svg>
      WhatsApp
    </Button>
  );
}

/** Widget flutuante para a página de cliente — botão fixo no canto */
export function WhatsAppWidget() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Olá VRCF! Preciso de suporte técnico. Podem ajudar?")}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white rounded-full px-4 py-3 shadow-lg transition-all hover:scale-105"
      title="Contactar via WhatsApp"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.112 1.524 5.84L.057 23.448c-.073.28.013.577.225.773.166.153.382.232.6.232.063 0 .127-.007.188-.022l5.768-1.504A11.948 11.948 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.102-1.43l-.364-.218-3.774.985 1.003-3.67-.238-.377A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
      </svg>
      <span className="text-sm font-medium hidden sm:block">Falar connosco</span>
    </a>
  );
}
