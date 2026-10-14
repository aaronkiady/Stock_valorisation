/**
 * Définition des rôles et des menus accessibles.
 * - admin     : tous les menus
 * - RespStock : tous les menus sauf « Utilisateurs » et « Historique »
 * - user      : uniquement « Mouvements »
 */

export type Role = 'admin' | 'RespStock' | 'user';

export const ROLES: Role[] = ['admin', 'RespStock', 'user'];

/** Identifiants des menus (doivent correspondre aux id dans App.tsx). */
export type MenuId =
  | 'dashboard'
  | 'stock'
  | 'mouvements'
  | 'articles'
  | 'chantiers'
  | 'users'
  | 'audit-log';

export const ROLE_MENUS: Record<Role, MenuId[]> = {
  admin: ['dashboard', 'stock', 'mouvements', 'articles', 'chantiers', 'users', 'audit-log'],
  RespStock: ['dashboard', 'stock', 'mouvements', 'articles', 'chantiers'],
  user: ['mouvements'],
};

export function canAccessMenu(role: Role | undefined, menuId: MenuId): boolean {
  if (!role) return false;
  return (ROLE_MENUS[role] || []).includes(menuId);
}

/** Chemin par défaut selon le rôle (premier menu autorisé). */
export function defaultPathForRole(role: Role | undefined): string {
  if (!role) return '/login';
  const first = (ROLE_MENUS[role] || [])[0];
  return first ? `/${first}` : '/login';
}
