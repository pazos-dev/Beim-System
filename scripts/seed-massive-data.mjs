/**
 * Script de seed masivo para pruebas de la aplicación de gestión.
 * Inserta entre 50-100 registros por tabla relevante con fechas variadas.
 * 
 * Uso: node scripts/seed-massive-data.mjs
 * Requiere ejecutarse desde apps/ o con pg disponible.
 */

import pg from "pg";

const { Pool } = pg;

const DUMMY_PASSWORD_HASH = "scrypt$" + "00".repeat(32) + "$" + "00".repeat(64);

const CATEGORIES = [
  { id: "celulares", name: "Celulares", code: "CEL" },
  { id: "notebooks", name: "Notebooks", code: "NB" },
  { id: "audio", name: "Audio", code: "AUD" },
  { id: "smartwatch", name: "Smartwatch", code: "SW" },
  { id: "gaming", name: "Gaming", code: "GM" },
  { id: "tablets", name: "Tablets", code: "TAB" },
  { id: "accesorios", name: "Accesorios", code: "ACC" },
  { id: "componentes", name: "Componentes", code: "COMP" },
  { id: "cables", name: "Cables y Cargadores", code: "CAB" },
  { id: "protectores", name: "Protectores", code: "PROT" },
];

const BRANDS = ["Samsung", "Apple", "Xiaomi", "Motorola", "Sony", "LG", "Huawei", "Nokia", "Realme", "OnePlus"];
const MODELS = ["Galaxy S24", "iPhone 15", "Redmi Note 13", "Edge 40", "Xperia 5", "Velvet", "P60 Pro", "G60", "GT Neo", "Nord 3"];
const PRODUCT_NAMES = [
  "Cargador rápido 65W", "Auriculares Bluetooth", "Funda silicona", "Vidrio templado",
  "Cable USB-C", "Batería externa 20000mAh", "Soporte auto", "Adaptador OTG",
  "Lápiz táctil", "Selfie stick", "Tripode mini", "Funda waterproof",
  "Cable lightning", "Cargador inalámbrico", "Aro de luz LED", "Micrófono USB",
  "Hub USB 4 puertos", "Teclado Bluetooth", "Mouse inalámbrico", "Webcam HD",
];

const FIRST_NAMES = ["Ana", "Carlos", "María", "Juan", "Laura", "Pedro", "Sofía", "Luis", "Valentina", "Diego", "Camila", "Martín", "Florencia", "Joaquín", "Antonella", "Bruno", "Catalina", "Facundo", "Delfina", "Agustín", "Victoria", "Mateo", "Julieta", "Lucas", "Emilia", "Santiago", "Agustina", "Nicolás", "Morena", "Thiago"];
const LAST_NAMES = ["García", "Rodríguez", "Fernández", "López", "Martínez", "González", "Pérez", "Sánchez", "Romero", "Torres", "Ramírez", "Flores", "Acosta", "Silva", "Molina", "Ruiz", "Castro", "Ortiz", "Núñez", "Medina", "Rojas", "Vargas", "Mendoza", "Herrera", "Aguirre", "Peña", "Soto", "Guerrero", "Cabrera", "Reyes"];

const SERVICES = [
  { name: "Cambio de pantalla", price: 3500 },
  { name: "Cambio de batería", price: 1800 },
  { name: "Reparación de placa", price: 6500 },
  { name: "Cambio de pin de carga", price: 1200 },
  { name: "Limpieza interna", price: 800 },
  { name: "Cambio de cámara", price: 2200 },
  { name: "Desbloqueo de cuenta", price: 2500 },
  { name: "Recuperación de datos", price: 4000 },
  { name: "Instalación de apps", price: 500 },
  { name: "Configuración de red", price: 600 },
  { name: "Cambio de altavoz", price: 1500 },
  { name: "Reparación de botones", price: 1000 },
  { name: "Actualización de software", price: 700 },
  { name: "Diagnóstico completo", price: 900 },
  { name: "Cambio de micrófono", price: 1300 },
];

const REPAIR_STATUSES = ["Ingresado", "EnReparacion", "Listo", "Entregado", "Cancelado"];
const PAYMENT_STATUSES = ["Pendiente", "parcial", "pagado"];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function formatTimestamp(d) {
  return d.toISOString();
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://beim@127.0.0.1:5432/beim_api" });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("[1/8] Insertando categorías...");
    for (const cat of CATEGORIES) {
      await client.query(
        `INSERT INTO categories (id, name, code, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO NOTHING`,
        [cat.id, cat.name, cat.code, `Categoría ${cat.name}`, cat.code === "CEL" ? 1 : randomInt(1, 20)]
      );
    }

    console.log("[2/8] Insertando servicios...");
    const serviceIds = [];
    for (let i = 0; i < SERVICES.length; i++) {
      const s = SERVICES[i];
      const id = crypto.randomUUID();
      serviceIds.push(id);
      await client.query(
        `INSERT INTO services (id, name, price_amount, price_currency, active, data, updated_at)
         VALUES ($1, $2, $3, 'UYU', true, '{}', now())
         ON CONFLICT (id) DO NOTHING`,
        [id, s.name, s.price]
      );
    }

    console.log("[3/8] Insertando 80 productos...");
    const productIds = [];
    for (let i = 1; i <= 80; i++) {
      const id = `prod-${String(i).padStart(4, "0")}`;
      productIds.push(id);
      const cat = randomChoice(CATEGORIES).id;
      const brand = randomChoice(BRANDS);
      const name = i <= 20 ? `${randomChoice(PRODUCT_NAMES)} ${brand}` : `${brand} ${randomChoice(MODELS)}`;
      const stock = randomInt(0, 50);
      const minStock = randomInt(3, 10);
      const price = randomInt(150, 25000);

      await client.query(
        `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, product_type, supplier_name, min_stock, published, warranty_days)
         VALUES ($1, $2, $3, $4, $5, $6, 'UYU', $7, 'Nuevo', $8, 'accesorio', 'Proveedor Genérico', $9, true, 30)
         ON CONFLICT (id) DO NOTHING`,
        [id, name, cat, brand, randomChoice(MODELS), price, stock, `${name} - ${brand}`, minStock]
      );
    }

    console.log("[4/8] Insertando 100 clientes...");
    const clientIds = [];
    for (let i = 1; i <= 100; i++) {
      const id = crypto.randomUUID();
      clientIds.push(id);
      const first = randomChoice(FIRST_NAMES);
      const last = randomChoice(LAST_NAMES);
      const name = `${first} ${last}`;
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i}@test.com`;

      await client.query(
        `INSERT INTO users (id, name, first_name, last_name, username, email, password_hash, role, phone, is_approved, is_wholesaler)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'cliente', $8, true, false)
         ON CONFLICT (email) DO NOTHING`,
        [id, name, first, last, `cli-${i}`, email, DUMMY_PASSWORD_HASH, `09${randomInt(10000000, 99999999)}`]
      );
    }

    console.log("[5/8] Insertando 100 receipts (órdenes de reparación)...");
    const receiptIds = [];
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 1; i <= 100; i++) {
      const id = crypto.randomUUID();
      receiptIds.push(id);
      const clientName = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
      const status = randomChoice(REPAIR_STATUSES);
      const createdAt = randomDate(ninetyDaysAgo, now);
      const brand = randomChoice(BRANDS);
      const model = randomChoice(MODELS);
      const price = String(randomInt(1500, 25000));
      const quoteTotal = randomInt(500, 15000);
      const services = [randomChoice(SERVICES).name];
      const paymentStatus = randomChoice(PAYMENT_STATUSES);

      await client.query(
        `INSERT INTO beim_receipts (
           id, client_name, client_id, client_phone, device_brand, device_model,
           repair_status, price, quote_total, payment_status, services, reported_issue,
           created_at, updated_at, entry_date_text, payload
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, '{}')
         ON CONFLICT DO NOTHING`,
        [
          id, clientName, `cli-${randomInt(1, 100)}`, `09${randomInt(10000000, 99999999)}`,
          brand, model, status, price, quoteTotal, paymentStatus, services,
          `Pantalla rota / No enciende / Botón falla`, createdAt, formatDate(createdAt)
        ]
      );
    }

    console.log("[6/8] Insertando 60 sesiones de caja...");
    for (let i = 0; i < 60; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const businessDate = formatDate(date);
      const openingAmount = randomInt(500, 5000);
      const isClosed = Math.random() > 0.3;
      const countedAmount = isClosed ? openingAmount + randomInt(-500, 1500) : null;
      const difference = isClosed ? (countedAmount - openingAmount) : 0;
      const status = isClosed ? "closed" : (i === 0 ? "open" : "closed");
      const closedAt = isClosed ? new Date(date.getTime() + 8 * 60 * 60 * 1000) : null;

      await client.query(
        `INSERT INTO gestion_cash_sessions (business_date, opening_amount, expected_amount, counted_amount, difference, status, notes, opened_at, closed_at)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (business_date) DO NOTHING`,
        [
          businessDate, openingAmount, countedAmount, difference, status,
          i === 0 ? "Apertura del día" : `Cierre del ${businessDate}`,
          new Date(date.getTime()), closedAt
        ]
      );
    }

    console.log("[7/8] Insertando 80 movimientos de stock...");
    for (let i = 1; i <= 80; i++) {
      const productId = randomChoice(productIds);
      const qty = randomInt(5, 50);
      const unitCost = randomInt(100, 5000);
      const createdAt = randomDate(ninetyDaysAgo, now);

      await client.query(
        `INSERT INTO stock_lots (id, product_id, initial_qty, remaining_qty, unit_cost, currency, purpose, acquired_via, created_at)
         VALUES ($1, $2, $3, $3, $4, 'UYU', 'venta', 'compra_directa', $5)
         ON CONFLICT DO NOTHING`,
        [`lot-${String(i).padStart(4, "0")}`, productId, qty, unitCost, createdAt]
      );
    }

    console.log("[8/8] Insertando 100 audit logs...");
    const ACTIONS = ["auth.login", "receipt.create", "receipt.annul", "cash.movement", "stock.movement", "user.update", "service.create", "purchase.create"];
    const ENTITY_TYPES = ["user", "receipt", "cash_session", "product", "service", "purchase"];

    for (let i = 1; i <= 100; i++) {
      const action = randomChoice(ACTIONS);
      const entityType = randomChoice(ENTITY_TYPES);
      const createdAt = randomDate(ninetyDaysAgo, now);
      const actorRole = randomChoice(["vendedor", "administrador", "tecnico", "caja"]);
      const actorId = clientIds.length > 0 ? randomChoice(clientIds) : null;

      await client.query(
        `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          actorId, actorRole, action, entityType,
          `ent-${randomInt(1, 999)}`,
          JSON.stringify({ source: "seed", index: i }),
          createdAt
        ]
      );
    }

    await client.query("COMMIT");
    console.log("\n✅ Seed completado exitosamente!");
    console.log("Datos insertados:");
    console.log("  - 10 categorías");
    console.log("  - 15 servicios");
    console.log("  - 80 productos");
    console.log("  - 100 clientes");
    console.log("  - 100 receipts (órdenes)");
    console.log("  - 60 sesiones de caja");
    console.log("  - 80 lotes de stock");
    console.log("  - 100 audit logs");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error durante el seed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
