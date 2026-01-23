/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns = [];

if (supabaseUrl) {
  try {
    const { hostname } = new URL(supabaseUrl);
    remotePatterns.push({
      protocol: "https",
      hostname,
      pathname: "/storage/v1/object/public/**"
    });
  } catch {
    // ignore malformed URL
  }
}

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns
  },
  experimental: {
    serverActions: {
      // Consent explicit origins for Server Actions; include dev host with port
      allowedOrigins: ["localhost", "http://localhost:3000"],
      bodySizeLimit: "5mb"
    }
  }
};

export default nextConfig;
