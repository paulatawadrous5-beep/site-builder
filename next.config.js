/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow images served from Vercel Blob (and any http(s) host the admin
    // pastes as an image URL). remotePatterns cannot be a wildcard host, so
    // we permit the blob host pattern and rely on plain <img> for the rest.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

module.exports = nextConfig;
