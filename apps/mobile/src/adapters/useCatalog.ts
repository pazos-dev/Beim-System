import type { CatalogDataSource } from './CatalogDataSource'
import { MockCatalogDataSource } from './MockCatalogDataSource'

let dataSource: CatalogDataSource | undefined

/**
 * Composition root that returns the active catalog data source.
 * Defaults to the Mock adapter; a future HTTP adapter can be wired here.
 */
export function useCatalog(): CatalogDataSource {
  if (dataSource === undefined) {
    dataSource = new MockCatalogDataSource()
  }
  return dataSource
}
