import type { User } from '../types';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  RespStock: 'Responsable Stock',
  user: 'Utilisateur',
  magasinier: 'Magasinier',
  RespChantier: 'Responsable Chantier',
};

export function canValidate(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['admin', 'RespStock', 'RespChantier'].includes(user.role);
}

export function canCreateMouvement(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['admin', 'RespStock', 'magasinier', 'user'].includes(user.role);
}

export function canAccessChantier(user: User | null | undefined, chantierId: number): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'RespStock') return true;
  return (user.chantiers ?? []).includes(chantierId);
}

export function getChantiersAutorises(user: User | null | undefined) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'RespStock') return null; // null = tous
  return user.chantiers ?? [];
}