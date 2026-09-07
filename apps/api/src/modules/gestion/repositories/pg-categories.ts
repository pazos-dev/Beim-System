/**
 * Postgres CategoriesPort (PR 3).
 *
 * Mirrors the vendored categories table. `create` fills the NOT NULL
 * description with '' and leaves parent_id/sort_order at defaults; duplicate
 * ids surface as 409 ConflictError via categories_pkey. `is_active`
 * (migration 0003, issue #87) drives the active filter; legacy rows default
 * to true so existing listings keep working.
 */
import { query } from "../../../config/db.js";
import { ConflictError } from "../../../errors/taxonomy.js";
import type { ActiveFilter, CategoriesPort } from "../ports.js";

interface CategoryRow {
  id: string;
  name: string;
  code: string;
  parent_id: string | null;
  is_active: boolean;
}

function mapCategoryRow(row: CategoryRow) {
  return { id: row.id, name: row.name, code: row.code, parentId: row.parent_id, active: row.is_active };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

const COLUMNS = "id, name, code, parent_id, is_active";

export const categoriesRepository: CategoriesPort = {
  async list(filter?: { active?: ActiveFilter }) {
    const active = filter?.active;
    // Default = active only; "all" disables the filter.
    if (active === "all") {
      const { rows } = await query<CategoryRow>(
        `SELECT ${COLUMNS} FROM categories ORDER BY sort_order, name`
      );
      return rows.map(mapCategoryRow);
    }
    const activeOnly = active ?? true;
    const { rows } = await query<CategoryRow>(
      `SELECT ${COLUMNS} FROM categories WHERE is_active = $1 ORDER BY sort_order, name`,
      [activeOnly]
    );
    return rows.map(mapCategoryRow);
  },

  async getById(id) {
    const { rows } = await query<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE id = $1`, [id]);
    return rows[0] === undefined ? null : mapCategoryRow(rows[0]);
  },

  async create(input) {
    try {
      const { rows } = await query<CategoryRow>(
        `INSERT INTO categories (id, name, code, description)
         VALUES ($1, $2, $3, '')
         RETURNING ${COLUMNS}`,
        [input.id, input.name, input.code]
      );
      return mapCategoryRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("Ya existe una categoría con ese id");
      }
      throw err;
    }
  },

  async update(id, input) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.code !== undefined) {
      params.push(input.code);
      sets.push(`code = $${params.length}`);
    }
    if (input.active !== undefined) {
      params.push(input.active);
      sets.push(`is_active = $${params.length}`);
    }
    if (sets.length === 0) return categoriesRepository.getById(id);
    params.push(id);
    const { rows } = await query<CategoryRow>(
      `UPDATE categories SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $${params.length}
       RETURNING ${COLUMNS}`,
      params
    );
    return rows[0] === undefined ? null : mapCategoryRow(rows[0]);
  }
};
