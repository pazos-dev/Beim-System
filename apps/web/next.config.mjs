/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@beim/contracts', '@beim/domain', '@beim/data'],
}

export default nextConfig
