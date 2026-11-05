/**
 * Service API pour communiquer avec le backend Flask
 */
import {
  Article,
  Chantier,
  Stock,
  Mouvement,
  AuditLog,
  DashboardStats,
  StockParChantier,
  PaginatedResponse,
  ArticleFormData,
  StockFormData,
  MouvementFormData,
  MouvementBatchData,
  ChantierFormData,
  SearchFilters,
  ProfileFormData,
  ValorisationMensuelleResponse,
  ValorisationDetailResponse
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5880/api';

// Helper pour les headers avec authentification
const getHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Helper pour gérer les erreurs
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Une erreur est survenue' }));
    throw new Error(error.error || 'Une erreur est survenue');
  }
  return response.json();
};

// Helper pour télécharger un fichier
const downloadFile = async (url: string, baseFilename: string): Promise<void> => {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  });

  if (!response.ok) {
    let message = 'Erreur lors de l\'export';
    try {
      const err = await response.json();
      message = err.error || message;
    } catch { /* réponse non-JSON */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  const contentType = response.headers.get('Content-Type') || '';
  const ext = contentType.includes('spreadsheetml') ? 'xlsx' : 'csv';

  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${baseFilename}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
};

// ==================== UPLOAD / PJ ====================

export const uploadApi = {
  uploadFile: async (file: File): Promise<{ filename: string; message: string }> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload-pj`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData
    });
    return handleResponse<{ filename: string; message: string }>(response);
  },

  downloadPj: async (filename: string): Promise<void> => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/download-pj/${encodeURIComponent(filename)}`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    });

    if (!response.ok) throw new Error('Fichier introuvable');

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  }
};

// ==================== EXPORT EXCEL ====================

export const exportApi = {
  stocks: async (search: string = ''): Promise<void> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const query = params.toString() ? `?${params.toString()}` : '';
    return downloadFile(`${API_BASE_URL}/stocks/export${query}`, `stocks_${timestamp}`);
  },

  mouvements: async (filters: SearchFilters = {}): Promise<void> => {
    const params = new URLSearchParams();
    if (filters.chantier_id) params.append('chantier_id', filters.chantier_id.toString());
    if (filters.date_debut) params.append('date_debut', filters.date_debut);
    if (filters.date_fin) params.append('date_fin', filters.date_fin);
    if (filters.type_mouvement) params.append('type_mouvement', filters.type_mouvement);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const query = params.toString() ? `?${params.toString()}` : '';
    return downloadFile(`${API_BASE_URL}/mouvements/export${query}`, `mouvements_${timestamp}`);
  }
};

// ==================== IMPORT CSV (STOCKS) ====================

export interface ImportReport {
  total: number;
  importes: number;
  ignores: number;
  erreurs: { ligne: number; erreur: string }[];
}

export const importApi = {
  importStocks: async (file: File): Promise<ImportReport> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/stocks/import`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData
    });
    return handleResponse<ImportReport>(response);
  }
};

// ==================== ARTICLES ====================

export const articlesApi = {
  getAll: async (filters: SearchFilters = {}): Promise<PaginatedResponse<Article>> => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());

    const response = await fetch(`${API_BASE_URL}/articles?${params}`, {
      headers: getHeaders()
    });
    
    const data = await handleResponse<any>(response);
    
    if (Array.isArray(data)) {
      return { articles: data, items: data, total: data.length, pages: 1, current_page: 1 };
    } else if (data && typeof data === 'object') {
      return {
        articles: data.articles || data.items || [],
        items: data.articles || data.items || [],
        total: data.total || (data.articles || data.items || []).length,
        pages: data.pages || 1,
        current_page: data.current_page || 1
      };
    }
    
    return { articles: [], items: [], total: 0, pages: 0, current_page: 1 };
  },

  getById: async (id: number): Promise<Article> => {
    const response = await fetch(`${API_BASE_URL}/articles/${id}`, { headers: getHeaders() });
    return handleResponse<Article>(response);
  },

  create: async (data: ArticleFormData): Promise<Article> => {
    const response = await fetch(`${API_BASE_URL}/articles`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Article>(response);
  },

  update: async (id: number, data: Partial<ArticleFormData>): Promise<Article> => {
    const response = await fetch(`${API_BASE_URL}/articles/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Article>(response);
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/articles/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  }
};

// ==================== CHANTIERS ====================

export const chantiersApi = {
  getAll: async (filters: SearchFilters = {}): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());

    const response = await fetch(`${API_BASE_URL}/chantiers?${params}`, {
      headers: getHeaders()
    });
    
    const data = await handleResponse<any>(response);
    
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (data.chantiers) return data.chantiers;
      if (data.items) return data.items;
      return data;
    }
    return [];
  },

  getById: async (id: number): Promise<Chantier> => {
    const response = await fetch(`${API_BASE_URL}/chantiers/${id}`, { headers: getHeaders() });
    return handleResponse<Chantier>(response);
  },

  create: async (data: ChantierFormData): Promise<Chantier> => {
    const response = await fetch(`${API_BASE_URL}/chantiers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Chantier>(response);
  },

  update: async (id: number, data: Partial<ChantierFormData>): Promise<Chantier> => {
    const response = await fetch(`${API_BASE_URL}/chantiers/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Chantier>(response);
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/chantiers/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  }
};

// ==================== STOCKS ====================

export const stocksApi = {
  getAll: async (filters: SearchFilters = {}): Promise<PaginatedResponse<Stock>> => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.chantier_id) params.append('chantier_id', filters.chantier_id.toString());
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());

    const response = await fetch(`${API_BASE_URL}/stocks?${params}`, {
      headers: getHeaders()
    });
    return handleResponse<PaginatedResponse<Stock>>(response);
  },

  getById: async (id: number): Promise<Stock> => {
    const response = await fetch(`${API_BASE_URL}/stocks/${id}`, { headers: getHeaders() });
    return handleResponse<Stock>(response);
  },

  create: async (data: StockFormData): Promise<Stock> => {
    const response = await fetch(`${API_BASE_URL}/stocks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Stock>(response);
  },

  update: async (id: number, data: Partial<StockFormData>): Promise<Stock> => {
    const response = await fetch(`${API_BASE_URL}/stocks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Stock>(response);
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/stocks/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  },

  validate: async (id: number): Promise<Stock> => {
    const response = await fetch(`${API_BASE_URL}/stocks/${id}/validate`, {
      method: 'PUT',
      headers: getHeaders()
    });
    return handleResponse<Stock>(response);
  }
};

// ==================== MOUVEMENTS ====================

export const mouvementsApi = {
  getAll: async (filters: SearchFilters = {}): Promise<PaginatedResponse<Mouvement>> => {
    const params = new URLSearchParams();
    if (filters.stock_id) params.append('stock_id', filters.stock_id.toString());
    if (filters.chantier_id) params.append('chantier_id', filters.chantier_id.toString());
    if (filters.type_mouvement) params.append('type_mouvement', filters.type_mouvement);
    if (filters.statut_validation) params.append('statut_validation', filters.statut_validation);
    if (filters.date_debut) params.append('date_debut', filters.date_debut);
    if (filters.date_fin) params.append('date_fin', filters.date_fin);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());

    const response = await fetch(`${API_BASE_URL}/mouvements?${params}`, {
      headers: getHeaders()
    });
    return handleResponse<PaginatedResponse<Mouvement>>(response);
  },

  getById: async (id: number): Promise<Mouvement> => {
    const response = await fetch(`${API_BASE_URL}/mouvements/${id}`, { headers: getHeaders() });
    return handleResponse<Mouvement>(response);
  },

  create: async (data: MouvementFormData): Promise<Mouvement> => {
    const response = await fetch(`${API_BASE_URL}/mouvements`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Mouvement>(response);
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/mouvements/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  },

  validate: async (id: number): Promise<Mouvement> => {
    const response = await fetch(`${API_BASE_URL}/mouvements/${id}/validate`, {
      method: 'PUT',
      headers: getHeaders()
    });
    return handleResponse<Mouvement>(response);
  },

  createBatch: async (data: MouvementBatchData): Promise<{
    total: number;
    crees: number;
    erreurs: { ligne: number; erreur: string }[];
    mouvements: Mouvement[];
  }> => {
    const response = await fetch(`${API_BASE_URL}/mouvements/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<any>(response);
  }
};

// ==================== AUDIT LOG ====================

export const auditApi = {
  getLogs: async (filters: SearchFilters = {}): Promise<PaginatedResponse<AuditLog>> => {
    const params = new URLSearchParams();
    if (filters.utilisateur) params.append('utilisateur', filters.utilisateur);
    if (filters.table_name) params.append('table_name', filters.table_name);
    if (filters.action) params.append('action', filters.action);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());

    const response = await fetch(`${API_BASE_URL}/audit-logs?${params}`, {
      headers: getHeaders()
    });
    return handleResponse<PaginatedResponse<AuditLog>>(response);
  }
};

// ==================== DASHBOARD ====================

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
      headers: getHeaders()
    });
    return handleResponse<DashboardStats>(response);
  },

  getStockParChantier: async (): Promise<StockParChantier[]> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/stock-par-chantier`, {
      headers: getHeaders()
    });
    return handleResponse<StockParChantier[]>(response);
  }
};

// ==================== UTILISATEURS (ADMIN) ====================

export interface UserData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'RespStock' | 'user';
  created_at?: string;
}

export const usersApi = {
  getAll: async (): Promise<UserData[]> => {
    const response = await fetch(`${API_BASE_URL}/users`, { headers: getHeaders() });
    return handleResponse<UserData[]>(response);
  },

  create: async (data: Partial<UserData> & { password: string }): Promise<UserData> => {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<UserData>(response);
  },

  update: async (id: number, data: Partial<UserData>): Promise<UserData> => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<UserData>(response);
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  }
};

// ==================== AUTHENTIFICATION ====================

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: 'admin' | 'RespStock' | 'user';
  };
}

export const profileApi = {
  get: async (): Promise<UserData> => {
    const response = await fetch(`${API_BASE_URL}/profile`, { headers: getHeaders() });
    return handleResponse<UserData>(response);
  },

  update: async (data: Partial<ProfileFormData>): Promise<UserData> => {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<UserData>(response);
  }
};

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return handleResponse<AuthResponse>(response);
  },

  logout: async (): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse<{ message: string }>(response);
  },

  verifyToken: async (token: string): Promise<{ valid: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return handleResponse<{ valid: boolean }>(response);
  }
};

// ==================== VALORISATION MENSUELLE ====================

export const valorisationApi = {
  getMensuelle: async (year: number): Promise<ValorisationMensuelleResponse> => {
    const response = await fetch(`${API_BASE_URL}/valorisation/mensuelle?year=${year}`, {
      headers: getHeaders()
    });
    return handleResponse<ValorisationMensuelleResponse>(response);
  },

  getDetail: async (year: number, mois: number): Promise<ValorisationDetailResponse> => {
    const response = await fetch(`${API_BASE_URL}/valorisation/mensuelle/${year}/${mois}`, {
      headers: getHeaders()
    });
    return handleResponse<ValorisationDetailResponse>(response);
  },

  exportMois: async (year: number, mois: number): Promise<void> => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return downloadFile(
      `${API_BASE_URL}/valorisation/mensuelle/export?year=${year}&mois=${mois}`,
      `valorisation_${year}_${String(mois).padStart(2, '0')}_${timestamp}`
    );
  }
};