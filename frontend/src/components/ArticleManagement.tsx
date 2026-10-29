import React, { useState, useEffect, useCallback } from 'react';
import { Article, ArticleFormData } from '../types';
import { articlesApi } from '../services/api';
import { Plus, Search, Trash2, Edit2, AlertCircle, Box } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';

const ArticleManagement: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  const [formData, setFormData] = useState<ArticleFormData & { cout?: number }>({
    reference_interne: '',
    nom: '',
    cout: 0, // ✅ Le coût est calculé automatiquement
    responsable: '',
    unite_mesure: 'unité',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    loadArticles();
  }, [currentPage, debouncedSearchTerm]);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const data = await articlesApi.getAll({
        search: debouncedSearchTerm,
        page: currentPage,
        per_page: perPage
      });
      setArticles(data.articles || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.reference_interne.trim()) {
      setError('La référence interne est requise');
      return;
    }
    if (!formData.nom.trim()) {
      setError('Le nom de l\'article est requis');
      return;
    }

    try {
      if (editingId) {
        // Lors de la modification, on n'envoie pas le champ 'cout' car il est calculé
        const { cout, ...dataToUpdate } = formData;
        await articlesApi.update(editingId, dataToUpdate);
        setSuccess('Article mis à jour avec succès');
      } else {
        // Lors de la création, on initialise 'cout' à 0 (calculé ensuite par le backend)
        const dataToCreate = { ...formData, cout: 0 };
        await articlesApi.create(dataToCreate);
        setSuccess('Article créé avec succès');
      }
      
      loadArticles();
      resetForm();
      setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleEdit = (article: Article) => {
    setEditingId(article.id);
    setFormData({
      reference_interne: article.reference_interne,
      nom: article.nom,
      cout: article.cout,
      responsable: article.responsable,
      unite_mesure: article.unite_mesure,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) return;
    try {
      await articlesApi.delete(id);
      setSuccess('Article supprimé avec succès');
      loadArticles();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const resetForm = () => {
    setFormData({
      reference_interne: '',
      nom: '',
      cout: 0,
      responsable: '',
      unite_mesure: 'unité',
    });
    setEditingId(null);
    setError(null);
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MGA',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des Articles</h1>
          <p className="text-gray-600 mt-1">Référentiel des articles et coût moyen (CMUP)</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nouvel Article</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          ✓ {success}
        </div>
      )}

      {/* Barre de recherche */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un article (référence, nom, responsable...)"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Liste des articles */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Réf. Interne</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coût Moyen (CMUP)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsable</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unité</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {articles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Box className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      {searchTerm ? 'Aucun article trouvé' : 'Aucun article enregistré'}
                    </p>
                  </td>
                </tr>
              ) : (
                articles.map((article) => (
                  <tr key={article.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{article.reference_interne}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{article.nom}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-700">{formatPrice(article.cout || 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{article.responsable || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{article.unite_mesure}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button onClick={() => handleEdit(article)} className="text-blue-600 hover:text-blue-900"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(article.id)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">Page {currentPage} sur {totalPages} ({total} articles au total)</div>
            <div className="flex space-x-2">
              <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">Précédent</button>
              <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Box className="mr-2" size={24} />
                {editingId ? 'Modifier l\'Article' : 'Nouvel Article'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Référence Interne <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.reference_interne}
                  onChange={(e) => setFormData({ ...formData, reference_interne: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: ART-001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'Article <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Ciment Portland"
                  required
                />
              </div>

              {/* ✅ CHAMP COÛT EN LECTURE SEULE */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coût Moyen (CMUP)
                </label>
                <input
                  type="number"
                  value={formData.cout || 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-600"
                  readOnly
                  title="Le coût est calculé automatiquement via les mouvements d'entrée"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Calculé automatiquement en fonction des prix d'achat des mouvements d'entrée.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    value={formData.responsable}
                    onChange={(e) => setFormData({ ...formData, responsable: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nom du responsable"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unité de Mesure</label>
                  <input
                    type="text"
                    value={formData.unite_mesure}
                    onChange={(e) => setFormData({ ...formData, unite_mesure: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: unité, kg, m"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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

export default ArticleManagement; // ✅ L'export default est bien présent ici