import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { Text } from 'react-native'

export type Rendered = {
  root: ReactTestRenderer['root']
  textContent(): string
  unmount(): void
}

/**
 * Renders a React Native view tree via react-test-renderer against the
 * lightweight react-native mock. Returns helpers for text-based assertions.
 */
export async function renderRN(element: React.ReactElement): Promise<Rendered> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(element)
  })

  const allText = (): string[] => {
    const found: string[] = []
    renderer.root.findAllByType(Text).forEach((node) => {
      const str = String(node.props['children'] ?? '')
      if (str.trim().length > 0) {
        found.push(str)
      }
    })
    return found
  }

  return {
    root: renderer.root,
    textContent: () => allText().join(' | '),
    unmount: () => {
      act(() => {
        renderer.unmount()
      })
    },
  }
}
