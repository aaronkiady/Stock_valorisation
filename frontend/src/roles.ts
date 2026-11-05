export type Role = 'admin' | 'RespStock' | 'user';

export const ROLES: Role[] = ['admin', 'RespStock', 'user'];

export type MenuId =
  | 'dashboard'
  | 'stock'
  | 'mouvements'
  | 'valorisation'
  | 'couts' // ✅ NOUVEAU
  | 'articles'
  | 'chantiers'
  | 'users'
  | 'audit-log';

export const ROLE_MENUS: Record<Role, MenuId[]> = {
  admin: ['dashboard', 'stock', 'mouvements', 'valorisation', 'couts', 'articles', 'chantiers', 'users', 'audit-log'],
  RespStock: ['dashboard', 'stock', 'mouvements', 'valorisation', 'couts', 'articles', 'chantiers'],
  user: ['mouvements'],
};

export function canAccessMenu(role: Role | undefined, menuId: MenuId): boolean {
  if (!role) return false;
  return (ROLE_MENUS[role] || []).includes(menuId);
}

export function defaultPathForRole(role: Role | undefined): string {
  if (!role) return '/login';
  const first = (ROLE_MENUS[role] || [])[0];
  return first ? `/${first}` : '/login';
}