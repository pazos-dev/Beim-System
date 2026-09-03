import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Idempotent seed script — reproduces data from pagina-web/db/seed.sql.
 * Uses upsert with conflict handling so repeated runs are safe.
 */
export async function main(): Promise<void> {
  // --- Users (3: admin, superadmin, cliente) ---
  const users = [
    {
      email: 'admin@beim.local',
      name: 'Administrador',
      username: 'admin',
      passwordHash:
        'scrypt$9d592b00bc3888968d1272f5c7f5baa7$4f503af5246a2aa18789abeec57c0847ba382bc2832134b6374d0d02791fade761af86574da1cc8b8ec630a44be3a6cfc5d5c27413fed3c659dbfc243d46534f',
      role: 'admin' as const,
      isWholesaler: true,
      isApproved: true,
    },
    {
      email: 'administradorprincipal@beim.local',
      name: 'Administrador principal',
      username: 'administradorprincipal',
      passwordHash:
        'scrypt$3133cddba452d266e6f03da0e089cac0$244197a2c2273a6ab168903367228b015357176b65891c244a3dee65e0f30308acc45b0ae40235d78e9144f101e939995efa71c76139a11888e4b85166998e97',
      role: 'superadmin' as const,
      isWholesaler: true,
      isApproved: true,
    },
    {
      email: 'beim.tecnologia@gmail.com',
      name: 'Beim Tecnologia',
      username: 'beim.tecnologia@gmail.com',
      passwordHash:
        'scrypt$295665206b4972e928bb382e84c3a5d1$997d0ea319faaa1901fe2d1e9dcc8f453d45abcc1650ec3eef16040856f326e7660db9b33a2d63eefa117d16c2fd6bd3499c99a7a4d1ab29b85dff08cac66bfa',
      role: 'cliente' as const,
      isWholesaler: false,
      isApproved: true,
    },
  ]

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        isWholesaler: u.isWholesaler,
        isApproved: u.isApproved,
      },
      update: {
        name: u.name,
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        isWholesaler: u.isWholesaler,
        isApproved: u.isApproved,
      },
    })
  }

  // --- App Settings ---
  const storePayload = {
    whatsapp: '59892514774',
    instagram: 'https://www.instagram.com/beim.uy/',
    heroText:
      'Celulares, notebooks, audio, gaming, accesorios y servicio tecnico con stock real, garantia y atencion rapida.',
    productBrands: ['Samsung', 'iPhone', 'Motorola', 'Xiaomi', 'Honor', 'Huawei'],
    paymentMethods: [
      {
        id: 'transferencia-bancaria',
        name: 'Transferencia bancaria',
        detail: 'Confirmacion manual por comprobante',
        instructions:
          'Realiza la transferencia y luego envia el comprobante a administracion para confirmar el pago.',
        isActive: true,
        sortOrder: 1,
      },
      {
        id: 'efectivo-retiro',
        name: 'Efectivo / retiro',
        detail: 'Pago al retirar o en entrega acordada',
        instructions:
          'Tu pedido queda reservado y coordinamos retiro o entrega para concretar el pago.',
        isActive: true,
        sortOrder: 2,
      },
      {
        id: 'usdt',
        name: 'USDT',
        detail: 'Cripto con validacion manual',
        instructions:
          'Envia el pago por la red indicada y comparte el comprobante o hash para verificarlo manualmente.',
        isActive: true,
        sortOrder: 3,
      },
    ],
  }

  await prisma.appSetting.upsert({
    where: { key: 'store' },
    create: { key: 'store', value: storePayload },
    update: { value: storePayload },
  })

  // --- Categories (7) ---
  const categories = [
    { id: 'celulares', name: 'Celulares', code: 'CEL', description: 'Smartphones nuevos, semi nuevos y accesorios', sortOrder: 1 },
    { id: 'notebooks', name: 'Notebooks', code: 'NB', description: 'Equipos para trabajo, estudio y gaming', sortOrder: 2 },
    { id: 'audio', name: 'Audio', code: 'AUD', description: 'Auriculares, parlantes y accesorios', sortOrder: 3 },
    { id: 'smartwatch', name: 'Smartwatch', code: 'SW', description: 'Relojes inteligentes y bandas', sortOrder: 4 },
    { id: 'gaming', name: 'Gaming', code: 'GM', description: 'Consolas, controles y perifericos', sortOrder: 5 },
    { id: 'accesorios', name: 'Accesorios', code: 'ACC', description: 'Cargadores, cables, fundas y hubs', sortOrder: 6 },
    { id: 'servicio', name: 'Servicio', code: 'SRV', description: 'Diagnostico, configuracion y soporte tecnico', sortOrder: 7 },
  ]

  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, code: c.code, description: c.description, sortOrder: c.sortOrder },
      update: { name: c.name, code: c.code, description: c.description, sortOrder: c.sortOrder },
    })
  }

  // --- Products (6) ---
  const products = [
    { id: 'smartphone-premium', name: 'Smartphone premium', categoryId: 'celulares', brand: 'iPhone', model: '16 Pro', price: 35600, currency: 'UYU' as const, stock: 8, badge: 'Nuevo', image: 'assets/iphone16pro-black.png', description: '256GB - 5G - Camara pro' },
    { id: 'notebook-ultraliviana', name: 'Notebook ultraliviana', categoryId: 'notebooks', brand: 'Samsung', model: 'Book', price: 30400, currency: 'UYU' as const, stock: 3, badge: 'Popular', image: 'NB', description: 'SSD - 16GB RAM - Ideal trabajo' },
    { id: 'auriculares-wireless', name: 'Auriculares wireless', categoryId: 'audio', brand: 'Honor', model: 'Choice', price: 3800, currency: 'UYU' as const, stock: 14, badge: 'Oferta', image: 'AUD', description: 'Bluetooth - Cancelacion - Estuche' },
    { id: 'reloj-inteligente', name: 'Reloj inteligente', categoryId: 'smartwatch', brand: 'Huawei', model: 'Fit', price: 5200, currency: 'UYU' as const, stock: 10, badge: 'Oferta', image: 'SW', description: 'Salud - Deporte - Notificaciones' },
    { id: 'cargador-rapido', name: 'Cargador rapido USB-C', categoryId: 'accesorios', brand: 'Motorola', model: 'Turbo', price: 1120, currency: 'UYU' as const, stock: 30, badge: 'Nuevo', image: 'ACC', description: '20W - Cable compatible - Garantia' },
    { id: 'combo-gaming', name: 'Combo gaming RGB', categoryId: 'gaming', brand: 'Xiaomi', model: 'Gaming Kit', price: 2720, currency: 'UYU' as const, stock: 6, badge: 'Popular', image: 'GM', description: 'Teclado - Mouse - Mousepad' },
  ]

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, categoryId: p.categoryId, brand: p.brand, model: p.model, price: p.price, currency: p.currency, stock: p.stock, badge: p.badge, image: p.image, description: p.description },
      update: { name: p.name, categoryId: p.categoryId, brand: p.brand, model: p.model, price: p.price, currency: p.currency, stock: p.stock, badge: p.badge, image: p.image, description: p.description },
    })
  }

  // --- Promo Slides (3) ---
  const slides = [
    {
      id: 'slide-1',
      eyebrow: 'Tecnología original',
      title: 'Tecnología, repuestos y accesorios con stock real',
      text: 'Celulares, notebooks, audio, repuestos y accesorios con garantía, atención rápida y disponibilidad clara.',
      image: 'assets/hero-slide1-tech.svg',
      primaryLabel: 'Comprar ahora',
      primaryHref: '#catalogo',
      secondaryLabel: 'Consultar',
      secondaryHref: 'https://wa.me/59892514774?text=Hola!%20Quiero%20armar%20mi%20setup%20tech',
      imageX: 50,
      imageY: 50,
      imageScale: 1,
      imageFramePreset: 'default',
      sortOrder: 1,
    },
    {
      id: 'slide-2',
      eyebrow: 'Ofertas de la semana',
      title: 'Combos, accesorios y equipos listos para entrega',
      text: 'Ofertas, combos y equipos listos para retirar o enviar. Consultá disponibilidad y precio final por WhatsApp.',
      image: 'assets/service-repair.png',
      primaryLabel: 'Ver destacados',
      primaryHref: '#catalogo',
      secondaryLabel: 'WhatsApp',
      secondaryHref: 'https://wa.me/59892514774?text=Hola!%20Quiero%20consultar%20por%20las%20ofertas',
      imageX: 50,
      imageY: 50,
      imageScale: 1,
      imageFramePreset: 'default',
      sortOrder: 2,
    },
    {
      id: 'slide-3',
      eyebrow: 'Empresas y soporte',
      title: 'Equipamiento tech y soporte para empresas',
      text: 'Compras por volumen, servicio técnico y asesoramiento para renovar equipos con stock real.',
      image: 'assets/iphone16pro-white.png',
      primaryLabel: 'Pedir cotización',
      primaryHref: '#empresas',
      secondaryLabel: 'Servicio técnico',
      secondaryHref: '#servicios',
      imageX: 50,
      imageY: 50,
      imageScale: 1,
      imageFramePreset: 'default',
      sortOrder: 3,
    },
  ]

  for (const s of slides) {
    await prisma.promoSlide.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        eyebrow: s.eyebrow,
        title: s.title,
        text: s.text,
        image: s.image,
        primaryLabel: s.primaryLabel,
        primaryHref: s.primaryHref,
        secondaryLabel: s.secondaryLabel,
        secondaryHref: s.secondaryHref,
        imageX: s.imageX,
        imageY: s.imageY,
        imageScale: s.imageScale,
        imageFramePreset: s.imageFramePreset,
        sortOrder: s.sortOrder,
      },
      update: {
        eyebrow: s.eyebrow,
        title: s.title,
        text: s.text,
        image: s.image,
        primaryLabel: s.primaryLabel,
        primaryHref: s.primaryHref,
        secondaryLabel: s.secondaryLabel,
        secondaryHref: s.secondaryHref,
        imageX: s.imageX,
        imageY: s.imageY,
        imageScale: s.imageScale,
        imageFramePreset: s.imageFramePreset,
        sortOrder: s.sortOrder,
      },
    })
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete: 3 users, 1 settings, 7 categories, 6 products, 3 slides')
}

// Only auto-run when executed directly (not imported by tests)
const isDirectExecution =
  process.argv[1] != null &&
  (process.argv[1].endsWith('/seed.ts') || process.argv[1].endsWith('\\seed.ts'))

if (isDirectExecution) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error('Seed failed:', e)
      prisma.$disconnect()
      process.exit(1)
    })
}
