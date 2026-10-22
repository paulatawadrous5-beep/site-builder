"use client";

/**
 * Shared public renderer. Used by BOTH:
 *   - the public page /s/[slug]
 *   - the editor live preview
 * so the preview is exactly what visitors see.
 *
 * Conditional-rendering rule (strict): a section renders ONLY when it is
 * enabled AND has real content. Removed/empty/disabled sections produce
 * NO container, placeholder, blank space, or message whatsoever.
 */

import { useEffect, useRef, useState } from "react";
import type {
  CarouselSection,
  ContactAction,
  ContactSection,
  HeaderSection,
  Icon,
  IconRow,
  IconRowsSection,
  SiteConfig,
  Theme,
  VideoSection,
} from "@/lib/types";
import { digitsOnly, isValidHttpUrl, toYouTubeEmbed } from "@/lib/validate";

function themeBackground(theme: Theme): string {
  const bg = theme.background;
  if (bg.kind === "gradient" && bg.colors && bg.colors.length >= 2) {
    return `linear-gradient(${bg.direction || "180deg"}, ${bg.colors.join(", ")})`;
  }
  if (bg.kind === "gradient" && bg.colors && bg.colors.length === 1) {
    return bg.colors[0];
  }
  return bg.color || "#ffffff";
}

function iconRadius(shape: Icon["shape"], theme: Theme, radius?: number): string {
  switch (shape) {
    case "circle":
      return "50%";
    case "square":
      return "0px";
    case "rounded":
      return `${theme.radius}px`;
    case "custom":
      return `${radius ?? theme.radius}px`;
    case "unframed":
      return "0px";
  }
}

function CarouselView({ section, theme }: { section: CarouselSection; theme: Theme }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = section.images.length;
  const duration = Math.max(1000, section.durationMs || 4000);

  useEffect(() => {
    if (!section.autoplay || paused || count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), duration);
    return () => clearInterval(t);
  }, [section.autoplay, paused, count, duration]);

  const go = (n: number) => setIndex(((n % count) + count) % count);
  const fade = section.transition === "fade";

  return (
    <section
      aria-label="Promotional offers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ position: "relative", overflow: "hidden", background: theme.sectionBg, borderRadius: theme.radius }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden" }}>
        {fade ? (
          section.images.map((img, i) => (
            <div
              key={img.id}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: i === index ? 1 : 0,
                transition: "opacity 600ms ease",
                pointerEvents: i === index ? "auto" : "none",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || ""}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                draggable={false}
              />
            </div>
          ))
        ) : (
          <div
            style={{
              display: "flex",
              height: "100%",
              transform: `translateX(-${index * 100}%)`,
              transition: "transform 600ms ease",
            }}
          >
            {section.images.map((img) => (
              <div
                key={img.id}
                style={{ flex: "0 0 100%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt || ""}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {section.showArrows && count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            style={arrowStyle(theme, "left")}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            style={arrowStyle(theme, "right")}
          >
            ›
          </button>
        </>
      )}
      {section.showDots && count > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "10px 0" }}>
          {section.images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: i === index ? theme.buttonColor : theme.borderColor,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function arrowStyle(theme: Theme, side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 10,
    transform: "translateY(-50%)",
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: `1px solid ${theme.borderColor}`,
    background: theme.sectionBg,
    color: theme.textColor,
    fontSize: 24,
    lineHeight: 1,
    cursor: "pointer",
  };
}

function VideoView({ section, theme }: { section: VideoSection; theme: Theme }) {
  const url = (section.videoUrl || "").trim();
  if (!url) return null;
  const embed = section.provider === "youtube" ? toYouTubeEmbed(url) : null;
  const isHttp = isValidHttpUrl(url);
  if (section.provider === "youtube" && !embed) return null;
  if (section.provider === "upload" && !isHttp) return null;
  return (
    <section
      aria-label="Video"
      style={{
        width: "100%",
        aspectRatio: section.aspectRatio,
        background: "#000",
        borderRadius: theme.radius,
        overflow: "hidden",
      }}
    >
      {embed ? (
        <iframe
          src={embed}
          title="Video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      ) : (
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      )}
    </section>
  );
}

function IconView({ icon, theme, size }: { icon: Icon; theme: Theme; size: number }) {
  const radius = iconRadius(icon.shape, theme, icon.radius);
  const framed = icon.shape !== "unframed";
  const inner = (
    <>
      {icon.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon.imageUrl}
          alt={icon.labelEnabled && icon.label ? icon.label : ""}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            borderRadius: radius,
            background: framed ? theme.iconBg : "transparent",
            display: "block",
          }}
          draggable={false}
        />
      ) : null}
      {icon.labelEnabled && icon.label ? (
        <span style={{ fontSize: 14, textAlign: "center", color: theme.textColor, lineHeight: 1.3 }}>{icon.label}</span>
      ) : null}
    </>
  );
  const box: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  };
  if (icon.urlEnabled && icon.url && isValidHttpUrl(icon.url)) {
    return (
      <a
        href={icon.url}
        target={icon.openInNewTab ? "_blank" : undefined}
        rel={icon.openInNewTab ? "noreferrer" : undefined}
        style={{ ...box, textDecoration: "none", cursor: "pointer" }}
      >
        {inner}
      </a>
    );
  }
  // No valid URL: render as plain content, never as a broken link.
  return <div style={box}>{inner}</div>;
}

function IconRowView({ row, theme }: { row: IconRow; theme: Theme }) {
  if (row.icons.length === 0) return null;
  const columns = Math.max(1, row.columns ?? row.icons.length);
  const align = row.align ?? (row.icons.length === 1 ? "center" : "space-between");
  const justify =
    align === "left"
      ? "flex-start"
      : align === "right"
        ? "flex-end"
        : align === "center"
          ? "center"
          : "space-between";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${row.gapY ?? 16}px ${row.gapX ?? 16}px`,
        justifyItems: align === "space-between" ? "stretch" : "center",
        justifyContent: justify,
        width: row.width || "100%",
        margin: "0 auto",
      }}
    >
      {row.icons.map((icon) => {
        const size = icon.size ?? row.iconSize ?? (row.icons.length === 1 ? 160 : 96);
        return <IconView key={icon.id} icon={icon} theme={theme} size={size} />;
      })}
    </div>
  );
}

function CopyButton({ action, theme }: { action: ContactAction; theme: Theme }) {
  const [msg, setMsg] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(action.phone);
      setMsg("Copied!");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = action.phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setMsg("Copied!");
      } catch {
        setMsg("Copy failed — long-press to copy: " + action.phone);
      }
    }
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <ContactButton action={action} theme={theme} onClick={copy} />
      {msg ? <span style={{ fontSize: 12 }}>{msg}</span> : null}
    </span>
  );
}

function ContactButton({
  action,
  theme,
  onClick,
  href,
}: {
  action: ContactAction;
  theme: Theme;
  onClick?: () => void;
  href?: string;
}) {
  const bg = action.color || theme.buttonColor;
  const radius =
    action.shape === "circle" ? "50%" : action.shape === "square" ? "0px" : `${theme.radius}px`;
  const label = action.label || (action.kind === "call" ? "Call" : action.kind === "copy" ? "Copy number" : "WhatsApp");
  const inner = (
    <>
      {action.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={action.imageUrl} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
      ) : null}
      <span>{label}</span>
    </>
  );
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    minHeight: 48,
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: radius,
    cursor: "pointer",
    fontSize: 15,
    textDecoration: "none",
  };
  if (href) {
    return (
      <a href={href} target={action.kind === "whatsapp" ? "_blank" : undefined} rel="noreferrer" style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

function ContactView({ section, theme }: { section: ContactSection; theme: Theme }) {
  if (section.actions.length === 0) return null;
  return (
    <section
      aria-label={section.heading || "Contact us"}
      style={{ background: theme.sectionBg, borderRadius: theme.radius, padding: 24, textAlign: "center" }}
    >
      {section.heading ? <h2 style={{ margin: "0 0 16px", fontSize: 22 }}>{section.heading}</h2> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {section.actions.map((action) => {
          if (action.kind === "call") {
            const tel = `tel:${action.phone.replace(/[^\d+]/g, "")}`;
            return <ContactButton key={action.id} action={action} theme={theme} href={tel} />;
          }
          if (action.kind === "copy") {
            return <CopyButton key={action.id} action={action} theme={theme} />;
          }
          const digits = digitsOnly(action.phone);
          if (!digits) return null;
          const wa = `https://wa.me/${digits}${action.message ? `?text=${encodeURIComponent(action.message)}` : ""}`;
          return <ContactButton key={action.id} action={action} theme={theme} href={wa} />;
        })}
      </div>
    </section>
  );
}

export default function SiteRenderer({ config }: { config: SiteConfig }) {
  const theme = config.theme;
  const visible = config.sections.filter((s) => s.enabled);
  const spacing = theme.spacing ?? 24;

  return (
    <div
      style={{
        background: themeBackground(theme),
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        fontSize: theme.baseFontSize,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: theme.sectionWidth,
          margin: "0 auto",
          padding: `${spacing}px 16px`,
          display: "flex",
          flexDirection: "column",
          gap: spacing,
        }}
      >
        {visible.map((section) => {
          if (section.type === "header") {
            const s = section as HeaderSection;
            if (!s.imageUrl) return null;
            const justify = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
            return (
              <section
                key={s.id}
                aria-label="Business header"
                style={{ background: s.bgColor || "transparent", display: "flex", justifyContent: justify }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.imageUrl}
                  alt={s.alt || ""}
                  style={{ maxWidth: "100%", height: "auto", display: "block" }}
                />
              </section>
            );
          }
          if (section.type === "carousel") {
            const s = section as CarouselSection;
            if (s.images.length === 0) return null;
            return <CarouselView key={s.id} section={s} theme={theme} />;
          }
          if (section.type === "video") {
            const s = section as VideoSection;
            if (!s.videoUrl?.trim()) return null;
            return <VideoView key={s.id} section={s} theme={theme} />;
          }
          if (section.type === "iconRows") {
            const s = section as IconRowsSection;
            const rows = s.rows.filter((r) => r.icons.length > 0);
            if (rows.length === 0) return null;
            return (
              <section key={s.id} style={{ display: "flex", flexDirection: "column", gap: spacing }}>
                {rows.map((row: IconRow) => (
                  <IconRowView key={row.id} row={row} theme={theme} />
                ))}
              </section>
            );
          }
          if (section.type === "contact") {
            const s = section as ContactSection;
            if (s.actions.length === 0) return null;
            return <ContactView key={s.id} section={s} theme={theme} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
