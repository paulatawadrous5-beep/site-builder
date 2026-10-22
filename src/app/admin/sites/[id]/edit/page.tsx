"use client";

/**
 * Visual editor for one site.
 *
 * Layout: top bar (back / name / slug / save state / Save / Publish /
 * Undo / Redo) + left section list + center live preview (the shared
 * <SiteRenderer/>, so preview === public page) + right properties panel
 * (selected section, plus an always-available Theme editor).
 *
 * All state lives in this page only (no localStorage for site data).
 * Every edit pushes a deep snapshot onto the undo stack; redo is cleared
 * by any new edit. Saving PUTs the whole config; publishing POSTs to
 * /publish and toggles published <-> draft.
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SiteRenderer from "@/components/SiteRenderer";
import type {
  CarouselSection,
  ContactAction,
  ContactKind,
  ContactSection,
  HeaderSection,
  Icon,
  IconRow,
  IconRowsSection,
  IconShape,
  Section,
  SectionType,
  SiteConfig,
  Theme,
  VideoSection,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
  return crypto.randomUUID();
}

const SLUG_RE = /^[a-z0-9-]+$/;

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && SLUG_RE.test(slug);
}

export function sectionLabel(type: SectionType): string {
  switch (type) {
    case "header":
      return "Header";
    case "carousel":
      return "Carousel";
    case "video":
      return "Video";
    case "iconRows":
      return "Icon rows";
    case "contact":
      return "Contact";
  }
}

function freshIcon(): Icon {
  return {
    id: newId(),
    label: "Icon",
    labelEnabled: true,
    url: "",
    urlEnabled: false,
    openInNewTab: false,
    shape: "rounded",
  };
}

function newSection(type: SectionType): Section {
  const id = newId();
  switch (type) {
    case "header":
      return { id, type, enabled: true, align: "center" };
    case "carousel":
      return {
        id,
        type,
        enabled: true,
        images: [],
        autoplay: true,
        durationMs: 4000,
        transition: "slide",
        showArrows: true,
        showDots: true,
      };
    case "video":
      return { id, type, enabled: true, provider: "upload", aspectRatio: "16/9" };
    case "iconRows":
      return {
        id,
        type,
        enabled: true,
        rows: [
          {
            id: newId(),
            icons: [freshIcon()],
            columns: 1,
            align: "center",
            iconSize: 96,
            gapX: 16,
            gapY: 16,
            width: "100%",
          },
        ],
      };
    case "contact":
      return { id, type, enabled: true, heading: "Contact us", actions: [] };
  }
}

/** Deep copy of a section with fresh ids everywhere (section + children). */
function duplicateSection(section: Section): Section {
  const copy = deepCopy(section);
  copy.id = newId();
  if (copy.type === "carousel") {
    copy.images = copy.images.map((img) => ({ ...img, id: newId() }));
  } else if (copy.type === "iconRows") {
    copy.rows = copy.rows.map((row) => ({
      ...row,
      id: newId(),
      icons: row.icons.map((icon) => ({ ...icon, id: newId() })),
    }));
  } else if (copy.type === "contact") {
    copy.actions = copy.actions.map((a) => ({ ...a, id: newId() }));
  }
  return copy;
}

function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function numOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

/* ------------------------------------------------------------------ */
/* Small form controls (module-level so inputs never lose focus)       */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-gray-600";
const btnCls =
  "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtnCls =
  "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";
const dangerBtnCls =
  "rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Txt({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className={inputCls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Num({
  value,
  onChange,
  min,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
}) {
  return (
    <input
      type="number"
      className={inputCls}
      value={value ?? ""}
      min={min}
      onChange={(e) => onChange(numOrUndefined(e.target.value))}
    />
  );
}

function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Color picker + HEX text input kept in sync. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shown = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <span className="flex items-center gap-2">
      <input
        type="color"
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pick color"
      />
      <input
        type="text"
        className={inputCls}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#ffffff"
      />
    </span>
  );
}

type UploadFn = (file: File, kind: "image" | "video") => Promise<string>;

/** Shared file-input handler: upload, then hand the URL back. */
async function handleUploadInput(
  e: React.ChangeEvent<HTMLInputElement>,
  kind: "image" | "video",
  onUpload: UploadFn,
  onUrl: (url: string) => void,
  onError: (msg: string) => void,
) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const url = await onUpload(file, kind);
    onUrl(url);
  } catch (err) {
    onError(err instanceof Error ? err.message : "Upload failed.");
  }
}

function FileField({
  label,
  accept,
  kind,
  onUpload,
  onUrl,
  onError,
  uploading,
}: {
  label: string;
  accept: string;
  kind: "image" | "video";
  onUpload: UploadFn;
  onUrl: (url: string) => void;
  onError: (msg: string) => void;
  uploading: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={uploading}
        className="mt-1 block w-full text-xs text-gray-600 file:mr-2 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-40"
        onChange={(e) => void handleUploadInput(e, kind, onUpload, onUrl, onError)}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Theme editor                                                        */
/* ------------------------------------------------------------------ */

const FONT_OPTIONS = [
  { value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", label: "System UI" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "ui-monospace, SFMono-Regular, Menlo, monospace", label: "Monospace" },
];

const DIRECTION_OPTIONS = [
  { value: "180deg", label: "To bottom (180deg)" },
  { value: "90deg", label: "To right (90deg)" },
  { value: "270deg", label: "To left (270deg)" },
  { value: "0deg", label: "To top (0deg)" },
  { value: "45deg", label: "Diagonal down-right (45deg)" },
  { value: "135deg", label: "Diagonal down-left (135deg)" },
  { value: "225deg", label: "Diagonal up-left (225deg)" },
  { value: "315deg", label: "Diagonal up-right (315deg)" },
];

function ThemeEditor({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const bg = theme.background;
  const stops = bg.kind === "gradient" ? (bg.colors ?? []) : [];
  const setBg = (patch: Partial<Theme["background"]>) =>
    onChange({ ...theme, background: { ...bg, ...patch } });

  return (
    <div className="space-y-4">
      <Field label="Background kind">
        <Sel
          value={bg.kind}
          onChange={(v) => {
            if (v === "gradient") {
              const colors =
                bg.colors && bg.colors.length >= 2
                  ? bg.colors
                  : [bg.color || "#ffffff", "#2563eb"];
              setBg({ kind: "gradient", colors, direction: bg.direction || "180deg" });
            } else {
              setBg({ kind: "solid", color: bg.colors?.[0] || bg.color || "#ffffff" });
            }
          }}
          options={[
            { value: "solid", label: "Solid color" },
            { value: "gradient", label: "Gradient" },
          ]}
        />
      </Field>

      {bg.kind === "solid" ? (
        <Field label="Background color">
          <ColorField value={bg.color || "#ffffff"} onChange={(v) => setBg({ color: v })} />
        </Field>
      ) : (
        <>
          <div className="space-y-2">
            <span className={labelCls}>Gradient stops (2 or more)</span>
            {stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <ColorField
                    value={stop}
                    onChange={(v) =>
                      setBg({ colors: stops.map((s, j) => (j === i ? v : s)) })
                    }
                  />
                </div>
                <button
                  type="button"
                  className={dangerBtnCls}
                  disabled={stops.length <= 2}
                  title={stops.length <= 2 ? "A gradient needs at least 2 stops" : "Remove stop"}
                  onClick={() => setBg({ colors: stops.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={btnCls}
              onClick={() => setBg({ colors: [...stops, stops[stops.length - 1] || "#000000"] })}
            >
              + Add stop
            </button>
          </div>
          <Field label="Gradient direction">
            <Sel
              value={bg.direction || "180deg"}
              onChange={(v) => setBg({ direction: v })}
              options={DIRECTION_OPTIONS}
            />
          </Field>
        </>
      )}

      <Field label="Text color">
        <ColorField value={theme.textColor} onChange={(v) => onChange({ ...theme, textColor: v })} />
      </Field>
      <Field label="Button color">
        <ColorField value={theme.buttonColor} onChange={(v) => onChange({ ...theme, buttonColor: v })} />
      </Field>
      <Field label="Border color">
        <ColorField value={theme.borderColor} onChange={(v) => onChange({ ...theme, borderColor: v })} />
      </Field>
      <Field label="Section background">
        <ColorField value={theme.sectionBg} onChange={(v) => onChange({ ...theme, sectionBg: v })} />
      </Field>
      <Field label="Icon background">
        <ColorField value={theme.iconBg} onChange={(v) => onChange({ ...theme, iconBg: v })} />
      </Field>
      <Field label="Font family">
        <Sel
          value={theme.fontFamily}
          onChange={(v) => onChange({ ...theme, fontFamily: v })}
          options={FONT_OPTIONS}
        />
      </Field>
      <Field label="Base font size (px)">
        <Num
          value={theme.baseFontSize}
          min={1}
          onChange={(v) => v !== undefined && onChange({ ...theme, baseFontSize: v })}
        />
      </Field>
      <Field label="Border radius (px)">
        <Num
          value={theme.radius}
          min={0}
          onChange={(v) => v !== undefined && onChange({ ...theme, radius: v })}
        />
      </Field>
      <Field label="Section width (e.g. 720px)">
        <Txt value={theme.sectionWidth} onChange={(v) => onChange({ ...theme, sectionWidth: v })} />
      </Field>
      <Field label="Spacing between sections (px)">
        <Num
          value={theme.spacing}
          min={0}
          onChange={(v) => v !== undefined && onChange({ ...theme, spacing: v })}
        />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section editors (module-level; parent passes onUpdate)              */
/* ------------------------------------------------------------------ */

type EditorProps<S extends Section> = {
  section: S;
  onUpdate: (next: S) => void;
  onUpload: UploadFn;
  onError: (msg: string) => void;
  uploading: boolean;
  themeButtonColor: string;
};

function HeaderEditor({ section, onUpdate, onUpload, onError, uploading }: EditorProps<HeaderSection>) {
  return (
    <div className="space-y-4">
      {section.imageUrl ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={section.imageUrl} alt={section.alt || ""} className="max-h-40 max-w-full rounded border border-gray-200 object-contain" />
          <p className="mt-1 break-all text-xs text-gray-500">{section.imageUrl}</p>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          No header image yet — a header section renders only once an image is set.
        </p>
      )}
      <FileField
        label={section.imageUrl ? "Replace image (PNG/JPG, max 10MB)" : "Upload image (PNG/JPG, max 10MB)"}
        accept="image/png,image/jpeg,image/jpg"
        kind="image"
        onUpload={onUpload}
        onUrl={(url) => onUpdate({ ...section, imageUrl: url })}
        onError={onError}
        uploading={uploading}
      />
      {section.imageUrl ? (
        <button type="button" className={dangerBtnCls} onClick={() => onUpdate({ ...section, imageUrl: undefined })}>
          Remove image
        </button>
      ) : null}
      <Field label="Background color (behind transparent PNGs)">
        <ColorField
          value={section.bgColor || "#ffffff"}
          onChange={(v) => onUpdate({ ...section, bgColor: v })}
        />
      </Field>
      <Field label="Alt text">
        <Txt value={section.alt || ""} onChange={(v) => onUpdate({ ...section, alt: v })} placeholder="Describe the image" />
      </Field>
      <Field label="Alignment">
        <Sel
          value={section.align}
          onChange={(v) => onUpdate({ ...section, align: v as HeaderSection["align"] })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </Field>
    </div>
  );
}

function CarouselEditor({ section, onUpdate, onUpload, onError, uploading }: EditorProps<CarouselSection>) {
  return (
    <div className="space-y-4">
      {section.images.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          No images yet — a carousel renders only once at least one image is added.
        </p>
      ) : null}
      <div className="space-y-3">
        {section.images.map((img, i) => (
          <div key={img.id} className="rounded-md border border-gray-200 p-2">
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || ""} className="h-14 w-20 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <Field label="Alt text">
                  <Txt
                    value={img.alt || ""}
                    onChange={(v) =>
                      onUpdate({
                        ...section,
                        images: section.images.map((x) => (x.id === img.id ? { ...x, alt: v } : x)),
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btnCls}
                disabled={i === 0}
                onClick={() =>
                  onUpdate({ ...section, images: moveInList(section.images, i, -1) })
                }
              >
                ↑ Move up
              </button>
              <button
                type="button"
                className={btnCls}
                disabled={i === section.images.length - 1}
                onClick={() =>
                  onUpdate({ ...section, images: moveInList(section.images, i, 1) })
                }
              >
                ↓ Move down
              </button>
              <button
                type="button"
                className={dangerBtnCls}
                onClick={() =>
                  onUpdate({ ...section, images: section.images.filter((x) => x.id !== img.id) })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <FileField
        label="Add image (PNG/JPG, max 10MB)"
        accept="image/png,image/jpeg,image/jpg"
        kind="image"
        onUpload={onUpload}
        onUrl={(url) =>
          onUpdate({ ...section, images: [...section.images, { id: newId(), url }] })
        }
        onError={onError}
        uploading={uploading}
      />
      <Check checked={section.autoplay} onChange={(v) => onUpdate({ ...section, autoplay: v })} label="Autoplay" />
      <Field label="Slide duration (ms)">
        <Num
          value={section.durationMs}
          min={1000}
          onChange={(v) => v !== undefined && onUpdate({ ...section, durationMs: v })}
        />
      </Field>
      <Field label="Transition">
        <Sel
          value={section.transition}
          onChange={(v) => onUpdate({ ...section, transition: v as CarouselSection["transition"] })}
          options={[
            { value: "slide", label: "Slide" },
            { value: "fade", label: "Fade" },
          ]}
        />
      </Field>
      <Check checked={section.showArrows} onChange={(v) => onUpdate({ ...section, showArrows: v })} label="Show arrows" />
      <Check checked={section.showDots} onChange={(v) => onUpdate({ ...section, showDots: v })} label="Show dots" />
    </div>
  );
}

function VideoEditor({ section, onUpdate, onUpload, onError, uploading }: EditorProps<VideoSection>) {
  return (
    <div className="space-y-4">
      <Field label="Provider">
        <Sel
          value={section.provider}
          onChange={(v) => onUpdate({ ...section, provider: v as VideoSection["provider"] })}
          options={[
            { value: "upload", label: "Upload (mp4/webm/mov)" },
            { value: "youtube", label: "YouTube" },
          ]}
        />
      </Field>
      {section.provider === "upload" ? (
        <FileField
          label="Upload video (MP4/WebM/MOV, max 100MB)"
          accept="video/mp4,video/webm,video/quicktime"
          kind="video"
          onUpload={onUpload}
          onUrl={(url) => onUpdate({ ...section, videoUrl: url })}
          onError={onError}
          uploading={uploading}
        />
      ) : (
        <Field label="YouTube URL">
          <Txt
            value={section.videoUrl || ""}
            onChange={(v) => onUpdate({ ...section, videoUrl: v })}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </Field>
      )}
      {section.videoUrl ? (
        <div>
          <p className="break-all text-xs text-gray-500">{section.videoUrl}</p>
          <button
            type="button"
            className={`${dangerBtnCls} mt-2`}
            onClick={() => onUpdate({ ...section, videoUrl: undefined })}
          >
            Remove video
          </button>
        </div>
      ) : null}
      <Field label="Aspect ratio">
        <Sel
          value={section.aspectRatio}
          onChange={(v) => onUpdate({ ...section, aspectRatio: v as VideoSection["aspectRatio"] })}
          options={[
            { value: "16/9", label: "16:9 (landscape)" },
            { value: "9/16", label: "9:16 (vertical)" },
            { value: "4/3", label: "4:3" },
          ]}
        />
      </Field>
      <p className="rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
        Note: a video section renders only when a valid URL is set.
      </p>
    </div>
  );
}

function IconRowsEditor({ section, onUpdate, onUpload, onError, uploading }: EditorProps<IconRowsSection>) {
  const updateRow = (rowId: string, next: IconRow) =>
    onUpdate({ ...section, rows: section.rows.map((r) => (r.id === rowId ? next : r)) });
  const updateIcon = (rowId: string, iconId: string, next: Icon) => {
    const row = section.rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, { ...row, icons: row.icons.map((ic) => (ic.id === iconId ? next : ic)) });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        className={primaryBtnCls}
        onClick={() =>
          onUpdate({
            ...section,
            rows: [
              ...section.rows,
              {
                id: newId(),
                icons: [freshIcon()],
                columns: 1,
                align: "center",
                iconSize: 96,
                gapX: 16,
                gapY: 16,
                width: "100%",
              },
            ],
          })
        }
      >
        + Add row
      </button>

      {section.rows.map((row, ri) => (
        <div key={row.id} className="space-y-3 rounded-md border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800">Row {ri + 1}</h4>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btnCls} disabled={ri === 0} onClick={() => onUpdate({ ...section, rows: moveInList(section.rows, ri, -1) })}>
                ↑ Up
              </button>
              <button type="button" className={btnCls} disabled={ri === section.rows.length - 1} onClick={() => onUpdate({ ...section, rows: moveInList(section.rows, ri, 1) })}>
                ↓ Down
              </button>
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  const copy = deepCopy(row);
                  copy.id = newId();
                  copy.icons = copy.icons.map((ic) => ({ ...ic, id: newId() }));
                  const next = [...section.rows];
                  next.splice(ri + 1, 0, copy);
                  onUpdate({ ...section, rows: next });
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className={dangerBtnCls}
                onClick={() => {
                  if (window.confirm("Delete this row and all its icons?")) {
                    onUpdate({ ...section, rows: section.rows.filter((r) => r.id !== row.id) });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Columns">
              <Num value={row.columns} min={1} onChange={(v) => updateRow(row.id, { ...row, columns: v })} />
            </Field>
            <Field label="Icon size (px)">
              <Num value={row.iconSize} min={1} onChange={(v) => updateRow(row.id, { ...row, iconSize: v })} />
            </Field>
            <Field label="Gap X (px)">
              <Num value={row.gapX} min={0} onChange={(v) => updateRow(row.id, { ...row, gapX: v })} />
            </Field>
            <Field label="Gap Y (px)">
              <Num value={row.gapY} min={0} onChange={(v) => updateRow(row.id, { ...row, gapY: v })} />
            </Field>
          </div>
          <Field label="Alignment">
            <Sel
              value={row.align || "center"}
              onChange={(v) => updateRow(row.id, { ...row, align: v as IconRow["align"] })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
                { value: "space-between", label: "Space between" },
              ]}
            />
          </Field>
          <Field label="Width (e.g. 100% or 720px)">
            <Txt value={row.width || ""} onChange={(v) => updateRow(row.id, { ...row, width: v || undefined })} placeholder="100%" />
          </Field>

          <div className="space-y-3 border-t border-gray-100 pt-3">
            {row.icons.map((icon) => (
              <div key={icon.id} className="space-y-2 rounded-md bg-gray-50 p-2.5">
                <div className="flex items-center gap-2">
                  {icon.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon.imageUrl} alt={icon.label || ""} className="h-12 w-12 rounded object-contain bg-white border border-gray-200" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-400">
                      No image
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <FileField
                      label={icon.imageUrl ? "Replace image" : "Upload image (PNG/JPG, max 10MB)"}
                      accept="image/png,image/jpeg,image/jpg"
                      kind="image"
                      onUpload={onUpload}
                      onUrl={(url) => updateIcon(row.id, icon.id, { ...icon, imageUrl: url })}
                      onError={onError}
                      uploading={uploading}
                    />
                  </div>
                </div>
                {icon.imageUrl ? (
                  <button type="button" className={dangerBtnCls} onClick={() => updateIcon(row.id, icon.id, { ...icon, imageUrl: undefined })}>
                    Remove image
                  </button>
                ) : null}
                <Field label="Label">
                  <Txt value={icon.label || ""} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, label: v })} />
                </Field>
                <Check checked={icon.labelEnabled} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, labelEnabled: v })} label="Show label" />
                <Field label="Link URL">
                  <Txt value={icon.url || ""} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, url: v })} placeholder="https://…" />
                </Field>
                <Check checked={icon.urlEnabled} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, urlEnabled: v })} label="Link enabled" />
                <Check checked={icon.openInNewTab} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, openInNewTab: v })} label="Open link in new tab" />
                <Field label="Shape">
                  <Sel
                    value={icon.shape}
                    onChange={(v) => updateIcon(row.id, icon.id, { ...icon, shape: v as IconShape })}
                    options={[
                      { value: "circle", label: "Circle" },
                      { value: "square", label: "Square" },
                      { value: "rounded", label: "Rounded" },
                      { value: "custom", label: "Custom radius" },
                      { value: "unframed", label: "Unframed" },
                    ]}
                  />
                </Field>
                {icon.shape === "custom" ? (
                  <Field label="Custom radius (px)">
                    <Num value={icon.radius} min={0} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, radius: v })} />
                  </Field>
                ) : null}
                <Field label="Icon size override (px, blank = row default)">
                  <Num value={icon.size} min={1} onChange={(v) => updateIcon(row.id, icon.id, { ...icon, size: v })} />
                </Field>
                <button
                  type="button"
                  className={dangerBtnCls}
                  onClick={() =>
                    updateRow(row.id, { ...row, icons: row.icons.filter((ic) => ic.id !== icon.id) })
                  }
                >
                  Remove icon
                </button>
              </div>
            ))}
            <button type="button" className={btnCls} onClick={() => updateRow(row.id, { ...row, icons: [...row.icons, freshIcon()] })}>
              + Add icon
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactEditor({ section, onUpdate, onUpload, onError, uploading, themeButtonColor }: EditorProps<ContactSection>) {
  const updateAction = (actionId: string, next: ContactAction) =>
    onUpdate({ ...section, actions: section.actions.map((a) => (a.id === actionId ? next : a)) });

  return (
    <div className="space-y-4">
      <Field label="Heading">
        <Txt value={section.heading} onChange={(v) => onUpdate({ ...section, heading: v })} placeholder="Contact us" />
      </Field>

      <div className="space-y-3">
        {section.actions.map((action, i) => (
          <div key={action.id} className="space-y-2 rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold capitalize text-gray-800">
                {action.kind === "call" ? "Call" : action.kind === "copy" ? "Copy number" : "WhatsApp"}
              </span>
              <div className="flex gap-1.5">
                <button type="button" className={btnCls} disabled={i === 0} onClick={() => onUpdate({ ...section, actions: moveInList(section.actions, i, -1) })}>
                  ↑ Up
                </button>
                <button type="button" className={btnCls} disabled={i === section.actions.length - 1} onClick={() => onUpdate({ ...section, actions: moveInList(section.actions, i, 1) })}>
                  ↓ Down
                </button>
                <button
                  type="button"
                  className={dangerBtnCls}
                  onClick={() => {
                    if (window.confirm("Delete this contact action?")) {
                      onUpdate({ ...section, actions: section.actions.filter((a) => a.id !== action.id) });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            <Field label="Kind">
              <Sel
                value={action.kind}
                onChange={(v) => updateAction(action.id, { ...action, kind: v as ContactKind })}
                options={[
                  { value: "call", label: "Call" },
                  { value: "copy", label: "Copy number" },
                  { value: "whatsapp", label: "WhatsApp" },
                ]}
              />
            </Field>
            <Field label="Phone">
              <Txt value={action.phone} onChange={(v) => updateAction(action.id, { ...action, phone: v })} placeholder="+1 555 123 4567" />
            </Field>
            <Field label="Label (blank = default for the kind)">
              <Txt value={action.label || ""} onChange={(v) => updateAction(action.id, { ...action, label: v || undefined })} />
            </Field>
            <Field label="Shape">
              <Sel
                value={action.shape || "rounded"}
                onChange={(v) => updateAction(action.id, { ...action, shape: v as ContactAction["shape"] })}
                options={[
                  { value: "circle", label: "Circle" },
                  { value: "square", label: "Square" },
                  { value: "rounded", label: "Rounded" },
                ]}
              />
            </Field>
            <Field label="Button color (blank = theme button color)">
              <ColorField
                value={action.color || themeButtonColor}
                onChange={(v) => updateAction(action.id, { ...action, color: v })}
              />
            </Field>
            {action.kind === "whatsapp" ? (
              <Field label="Prefilled WhatsApp message">
                <Txt value={action.message || ""} onChange={(v) => updateAction(action.id, { ...action, message: v || undefined })} placeholder="Hi, I'd like to know more…" />
              </Field>
            ) : null}
            {action.imageUrl ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={action.imageUrl} alt="" className="h-10 w-10 rounded object-contain border border-gray-200 bg-white" />
              </div>
            ) : null}
            <FileField
              label={action.imageUrl ? "Replace button icon" : "Upload button icon (PNG/JPG, max 10MB)"}
              accept="image/png,image/jpeg,image/jpg"
              kind="image"
              onUpload={onUpload}
              onUrl={(url) => updateAction(action.id, { ...action, imageUrl: url })}
              onError={onError}
              uploading={uploading}
            />
            {action.imageUrl ? (
              <button type="button" className={dangerBtnCls} onClick={() => updateAction(action.id, { ...action, imageUrl: undefined })}>
                Remove image
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["call", "copy", "whatsapp"] as ContactKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className={btnCls}
            onClick={() =>
              onUpdate({
                ...section,
                actions: [
                  ...section.actions,
                  {
                    id: newId(),
                    kind,
                    phone: "",
                    label: kind === "call" ? "Call" : kind === "copy" ? "Copy number" : "WhatsApp",
                    shape: "rounded",
                  },
                ],
              })
            }
          >
            + Add {kind === "call" ? "call" : kind === "copy" ? "copy" : "WhatsApp"} action
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type PreviewSize = "desktop" | "tablet" | "mobile";
type RightTab = "section" | "theme";

const ADD_TYPES: SectionType[] = ["header", "carousel", "video", "iconRows", "contact"];

export default function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("section");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const configRef = useRef<SiteConfig | null>(null);
  const lastSavedRef = useRef<SiteConfig | null>(null);
  const undoRef = useRef<SiteConfig[]>([]);
  const redoRef = useRef<SiteConfig[]>([]);
  // Bumped whenever the undo/redo stacks change so their buttons re-render.
  const [, setHistTick] = useState(0);

  const setConfigBoth = useCallback((next: SiteConfig | null) => {
    configRef.current = next;
    setConfig(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/sites/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || `Failed to load site (${res.status}).`,
        );
      }
      const data = (await res.json()) as SiteConfig;
      setConfigBoth(data);
      lastSavedRef.current = data;
      undoRef.current = [];
      redoRef.current = [];
      setHistTick((t) => t + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load site.");
    } finally {
      setLoading(false);
    }
  }, [id, setConfigBoth]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Apply an edit: snapshot current config for undo, clear redo. */
  const updateConfig = useCallback(
    (fn: (c: SiteConfig) => SiteConfig) => {
      const cur = configRef.current;
      if (!cur) return;
      undoRef.current = [...undoRef.current, deepCopy(cur)];
      redoRef.current = [];
      setHistTick((t) => t + 1);
      setConfigBoth(fn(deepCopy(cur)));
    },
    [setConfigBoth],
  );

  const undo = useCallback(() => {
    const cur = configRef.current;
    const prev = undoRef.current[undoRef.current.length - 1];
    if (!cur || !prev) return;
    redoRef.current = [...redoRef.current, deepCopy(cur)];
    undoRef.current = undoRef.current.slice(0, -1);
    setHistTick((t) => t + 1);
    setConfigBoth(deepCopy(prev));
  }, [setConfigBoth]);

  const redo = useCallback(() => {
    const cur = configRef.current;
    const next = redoRef.current[redoRef.current.length - 1];
    if (!cur || !next) return;
    undoRef.current = [...undoRef.current, deepCopy(cur)];
    redoRef.current = redoRef.current.slice(0, -1);
    setHistTick((t) => t + 1);
    setConfigBoth(deepCopy(next));
  }, [setConfigBoth]);

  const updateSection = useCallback(
    (next: Section) => {
      updateConfig((c) => ({
        ...c,
        sections: c.sections.map((s) => (s.id === next.id ? next : s)),
      }));
    },
    [updateConfig],
  );

  const upload: UploadFn = useCallback(
    async (file, kind) => {
      const site = configRef.current;
      if (!site) throw new Error("Site is not loaded yet.");
      setUploading(true);
      try {
        const form = new FormData();
        form.append("siteId", site.id);
        form.append("kind", kind);
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((body as { error?: string }).error || `Upload failed (${res.status}).`);
        }
        const url = (body as { url?: string }).url;
        if (!url) throw new Error("Upload succeeded but returned no URL.");
        return url;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const save = useCallback(async () => {
    const cur = configRef.current;
    if (!cur || saving) return;
    if (!isValidSlug(cur.slug)) {
      setError("Slug must use lowercase letters, numbers, and hyphens only.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${cur.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cur.name,
          slug: cur.slug,
          theme: cur.theme,
          sections: cur.sections,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) throw new Error("That slug is already taken.");
        throw new Error((body as { error?: string }).error || `Save failed (${res.status}).`);
      }
      const data = body as SiteConfig;
      setConfigBoth(data);
      lastSavedRef.current = data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [saving, setConfigBoth]);

  const togglePublish = useCallback(async () => {
    const cur = configRef.current;
    if (!cur || publishing) return;
    const target = cur.status === "published" ? "draft" : "published";
    setError(null);
    setPublishing(true);
    try {
      const res = await fetch(`/api/sites/${cur.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `Publish failed (${res.status}).`);
      }
      const data = body as SiteConfig;
      setConfigBoth(data);
      lastSavedRef.current = data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }, [publishing, setConfigBoth]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-600">Loading site…</p>
      </main>
    );
  }

  if (loadError || !config) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-4">
        <p className="text-sm text-red-600">{loadError || "Site not found."}</p>
        <div className="flex gap-2">
          <button type="button" className={primaryBtnCls} onClick={() => void load()}>
            Retry
          </button>
          <Link href="/admin" className={btnCls}>
            ← Back to sites
          </Link>
        </div>
      </main>
    );
  }

  const dirty =
    lastSavedRef.current !== null &&
    JSON.stringify(config) !== JSON.stringify(lastSavedRef.current);
  const statusText = saving
    ? "Saving…"
    : publishing
      ? "Saving…"
      : error
        ? "Error"
        : dirty
          ? "Unsaved changes"
          : config.status === "published"
            ? "Published"
            : "Saved";
  const slugValid = isValidSlug(config.slug);
  const selected = config.sections.find((s) => s.id === selectedId) ?? null;
  const previewWidth =
    previewSize === "desktop" ? "100%" : previewSize === "tablet" ? "768px" : "375px";
  const visibleCount = config.sections.filter((s) => s.enabled).length;

  const addSection = (type: SectionType) => {
    const section = newSection(type);
    updateConfig((c) => ({ ...c, sections: [...c.sections, section] }));
    setSelectedId(section.id);
    setRightTab("section");
  };

  const dropReorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    updateConfig((c) => {
      const from = c.sections.findIndex((s) => s.id === dragId);
      const to = c.sections.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return c;
      const sections = [...c.sections];
      const [moved] = sections.splice(from, 1);
      sections.splice(to, 0, moved);
      return { ...c, sections };
    });
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <Link href="/admin" className="text-sm font-medium text-blue-600 hover:underline">
          ← Sites
        </Link>
        <input
          type="text"
          aria-label="Site name"
          className="min-w-[140px] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold focus:border-blue-500 focus:outline-none sm:flex-none sm:w-56"
          value={config.name}
          placeholder="Site name"
          onChange={(e) => updateConfig((c) => ({ ...c, name: e.target.value }))}
        />
        <div className="flex items-center gap-1">
          <span className="hidden text-xs text-gray-400 sm:inline">/</span>
          <input
            type="text"
            aria-label="Site slug"
            className={`w-44 rounded-md border px-2 py-1.5 font-mono text-sm focus:outline-none ${
              slugValid ? "border-gray-300 focus:border-blue-500" : "border-red-400 focus:border-red-500"
            }`}
            value={config.slug}
            spellCheck={false}
            placeholder="site-slug"
            onChange={(e) => updateConfig((c) => ({ ...c, slug: e.target.value }))}
          />
        </div>
        {!slugValid ? (
          <span className="text-xs text-red-600">Slug must use lowercase letters, numbers, and hyphens only.</span>
        ) : null}
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            statusText === "Error"
              ? "bg-red-100 text-red-700"
              : statusText === "Published"
                ? "bg-green-100 text-green-700"
                : statusText === "Saving…"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-700"
          }`}
        >
          {statusText}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize text-gray-600">
          {config.status}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className={btnCls} disabled={undoRef.current.length === 0} onClick={undo} title="Undo last edit">
            ↩ Undo
          </button>
          <button type="button" className={btnCls} disabled={redoRef.current.length === 0} onClick={redo} title="Redo undone edit">
            ↪ Redo
          </button>
          <button type="button" className={primaryBtnCls} disabled={saving || !slugValid} onClick={() => void save()}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className={btnCls}
            disabled={publishing}
            onClick={() => void togglePublish()}
          >
            {publishing ? "Working…" : config.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {uploading ? (
        <div className="border-b border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Uploading…
        </div>
      ) : null}

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left panel */}
        <aside className="w-full shrink-0 border-b border-gray-200 bg-white p-3 lg:sticky lg:top-[53px] lg:max-h-[calc(100vh-53px)] lg:w-72 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <h2 className="text-sm font-semibold">Add section</h2>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {ADD_TYPES.map((type) => (
              <button key={type} type="button" className={`${btnCls} text-left`} onClick={() => addSection(type)}>
                + {sectionLabel(type)}
              </button>
            ))}
          </div>

          <h2 className="mt-5 text-sm font-semibold">
            Sections ({config.sections.length})
          </h2>
          {config.sections.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              No sections yet. Add one above — it appears at the end of the list and in the preview.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {config.sections.map((section, i) => {
                const isSelected = section.id === selectedId;
                return (
                  <li
                    key={section.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(section.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverId(section.id);
                    }}
                    onDragLeave={() => setDragOverId((cur) => (cur === section.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropReorder(section.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    className={`cursor-grab rounded-md border p-2 ${
                      isSelected
                        ? "border-blue-400 bg-blue-50"
                        : dragOverId === section.id
                          ? "border-dashed border-blue-400 bg-blue-50/50"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => {
                        setSelectedId(section.id);
                        setRightTab("section");
                      }}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-gray-400" title="Drag to reorder">⠿</span>
                        {sectionLabel(section.type)}
                        {!section.enabled ? (
                          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                            Disabled
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {section.type === "carousel"
                          ? `${section.images.length} image${section.images.length === 1 ? "" : "s"}`
                          : section.type === "iconRows"
                            ? `${section.rows.length} row${section.rows.length === 1 ? "" : "s"}`
                            : section.type === "contact"
                              ? `${section.actions.length} action${section.actions.length === 1 ? "" : "s"}`
                              : section.type === "video"
                                ? section.videoUrl
                                  ? "Video set"
                                  : "No video yet"
                                : section.imageUrl
                                  ? "Image set"
                                  : "No image yet"}
                      </span>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={(e) =>
                            updateSection({ ...section, enabled: e.target.checked })
                          }
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        className={btnCls}
                        disabled={i === 0}
                        onClick={() =>
                          updateConfig((c) => ({ ...c, sections: moveInList(c.sections, i, -1) }))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={btnCls}
                        disabled={i === config.sections.length - 1}
                        onClick={() =>
                          updateConfig((c) => ({ ...c, sections: moveInList(c.sections, i, 1) }))
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={btnCls}
                        onClick={() => {
                          const copy = duplicateSection(section);
                          updateConfig((c) => {
                            const next = [...c.sections];
                            next.splice(i + 1, 0, copy);
                            return { ...c, sections: next };
                          });
                          setSelectedId(copy.id);
                          setRightTab("section");
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className={dangerBtnCls}
                        onClick={() => {
                          if (window.confirm(`Delete this ${sectionLabel(section.type)} section?`)) {
                            updateConfig((c) => ({
                              ...c,
                              sections: c.sections.filter((s) => s.id !== section.id),
                            }));
                            if (selectedId === section.id) setSelectedId(null);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Disabled sections keep their settings but are hidden from the public page.
          </p>
        </aside>

        {/* Center preview */}
        <main className="min-w-0 flex-1 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-gray-600">Preview:</span>
            {(
              [
                ["desktop", "Desktop (100%)"],
                ["tablet", "Tablet (768px)"],
                ["mobile", "Mobile (375px)"],
              ] as [PreviewSize, string][]
            ).map(([size, label]) => (
              <button
                key={size}
                type="button"
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  previewSize === size
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => setPreviewSize(size)}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">
              {visibleCount} enabled section{visibleCount === 1 ? "" : "s"}
            </span>
          </div>
          {config.sections.length === 0 ? (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Preview is empty — add a section from the left panel.
            </p>
          ) : null}
          <div className="flex justify-center">
            <div
              className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm"
              style={{ width: previewWidth, maxWidth: "100%" }}
            >
              <SiteRenderer config={config} />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            Live preview — it updates instantly as you edit, using the same renderer as the public page.
          </p>
        </main>

        {/* Right panel */}
        <aside className="w-full shrink-0 border-t border-gray-200 bg-white p-3 lg:sticky lg:top-[53px] lg:max-h-[calc(100vh-53px)] lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                rightTab === "section" ? "bg-gray-900 text-white" : "border border-gray-300 bg-white text-gray-700"
              }`}
              onClick={() => setRightTab("section")}
            >
              Section
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                rightTab === "theme" ? "bg-gray-900 text-white" : "border border-gray-300 bg-white text-gray-700"
              }`}
              onClick={() => setRightTab("theme")}
            >
              Theme
            </button>
          </div>

          {rightTab === "theme" ? (
            <div className="mt-3">
              <h2 className="text-sm font-semibold">Theme</h2>
              <div className="mt-2">
                <ThemeEditor
                  theme={config.theme}
                  onChange={(t) => updateConfig((c) => ({ ...c, theme: t }))}
                />
              </div>
            </div>
          ) : selected ? (
            <div className="mt-3">
              <h2 className="text-sm font-semibold">
                {sectionLabel(selected.type)}
                {!selected.enabled ? (
                  <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                    Disabled
                  </span>
                ) : null}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Changes appear in the preview immediately. Remember to Save.
              </p>
              <div className="mt-3">
                {selected.type === "header" ? (
                  <HeaderEditor
                    section={selected}
                    onUpdate={updateSection}
                    onUpload={upload}
                    onError={setError}
                    uploading={uploading}
                    themeButtonColor={config.theme.buttonColor}
                  />
                ) : selected.type === "carousel" ? (
                  <CarouselEditor
                    section={selected}
                    onUpdate={updateSection}
                    onUpload={upload}
                    onError={setError}
                    uploading={uploading}
                    themeButtonColor={config.theme.buttonColor}
                  />
                ) : selected.type === "video" ? (
                  <VideoEditor
                    section={selected}
                    onUpdate={updateSection}
                    onUpload={upload}
                    onError={setError}
                    uploading={uploading}
                    themeButtonColor={config.theme.buttonColor}
                  />
                ) : selected.type === "iconRows" ? (
                  <IconRowsEditor
                    section={selected}
                    onUpdate={updateSection}
                    onUpload={upload}
                    onError={setError}
                    uploading={uploading}
                    themeButtonColor={config.theme.buttonColor}
                  />
                ) : (
                  <ContactEditor
                    section={selected}
                    onUpdate={updateSection}
                    onUpload={upload}
                    onError={setError}
                    uploading={uploading}
                    themeButtonColor={config.theme.buttonColor}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-gray-600">
                Select a section on the left to edit it, or open the Theme tab to change colors,
                fonts, and spacing for the whole site.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
