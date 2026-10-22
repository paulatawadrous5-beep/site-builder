import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteRenderer from "@/components/SiteRenderer";
import { getSiteBySlug } from "@/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site || site.status !== "published") return { title: "Not found" };
  return { title: site.name, description: `Visit ${site.name}` };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  // Draft, archived, and unpublished sites NEVER render publicly.
  if (!site || site.status !== "published") notFound();
  return <SiteRenderer config={site} />;
}
