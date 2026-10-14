/**
 * Composant Mouvements - Gestion des entrées et sorties avec validation complète
 * ✅ CORRECTION : Recherche serveur pour les chantiers
 * ✅ CONSERVATION TOTALE : Toutes les fonctionnalités de validation de stock
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Mouvement, Stock, Chantier, MouvementFormData } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, exportApi } from '../services/api';
import { Plus, Search, Trash2, Calendar, AlertCircle, AlertTriangle, Package, Download } from 'lucide-react';
import SearchableSelectAPI from './SearchableSelectAPI'; // Pour stocks (150K+)
import SearchableSelect from './SearchableSelect'; // Garde pour les filtres

const Mouvements: React.FC = () => {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // ✅ CORRECTION : États pour la gestion des filtres avec chantiers chargés
  const [chantiersForFilter, setChantiersForFilter] = useState<Chantier[]>([]);
  
  const [filters, setFilters] = useState({
    chantier_id: undefined as number | undefined,
    date_debut: '',
    date_fin: '',
    type_mouvement: '' as '' | 'ENTREE' | 'SORTIE'
  });
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    numero_bs_br_cj: '',
    chantier_id: undefined as number | undefined,
    stock_id: undefined as number | undefined,
    entree: 0,
    sortie: 0,
    commentaire: ''
  });
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  
  // ✅ NOUVEAU : Stock sélectionné pour affichage et validation
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  // ✅ Chargement initial
  useEffect(() => {
    loadMouvements();
    loadChantiersForFilter(); // Pour les filtres uniquement
  }, [currentPage, filters]);

  // ✅ Charger le stock sélectionné quand stock_id change
  useEffect(() => {
    if (formData.stock_id) {
      loadSelectedStock(formData.stock_id);
    } else {
      setSelectedStock(null);
      setStockWarning(null);
      setStockError(null);
    }
  }, [formData.stock_id]);

  // ✅ Valider le stock quand la quantité de sortie change
  useEffect(() => {
    validateStock();
  }, [formData.sortie, selectedStock]);

  /**
   * ✅ Charger les mouvements avec filtres
   */
  const loadMouvements = async () => {
    try {
      setLoading(true);
      
      const params: any = {
        page: currentPage,
        per_page: 20
      };

      if (filters.chantier_id) params.chantier_id = filters.chantier_id;
      if (filters.date_debut) params.date_debut = filters.date_debut;
      if (filters.date_fin) params.date_fin = filters.date_fin;
      if (filters.type_mouvement) params.type_mouvement = filters.type_mouvement;

      console.log('📤 Chargement mouvements - Paramètres:', params);

      const response = await mouvementsApi.getAll(params);
      setMouvements(response.mouvements || []);
      setTotalPages(response.pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ Charger les chantiers pour les filtres uniquement (quantité limitée)
   */
  const loadChantiersForFilter = async () => {
    try {
      console.log('🔄 Chargement chantiers pour filtres...');
      const data = await chantiersApi.getAll({ per_page: 1000 });
      
      let chantiersArray: Chantier[] = [];
      if (Array.isArray(data)) {
        chantiersArray = data;
      } else if (data && typeof data === 'object') {
        chantiersArray = data.chantiers || data.items || [];
      }
      
      console.log(`✅ ${chantiersArray.length} chantiers chargés pour filtres`);
      setChantiersForFilter(chantiersArray);
    } catch (err) {
      console.error('❌ Erreur chargement chantiers:', err);
    }
  };

  /**
   * ✅ NOUVEAU : Charger le stock sélectionné
   */
  const loadSelectedStock = async (stockId: number) => {
    try {
      console.log('📦 Chargement stock ID:', stockId);
      const stock = await stocksApi.getById(stockId);
      setSelectedStock(stock);
      console.log('✅ Stock chargé:', stock);
    } catch (err) {
      console.error('❌ Erreur chargement stock:', err);
      setError('Impossible de charger les informations du stock');
      setSelectedStock(null);
    }
  };

  /**
   * ✅ FONCTION DE RECHERCHE DE STOCKS CÔTÉ SERVEUR
   */
  const searchStocks = useCallback(async (searchTerm: string) => {
    try {
      console.log('🔍 Recherche stocks:', searchTerm);
      
      const data = await stocksApi.getAll({ 
        search: searchTerm, 
        per_page: 50 
      });
      
      const stocks = data.stocks || data.items || [];
      console.log(`✅ ${stocks.length} stocks trouvés`);
      
      return stocks.map(stock => ({
        value: stock.id,
        label: `N° ${stock.numero_fiche}`,
        sublabel: `${stock.article?.reference_interne || 'N/A'} - ${stock.chantier?.code || 'N/A'} (Dispo: ${stock.quantite_finale})`
      }));
    } catch (err) {
      console.error('❌ Erreur recherche stocks:', err);
      return [];
    }
  }, []);

  /**
   * ✅ FONCTION POUR RÉCUPÉRER LE LABEL D'UN STOCK SÉLECTIONNÉ
   */
  const getStockLabel = useCallback(async (stockId: number) => {
    try {
      const stock = await stocksApi.getById(stockId);
      return `N° ${stock.numero_fiche} - ${stock.article?.reference_interne || 'N/A'}`;
    } catch (err) {
      console.error('❌ Erreur chargement stock:', err);
      return `Stock #${stockId}`;
    }
  }, []);

  /**
   * ✅ FONCTION DE RECHERCHE DE CHANTIERS CÔTÉ SERVEUR
   */
  const searchChantiers = useCallback(async (searchTerm: string) => {
    try {
      console.log('🔍 Recherche chantiers:', searchTerm);
      
      const data = await chantiersApi.getAll({ 
        search: searchTerm, 
        per_page: 50 
      });
      
      let chantiers: Chantier[] = [];
      if (Array.isArray(data)) {
        chantiers = data;
      } else if (data && typeof data === 'object') {
        chantiers = data.chantiers || data.items || [];
      }
      
      console.log(`✅ ${chantiers.length} chantiers trouvés`);
      
      return chantiers
        .filter(c => c.statut === 'Actif')
        .map(chantier => ({
          value: chantier.id,
          label: chantier.code,
          sublabel: chantier.nom
        }));
    } catch (err) {
      console.error('❌ Erreur recherche chantiers:', err);
      return [];
    }
  }, []);

  /**
   * ✅ FONCTION POUR RÉCUPÉRER LE LABEL D'UN CHANTIER SÉLECTIONNÉ
   */
  const getChantierLabel = useCallback(async (chantierId: number) => {
    try {
      const chantier = await chantiersApi.getById(chantierId);
      return `${chantier.code} - ${chantier.nom}`;
    } catch (err) {
      console.error('❌ Erreur chargement chantier:', err);
      return `Chantier #${chantierId}`;
    }
  }, []);

  /**
   * ✅ VALIDATION DU STOCK AVEC AVERTISSEMENTS
   */
  const validateStock = () => {
    setStockWarning(null);
    setStockError(null);

    if (!selectedStock || formData.sortie === 0) {
      return;
    }

    const disponible = selectedStock.quantite_finale;
    const sortie = formData.sortie;

    // ❌ ERREUR BLOQUANTE : Stock insuffisant
    if (sortie > disponible) {
      setStockError(
        `❌ Stock insuffisant ! Disponible : ${disponible} ${selectedStock.unite}, ` +
        `Demandé : ${sortie} ${selectedStock.unite}`
      );
      return;
    }

    // ⚠️ AVERTISSEMENT : Consommation > 80%
    const pourcentage = (sortie / disponible) * 100;
    if (pourcentage > 80) {
      setStockWarning(
        `⚠️ Attention : Cette sortie représente ${pourcentage.toFixed(0)}% du stock disponible`
      );
    }
  };

  /**
   * ✅ SOUMISSION DU FORMULAIRE
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation des champs obligatoires
    if (!formData.chantier_id) {
      setError('Le chantier est obligatoire');
      return;
    }

    if (!formData.stock_id) {
      setError('Le stock est obligatoire');
      return;
    }

    if (formData.entree === 0 && formData.sortie === 0) {
      setError('Veuillez saisir une entrée ou une sortie');
      return;
    }

    if (formData.entree > 0 && formData.sortie > 0) {
      setError('Une entrée OU une sortie, pas les deux');
      return;
    }

    // ❌ BLOCAGE SI STOCK INSUFFISANT
    if (stockError) {
      setError('Impossible de créer le mouvement : stock insuffisant');
      return;
    }

    // ✅ VALIDATION : Vérifier que tous les champs obligatoires sont remplis
    if (!formData.chantier_id) {
      setError('Le chantier est obligatoire');
      return;
    }

    if (!selectedStock?.article_id) {
      setError('Impossible de récupérer l\'article du stock sélectionné');
      return;
    }

    try {
      const payload: MouvementFormData = {
        date: formData.date,
        numero_bs_br_cj: formData.numero_bs_br_cj,
        chantier_id: formData.chantier_id,
        stock_id: formData.stock_id!,
        article_id: selectedStock.article_id,
        entree: formData.entree,
        sortie: formData.sortie,
        commentaire: formData.commentaire
      };

      console.log('📤 Envoi mouvement:', payload);

      await mouvementsApi.create(payload);
      setSuccess('Mouvement créé avec succès');
      
      await loadMouvements();
      resetForm();
      setShowModal(false);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  /**
   * ✅ SUPPRESSION D'UN MOUVEMENT
   */
  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce mouvement ?')) return;

    try {
      await mouvementsApi.delete(id);
      setSuccess('Mouvement supprimé avec succès');
      await loadMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  /**
   * ✅ RÉINITIALISATION DU FORMULAIRE
   */
  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      numero_bs_br_cj: '',
      chantier_id: undefined,
      stock_id: undefined,
      entree: 0,
      sortie: 0,
      commentaire: ''
    });
    setSelectedStock(null);
    setStockWarning(null);
    setStockError(null);
    setError(null);
  };

  /**
   * ✅ EXPORT EXCEL DES MOUVEMENTS (avec les filtres courants)
   */
  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      await exportApi.mouvements({
        chantier_id: filters.chantier_id,
        date_debut: filters.date_debut,
        date_fin: filters.date_fin,
        type_mouvement: filters.type_mouvement
      });
      setSuccess('Export Excel généré avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  // ✅ Préparer les options pour les filtres de chantiers
  const chantierFilterOptions = chantiersForFilter
    .filter(c => c.statut === 'Actif')
    .map(chantier => ({
      value: chantier.id,
      label: chantier.code,
      sublabel: chantier.nom
    }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Mouvements de Stock</h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={20} />
            <span>{exporting ? 'Export en cours...' : 'Exporter Excel'}</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Nouveau Mouvement</span>
          </button>
        </div>
      </div>

      {/* Messages de succès/erreur globaux */}
      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg flex items-center space-x-2">
          <AlertCircle size={20} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg flex items-center space-x-2">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* ✅ FILTRES */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Filtre Chantier */}
          <SearchableSelect
            label="Chantier"
            placeholder="Tous les chantiers"
            options={chantierFilterOptions}
            value={filters.chantier_id}
            onChange={(value) => {
              setFilters({ ...filters, chantier_id: value as number | undefined });
              setCurrentPage(1);
            }}
            allowEmpty={true}
          />

          {/* Filtre Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de mouvement
            </label>
            <select
              value={filters.type_mouvement}
              onChange={(e) => {
                setFilters({ ...filters, type_mouvement: e.target.value as '' | 'ENTREE' | 'SORTIE' });
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tous les types</option>
              <option value="ENTREE">Entrées</option>
              <option value="SORTIE">Sorties</option>
            </select>
          </div>

          {/* Date début */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date début
            </label>
            <input
              type="date"
              value={filters.date_debut}
              onChange={(e) => {
                setFilters({ ...filters, date_debut: e.target.value });
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date fin */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date fin
            </label>
            <input
              type="date"
              value={filters.date_fin}
              onChange={(e) => {
                setFilters({ ...filters, date_fin: e.target.value });
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ✅ TABLEAU DES MOUVEMENTS */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        ) : mouvements.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-400" />
            <p>Aucun mouvement trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° BS/BR/CJ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chantier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Article</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commentaire</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mouvements.map((mouvement) => (
                  <tr key={mouvement.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(mouvement.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mouvement.numero_bs_br_cj || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mouvement.chantier?.code || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mouvement.article?.reference_interne || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        mouvement.type_mouvement === 'ENTREE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {mouvement.type_mouvement}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                      {mouvement.type_mouvement === 'ENTREE' 
                        ? `+${mouvement.entree}` 
                        : `-${mouvement.sortie}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {mouvement.commentaire || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleDelete(mouvement.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ✅ PAGINATION */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Précédent
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      {/* ✅ MODAL NOUVEAU MOUVEMENT */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Nouveau Mouvement</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* N° BS/BR/CJ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    N° BS/BR/CJ
                  </label>
                  <input
                    type="text"
                    value={formData.numero_bs_br_cj}
                    onChange={(e) => setFormData({ ...formData, numero_bs_br_cj: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Numéro de référence"
                  />
                </div>

                {/* ✅ CHANTIER - RECHERCHE SERVEUR */}
                <SearchableSelectAPI
                  label="Chantier"
                  placeholder="Rechercher un chantier..."
                  value={formData.chantier_id}
                  onChange={(value) => setFormData({ ...formData, chantier_id: value as number })}
                  searchFunction={searchChantiers}
                  getSelectedLabel={getChantierLabel}
                  minChars={2}
                  error={error && !formData.chantier_id ? 'Chantier requis' : undefined}
                />

                {/* ✅ STOCK - RECHERCHE SERVEUR */}
                <SearchableSelectAPI
                  label="Stock (N° Fiche)"
                  placeholder="Rechercher un stock..."
                  value={formData.stock_id}
                  onChange={(value) => setFormData({ ...formData, stock_id: value as number })}
                  searchFunction={searchStocks}
                  getSelectedLabel={getStockLabel}
                  minChars={1}
                  error={error && !formData.stock_id ? 'Stock requis' : undefined}
                />

                {/* ✅ AFFICHAGE DES INFOS DU STOCK SÉLECTIONNÉ */}
                {selectedStock && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
                      <Package size={18} className="mr-2" />
                      Informations du stock
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-blue-700 font-medium">N° Fiche:</span>
                        <span className="ml-2 text-gray-900">{selectedStock.numero_fiche}</span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Article:</span>
                        <span className="ml-2 text-gray-900">
                          {selectedStock.article?.reference_interne || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Chantier:</span>
                        <span className="ml-2 text-gray-900">
                          {selectedStock.chantier?.code || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Disponible:</span>
                        <span className="ml-2 text-gray-900 font-semibold">
                          {selectedStock.quantite_finale} {selectedStock.unite}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Entrée */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entrée
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.entree}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      entree: parseFloat(e.target.value) || 0,
                      sortie: 0 // Réinitialiser la sortie si on saisit une entrée
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={formData.sortie > 0}
                  />
                </div>

                {/* Sortie */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sortie
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sortie}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      sortie: parseFloat(e.target.value) || 0,
                      entree: 0 // Réinitialiser l'entrée si on saisit une sortie
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={formData.entree > 0}
                  />
                </div>

                {/* ⚠️ MESSAGE D'AVERTISSEMENT JAUNE */}
                {stockWarning && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start space-x-2">
                    <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-yellow-800">{stockWarning}</span>
                  </div>
                )}

                {/* ❌ MESSAGE D'ERREUR ROUGE (BLOQUANT) */}
                {stockError && (
                  <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start space-x-2">
                    <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-red-800 font-semibold">{stockError}</span>
                  </div>
                )}

                {/* Commentaire */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Commentaire
                  </label>
                  <textarea
                    value={formData.commentaire}
                    onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Commentaire optionnel..."
                  />
                </div>
              </div>

              {/* Boutons */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!!stockError} // ❌ BLOQUER si erreur de stock
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Plus size={20} />
                  <span>Créer le mouvement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mouvements;
