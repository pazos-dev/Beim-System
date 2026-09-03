/**
 * Lightweight react-native mock for vitest (jsdom) rendering.
 * React Native's real bundle cannot parse under plain Node, so host
 * components are re-implemented as plain React components that produce a
 * renderable tree for react-test-renderer assertions.
 */
import React from 'react'

export type RNProps = {
  children?: React.ReactNode
  testID?: string
  [key: string]: unknown
}

function hostComponent(displayName: string) {
  const Component: React.FC<RNProps> = ({ children, ...rest }) =>
    React.createElement(displayName, rest, children)
  Component.displayName = displayName
  return Component
}

export const View = hostComponent('View')
export const Text = hostComponent('Text')
export const Pressable = hostComponent('Pressable')
export const ScrollView = hostComponent('ScrollView')
export const Image = hostComponent('Image')
export const TouchableOpacity = hostComponent('TouchableOpacity')

export type FlatListProps = {
  data: readonly unknown[] | null | undefined
  renderItem?: (info: { item: unknown; index: number }) => React.ReactNode
  keyExtractor?: (item: unknown, index: number) => string
  ListEmptyComponent?: React.ReactElement | React.ComponentType<unknown> | null
  contentContainerStyle?: unknown
  testID?: string
  [key: string]: unknown
}

export const FlatList: React.FC<FlatListProps> = ({
  data,
  renderItem,
  keyExtractor,
  ListEmptyComponent,
  ...rest
}) => {
  const items = data ?? []
  if (items.length === 0 && ListEmptyComponent) {
    return React.createElement(
      'FlatList',
      rest,
      React.isValidElement(ListEmptyComponent)
        ? ListEmptyComponent
        : React.createElement(ListEmptyComponent as React.ComponentType),
    )
  }
  const nodes = items.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index)
    return React.createElement(
      React.Fragment,
      { key },
      renderItem ? renderItem({ item, index }) : null,
    )
  })
  return React.createElement('FlatList', rest, nodes)
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown) => style,
}

export const Platform = {
  OS: 'ios',
  select: <T extends Record<string, unknown>>(specifics: T): unknown =>
    specifics['ios'] ?? Object.values(specifics)[0],
  Version: 0,
}

export const ActivityIndicator = hostComponent('ActivityIndicator')

export function requireNativeComponent(name: string) {
  return hostComponent(name)
}
