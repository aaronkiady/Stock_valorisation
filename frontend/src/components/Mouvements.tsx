import React, { useState, useEffect } from 'react';
import { Mouvement, Stock, Chantier } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, exportApi } from '../services/api';
import { Plus, Search, Trash2, TrendingUp, ArrowDownCircle, ArrowUpCircle, AlertCircle, Download, DollarSign } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import useDebounce from '../hooks/useDebounce';

const Mouvements: React.FC = () => {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    numero_bs_br_cj: '',
    chantier_id: undefined as number | undefined,
    stock_id: undefined as number | undefined,
    article_id: undefined as number | undefined,
    entree: 0,
    sortie: 0,
    prix_unitaire: 0, // ✅ NOUVEAU CHAMP
    commentaire: '',
    type_mouvement: '' as '' | 'ENTREE' | 'SORTIE',
  });
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    loadMouvements();
  }, [currentPage, debouncedSearchTerm]);

  useEffect(() => {
    loadStocks();
    loadChantiers();
  }, []);

  const loadMouvements = async () => {
    try {
      setLoading(true);
      const data = await mouvementsApi.getAll({
        page: currentPage,
        per_page: perPage
      });
      setMouvements(data.mouvements || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const loadStocks = async () => {
    try {
      const data = await stocksApi.getAll({ per_page: 1000 });
      setStocks(data.stocks || []);
    } catch (err) {
      console.error('Erreur chargement stocks:', err);
    }
  };

  const loadChantiers = async () => {
    try {
      const data = await chantiersApi.getAll({ per_page: 1000 });
      let chantiersArray: Chantier[] = [];
      if (Array.isArray(data)) chantiersArray = data;
      else if (data && typeof data === 'object') chantiersArray = data.chantiers || [];
      setChantiers(chantiersArray);
    } catch (err) {
      console.error('Erreur chargement chantiers:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.stock_id) {
      setError('Veuillez sélectionner un stock');
      return;
    }

    if (!formData.article_id) {
      setError('Veuillez sélectionner un article');
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

    if (!formData.prix_unitaire || formData.prix_unitaire <= 0) {
      setError('Le prix unitaire est obligatoire et doit être supérieur à 0');
      return;
    }

    try {
      await mouvementsApi.create({
        date: formData.date,
        numero_bs_br_cj: formData.numero_bs_br_cj,
        chantier_id: formData.chantier_id,
        stock_id: formData.stock_id,
        article_id: formData.article_id,
        entree: formData.entree > 0 ? formData.entree : undefined,
        sortie: formData.sortie > 0 ? formData.sortie : undefined,
        prix_unitaire: formData.prix_unitaire,
        commentaire: formData.commentaire,
      });

      setSuccess('Mouvement enregistré avec succès');
      loadMouvements();
      resetForm();
      setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce mouvement ?')) return;
    try {
      await mouvementsApi.delete(id);
      setSuccess('Mouvement supprimé avec succès');
      loadMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      await exportApi.mouvements({});
      setSuccess('Export Excel généré avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      numero_bs_br_cj: '',
      chantier_id: undefined,
      stock_id: undefined,
      article_id: undefined,
      entree: 0,
      sortie: 0,
      prix_unitaire: 0,
      commentaire: '',
      type_mouvement: '',
    });
    setError(null);
  };

  const stockOptions = stocks.map(stock => ({
    value: stock.id,
    label: `Fiche N°${stock.numero_fiche}`,
    sublabel: `${stock.article?.reference_interne} - ${stock.article?.nom} (${stock.chantier?.code})`
  }));

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
          <h1 className="text-3xl font-bold text-gray-900">Mouvements de Stock</h1>
          <p className="text-gray-600 mt-1">Suivi des entrées et sorties</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleExport} disabled={exporting} className="btn btn-secondary flex items-center space-x-2">
            <Download size={20} />
            <span>{exporting ? 'Export en cours...' : 'Exporter Excel'}</span>
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary flex items-center space-x-2">
            <Plus size={20} />
            <span>Nouveau Mouvement</span>
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
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>
      )}

      {/* Liste des mouvements */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° BS/BR/CJ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chantier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Article</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Unitaire</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mouvements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">Aucun mouvement enregistré</p>
                  </td>
                </tr>
              ) : (
                mouvements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.numero_bs_br_cj || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{m.chantier?.code || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>
                        <p className="font-medium">{m.article?.reference_interne}</p>
                        <p className="text-gray-500">{m.article?.nom}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {m.type_mouvement === 'ENTREE' ? (
                        <span className="flex items-center text-green-600 text-sm font-medium">
                          <ArrowDownCircle className="mr-1" size={16} /> Entrée
                        </span>
                      ) : (
                        <span className="flex items-center text-red-600 text-sm font-medium">
                          <ArrowUpCircle className="mr-1" size={16} /> Sortie
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {m.entree ? `+${m.entree}` : `-${m.sortie}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatPrice(m.prix_unitaire || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-900">
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
            <div className="text-sm text-gray-700">Page {currentPage} sur {totalPages} ({total} mouvements au total)</div>
            <div className="flex space-x-2">
              <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">Précédent</button>
              <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de création */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <TrendingUp className="mr-2" size={24} /> Nouveau Mouvement
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><span className="text-2xl">&times;</span></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ</label>
                  <input type="text" value={formData.numero_bs_br_cj} onChange={(e) => setFormData({ ...formData, numero_bs_br_cj: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: BS-001" />
                </div>
              </div>

              <SearchableSelect
                label="Stock (Fiche)"
                options={stockOptions}
                value={formData.stock_id}
                onChange={(value) => {
                  const stockId = value as number;
                  const selectedStock = stocks.find(s => s.id === stockId);
                  setFormData({ 
                    ...formData, 
                    stock_id: stockId,
                    article_id: selectedStock?.article_id,
                    chantier_id: selectedStock?.chantier_id
                  });
                }}
                placeholder="Rechercher un stock..."
                allowEmpty={false}
              />

              {formData.stock_id && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800"><strong>Article :</strong> {stocks.find(s => s.id === formData.stock_id)?.article?.nom}</p>
                  <p className="text-sm text-blue-800"><strong>Chantier :</strong> {stocks.find(s => s.id === formData.stock_id)?.chantier?.nom}</p>
                  <p className="text-sm text-blue-800"><strong>Stock Actuel :</strong> {stocks.find(s => s.id === formData.stock_id)?.quantite_finale} {stocks.find(s => s.id === formData.stock_id)?.unite}</p>
                  <p className="text-sm text-blue-800"><strong>CMUP Actuel :</strong> {formatPrice(stocks.find(s => s.id === formData.stock_id)?.article?.cout || 0)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entrée</label>
                  <input type="number" step="0.01" min="0" value={formData.entree || ''} onChange={(e) => setFormData({ ...formData, entree: parseFloat(e.target.value) || 0, sortie: 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sortie</label>
                  <input type="number" step="0.01" min="0" value={formData.sortie || ''} onChange={(e) => setFormData({ ...formData, sortie: parseFloat(e.target.value) || 0, entree: 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="0" />
                </div>
              </div>

              {/* ✅ CHAMP PRIX UNITAIRE OBLIGATOIRE */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="inline mr-1" size={16} />
                  Prix Unitaire (MGA) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.prix_unitaire || ''}
                  onChange={(e) => setFormData({ ...formData, prix_unitaire: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: 15000"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Pour les entrées : prix d'achat. Pour les sorties : valorisation au CMUP.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire</label>
                <textarea value={formData.commentaire} onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Optionnel..." />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mouvements;