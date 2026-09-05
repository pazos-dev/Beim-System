/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Cache-busting del iframe de boleta vendored (D7): timestamp de build en
    // tiempo de arranque con override del operador para despliegues reproducibles.
    BOLETA_VERSION: process.env.BOLETA_VERSION ?? String(Date.now()),
  },
};

export default nextConfig;
