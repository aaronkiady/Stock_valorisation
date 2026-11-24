/**
 * Types TypeScript pour l'application de gestion de stock
 */
import { Role } from '../roles';

// ✅ UserRole est un alias de Role (source unique : roles.ts)
export type UserRole = Role;

// ==================== TYPES DE BASE ====================

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  last_login?: string;
  chantiers?: number[]; // ✅ IDs des chantiers assignés
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
  client?: string;
  statut: 'Actif' | 'Inactif' | 'Clôturé';
  created_at?: string;
  date_creation?: string;
}

export type StatutValidation = 'Brouillon' | 'Validé' | 'Annulé';

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
  date_inventaire?: string;
  reference_document?: string;
  fichier_pj?: string;
  statut_validation: 'Brouillon' | 'Validé';
  date_validation?: string;
  validateur?: User;
  chantier?: Chantier;
  article?: Article;
}

export type TypeMouvement = 'ENTREE' | 'SORTIE' | 'RESERVATION';

export interface Mouvement {
  id: number;
  date: string;
  numero_bs_br_cj: string;
  reference_document?: string;
  chantier_id?: number;
  stock_id: number;
  article_id: number;
  entree?: number;
  sortie?: number;
  prix_unitaire?: number;
  type_mouvement: 'ENTREE' | 'SORTIE' | 'RESERVATION';
  commentaire?: string;
  created_at?: string;
  utilisateur?: string;
  date_saisie?: string;
  fichier_pj?: string;
  statut_validation: 'Brouillon' | 'Validé' | 'Annulé';
  date_validation?: string;
  validateur?: User;
  chantier?: Chantier;
  stock?: Stock;
  article?: Article;
  stock_numero?: number;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'VALIDATE' | 'IMPORT' | 'ANNULER';
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  utilisateur: string;
  timestamp: string;
}

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
  validation?: {
    stocks_brouillon: number;
    mouvements_brouillon: number;
  };
}

export interface StockParChantier {
  chantier: string;
  entrees: number;
  sorties: number;
}

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
  date_inventaire?: string;
  reference_document?: string;
  fichier_pj?: string;
}

export interface MouvementFormData {
  date: string;
  numero_bs_br_cj: string;
  chantier_id?: number;
  stock_id?: number;
  article_id: number;
  entree?: number;
  sortie?: number;
  prix_unitaire?: number;
  commentaire?: string;
  fichier_pj?: string;
}

export interface MouvementBatchData {
  date: string;
  numero_bs_br_cj: string;
  fichier_pj?: string;
  commentaire?: string;
  type_mouvement?: 'ENTREE' | 'SORTIE' | 'RESERVATION';
  mouvements: {
    stock_id?: number;
    article_id: number;
    chantier_id?: number;
    unite?: string;
    entree?: number;
    sortie?: number;
    prix_unitaire?: number;
  }[];
}

export interface ChantierFormData {
  code: string;
  nom: string;
  client?: string;
  statut: 'Actif' | 'Inactif' | 'Clôturé';
}

export interface SearchFilters {
  search?: string;
  statut?: string;
  statut_validation?: string;
  chantier_id?: number;
  stock_id?: number;
  article_id?: number;
  date_debut?: string;
  date_fin?: string;
  type_mouvement?: '' | 'ENTREE' | 'SORTIE' | 'RESERVATION';
  utilisateur?: string;
  table_name?: string;
  action?: string;
  page?: number;
  per_page?: number;
}

export interface FormErrors {
  [key: string]: string;
}

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

export interface ProfileFormData {
  username?: string;
  email?: string;
  full_name?: string;
  password?: string;
  confirm_password?: string;
}

// ==================== VALORISATION MENSUELLE ====================

export interface ValorisationMois {
  mois: number;
  label: string;
  date_fin: string;
  qte_entrees: number;
  valeur_entrees: number;
  qte_sorties: number;
  valeur_sorties: number;
  nb_articles: number;
  nb_mouvements: number;
}

export interface ValorisationMensuelleResponse {
  year: number;
  mois: ValorisationMois[];
}

export interface ValorisationDetailLigne {
  mouvement_id: number;
  type: 'ENTREE' | 'SORTIE';
  numero_piece: string;
  article_ref: string;
  article_nom: string;
  chantier_code: string;
  chantier_nom: string;
  quantite: number;
  prix_unitaire: number;
  valeur: number;
}

export interface ValorisationDetailResponse {
  year: number;
  mois: number;
  date_debut: string;
  date_fin: string;
  total_entrees: number;
  total_sorties: number;
  detail: ValorisationDetailLigne[];
}