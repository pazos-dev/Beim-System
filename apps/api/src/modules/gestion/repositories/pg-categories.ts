/**
 * Postgres CategoriesPort (PR 3).
 *
 * Mirrors the vendored categories table. `create` fills the NOT NULL
 * description with '' and leaves parent_id/sort_order at defaults; duplicate
 * ids surface as 409 ConflictError via categories_pkey.
 */
import { query } from "../../../config/db.js";
import { ConflictError } from "../../../errors/taxonomy.js";
import type { CategoriesPort } from "../ports.js";

interface CategoryRow {
  id: string;
  name: string;
  code: string;
  parent_id: string | null;
}

function mapCategoryRow(row: CategoryRow) {
  return { id: row.id, name: row.name, code: row.code, parentId: row.parent_id };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export const categoriesRepository: CategoriesPort = {
  async list() {
    const { rows } = await query<CategoryRow>(
      "SELECT id, name, code, parent_id FROM categories ORDER BY sort_order, name"
    );
    return rows.map(mapCategoryRow);
  },

  async getById(id) {
    const { rows } = await query<CategoryRow>(
      "SELECT id, name, code, parent_id FROM categories WHERE id = $1",
      [id]
    );
    return rows[0] === undefined ? null : mapCategoryRow(rows[0]);
  },

  async create(input) {
    try {
      const { rows } = await query<CategoryRow>(
        `INSERT INTO categories (id, name, code, description)
         VALUES ($1, $2, $3, '')
         RETURNING id, name, code, parent_id`,
        [input.id, input.name, input.code]
      );
      return mapCategoryRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("Ya existe una categoría con ese id");
      }
      throw err;
    }
  }
};