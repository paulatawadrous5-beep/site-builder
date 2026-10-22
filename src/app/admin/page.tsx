"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminNav from "@/components/AdminNav";
import type { SiteStatus, SiteSummary } from "@/lib/types";

type StatusFilter = "all" | SiteStatus;

const STATUS_STYLES: Record<SiteStatus, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-200 text-gray-700",
};

async function readError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return "Something went wrong. Please try again.";
}

function publicUrl(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminDashboardPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites");
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const body: unknown = await res.json();
      if (!Array.isArray(body)) {
        setError("Unexpected response from the server.");
        return;
      }
      setSites(body as SiteSummary[]);
    } catch {
      setError("Could not load websites. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sites.filter((site) => {
      const matchesQuery =
        query === "" ||
        site.name.toLowerCase().includes(query) ||
        site.slug.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || site.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [sites, search, statusFilter]);

  async function runAction(siteId: string, action: () => Promise<Response>) {
    setBusyId(siteId);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      await loadSites();
    } catch {
      setError("That action failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function handleDuplicate(site: SiteSummary) {
    return runAction(site.id, () =>
      fetch(`/api/sites/${site.id}/duplicate`, { method: "POST" }),
    );
  }

  function handlePublishToggle(site: SiteSummary) {
    const nextStatus: SiteStatus = site.status === "published" ? "draft" : "published";
    return runAction(site.id, () =>
      fetch(`/api/sites/${site.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      }),
    );
  }

  function handleArchive(site: SiteSummary) {
    return runAction(site.id, () =>
      fetch(`/api/sites/${site.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
    );
  }

  function handleDelete(site: SiteSummary) {
    if (!window.confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
    void runAction(site.id, () => fetch(`/api/sites/${site.id}`, { method: "DELETE" }));
  }

  async function handleCopyUrl(site: SiteSummary) {
    const url = publicUrl(site.slug);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      // Fall back to a hidden textarea + execCommand below.
    }
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      document.body.removeChild(textarea);
    }
    if (copied) {
      setCopiedId(site.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === site.id ? null : current));
      }, 2000);
    } else {
      setError("Could not copy the URL. You can copy it from the address bar after opening the site.");
    }
  }

  function handleOpenSite(site: SiteSummary) {
    window.open(publicUrl(site.slug), "_blank");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">Websites</h1>
          <Link
            href="/admin/sites/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create website
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            aria-label="Search websites"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-gray-500">Loading websites…</p>
        ) : sites.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-gray-700">No websites yet — create your first one.</p>
            <Link
              href="/admin/sites/new"
              className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create website
            </Link>
          </div>
        ) : filteredSites.length === 0 ? (
          <p className="mt-8 text-sm text-gray-500">
            No websites match your search or filter.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSites.map((site) => {
              const busy = busyId === site.id;
              return (
                <li
                  key={site.id}
                  className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-gray-900">{site.name}</h2>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[site.status]}`}
                    >
                      {site.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-sm text-gray-500">/{site.slug}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Updated {formatDate(site.updatedAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/sites/${site.id}/edit`}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(site)}
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePublishToggle(site)}
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {site.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    {site.status !== "archived" && (
                      <button
                        type="button"
                        onClick={() => void handleArchive(site)}
                        disabled={busy}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(site)}
                      disabled={busy}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(site)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copiedId === site.id ? "Copied!" : "Copy URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSite(site)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Open site
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
