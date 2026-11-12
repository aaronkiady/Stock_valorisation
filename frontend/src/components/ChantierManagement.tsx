/**
 * ChantierManagement - Gestion complète des chantiers
 * ✅ VERSION CORRIGÉE - Utilisation cohérente de l'API et recherche optimisée
 * ✅ Protection contre "chantiers.filter is not a function"
 * ✅ AJOUT DU CHAMP CLIENT
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Chantier } from '../types';
import { chantiersApi } from '../services/api';
import { Building2, Plus, Edit2, Trash2, Search, AlertCircle, X, User } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';

const ChantierManagement: React.FC = () => {
  // ✅ CORRECTION: S'assurer que chantiers est toujours initialisé comme tableau
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  // ✅ AJOUT DU CHAMP CLIENT
  const [formData, setFormData] = useState({
    code: '',
    nom: '',
    client: '', 
    statut: 'Actif' as 'Actif' | 'Inactif' | 'Clôturé'
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  const loadChantiers = useCallback(async (search: string = '', page: number = 1) => {
    try {
      if (search !== '' || page !== currentPage) {
        setSearchLoading(true);
      }
      
      setError(null);
      
      const data = await chantiersApi.getAll({
        search: search,
        page: page,
        per_page: perPage
      });
      
      if (data && data.chantiers && Array.isArray(data.chantiers)) {
        setChantiers(data.chantiers);
        setTotalPages(data.pages || 1);
        setTotal(data.total || 0);
        setCurrentPage(page);
      } else if (Array.isArray(data)) {
        setChantiers(data);
        setTotal(data.length || 0);
        setTotalPages(1);
      } else {
        console.error('Format de réponse inattendu:', data);
        setChantiers([]);
        setTotal(0);
        setTotalPages(1);
        setError('Format de réponse invalide');
      }
      
    } catch (err) {
      console.error('Erreur lors du chargement des chantiers:', err);
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setChantiers([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
      setSearchLoading(false);
    }
  }, [currentPage, perPage]);

  useEffect(() => {
    if (loading) {
      loadChantiers();
    } else {
      loadChantiers(debouncedSearchTerm, 1);
    }
  }, [debouncedSearchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  const handlePageChange = (newPage: number) => {
    loadChantiers(debouncedSearchTerm, newPage);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.code.trim()) {
      setError('Le code du chantier est obligatoire');
      return;
    }

    if (!formData.nom.trim()) {
      setError('Le nom du chantier est obligatoire');
      return;
    }

    try {
      if (editingId) {
        await chantiersApi.update(editingId, formData);
        setSuccess('Chantier modifié avec succès');
      } else {
        await chantiersApi.create(formData);
        setSuccess('Chantier créé avec succès');
      }

      await loadChantiers(debouncedSearchTerm, currentPage);
      resetForm();
      setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleEdit = (chantier: Chantier) => {
    setFormData({
      code: chantier.code,
      nom: chantier.nom,
      client: chantier.client || '', // ✅ Récupération du client
      statut: chantier.statut
    });
    setEditingId(chantier.id);
    setShowModal(true);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce chantier ?')) return;

    try {
      await chantiersApi.delete(id);
      setSuccess('Chantier supprimé avec succès');
      await loadChantiers(debouncedSearchTerm, currentPage);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      nom: '',
      client: '', // ✅ Reset du client
      statut: 'Actif'
    });
    setEditingId(null);
    setError(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const stats = {
    total: total,
    actif: Array.isArray(chantiers) ? chantiers.filter(c => c.statut === 'Actif').length : 0,
    inactif: Array.isArray(chantiers) ? chantiers.filter(c => c.statut === 'Inactif').length : 0
  };

  if (loading && chantiers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <span className="ml-3 text-gray-600">Chargement des chantiers...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Building2 className="mr-3" size={32} />
            Gestion des Chantiers
          </h1>
          <p className="text-gray-600 mt-1">
            {total} chantier{total > 1 ? 's' : ''} au total
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Nouveau Chantier</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <div>
            <p className="font-medium">Erreur</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          ✓ {success}
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total</p>
          <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Actifs</p>
          <p className="text-2xl font-bold text-green-900">{stats.actif}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 font-medium">Inactifs</p>
          <p className="text-2xl font-bold text-gray-900">{stats.inactif}</p>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center space-x-2 relative">
          <Search className="text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un chantier (code, nom, client)..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="flex-1 px-3 py-2 border-0 focus:ring-0 focus:outline-none"
            disabled={searchLoading}
          />
          
          {searchLoading && (
            <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
            </div>
          )}
          
          {searchTerm && !searchLoading && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Effacer la recherche"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {searchLoading && chantiers.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mr-2"></div>
          <span className="text-sm text-gray-600">Recherche en cours...</span>
        </div>
      )}

      {/* Tableau des chantiers */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nom
                </th>
                {/* ✅ NOUVELLE COLONNE CLIENT */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date de création
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {!Array.isArray(chantiers) || chantiers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Building2 className="mx-auto mb-2 text-gray-400" size={48} />
                    <p className="text-lg font-medium">
                      {!Array.isArray(chantiers) 
                        ? 'Erreur: données invalides' 
                        : debouncedSearchTerm ? 'Aucun résultat trouvé' : 'Aucun chantier trouvé'}
                    </p>
                    <p className="text-sm">
                      {debouncedSearchTerm && Array.isArray(chantiers)
                        ? 'Essayez une autre recherche' 
                        : Array.isArray(chantiers) ? 'Créez votre premier chantier' : 'Veuillez recharger la page'}
                    </p>
                    {debouncedSearchTerm && Array.isArray(chantiers) && (
                      <button
                        onClick={handleClearSearch}
                        className="mt-2 px-4 py-2 text-sm text-green-600 hover:text-green-800 font-medium"
                      >
                        Effacer la recherche
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                chantiers.map((chantier) => (
                  <tr key={chantier.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        {chantier.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 font-medium">{chantier.nom}</span>
                    </td>
                    {/* ✅ AFFICHAGE DU CLIENT */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{chantier.client || '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          chantier.statut === 'Actif'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {chantier.statut}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {chantier.created_at
                        ? new Date(chantier.created_at).toLocaleDateString('fr-FR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEdit(chantier)}
                        className="text-blue-600 hover:text-blue-900 inline-flex items-center transition-colors"
                        title="Modifier"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(chantier.id)}
                        className="text-red-600 hover:text-red-900 inline-flex items-center transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Affichage de {chantiers.length} résultat(s) sur {total} • Page {currentPage} sur {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1 || searchLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Précédent
              </button>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages || searchLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Formulaire */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Building2 className="mr-2" size={24} />
                {editingId ? 'Modifier le chantier' : 'Nouveau chantier'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code du chantier *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ex: CHANT001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du chantier *
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ex: Construction Immeuble A"
                  required
                />
              </div>

              {/* ✅ NOUVEAU CHAMP CLIENT */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client
                </label>
                <input
                  type="text"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ex: Société XYZ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Statut
                </label>
                <select
                  value={formData.statut}
                  onChange={(e) => setFormData({ ...formData, statut: e.target.value as 'Actif' | 'Inactif' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="Actif">Actif</option>
                  <option value="Inactif">Inactif</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  {editingId ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChantierManagement;