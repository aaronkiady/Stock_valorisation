/**
 * Types TypeScript pour l'application de gestion de stock
 * ✅ CORRECTION : Ajout de type_mouvement dans Mouvement
 */

// ==================== TYPES DE BASE ====================

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'RespStock' | 'user';
  full_name: string;
  created_at?: string;
}

export interface Article {
  id: number;
  reference_interne: string;
  nom: string;
  cout: number;
  responsable: string;
  unite_mesure: string;
  created_at?: string;
}

export interface Chantier {
  id: number;
  code: string;
  nom: string;
  statut: 'Actif' | 'Inactif' | 'Clôturé';
  created_at?: string;
  date_creation?: string;
}

export interface Stock {
  id: number;
  numero_fiche: number;
  reference_odoo?: string;
  chantier_id: number;
  article_id: number;
  quantite_initiale: number;
  quantite_finale: number;
  unite?: string;
  statut: string;
  created_at?: string;
  prix_unitaire?: number;
  
  prix_total?: number;
  
  // Relations
  chantier?: Chantier;
  article?: Article;
}

// ✅ CORRECTION : Ajout de type_mouvement
export interface Mouvement {
  id: number;
  date: string;
  numero_bs_br_cj: string;
  chantier_id?: number;
  stock_id: number;
  article_id: number;
  entree?: number;
  sortie?: number;
  prix_unitaire?: number;
  type_mouvement: 'ENTREE' | 'SORTIE';
  commentaire?: string;
  created_at?: string;
  utilisateur?: string;
  
  // Relations
  chantier?: Chantier;
  stock?: Stock;
  article?: Article;
  stock_numero?: number;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  utilisateur: string;
  timestamp: string;
}

// ==================== TYPES POUR LE DASHBOARD ====================

export interface DashboardStats {
  nb_articles: number;
  nb_chantiers: number;
  stock: {
    total_valeur: number;
    total_quantite: number;
    count_normal: number;
    count_alert: number;
    count_urgent: number;
  };
  mouvements: {
    total_entrees: number;
    total_sorties: number;
    total_mouvements: number;
  };
}

export interface StockParChantier {
  chantier: string;
  entrees: number;
  sorties: number;
}

// ==================== TYPES POUR LA PAGINATION ====================

export interface PaginatedResponse<T> {
  data?: T[];
  items?: T[];
  chantiers?: T[];
  users?: T[];
  articles?: T[];
  stocks?: T[];
  mouvements?: T[];
  logs?: T[];
  total: number;
  pages: number;
  current_page: number;
  per_page?: number;
}

export interface ApiError {
  error: string;
}

export interface ApiSuccess {
  message: string;
}

// ==================== TYPES POUR LES FORMULAIRES ====================

export interface ArticleFormData {
  reference_interne: string;
  nom: string;
  cout: number;
  responsable: string;
  unite_mesure: string;
}

export interface StockFormData {
  numero_fiche: number;
  reference_odoo?: string;
  chantier_id: number;
  article_id: number;
  unite?: string;
  quantite_initiale: number;
  prix_unitaire?: number;
  stock_initial?: number;
}

export interface MouvementFormData {
  date: string;
  numero_bs_br_cj: string;
  chantier_id?: number;
  stock_id: number;
  article_id: number;
  entree?: number;
  sortie?: number;
  prix_unitaire?: number;
  commentaire?: string;
}

export interface ChantierFormData {
  code: string;
  nom: string;
  statut: 'Actif' | 'Inactif' | 'Clôturé';
}

// ==================== TYPES POUR LES FILTRES ====================

export interface SearchFilters {
  search?: string;
  statut?: string;
  chantier_id?: number;
  stock_id?: number;
  article_id?: number;
  date_debut?: string;
  date_fin?: string;
  type_mouvement?: '' | 'ENTREE' | 'SORTIE';
  utilisateur?: string;
  table_name?: string;
  action?: string;
  page?: number;
  per_page?: number;
}

export interface FormErrors {
  [key: string]: string;
}

// ==================== TYPES POUR L'AUTHENTIFICATION ====================

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ==================== TYPES POUR LE PROFIL ====================

export interface ProfileFormData {
  username?: string;
  email?: string;
  full_name?: string;
  password?: string;
  confirm_password?: string;
}
