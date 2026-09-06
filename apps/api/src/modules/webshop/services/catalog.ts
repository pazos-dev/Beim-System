/**
 * Catalog service (PR 4) — thin read layer over the catalog + promo-slides
 * repositories. Business rules: published-only visibility (migration 0001
 * flag), pagination metadata, category/search filters, slides in defined
 * order. Pricing for orders is NOT resolved here — that is the orders
 * service's transactional job (server-authoritative prices).
 */
import type { CatalogItem, CatalogListOptions, CatalogPage, PromoSlideRow } from "../ports.js";
import { catalogRepository } from "../repositories/pg-orders.js";
import { promoSlidesRepository } from "../repositories/pg-promo-slides.js";

export const catalogService = {
  listPublished(options: CatalogListOptions): Promise<CatalogPage> {
    return catalogRepository.listPublished(options);
  },
  getPublishedById(id: string): Promise<CatalogItem | null> {
    return catalogRepository.getPublishedById(id);
  },
  listSlides(): Promise<PromoSlideRow[]> {
    return promoSlidesRepository.listPublished();
  }
};