import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

const mockParams: Record<string, string> = {}
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('StackScreen', null, children),
  },
}))

import ProductScreen from '../product/[id]'
import { renderRN } from '../../test/renderRN'
import { MockCatalogDataSource } from '../../adapters/MockCatalogDataSource'

describe('ProductScreen', () => {
  beforeEach(() => {
    delete mockParams['id']
  })

  it('renders name, price, currency, brand, model and stock', async () => {
    mockParams['id'] = 'prod-1'
    const r = await renderRN(
      <ProductScreen dataSource={new MockCatalogDataSource()} />,
    )
    const text = r.textContent()
    expect(text).toContain('iPhone 15 Pro')
    expect(text).toContain('USD')
    expect(text).toContain('1500')
    expect(text).toContain('Apple')
    expect(text).toContain('A2849')
    expect(text).toContain('5')
    r.unmount()
  })

  it('shows a not-found message when the product does not exist', async () => {
    mockParams['id'] = 'missing'
    const r = await renderRN(
      <ProductScreen dataSource={new MockCatalogDataSource()} />,
    )
    expect(r.textContent()).toContain('Producto no encontrado')
    r.unmount()
  })
})
