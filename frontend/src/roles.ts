// src/roles.ts
// ✅ Source unique de vérité pour les rôles, menus et redirections

// ==================================================================
// RÔLES
// ==================================================================

export type Role = 'admin' | 'RespStock' | 'user' | 'magasinier' | 'RespChantier';

export const ROLES: Role[] = ['admin', 'RespStock', 'user', 'magasinier', 'RespChantier'];

// Rôles autorisés à valider les stocks/mouvements
export const VALIDATEURS: Role[] = ['admin', 'RespStock', 'RespChantier'];

// Rôles ayant accès à tous les chantiers (pas de filtrage)
export const ROLES_ACCES_TOTAL: Role[] = ['admin', 'RespStock'];

// Rôles nécessitant une assignation de chantiers
export const ROLES_AVEC_CHANTIERS: Role[] = ['magasinier', 'RespChantier'];

// ==================================================================
// MENUS
// ==================================================================

export type MenuId =
  | 'dashboard'
  | 'stock'
  | 'mouvements'
  | 'valorisation'
  | 'couts'
  | 'articles'
  | 'chantiers'
  | 'users'
  | 'audit-log';

// Matrice d'accès : role -> menus autorisés
const MENU_ACCESS: Record<Role, MenuId[]> = {
  admin: [
    'dashboard',
    'stock',
    'mouvements',
    'valorisation',
    'couts',
    'articles',
    'chantiers',
    'users',
    'audit-log',
  ],
  RespStock: [
    'dashboard',
    'stock',
    'mouvements',
    'valorisation',
    'couts',
    'articles',
    'chantiers',
  ],
  RespChantier: [
    'mouvements',
    'stock',
  ],
  magasinier: [
    'mouvements',
    'stock',
  ],
  user: [
    'mouvements',
    'stock',
  ],
};

// Vérifie si un rôle peut accéder à un menu
export const canAccessMenu = (role: Role | undefined, menuId: MenuId): boolean => {
  if (!role) return false;
  const allowed = MENU_ACCESS[role];
  if (!allowed) return false;
  return allowed.includes(menuId);
};

// Renvoie tous les menus accessibles pour un rôle (utile pour debug)
export const menusForRole = (role: Role | undefined): MenuId[] => {
  if (!role) return [];
  return MENU_ACCESS[role] || [];
};

// ==================================================================
// REDIRECTION APRÈS LOGIN
// ==================================================================

export const defaultPathForRole = (role: Role | undefined): string => {
  if (!role) return '/login';

  switch (role) {
    case 'admin':
    case 'RespStock':
      return '/dashboard';
    case 'RespChantier':
    case 'magasinier':
    case 'user':
      return '/mouvements';
    default:
      return '/login';
  }
};

// ==================================================================
// HELPERS DIVERS
// ==================================================================

export const isAdmin = (role: Role | undefined): boolean => role === 'admin';
export const isRespStock = (role: Role | undefined): boolean => role === 'RespStock';
export const isRespChantier = (role: Role | undefined): boolean => role === 'RespChantier';
export const isMagasinier = (role: Role | undefined): boolean => role === 'magasinier';

export const canValidate = (role: Role | undefined): boolean =>
  !!role && VALIDATEURS.includes(role);

export const hasFullChantierAccess = (role: Role | undefined): boolean =>
  !!role && ROLES_ACCES_TOTAL.includes(role);

export const requiresChantierAssignment = (role: Role | undefined): boolean =>
  !!role && ROLES_AVEC_CHANTIERS.includes(role);