"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import AdminNav from "@/components/AdminNav";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

async function readError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return "Could not create the website. Please try again.";
}

export default function NewSitePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validateSlug(value: string): string | null {
    if (value.trim() === "") return "Slug is required.";
    if (!SLUG_PATTERN.test(value)) {
      return "Slug may only contain lowercase letters, numbers, and hyphens.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validateSlug(slug);
    setSlugError(error);
    setSubmitError(null);
    if (error) return;
    if (name.trim() === "") {
      setSubmitError("Business name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug }),
      });
      if (res.status === 409) {
        setSubmitError("That slug is already taken.");
        return;
      }
      if (!res.ok) {
        setSubmitError(await readError(res));
        return;
      }
      const body: unknown = await res.json();
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") {
        setSubmitError("Unexpected response from the server.");
        return;
      }
      router.push(`/admin/sites/${body.id}/edit`);
    } catch {
      setSubmitError("Could not create the website. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/admin" className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Create a new website</h1>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Business name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Bakery"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
              Slug
            </label>
            <input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugError(validateSlug(e.target.value));
              }}
              onBlur={() => setSlugError(validateSlug(slug))}
              placeholder="e.g. acme-bakery"
              aria-invalid={slugError !== null}
              aria-describedby={slugError ? "slug-error" : undefined}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {slugError ? (
              <p id="slug-error" role="alert" className="mt-1 text-sm text-red-600">
                {slugError}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Lowercase letters, numbers, and hyphens only. Your site will live at /s/
                {slug || "your-slug"}.
              </p>
            )}
          </div>
          {submitError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create website"}
          </button>
        </form>
      </main>
    </div>
  );
}
