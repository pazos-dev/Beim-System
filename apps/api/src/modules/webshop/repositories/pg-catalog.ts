/**
 * Postgres CatalogPort implementation — published-only catalog reads with
 * category/search filters and single-product reads.
 *
 * Split from pg-orders.ts (SOLID batch 2). Leaf module: only imports
 * config/db and ports.
 */
import { query } from "../../../config/db.js";
import type { CatalogItem, CatalogListOptions, CatalogPage, CatalogPort } from "../ports.js";

interface ProductDbRow {
  id: string;
  product_code: number | null;
  name: string;
  category_id: string;
  brand: string;
  model: string;
  price: string;
  currency: string;
  stock: number;
  badge: string;
  image: string | null;
  description: string;
}

function mapProduct(row: ProductDbRow): CatalogItem {
  return {
    id: row.id,
    productCode: row.product_code,
    name: row.name,
    categoryId: row.category_id,
    brand: row.brand,
    model: row.model,
    price: Number(row.price),
    currency: row.currency,
    stock: row.stock,
    badge: row.badge,
    image: row.image,
    description: row.description
  };
}

/**
 * Catalog visibility contract (PR 4): `published = true` (migration 0001) is
 * the one gate. Category and search filters are optional. Search matches
 * name/brand/model case-insensitively. Ordering is stable (created_at, id).
 */
const CATALOG_SELECT = `SELECT id, product_code, name, category_id, brand, model, price, currency, stock, badge, image, description
   FROM products
   WHERE published = true
     AND ($1::text IS NULL OR category_id = $1)
     AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%' OR model ILIKE '%' || $2 || '%')`;

export const catalogRepository: CatalogPort = {
  async listPublished(options: CatalogListOptions): Promise<CatalogPage> {
    const page = Math.max(1, Math.trunc(options.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 1) || 1));
    const offset = (page - 1) * limit;
    const category = options.category?.trim() || null;
    const search = options.search?.trim() || null;

    const [itemsResult, countResult] = await Promise.all([
      query<ProductDbRow>(`${CATALOG_SELECT} ORDER BY created_at ASC, id ASC LIMIT $3 OFFSET $4`, [
        category,
        search,
        limit,
        offset
      ]),
      query<{ total: number }>(
        `SELECT count(*)::int AS total FROM products WHERE published = true
           AND ($1::text IS NULL OR category_id = $1)
           AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%' OR model ILIKE '%' || $2 || '%')`,
        [category, search]
      )
    ]);

    const total = countResult.rows[0].total;
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: itemsResult.rows.map(mapProduct)
    };
  },

  async getPublishedById(id: string): Promise<CatalogItem | null> {
    const { rows } = await query<ProductDbRow>(
      `${CATALOG_SELECT} AND id = $3 LIMIT 1`,
      [null, null, id]
    );
    return rows[0] !== undefined ? mapProduct(rows[0]) : null;
  }
};
