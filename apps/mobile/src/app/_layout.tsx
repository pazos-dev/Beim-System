import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Catálogo' }} />
      <Stack.Screen name="category/[id]" options={{ title: 'Categoría' }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Producto' }} />
    </Stack>
  )
}
