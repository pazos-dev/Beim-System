/**
 * Postgres PromoSlidesPort (PR 4).
 *
 * Serves only published slides in their defined order — sort_order, then
 * creation time (webshop-api/spec.md "Slides ordered"). `published` comes
 * from migration 0001 (the vendored schema has no such column).
 */
import { query } from "../../../config/db.js";
import type { PromoSlideRow, PromoSlidesPort } from "../ports.js";

interface PromoSlideDbRow {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  image: string;
  primary_label: string | null;
  primary_href: string | null;
  secondary_label: string | null;
  secondary_href: string | null;
  sort_order: number;
}

function mapSlide(row: PromoSlideDbRow): PromoSlideRow {
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    text: row.text,
    image: row.image,
    primaryLabel: row.primary_label,
    primaryHref: row.primary_href,
    secondaryLabel: row.secondary_label,
    secondaryHref: row.secondary_href,
    sortOrder: row.sort_order
  };
}

export const promoSlidesRepository: PromoSlidesPort = {
  async listPublished(): Promise<PromoSlideRow[]> {
    const { rows } = await query<PromoSlideDbRow>(
      `SELECT id, eyebrow, title, text, image, primary_label, primary_href,
              secondary_label, secondary_href, sort_order
       FROM promo_slides
       WHERE published = true
       ORDER BY sort_order ASC, created_at ASC`
    );
    return rows.map(mapSlide);
  }
};