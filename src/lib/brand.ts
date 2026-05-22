// Configuração das marcas suportadas para comunicações com o cliente.
// Cada cliente tem um campo `marca` que controla qual destas é usada.

import vrcfLogo from "@/assets/vrcf-logo.png";
import spacedataLogo from "@/assets/spacedata-logo.png";

export type Marca = "vrcf" | "spacedata";

export interface BrandConfig {
  id: Marca;
  shortName: string;
  fullName: string;
  emailSiteName: string;
  tagline: string;
  color: string;       // cor primária (botões / texto destaque emails)
  colorSoft: string;   // fundo de citações em emails
  siteUrl: string;
  logo: string;        // import path para uso na app
  // Contactos / identidade fiscal usados em PDFs e rodapés
  contactEmail: string;
  contactPhone: string;
  nif: string;
  address: string;
  iban: string;
}

export const BRANDS: Record<Marca, BrandConfig> = {
  vrcf: {
    id: "vrcf",
    shortName: "VRCF",
    fullName: "VRCF — Informática & Segurança",
    emailSiteName: "VRCF — Suporte Técnico",
    tagline: "Informática & Segurança",
    color: "#F97316",
    colorSoft: "#fff7ed",
    siteUrl: "https://tickets.vrcf.info",
    logo: vrcfLogo,
    contactEmail: "geral@vrcf.pt",
    contactPhone: "911564243",
    nif: "515237205",
    address: "Rua Luis Calado Nunes 15 LJ B",
    iban: "PT50 0007 0200 0000 5140 0080 2",
  },
  spacedata: {
    id: "spacedata",
    shortName: "SpaceData",
    fullName: "SpaceData — Informática, Software e Serviços",
    emailSiteName: "SpaceData — Suporte Técnico",
    tagline: "Informática, Software e Serviços",
    color: "#DC2626",
    colorSoft: "#fef2f2",
    siteUrl: "https://tickets.vrcf.info",
    logo: spacedataLogo,
    contactEmail: "geral@spacedata.eu",
    contactPhone: "918527169",
    nif: "515237205",
    address: "Rua Luis Calado Nunes 15 LJ B",
    iban: "PT50 0007 0200 0000 5140 0080 2",
  },
};

export function getBrand(marca?: string | null): BrandConfig {
  if (marca === "spacedata") return BRANDS.spacedata;
  return BRANDS.vrcf;
}

export const MARCA_OPTIONS: { value: Marca; label: string }[] = [
  { value: "vrcf", label: "VRCF" },
  { value: "spacedata", label: "SpaceData" },
];

// ===== Helper para carregar logos como dataURL (uso em jsPDF) =====
const logoDataUrlCache = new Map<string, Promise<string>>();

export function loadBrandLogoDataUrl(brand: BrandConfig): Promise<string> {
  const cached = logoDataUrlCache.get(brand.id);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(brand.logo);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  })();
  logoDataUrlCache.set(brand.id, p);
  return p;
}
