/**
 * Catalog + orders service tests (PR 4) against beim_api_test.
 *
 * Catalog: "published" semantics (decision, PR 4 — explicit `published`
 * column added by migration 0001, independent of stock/badge), pagination,
 * category + search filters, single-product reads, published-only slides in
 * their defined order (webshop-api/spec.md "Slides ordered").
 *
 * Orders: transactional creation with server-authoritative pricing and an
 * in-transaction stock CHECK (check-not-reserve: stock is committed only at
 * payment, stock_committed=false) — insufficient stock rolls back the whole
 * order (webshop-api/spec.md "Order then pay"); ownership-scoped reads; and
 * checkout sessions that never flip payment (unpaid until webhook).
 */
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { ConflictError, InsufficientStockError, NotFoundError, ValidationError } from "../../errors/taxonomy.js";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { catalogRepository } = await import("./repositories/pg-orders.js");
const { promoSlidesRepository } = await import("./repositories/pg-promo-slides.js");
const { catalogService } = await import("./services/catalog.js");
const { checkoutService, ordersService } = await import("./services/orders.js");

const USER_A = "99999999-0000-0000-0000-00000000000a";
const USER_B = "99999999-0000-0000-0000-00000000000b";

async function seedProduct(
  input: {
    id: string;
    name: string;
    categoryId: string;
    price: number;
    stock: number;
    currency?: string;
    brand?: string;
    model?: string;
    published?: boolean;
  }
): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Nuevo', '', $9)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, price = EXCLUDED.price,
           currency = EXCLUDED.currency, stock = EXCLUDED.stock, brand = EXCLUDED.brand,
           model = EXCLUDED.model, published = EXCLUDED.published, updated_at = now()`,
    [
      input.id,
      input.name,
      input.categoryId,
      input.brand ?? "",
      input.model ?? "",
      input.price,
      input.currency ?? "UYU",
      input.stock,
      input.published ?? true
    ]
  );
  return input.id;
}

async function seedUser(userId: string): Promise<void> {
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, 'Comprador', 'comprador-' || $1::text, $1::text || '@beim.test', 'irrelevant-hash', 'cliente', true)
     ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
}

async function countOrders(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM orders WHERE user_id = $1",
    [userId]
  );
  return Number(rows[0].n);
}

describePg("catalog: published semantics + pagination + filters", () => {
  it("serves ONLY published products (explicit flag, independent of stock)", async () => {
    await seedProduct({ id: "cat-pub-1", name: "Visible uno", categoryId: "celulares", price: 100, stock: 0 });
    await seedProduct({ id: "cat-pub-2", name: "Visible dos", categoryId: "celulares", price: 200, stock: 5 });
    await seedProduct({ id: "cat-hid-1", name: "Oculto", categoryId: "celulares", price: 50, stock: 8, published: false });

    const page = await catalogRepository.listPublished({ page: 1, limit: 10 });
    const ids = page.items.map((p) => p.id);
    expect(ids).toContain("cat-pub-1"); // out-of-stock but published → still visible
    expect(ids).toContain("cat-pub-2");
    expect(ids).not.toContain("cat-hid-1");
    expect(page.total).toBeGreaterThanOrEqual(2);
  });

  it("paginates published products with stable ordering and pagination metadata", async () => {
    const total = (await catalogRepository.listPublished({ page: 1, limit: 100 })).total;
    const page1 = await catalogRepository.listPublished({ page: 1, limit: 2 });
    const page2 = await catalogRepository.listPublished({ page: 2, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    const ids1 = new Set(page1.items.map((p) => p.id));
    for (const item of page2.items) expect(ids1.has(item.id)).toBe(false);
    expect(page1.totalPages).toBe(Math.ceil(total / 2));
    expect(page2.page).toBe(2);
  });

  it("filters by category (category_id) and by search term across name/brand/model", async () => {
    await seedProduct({ id: "cat-f-cel", name: "Telefono f", categoryId: "celulares", price: 10, stock: 1 });
    await seedProduct({ id: "cat-f-acc", name: "Cargador f", categoryId: "accesorios", price: 10, stock: 1 });
    const searchBrand = await seedProduct({
      id: "cat-f-brand",
      name: "Periferico f",
      categoryId: "gaming",
      price: 10,
      stock: 1,
      brand: "MotoTest"
    });

    // Category filter bounds the result set both ways (seed data also has
    // accesorios products, so assert presence/absence of the fixtures).
    const byAccesorios = await catalogRepository.listPublished({ page: 1, limit: 50, category: "accesorios" });
    const accIds = byAccesorios.items.map((p) => p.id);
    expect(accIds).toContain("cat-f-acc");
    expect(accIds).not.toContain("cat-f-cel");

    const byCelulares = await catalogRepository.listPublished({ page: 1, limit: 50, category: "celulares" });
    const celIds = byCelulares.items.map((p) => p.id);
    expect(celIds).toContain("cat-f-cel");
    expect(celIds).not.toContain("cat-f-acc");

    // Search terms namespaced to fixtures give exact expectations.
    const byBrand = await catalogRepository.listPublished({ page: 1, limit: 10, search: "mototest" });
    expect(byBrand.items.map((p) => p.id)).toEqual([searchBrand]);

    const byName = await catalogRepository.listPublished({ page: 1, limit: 10, search: "periferico" });
    expect(byName.items.map((p) => p.id)).toEqual([searchBrand]);

    const none = await catalogRepository.listPublished({ page: 1, limit: 10, search: "zzz-no-existe" });
    expect(none.items).toHaveLength(0); // precondition: term matches nothing (companion cases above are non-empty)
    expect(none.total).toBe(0);
  });

  it("getPublishedById returns a published product and hides unpublished/missing ones", async () => {
    await seedProduct({ id: "cat-one-1", name: "Unico", categoryId: "celulares", price: 10, stock: 1 });
    await seedProduct({ id: "cat-one-2", name: "Escondido", categoryId: "celulares", price: 10, stock: 1, published: false });

    const found = await catalogRepository.getPublishedById("cat-one-1");
    expect(found?.id).toBe("cat-one-1");
    expect(found?.price).toBe(10);
    expect(await catalogRepository.getPublishedById("cat-one-2")).toBeNull();
    expect(await catalogRepository.getPublishedById("cat-inexistente")).toBeNull();
  });

  it("promo slides: only published, in defined order (sort_order, then created_at)", async () => {
    await query(
      `INSERT INTO promo_slides (id, eyebrow, title, text, image, sort_order, published)
       VALUES ('slide-v-a', 'A', 'Slide A', '', 'assets/a.png', 2, true),
              ('slide-v-b', 'B', 'Slide B', '', 'assets/b.png', 1, true),
              ('slide-v-c', 'C', 'Slide C', '', 'assets/c.png', 3, false)
       ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, published = EXCLUDED.published`,
      []
    );
    const slides = await promoSlidesRepository.listPublished();
    const ids = slides.map((s) => s.id);
    // Seed data adds other published slides, so scope to our fixtures:
    // sort_order 1 then 2, hidden slide-v-c skipped.
    const mine = ids.filter((id) => id.startsWith("slide-v-"));
    expect(mine).toEqual(["slide-v-b", "slide-v-a"]);
    expect(slides.find((s) => s.id === mine[0])?.title).toBe("Slide B");
  });

  it("catalogService translates list options and single reads", async () => {
    await seedProduct({ id: "cat-svc-1", name: "Svc one", categoryId: "celulares", price: 10, stock: 1 });
    const listed = await catalogService.listPublished({ page: 1, limit: 1 });
    expect(listed.items).toHaveLength(1);
    expect((await catalogService.getPublishedById("cat-svc-1"))?.name).toBe("Svc one");
    expect(await catalogService.listSlides()).toBeInstanceOf(Array);
  });
});

describePg("orders service: transactional create with stock check", () => {
  it("creates an unpaid order + items atomically with server-authoritative pricing", async () => {
    await seedUser(USER_A);
    const a = await seedProduct({ id: "ord-a", name: "Producto A", categoryId: "celulares", price: 100, stock: 5 });
    const b = await seedProduct({ id: "ord-b", name: "Producto B", categoryId: "accesorios", price: 200, stock: 3 });

    const result = await ordersService.create(USER_A, {
      customer: "Comprador Test",
      email: "comprador@test.uy",
      items: [
        { productId: a, quantity: 2 },
        { productId: b, quantity: 1 }
      ]
    });

    expect(result.order.status).toBe("Pendiente");
    expect(result.order.paymentStatus).toBe("Pendiente de pago");
    expect(result.order.stockCommitted).toBe(false); // stock commits only at payment
    expect(result.order.total).toBe(400);
    expect(result.order.currency).toBe("UYU");
    expect(result.items.map((i) => [i.productName, i.quantity, i.unitPrice])).toEqual([
      ["Producto A", 2, 100],
      ["Producto B", 1, 200]
    ]);

    // Real product stock is untouched by order creation.
    const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [a]);
    expect(rows[0].stock).toBe(5);
  });

  it("insufficient stock → 409 rollback: no order, no items, stock untouched", async () => {
    await seedUser(USER_A);
    const a = await seedProduct({ id: "ord-low", name: "Poco stock", categoryId: "celulares", price: 100, stock: 1 });
    const before = await countOrders(USER_A);

    await expect(
      ordersService.create(USER_A, {
        customer: "Falla Stock",
        items: [{ productId: a, quantity: 2 }]
      })
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await countOrders(USER_A)).toBe(before);
    const { rows } = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM order_items WHERE product_id = $1",
      [a]
    );
    expect(rows[0].n).toBe("0");
  });

  it("unknown or unpublished products are 404 and mixed currencies are 422", async () => {
    await seedUser(USER_A);
    await seedProduct({ id: "ord-usd", name: "Dolar", categoryId: "celulares", price: 5, stock: 5, currency: "USD" });
    await seedProduct({ id: "ord-hidden", name: "Oculto", categoryId: "celulares", price: 5, stock: 5, published: false });

    await expect(
      ordersService.create(USER_A, { customer: "X", items: [{ productId: "ord-unknown", quantity: 1 }] })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      ordersService.create(USER_A, { customer: "X", items: [{ productId: "ord-hidden", quantity: 1 }] })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      ordersService.create(USER_A, {
        customer: "X",
        items: [
          { productId: "ord-usd", quantity: 1 },
          { productId: "ord-a", quantity: 1 }
        ]
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("listMine returns only the caller's orders, newest first, paginated", async () => {
    const owner = "99999999-0000-0000-0000-0000000000c1";
    await seedUser(owner);
    await seedUser(USER_B);
    const a = await seedProduct({ id: "ord-list", name: "Listado", categoryId: "celulares", price: 10, stock: 5 });
    const mine1 = await ordersService.create(owner, { customer: "Yo", items: [{ productId: a, quantity: 1 }] });
    const mine2 = await ordersService.create(owner, { customer: "Yo", items: [{ productId: a, quantity: 2 }] });
    await ordersService.create(USER_B, { customer: "Otro", items: [{ productId: a, quantity: 1 }] });
    // Pin timestamps so the "newest first" assertion is deterministic even
    // when both rows land in the same millisecond.
    await query("UPDATE orders SET created_at = now() - interval '1 hour' WHERE id = $1", [mine1.order.id]);

    const mine = await ordersService.listMine(owner, { page: 1, limit: 10 });
    expect(mine.total).toBe(2);
    expect(mine.items.map((o) => o.id).sort()).toEqual([mine1.order.id, mine2.order.id].sort());

    const paged = await ordersService.listMine(owner, { page: 1, limit: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(2);
    // Newest first: mine2 was created after mine1
    expect(paged.items[0].id).toBe(mine2.order.id);
  });

  it("getMine returns order+items for the owner, null for foreign orders", async () => {
    await seedUser(USER_A);
    await seedUser(USER_B);
    const a = await seedProduct({ id: "ord-mine", name: "Mi pedido", categoryId: "celulares", price: 10, stock: 5 });
    const created = await ordersService.create(USER_A, { customer: "Dueño", items: [{ productId: a, quantity: 1 }] });

    const owned = await ordersService.getMine(USER_A, created.order.id);
    expect(owned?.order.id).toBe(created.order.id);
    expect(owned?.items).toHaveLength(1);
    expect(await ordersService.getMine(USER_B, created.order.id)).toBeNull();
  });
});

describePg("checkout sessions (unpaid until webhook)", () => {
  it("mints a pending session with a URL and leaves the order unpaid", async () => {
    await seedUser(USER_A);
    const a = await seedProduct({ id: "chk-a", name: "Checkout", categoryId: "celulares", price: 10, stock: 5 });
    const { order } = await ordersService.create(USER_A, { customer: "Paga despues", items: [{ productId: a, quantity: 1 }] });

    const session = await checkoutService.create(USER_A, order.id, "transferencia-bancaria");
    expect(session.orderId).toBe(order.id);
    expect(session.status).toBe("pending");
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.url).toMatch(new RegExp(`/checkout/${session.id}$`));

    const { rows } = await query<{ payment_status: string; stock_committed: boolean }>(
      "SELECT payment_status, stock_committed FROM orders WHERE id = $1",
      [order.id]
    );
    expect(rows[0].payment_status).toBe("Pendiente de pago");
    expect(rows[0].stock_committed).toBe(false); // webhook confirmation is what flips payment

    const persisted = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM checkout_sessions WHERE id = $1",
      [session.id]
    );
    expect(persisted.rows[0].n).toBe("1");
  });

  it("foreign or unknown orders are 404; paid orders are 409", async () => {
    await seedUser(USER_A);
    await seedUser(USER_B);
    const a = await seedProduct({ id: "chk-b", name: "Checkout B", categoryId: "celulares", price: 10, stock: 5 });
    const { order } = await ordersService.create(USER_A, { customer: "Paga luego", items: [{ productId: a, quantity: 1 }] });

    await expect(checkoutService.create(USER_B, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(checkoutService.create(USER_A, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError
    );

    await query("UPDATE orders SET payment_status = 'Pagado' WHERE id = $1", [order.id]);
    await expect(checkoutService.create(USER_A, order.id)).rejects.toBeInstanceOf(ConflictError);
  });
});