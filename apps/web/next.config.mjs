/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // Canonical URLs (Phase 5A): /state/...
    // Keep /us/... as a temporary alias to avoid breaking existing links.
    return [
      {
        source: "/us/:stateSlug",
        destination: "/state/:stateSlug",
        permanent: true
      },
      {
        source: "/us/:stateSlug/:citySlug",
        destination: "/state/:stateSlug/:citySlug",
        permanent: true
      }
    ];
  }
};

export default nextConfig;


