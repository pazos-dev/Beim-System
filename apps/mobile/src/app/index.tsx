import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, Image } from 'react-native'
import type { Product } from '@beim/contracts'
import type { CatalogDataSource } from '../adapters/CatalogDataSource'
import { useCatalog } from '../adapters/useCatalog'
import { colors, spacing } from '../theme'

type HomeScreenProps = {
  dataSource?: CatalogDataSource
}

function ProductCard({ product }: { product: Product }) {
  return (
    <View style={styles.card}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Sin imagen</Text>
        </View>
      )}
      <Text style={styles.productName}>{product.name}</Text>
      <Text style={styles.price}>{`${product.currency} ${product.price}`}</Text>
    </View>
  )
}

function EmptyState() {
  return <Text style={styles.emptyText}>No hay productos disponibles</Text>
}

export default function HomeScreen({ dataSource }: HomeScreenProps) {
  const catalog = dataSource ?? useCatalog()
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    let mounted = true
    catalog
      .listProducts()
      .then((result) => {
        if (mounted) {
          setProducts(result)
        }
      })
      .catch(() => {
        if (mounted) {
          setProducts([])
        }
      })
    return () => {
      mounted = false
    }
  }, [catalog])

  return (
    <View style={styles.container} testID="home-screen">
      <Text style={styles.heading}>Catálogo</Text>
      <FlatList
        testID="product-list"
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} />}
        ListEmptyComponent={EmptyState}
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
  image: {
    width: 64,
    height: 64,
    marginBottom: spacing.sm,
  },
  placeholder: {
    width: 64,
    height: 64,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.placeholder,
    fontSize: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  price: {
    fontSize: 14,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
