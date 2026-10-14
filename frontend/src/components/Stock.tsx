/**
 * Composant Stock - Gestion du stock avec recherche optimisée
 * ✅ CORRECTION MAJEURE : Utilisation de SearchableSelectAPI pour 150 000+ articles
 * ✅ Recherche côté serveur au lieu de charger tous les articles
 * ✅ Performance optimale même avec des millions d'articles
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stock, Article, Chantier, StockFormData } from '../types';
import { stocksApi, articlesApi, chantiersApi, exportApi, importApi } from '../services/api';
import { Plus, Search, Trash2, Edit2, AlertCircle, Package, Download, Upload } from 'lucide-react';
import SearchableSelectAPI from './SearchableSelectAPI'; // ✅ Import du nouveau composant
import SearchableSelect from './SearchableSelect'; // Pour les chantiers (quantité limitée)
import useDebounce from '../hooks/useDebounce';

const StockComponent: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // États pour la pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;
  
  const [formData, setFormData] = useState({
    numero_fiche: 0,
    reference_odoo: '',
    chantier_id: undefined as number | undefined,
    article_id: undefined as number | undefined,
    unite: '',
    quantite_initiale: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    loadStocks();
  }, [currentPage, debouncedSearchTerm]);

  useEffect(() => {
    loadChantiers();
  }, []);

  const loadStocks = async () => {
    try {
      setLoading(true);
      const data = await stocksApi.getAll({
        search: debouncedSearchTerm,
        page: currentPage,
        per_page: perPage
      });
      setStocks(data.stocks || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const loadChantiers = async () => {
    try {
      console.log('🔄 Chargement des chantiers...');
      const data = await chantiersApi.getAll({ per_page: 1000 });
      
      let chantiersArray: Chantier[] = [];
      if (Array.isArray(data)) {
        chantiersArray = data;
      } else if (data && typeof data === 'object') {
        chantiersArray = data.chantiers || [];
      }
      
      console.log(`✅ ${chantiersArray.length} chantiers chargés`);
      setChantiers(chantiersArray);
    } catch (err) {
      console.error('❌ Erreur chargement chantiers:', err);
    }
  };

  // ✅ FONCTION DE RECHERCHE D'ARTICLES CÔTÉ SERVEUR
  const searchArticles = useCallback(async (searchTerm: string) => {
    try {
      console.log('🔍 Recherche articles:', searchTerm);
      
      const data = await articlesApi.getAll({ 
        search: searchTerm, 
        per_page: 50 // Limiter à 50 résultats max
      });
      
      const articles = data.articles || data.items || [];
      console.log(`✅ ${articles.length} articles trouvés`);
      
      return articles.map(article => ({
        value: article.id,
        label: article.reference_interne,
        sublabel: `${article.nom} - ${article.cout} MGA`
      }));
    } catch (err) {
      console.error('❌ Erreur recherche articles:', err);
      return [];
    }
  }, []);

  // ✅ FONCTION POUR RÉCUPÉRER LE LABEL D'UN ARTICLE SÉLECTIONNÉ
  const getArticleLabel = useCallback(async (articleId: number) => {
    try {
      const article = await articlesApi.getById(articleId);
      return `${article.reference_interne} - ${article.nom}`;
    } catch (err) {
      console.error('❌ Erreur chargement article:', err);
      return `Article #${articleId}`;
    }
  }, []);

  // Préparer les options pour les chantiers (quantité limitée, donc SearchableSelect classique)
  const chantierOptions = chantiers
    .filter(c => c.statut === 'Actif')
    .map(chantier => ({
      value: chantier.id,
      label: chantier.code,
      sublabel: chantier.nom
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.chantier_id) {
      setError('Veuillez sélectionner un chantier');
      return;
    }

    if (!formData.article_id) {
      setError('Veuillez sélectionner un article');
      return;
    }

    if (!formData.numero_fiche || formData.numero_fiche <= 0) {
      setError('Le numéro de fiche doit être supérieur à 0');
      return;
    }

    try {
      const dataToSubmit: StockFormData = {
        numero_fiche: formData.numero_fiche,
        reference_odoo: formData.reference_odoo,
        chantier_id: formData.chantier_id,
        article_id: formData.article_id,
        unite: formData.unite,
        quantite_initiale: formData.quantite_initiale,
        stock_initial: formData.quantite_initiale
      };

      if (editingId) {
        await stocksApi.update(editingId, dataToSubmit);
        setSuccess('Stock mis à jour avec succès');
      } else {
        await stocksApi.create(dataToSubmit);
        setSuccess('Stock créé avec succès');
      }
      
      loadStocks();
      resetForm();
      setShowModal(false);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleEdit = (stock: Stock) => {
    setEditingId(stock.id);
    setFormData({
      numero_fiche: stock.numero_fiche,
      reference_odoo: stock.reference_odoo || '',
      chantier_id: stock.chantier_id,
      article_id: stock.article_id,
      unite: stock.unite || '',
      quantite_initiale: stock.quantite_initiale,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce stock ?')) return;

    try {
      await stocksApi.delete(id);
      setSuccess('Stock supprimé avec succès');
      loadStocks();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      await exportApi.stocks(debouncedSearchTerm);
      setSuccess('Export Excel généré avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    setError(null);
    setImportSummary(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
    e.target.value = '';
    if (!file) return;

    try {
      setImporting(true);
      setError(null);
      setImportSummary(null);
      const report = await importApi.importStocks(file);

      let message = `Import terminé : ${report.importes} importé(s), ${report.ignores} ignoré(s) sur ${report.total} ligne(s).`;
      if (report.erreurs.length > 0) {
        const details = report.erreurs
          .slice(0, 10)
          .map(e => `Ligne ${e.ligne}: ${e.erreur}`)
          .join(' | ');
        message += ` Erreurs: ${details}${report.erreurs.length > 10 ? ' …' : ''}`;
      }
      setImportSummary(message);
      loadStocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      numero_fiche: 0,
      reference_odoo: '',
      chantier_id: undefined,
      article_id: undefined,
      unite: '',
      quantite_initiale: 0,
    });
    setEditingId(null);
    setError(null);
  };

  const stats = {
    total: total,
    critique: stocks.filter(s => s.statut === 'Approvisionnement URGENT!').length,
    alert: stocks.filter(s => s.statut === 'Approvisionnement nécessaire').length,
    normal: stocks.filter(s => s.statut === 'Stock Normal').length,
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
          <h1 className="text-3xl font-bold text-gray-900">Gestion des Stocks</h1>
          <p className="text-gray-600 mt-1">Gérer les stocks par chantier et article</p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="btn btn-success flex items-center space-x-2"
          >
            <Upload size={20} />
            <span>{importing ? 'Import en cours...' : 'Importer CSV'}</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <Download size={20} />
            <span>{exporting ? 'Export en cours...' : 'Exporter Excel'}</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Nouveau Stock</span>
          </button>
        </div>
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

      {importSummary && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
          {importSummary}
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total</p>
          <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Normal</p>
          <p className="text-2xl font-bold text-green-900">{stats.normal}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-600 font-medium">Alerte</p>
          <p className="text-2xl font-bold text-yellow-900">{stats.alert}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 font-medium">Critique</p>
          <p className="text-2xl font-bold text-red-900">{stats.critique}</p>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un stock (N° fiche, référence, article...)"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm !== debouncedSearchTerm && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      </div>

      {/* Liste des stocks */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  N° Fiche
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Réf. Odoo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chantier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Article
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qté Initiale
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qté Finale
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prix Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stocks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      {searchTerm ? 'Aucun stock trouvé' : 'Aucun stock enregistré'}
                    </p>
                  </td>
                </tr>
              ) : (
                stocks.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {stock.numero_fiche}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stock.reference_odoo || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {stock.chantier?.code || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>
                        <p className="font-medium">{stock.article?.reference_interne}</p>
                        <p className="text-gray-500">{stock.article?.nom}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {stock.quantite_initiale} {stock.unite}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {stock.quantite_finale} {stock.unite}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatPrice(stock.prix_total || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        stock.statut === 'Stock Normal' ? 'bg-green-100 text-green-800' :
                        stock.statut === 'Approvisionnement nécessaire' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {stock.statut}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEdit(stock)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(stock.id)}
                        className="text-red-600 hover:text-red-900"
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
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Page {currentPage} sur {totalPages} ({total} stocks au total)
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Précédent
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Package className="mr-2" size={24} />
                {editingId ? 'Modifier le Stock' : 'Nouveau Stock'}
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
              {/* Avertissement important pour 150 000 articles */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
                <AlertCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-blue-800 font-medium">Recherche d'articles optimisée</p>
                  <p className="text-blue-700 text-sm mt-1">
                    Tapez au moins 2 caractères pour rechercher parmi vos 150 000+ articles
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro de Fiche <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.numero_fiche || ''}
                    onChange={(e) => setFormData({ ...formData, numero_fiche: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Référence Odoo
                  </label>
                  <input
                    type="text"
                    value={formData.reference_odoo}
                    onChange={(e) => setFormData({ ...formData, reference_odoo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: REF-001"
                  />
                </div>
              </div>

              {/* SearchableSelect classique pour les chantiers (quantité limitée) */}
              <SearchableSelect
                label="Chantier"
                options={chantierOptions}
                value={formData.chantier_id}
                onChange={(value) => setFormData({ ...formData, chantier_id: value as number | undefined })}
                placeholder="Rechercher un chantier..."
                allowEmpty={false}
                error={!formData.chantier_id && error ? 'Chantier requis' : undefined}
              />

              {/* ✅ SearchableSelectAPI pour les articles (150 000+) */}
              <SearchableSelectAPI
                label="Article (Recherche parmi 150 000+)"
                placeholder="Tapez pour rechercher (ex: collier, tuyau, etc.)"
                value={formData.article_id}
                onChange={(value) => {
                  console.log('Article sélectionné:', value);
                  setFormData({ ...formData, article_id: value });
                }}
                searchFunction={searchArticles}
                getSelectedLabel={getArticleLabel}
                allowEmpty={false}
                minChars={2}
                error={!formData.article_id && error ? 'Article requis' : undefined}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unité
                  </label>
                  <input
                    type="text"
                    value={formData.unite}
                    onChange={(e) => setFormData({ ...formData, unite: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: unité, kg, m"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantité Initiale <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.quantite_initiale || ''}
                    onChange={(e) => setFormData({ ...formData, quantite_initiale: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
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
                  disabled={chantiers.length === 0}
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

export default StockComponent;
