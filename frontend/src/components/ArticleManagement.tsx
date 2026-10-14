/**
 * ArticleManagement - Gestion complète des articles
 * Permet de créer, modifier, supprimer et lister les articles
 */
import React, { useState, useEffect } from 'react';
import { Article } from '../types';
import { articlesApi } from '../services/api';
import { Package, Plus, Edit2, Trash2, Search, AlertCircle, X } from 'lucide-react';

const ArticleManagement: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [formData, setFormData] = useState({
    reference_interne: '',
    nom: '',
    cout: 0,
    responsable: '',
    unite_mesure: 'unité'
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadArticles();
  }, [currentPage, searchTerm]);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const data = await articlesApi.getAll({ 
        search: searchTerm, 
        page: currentPage,
        per_page: 20
      });
      setArticles(data.articles || []);
      setTotalPages(data.pages);
      setTotal(data.total);
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

    // Validation
    if (!formData.reference_interne.trim()) {
      setError('La référence interne est obligatoire');
      return;
    }

    if (!formData.nom.trim()) {
      setError('Le nom de l\'article est obligatoire');
      return;
    }

    try {
      if (editingId) {
        await articlesApi.update(editingId, formData);
        setSuccess('Article modifié avec succès');
      } else {
        await articlesApi.create(formData);
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
    setFormData({
      reference_interne: article.reference_interne,
      nom: article.nom,
      cout: article.cout,
      responsable: article.responsable,
      unite_mesure: article.unite_mesure
    });
    setEditingId(article.id);
    setShowModal(true);
    setError(null);
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
      unite_mesure: 'unité'
    });
    setEditingId(null);
    setError(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  if (loading && articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Package className="mr-3" size={32} />
            Gestion des Articles
          </h1>
          <p className="text-gray-600 mt-1">{total} articles au total</p>
        </div>
        <button
          onClick={handleOpenModal}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Nouvel Article</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          ✓ {success}
        </div>
      )}

      {/* Barre de recherche */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center space-x-2">
          <Search className="text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un article (référence, nom)..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 px-3 py-2 border-0 focus:ring-0 focus:outline-none"
          />
        </div>
      </div>

      {/* Tableau des articles */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Référence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nom
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Coût
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Responsable
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unité
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {articles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Package className="mx-auto mb-2 text-gray-400" size={48} />
                  <p>Aucun article trouvé</p>
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {article.reference_interne}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{article.nom}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {article.cout.toFixed(2)} MGA
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{article.responsable}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{article.unite_mesure}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleEdit(article)}
                      className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                      title="Modifier"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(article.id)}
                      className="text-red-600 hover:text-red-900 inline-flex items-center"
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
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            Page {currentPage} sur {totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Précédent
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Modal Formulaire */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold flex items-center">
                <Package className="mr-2" size={24} />
                {editingId ? 'Modifier l\'Article' : 'Nouvel Article'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded flex items-start">
                  <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Référence Interne <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.reference_interne}
                    onChange={(e) => setFormData({ ...formData, reference_interne: e.target.value })}
                    placeholder="Ex: 1100BA2I003"
                    disabled={editingId !== null}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de l'Article <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Ex: Boulon inox A2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coût (Ariary)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cout}
                    onChange={(e) => setFormData({ ...formData, cout: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Responsable
                  </label>
                  <input
                    type="text"
                    value={formData.responsable}
                    onChange={(e) => setFormData({ ...formData, responsable: e.target.value })}
                    placeholder="Ex: Jean Dupont"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unité de Mesure
                  </label>
                  <select
                    value={formData.unite_mesure}
                    onChange={(e) => setFormData({ ...formData, unite_mesure: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="unité">unité</option>
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                    <option value="m">m</option>
                    <option value="m²">m²</option>
                    <option value="m³">m³</option>
                    <option value="boîte">boîte</option>
                    <option value="paquet">paquet</option>
                  </select>
                </div>
              </div>

              {/* Boutons */}
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
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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

export default ArticleManagement;
