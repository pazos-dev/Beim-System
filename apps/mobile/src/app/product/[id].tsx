import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Image } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { Product } from '@beim/contracts'
import type { CatalogDataSource } from '../../adapters/CatalogDataSource'
import { useCatalog } from '../../adapters/useCatalog'
import { colors, spacing } from '../../theme'

type ProductScreenProps = {
  dataSource?: CatalogDataSource
}

export default function ProductScreen({ dataSource }: ProductScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const catalog = dataSource ?? useCatalog()
  const [product, setProduct] = useState<Product | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    const productId = Array.isArray(id) ? id[0] : id
    catalog
      .getProductById(productId)
      .then((result) => {
        if (mounted) {
          setProduct(result ?? undefined)
        }
      })
      .catch(() => {
        if (mounted) {
          setProduct(undefined)
        }
      })
    return () => {
      mounted = false
    }
  }, [catalog, id])

  if (product === undefined) {
    return (
      <View style={styles.container} testID="product-screen">
        <Text style={styles.notFound}>Producto no encontrado</Text>
      </View>
    )
  }

  return (
    <View style={styles.container} testID="product-screen">
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Sin imagen</Text>
        </View>
      )}
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>{`${product.currency} ${product.price}`}</Text>
      <Text style={styles.detail}>Marca: {product.brand ?? '—'}</Text>
      <Text style={styles.detail}>Modelo: {product.model ?? '—'}</Text>
      <Text style={styles.detail}>Stock: {product.stock}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  image: {
    width: 160,
    height: 160,
    marginBottom: spacing.md,
  },
  placeholder: {
    width: 160,
    height: 160,
    marginBottom: spacing.md,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.placeholder,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  price: {
    fontSize: 20,
    color: colors.primary,
    marginVertical: spacing.sm,
  },
  detail: {
    fontSize: 16,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  notFound: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
