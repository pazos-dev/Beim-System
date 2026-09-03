export { serviceItemsTotal, technicalBaseBudget } from './calculation'
export type { PriceableServiceItem } from './calculation'
export {
  validateOrderStatus,
  isFinishedOrderStatus,
  applyFinishedTimestamp,
  deriveRepairStatusFromServiceItems,
} from './status'
export {
  normalizeServiceItems,
  normalizeServiceItemApprovalStatus,
  findDuplicateServiceItemDescriptions,
  commitApprovedServiceItemStockLocally,
  restoreRemovedServiceItemStockLocally,
} from './service-items'
export type {
  ApprovalStatus,
  RawServiceItem,
  NormalizedServiceItem,
} from './service-items'
