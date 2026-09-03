import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

const mockParams = {}
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Link', null, children),
  Stack: {
    Screen: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('StackScreen', null, children),
  },
}))

import HomeScreen from '../index'
import { renderRN } from '../../test/renderRN'
import { MockCatalogDataSource } from '../../adapters/MockCatalogDataSource'
import type { CatalogDataSource } from '../../adapters/CatalogDataSource'

class EmptyDataSource implements CatalogDataSource {
  async listProducts() {
    return []
  }
  async listCategories() {
    return []
  }
  async getProductById(): Promise<null> {
    return null
  }
}

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product cards with name, price and currency', async () => {
    const r = await renderRN(
      <HomeScreen dataSource={new MockCatalogDataSource()} />,
    )
    const text = r.textContent()
    expect(text).toContain('iPhone 15 Pro')
    expect(text).toContain('USD 1500')
    expect(text).toContain('Samsung Galaxy S24')
    expect(text).toContain('MacBook Air M3')
    r.unmount()
  })

  it('shows an empty-state message when the adapter returns no products', async () => {
    const r = await renderRN(<HomeScreen dataSource={new EmptyDataSource()} />)
    expect(r.textContent()).toContain('No hay productos disponibles')
    r.unmount()
  })
})
