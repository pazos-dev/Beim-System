import { prisma } from './prisma'
import { toReceiptContract, type BeimReceipt } from '../mapper/receipt'

/**
 * Get a receipt by ID, including parts, payments, and checklists.
 */
export async function getReceiptById(id: string): Promise<BeimReceipt | null> {
  const row = await prisma.beimReceipt.findUnique({
    where: { id },
    include: { parts: true, payments: true, checklists: true },
  })
  if (!row) return null
  const { parts, payments, checklists, ...receiptRow } = row
  return toReceiptContract(receiptRow, { parts, payments, checklists })
}

/**
 * Search receipts by case-insensitive LIKE across client_name, client_id,
 * device_model, and imei_serial.
 */
export async function searchReceipts(query: string): Promise<BeimReceipt[]> {
  const like = `%${query}%`
  const rows = await prisma.beimReceipt.findMany({
    where: {
      OR: [
        { clientName: { contains: like, mode: 'insensitive' } },
        { clientId: { contains: like, mode: 'insensitive' } },
        { deviceModel: { contains: like, mode: 'insensitive' } },
        { imeiSerial: { contains: like, mode: 'insensitive' } },
      ],
    },
    include: { parts: true, payments: true, checklists: true },
  })
  return rows.map((row) => {
    const { parts, payments, checklists, ...receiptRow } = row
    return toReceiptContract(receiptRow, { parts, payments, checklists })
  })
}

/**
 * Create a new receipt.
 */
export async function createReceipt(data: {
  receiptNumber: number
  userId?: string | null
  repairStatus?: string
  clientName?: string
  clientId?: string
  clientPhone?: string
  deviceBrand?: string
  deviceModel?: string
  deviceColor?: string
  imeiSerial?: string
  assignedTechnicianId?: string | null
  diagnosticNotes?: string
  quoteStatus?: string
  quoteTotal?: number
  quoteSentAt?: Date | null
  quoteApprovedAt?: Date | null
  qaStatus?: string
  qaCompletedAt?: Date | null
  warrantyStartsAt?: Date | null
  warrantyEndsAt?: Date | null
  invoiceNumber?: string
  paymentStatus?: string
  services?: string[]
  reportedIssue?: string
  visualItems?: string[]
  entryDateText?: string
  deliveryTime?: string
  deliveryUnit?: string
  warrantyOffered?: string
  price?: string
  unlockCode?: string
  unlockPassword?: string
  unlockPattern?: string
  terms?: string
  payload?: Record<string, unknown>
}): Promise<BeimReceipt> {
  const createData: Record<string, unknown> = { receiptNumber: data.receiptNumber }
  if (data.userId !== undefined) createData['userId'] = data.userId
  if (data.repairStatus !== undefined) createData['repairStatus'] = data.repairStatus
  if (data.clientName !== undefined) createData['clientName'] = data.clientName
  if (data.clientId !== undefined) createData['clientId'] = data.clientId
  if (data.clientPhone !== undefined) createData['clientPhone'] = data.clientPhone
  if (data.deviceBrand !== undefined) createData['deviceBrand'] = data.deviceBrand
  if (data.deviceModel !== undefined) createData['deviceModel'] = data.deviceModel
  if (data.deviceColor !== undefined) createData['deviceColor'] = data.deviceColor
  if (data.imeiSerial !== undefined) createData['imeiSerial'] = data.imeiSerial
  if (data.assignedTechnicianId !== undefined) createData['assignedTechnicianId'] = data.assignedTechnicianId
  if (data.diagnosticNotes !== undefined) createData['diagnosticNotes'] = data.diagnosticNotes
  if (data.quoteStatus !== undefined) createData['quoteStatus'] = data.quoteStatus
  if (data.quoteTotal !== undefined) createData['quoteTotal'] = data.quoteTotal
  if (data.quoteSentAt !== undefined) createData['quoteSentAt'] = data.quoteSentAt
  if (data.quoteApprovedAt !== undefined) createData['quoteApprovedAt'] = data.quoteApprovedAt
  if (data.qaStatus !== undefined) createData['qaStatus'] = data.qaStatus
  if (data.qaCompletedAt !== undefined) createData['qaCompletedAt'] = data.qaCompletedAt
  if (data.warrantyStartsAt !== undefined) createData['warrantyStartsAt'] = data.warrantyStartsAt
  if (data.warrantyEndsAt !== undefined) createData['warrantyEndsAt'] = data.warrantyEndsAt
  if (data.invoiceNumber !== undefined) createData['invoiceNumber'] = data.invoiceNumber
  if (data.paymentStatus !== undefined) createData['paymentStatus'] = data.paymentStatus
  if (data.services !== undefined) createData['services'] = data.services
  if (data.reportedIssue !== undefined) createData['reportedIssue'] = data.reportedIssue
  if (data.visualItems !== undefined) createData['visualItems'] = data.visualItems
  if (data.entryDateText !== undefined) createData['entryDateText'] = data.entryDateText
  if (data.deliveryTime !== undefined) createData['deliveryTime'] = data.deliveryTime
  if (data.deliveryUnit !== undefined) createData['deliveryUnit'] = data.deliveryUnit
  if (data.warrantyOffered !== undefined) createData['warrantyOffered'] = data.warrantyOffered
  if (data.price !== undefined) createData['price'] = data.price
  if (data.unlockCode !== undefined) createData['unlockCode'] = data.unlockCode
  if (data.unlockPassword !== undefined) createData['unlockPassword'] = data.unlockPassword
  if (data.unlockPattern !== undefined) createData['unlockPattern'] = data.unlockPattern
  if (data.terms !== undefined) createData['terms'] = data.terms
  if (data.payload !== undefined) createData['payload'] = data.payload

  const created = await prisma.beimReceipt.create({
    data: createData as Parameters<typeof prisma.beimReceipt.create>[0]['data'],
  })
  return toReceiptContract(created)
}

/**
 * Update a receipt by ID.
 */
export async function updateReceipt(
  id: string,
  data: {
    repairStatus?: string
    clientName?: string
    clientId?: string
    clientPhone?: string
    deviceBrand?: string
    deviceModel?: string
    deviceColor?: string
    imeiSerial?: string
    assignedTechnicianId?: string | null
    diagnosticNotes?: string
    quoteStatus?: string
    quoteTotal?: number
    quoteSentAt?: Date | null
    quoteApprovedAt?: Date | null
    qaStatus?: string
    qaCompletedAt?: Date | null
    warrantyStartsAt?: Date | null
    warrantyEndsAt?: Date | null
    invoiceNumber?: string
    paymentStatus?: string
    services?: string[]
    reportedIssue?: string
    visualItems?: string[]
    entryDateText?: string
    deliveryTime?: string
    deliveryUnit?: string
    warrantyOffered?: string
    price?: string
    unlockCode?: string
    unlockPassword?: string
    unlockPattern?: string
    terms?: string
    payload?: Record<string, unknown>
  },
): Promise<BeimReceipt> {
  const updateData: Record<string, unknown> = {}
  if (data.repairStatus !== undefined) updateData['repairStatus'] = data.repairStatus
  if (data.clientName !== undefined) updateData['clientName'] = data.clientName
  if (data.clientId !== undefined) updateData['clientId'] = data.clientId
  if (data.clientPhone !== undefined) updateData['clientPhone'] = data.clientPhone
  if (data.deviceBrand !== undefined) updateData['deviceBrand'] = data.deviceBrand
  if (data.deviceModel !== undefined) updateData['deviceModel'] = data.deviceModel
  if (data.deviceColor !== undefined) updateData['deviceColor'] = data.deviceColor
  if (data.imeiSerial !== undefined) updateData['imeiSerial'] = data.imeiSerial
  if (data.assignedTechnicianId !== undefined) updateData['assignedTechnicianId'] = data.assignedTechnicianId
  if (data.diagnosticNotes !== undefined) updateData['diagnosticNotes'] = data.diagnosticNotes
  if (data.quoteStatus !== undefined) updateData['quoteStatus'] = data.quoteStatus
  if (data.quoteTotal !== undefined) updateData['quoteTotal'] = data.quoteTotal
  if (data.quoteSentAt !== undefined) updateData['quoteSentAt'] = data.quoteSentAt
  if (data.quoteApprovedAt !== undefined) updateData['quoteApprovedAt'] = data.quoteApprovedAt
  if (data.qaStatus !== undefined) updateData['qaStatus'] = data.qaStatus
  if (data.qaCompletedAt !== undefined) updateData['qaCompletedAt'] = data.qaCompletedAt
  if (data.warrantyStartsAt !== undefined) updateData['warrantyStartsAt'] = data.warrantyStartsAt
  if (data.warrantyEndsAt !== undefined) updateData['warrantyEndsAt'] = data.warrantyEndsAt
  if (data.invoiceNumber !== undefined) updateData['invoiceNumber'] = data.invoiceNumber
  if (data.paymentStatus !== undefined) updateData['paymentStatus'] = data.paymentStatus
  if (data.services !== undefined) updateData['services'] = data.services
  if (data.reportedIssue !== undefined) updateData['reportedIssue'] = data.reportedIssue
  if (data.visualItems !== undefined) updateData['visualItems'] = data.visualItems
  if (data.entryDateText !== undefined) updateData['entryDateText'] = data.entryDateText
  if (data.deliveryTime !== undefined) updateData['deliveryTime'] = data.deliveryTime
  if (data.deliveryUnit !== undefined) updateData['deliveryUnit'] = data.deliveryUnit
  if (data.warrantyOffered !== undefined) updateData['warrantyOffered'] = data.warrantyOffered
  if (data.price !== undefined) updateData['price'] = data.price
  if (data.unlockCode !== undefined) updateData['unlockCode'] = data.unlockCode
  if (data.unlockPassword !== undefined) updateData['unlockPassword'] = data.unlockPassword
  if (data.unlockPattern !== undefined) updateData['unlockPattern'] = data.unlockPattern
  if (data.terms !== undefined) updateData['terms'] = data.terms
  if (data.payload !== undefined) updateData['payload'] = data.payload

  const updated = await prisma.beimReceipt.update({
    where: { id },
    data: updateData as Parameters<typeof prisma.beimReceipt.update>[0]['data'],
  })
  return toReceiptContract(updated)
}
