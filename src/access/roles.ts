import type { Access, FieldAccess } from 'payload'

export type UserRole = 'admin' | 'reviewer'

type MaybeUser = {
  id?: string | number
  role?: UserRole | null
} | null

export function isAdminUser(user: MaybeUser): boolean {
  return user?.role === 'admin'
}

export const authenticated: Access = ({ req: { user } }) => Boolean(user)

export const adminOnly: Access = ({ req: { user } }) => isAdminUser(user)

export const adminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminUser(user)) return true
  return { id: { equals: user.id } }
}

export const adminField: FieldAccess = ({ req: { user } }) => isAdminUser(user)
