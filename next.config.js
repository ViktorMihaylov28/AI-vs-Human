import { defineNextConfig } from "convex/next.config";

const nextConfig = defineNextConfig({
  reactStrictMode: true,
  transpilePackages: ["lucide-react"],
});

export default nextConfig;