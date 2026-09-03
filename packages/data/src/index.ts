// Access layer
export { prisma } from './access/prisma'
export { listUsers, getUserById, upsertUser } from './access/user'
export { listProducts, getProductById, upsertProduct } from './access/product'
export { listCategories, getCategoryById, upsertCategory } from './access/category'
export { listOrders, getOrderById, createOrder, updateOrder } from './access/order'
export { getReceiptById, searchReceipts, createReceipt, updateReceipt } from './access/receipt'
export { listClients, getClientById, upsertClient } from './access/client'
export { listServices, upsertService, deleteService, listServiceCategories, upsertServiceCategory, deleteServiceCategory } from './access/service'
export { listStockMovements } from './access/stock-movement'

// Mappers
export { decimalToNumber, parseBeimMoney } from './mapper/money'
export { toUserContract } from './mapper/user'
export { toProductContract } from './mapper/product'
export { toCategoryContract } from './mapper/category'
export { toOrderContract, toOrderItemsContract } from './mapper/order'
export { toReceiptContract } from './mapper/receipt'
export { toClientContract } from './mapper/client'
export { toServiceContract } from './mapper/service'
export { toServiceCategoryContract } from './mapper/service-category'
export { toStockMovementContract } from './mapper/stock-movement'

// Types
export type { BeimReceipt } from './mapper/receipt'
