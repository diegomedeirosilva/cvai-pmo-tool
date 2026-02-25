/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["exceljs", "bcryptjs"],
  },
};

export default nextConfig;
