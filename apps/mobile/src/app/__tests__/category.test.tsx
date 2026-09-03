import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

const mockParams: Record<string, string> = {}
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Link', null, children),
}))

import CategoryScreen from '../category/[id]'
import { renderRN } from '../../test/renderRN'
import { MockCatalogDataSource } from '../../adapters/MockCatalogDataSource'

describe('CategoryScreen', () => {
  beforeEach(() => {
    delete mockParams['id']
  })

  it('renders the category heading and only the matching products', async () => {
    mockParams['id'] = 'cat-1'
    const r = await renderRN(
      <CategoryScreen dataSource={new MockCatalogDataSource()} />,
    )
    const text = r.textContent()
    expect(text).toContain('Celulares')
    expect(text).toContain('iPhone 15 Pro')
    expect(text).toContain('Samsung Galaxy S24')
    expect(text).toContain('Motorola G54')
    // Products from other categories must NOT appear.
    expect(text).not.toContain('MacBook Air M3')
    r.unmount()
  })
})
