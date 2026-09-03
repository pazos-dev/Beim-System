'use server'

import { upsertClient, softDeleteClient } from '@beim/data'
import { revalidatePath } from 'next/cache'

export interface ActionResult {
  error?: string
}

interface ClientPayload {
  name: string
  document?: string
  phone?: string
  email?: string
}

function parsePayload(formData: FormData): ClientPayload {
  const name = formData.get('name')?.toString().trim() ?? ''
  const document = formData.get('document')?.toString().trim()
  const phone = formData.get('phone')?.toString().trim()
  const email = formData.get('email')?.toString().trim()

  const payload: ClientPayload = { name }
  if (document) payload.document = document
  if (phone) payload.phone = phone
  if (email) payload.email = email

  return payload
}

export async function createClient(formData: FormData): Promise<ActionResult> {
  const payload = parsePayload(formData)
  if (!payload.name) {
    return { error: 'El nombre es obligatorio' }
  }
  await upsertClient(payload)
  revalidatePath('/gestion/clients')
  return {}
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const payload = parsePayload(formData)
  if (!payload.name) {
    return { error: 'El nombre es obligatorio' }
  }
  await upsertClient({ ...payload, id })
  revalidatePath('/gestion/clients')
  return {}
}

export async function deleteClient(id: string): Promise<ActionResult> {
  await softDeleteClient(id)
  revalidatePath('/gestion/clients')
  return {}
}
