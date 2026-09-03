import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { Product, Category } from '@beim/contracts'
import type { CatalogDataSource } from '../../adapters/CatalogDataSource'
import { useCatalog } from '../../adapters/useCatalog'
import { colors, spacing } from '../../theme'

type CategoryScreenProps = {
  dataSource?: CatalogDataSource
}

export default function CategoryScreen({ dataSource }: CategoryScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const catalog = dataSource ?? useCatalog()
  const [category, setCategory] = useState<Category | undefined>(undefined)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    let mounted = true
    const categoryId = Array.isArray(id) ? id[0] : id
    Promise.all([catalog.listCategories(), catalog.listProducts()])
      .then(([categories, allProducts]) => {
        if (!mounted) {
          return
        }
        setCategory(
          categories.find((item) => item.id === categoryId),
        )
        setProducts(
          allProducts.filter((product) => product.categoryId === categoryId),
        )
      })
      .catch(() => {
        if (mounted) {
          setProducts([])
        }
      })
    return () => {
      mounted = false
    }
  }, [catalog, id])

  return (
    <View style={styles.container} testID="category-screen">
      <Text style={styles.heading}>{category?.name ?? 'Categoría'}</Text>
      <FlatList
        testID="category-products"
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.price}>{`${item.currency} ${item.price}`}</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  price: {
    fontSize: 14,
    color: colors.primary,
    marginTop: spacing.xs,
  },
})
