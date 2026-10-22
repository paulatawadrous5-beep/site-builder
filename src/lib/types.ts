/**
 * Single source of truth for the site-builder data model.
 *
 * A SiteConfig is a complete, versionable description of one client website.
 * The public renderer (components/SiteRenderer.tsx) renders ONLY from this
 * model — there are no hardcoded sections, icon counts, or layouts.
 * Every section carries a stable `id` so reordering/editing one element
 * never overwrites another.
 */

export type SiteStatus = "draft" | "published" | "archived";

export interface ThemeBackground {
  kind: "solid" | "gradient";
  /** Solid background color (hex). Used when kind === 'solid'. */
  color?: string;
  /** Gradient color stops (hex). Used when kind === 'gradient'. */
  colors?: string[];
  /** CSS gradient direction, e.g. "180deg" or "to right". */
  direction?: string;
}

export interface Theme {
  background: ThemeBackground;
  textColor: string;
  buttonColor: string;
  borderColor: string;
  sectionBg: string;
  iconBg: string;
  fontFamily: string;
  /** Base font size in px. */
  baseFontSize: number;
  /** Default border radius in px. */
  radius: number;
  /** Max content width, e.g. "720px" or "100%". */
  sectionWidth: string;
  /** Default vertical spacing between sections in px. */
  spacing: number;
}

export type SectionType = "header" | "carousel" | "video" | "iconRows" | "contact";

export interface SectionBase {
  id: string;
  type: SectionType;
  /** Disabled sections keep their config but are hidden from the public site. */
  enabled: boolean;
}

export interface HeaderSection extends SectionBase {
  type: "header";
  imageUrl?: string;
  /** Background color shown behind transparent PNGs. */
  bgColor?: string;
  alt?: string;
  align: "left" | "center" | "right";
  spacing?: number;
}

export interface CarouselImage {
  id: string;
  url: string;
  alt?: string;
}

export interface CarouselSection extends SectionBase {
  type: "carousel";
  images: CarouselImage[];
  autoplay: boolean;
  /** Slide duration in milliseconds. */
  durationMs: number;
  transition: "slide" | "fade";
  showArrows: boolean;
  showDots: boolean;
}

export interface VideoSection extends SectionBase {
  type: "video";
  videoUrl?: string;
  provider: "upload" | "youtube";
  aspectRatio: "16/9" | "9/16" | "4/3";
  spacing?: number;
}

export type IconShape = "circle" | "square" | "rounded" | "custom" | "unframed";

export interface Icon {
  id: string;
  imageUrl?: string;
  label?: string;
  labelEnabled: boolean;
  url?: string;
  urlEnabled: boolean;
  openInNewTab: boolean;
  shape: IconShape;
  /** Border radius in px, used when shape === 'custom'. */
  radius?: number;
  /** Icon image size in px (overrides the row default). */
  size?: number;
}

export interface IconRow {
  id: string;
  icons: Icon[];
  /** Grid columns; defaults to icons.length (or 1 when empty). */
  columns?: number;
  align?: "left" | "center" | "right" | "space-between";
  /** Default icon image size in px for this row. */
  iconSize?: number;
  gapX?: number;
  gapY?: number;
  /** Row width, e.g. "100%" or "720px". */
  width?: string;
}

export interface IconRowsSection extends SectionBase {
  type: "iconRows";
  rows: IconRow[];
}

export type ContactKind = "call" | "copy" | "whatsapp";

export interface ContactAction {
  id: string;
  kind: ContactKind;
  phone: string;
  label?: string;
  shape?: "circle" | "square" | "rounded";
  imageUrl?: string;
  color?: string;
  /** Optional prefilled WhatsApp message the visitor reviews before sending. */
  message?: string;
}

export interface ContactSection extends SectionBase {
  type: "contact";
  heading: string;
  actions: ContactAction[];
}

export type Section =
  | HeaderSection
  | CarouselSection
  | VideoSection
  | IconRowsSection
  | ContactSection;

export interface SiteConfig {
  id: string;
  name: string;
  slug: string;
  status: SiteStatus;
  theme: Theme;
  sections: Section[];
  createdAt: string;
  updatedAt: string;
}

/** Lightweight record kept in the sites index. */
export interface SiteSummary {
  id: string;
  name: string;
  slug: string;
  status: SiteStatus;
  updatedAt: string;
}

export function defaultTheme(): Theme {
  return {
    background: { kind: "solid", color: "#ffffff" },
    textColor: "#111827",
    buttonColor: "#2563eb",
    borderColor: "#e5e7eb",
    sectionBg: "#ffffff",
    iconBg: "#f3f4f6",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    baseFontSize: 16,
    radius: 12,
    sectionWidth: "720px",
    spacing: 24,
  };
}

export function defaultSections(): Section[] {
  return [];
}

/** A brand-new site starts with zero sections — never sample client data. */
export function newSiteConfig(
  id: string,
  name: string,
  slug: string,
  now: string,
): SiteConfig {
  return {
    id,
    name,
    slug,
    status: "draft",
    theme: defaultTheme(),
    sections: defaultSections(),
    createdAt: now,
    updatedAt: now,
  };
}
