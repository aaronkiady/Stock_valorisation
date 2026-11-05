import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mouvement, Stock, Chantier } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, exportApi, uploadApi } from '../services/api';
import { Plus, Search, Trash2, TrendingUp, ArrowDownCircle, ArrowUpCircle, AlertCircle, Download, DollarSign, CheckCircle, FileText, Calendar, X, Layers } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';

const Mouvements: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canValidate = user?.role === 'admin' || user?.role === 'RespStock';

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
    date: new Date().toISOString().split('T')[0], // Date du mouvement
    numero_bs_br_cj: '',
    chantier_id: undefined as number | undefined,
    stock_id: undefined as number | undefined,
    article_id: undefined as number | undefined,
    type: 'ENTREE' as 'ENTREE' | 'SORTIE',  // ✅ Case à cocher
    quantite: 0,  // ✅ Quantité unique
    prix_unitaire: 0,
    commentaire: '',
    fichier_pj: '' as string | undefined,
  });
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [uploadingPj, setUploadingPj] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const pjInputRef = React.useRef<HTMLInputElement>(null);

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

  const handlePjUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setUploadingPj(true);
      setError(null);
      const result = await uploadApi.uploadFile(file);
      setFormData(prev => ({ ...prev, fichier_pj: result.filename }));
      setSuccess(`Fichier "${file.name}" uploadé`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploadingPj(false);
    }
  };

  const handleDownloadPj = async (filename: string) => {
    try {
      await uploadApi.downloadPj(filename);
    } catch (err) {
      setError('Impossible de télécharger le fichier');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.stock_id) { setError('Veuillez sélectionner un stock'); return; }
    if (!formData.article_id) { setError('Veuillez sélectionner un article'); return; }
    if (formData.quantite <= 0) { setError('La quantité doit être supérieure à 0'); return; }
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
        entree: formData.type === 'ENTREE' ? formData.quantite : undefined,
        sortie: formData.type === 'SORTIE' ? formData.quantite : undefined,
        prix_unitaire: formData.prix_unitaire,
        commentaire: formData.commentaire,
        fichier_pj: formData.fichier_pj || undefined,
      });

      setSuccess('Mouvement enregistré (en attente de validation)');
      loadMouvements();
      resetForm();
      setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleValidate = async (id: number) => {
    if (!window.confirm('Confirmer la validation de ce mouvement ? Le stock sera mis à jour.')) return;
    try {
      setValidatingId(id);
      setError(null);
      await mouvementsApi.validate(id);
      setSuccess('Mouvement validé ! Stock mis à jour.');
      loadMouvements();
      loadStocks();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur validation');
    } finally {
      setValidatingId(null);
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
      type: 'ENTREE',
      quantite: 0,
      prix_unitaire: 0,
      commentaire: '',
      fichier_pj: undefined,
    });
    setError(null);
  };

  const stockOptions = stocks
    .filter(s => s.statut_validation === 'Validé') // ✅ Seuls les stocks validés acceptent des mouvements
    .map(stock => ({
      value: stock.id,
      label: `Fiche N°${stock.numero_fiche}`,
      sublabel: `${stock.article?.reference_interne} - ${stock.article?.nom} (${stock.chantier?.code}) - Dispo: ${stock.quantite_finale}`
    }));

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MGA',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleDateString('fr-FR'); }
    catch { return dateStr; }
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
          <button
            onClick={() => navigate('/mouvements/nouveau')}
            className="btn bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-2"
          >
            <Layers size={20} />
            <span>Saisie groupée</span>
          </button>
          <button onClick={handleExport} disabled={exporting} className="btn btn-secondary flex items-center space-x-2">
            <Download size={20} />
            <span>{exporting ? 'Export...' : 'Exporter Excel'}</span>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date saisie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date mouvement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° BS/BR/CJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chantier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qté</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prix Unit.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mouvements.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center">
                    <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">Aucun mouvement enregistré</p>
                  </td>
                </tr>
              ) : (
                mouvements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{formatDateTime(m.date_saisie || m.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(m.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.numero_bs_br_cj || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{m.chantier?.code || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div>
                        <p className="font-medium">{m.article?.reference_interne}</p>
                        <p className="text-gray-500 text-xs">{m.article?.nom}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {m.entree ? `+${m.entree}` : `-${m.sortie}`}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatPrice(m.prix_unitaire || 0)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {m.fichier_pj ? (
                        <button onClick={() => handleDownloadPj(m.fichier_pj!)} className="text-blue-600 hover:text-blue-900" title="Télécharger PJ">
                          <FileText size={18} />
                        </button>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${m.statut_validation === 'Validé' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {m.statut_validation || 'Brouillon'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {canValidate && m.statut_validation !== 'Validé' && (
                        <button onClick={() => handleValidate(m.id)} disabled={validatingId === m.id} className="text-green-600 hover:text-green-900 inline-flex" title="Valider">
                          <CheckCircle size={18} />
                        </button>
                      )}
                      {m.statut_validation !== 'Validé' && (
                        <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-900" title="Supprimer">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">Page {currentPage} sur {totalPages} ({total} mouvements au total)</div>
            <div className="flex space-x-2">
              <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100">Précédent</button>
              <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100">Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de création */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center"><TrendingUp className="mr-2" size={24} /> Nouveau Mouvement</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><span className="text-2xl">&times;</span></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* ✅ DATE DE SAISIE (lecture seule) + DATE DU MOUVEMENT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline mr-1" size={14} /> Date de saisie
                  </label>
                  <input
                    type="text"
                    value={new Date().toLocaleString('fr-FR')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline mr-1" size={14} /> Date du mouvement <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ</label>
                <input type="text" value={formData.numero_bs_br_cj} onChange={(e) => setFormData({ ...formData, numero_bs_br_cj: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: BS-001" />
              </div>

              <SearchableSelect
                label="Stock (Fiche validée uniquement)"
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
                placeholder="Rechercher un stock validé..."
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

              {/* ✅ CASES À COCHER ENTRÉE / SORTIE */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de mouvement <span className="text-red-500">*</span></label>
                <div className="flex space-x-4">
                  <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'ENTREE' ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-300'}`}>
                    <input
                      type="radio"
                      name="type"
                      value="ENTREE"
                      checked={formData.type === 'ENTREE'}
                      onChange={() => setFormData({ ...formData, type: 'ENTREE' })}
                      className="mr-2"
                    />
                    <ArrowDownCircle className="mr-1 text-green-600" size={18} />
                    <span className="font-medium text-green-700">Entrée</span>
                  </label>
                  <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'SORTIE' ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-300'}`}>
                    <input
                      type="radio"
                      name="type"
                      value="SORTIE"
                      checked={formData.type === 'SORTIE'}
                      onChange={() => setFormData({ ...formData, type: 'SORTIE' })}
                      className="mr-2"
                    />
                    <ArrowUpCircle className="mr-1 text-red-600" size={18} />
                    <span className="font-medium text-red-700">Sortie</span>
                  </label>
                </div>
              </div>

              {/* ✅ CHAMP QUANTITÉ UNIQUE (adapté selon le type) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantité {formData.type === 'ENTREE' ? 'Entrée' : 'Sortie'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantite || ''}
                  onChange={(e) => setFormData({ ...formData, quantite: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none ${formData.type === 'ENTREE' ? 'border-green-400 focus:ring-green-500' : 'border-red-400 focus:ring-red-500'}`}
                  placeholder="0"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.type === 'ENTREE' ? 'Quantité à ajouter au stock.' : 'Quantité à retirer du stock.'}
                </p>
              </div>

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
              </div>

              {/* ✅ UPLOAD PJ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FileText className="inline mr-1" size={16} /> Pièce jointe (PJ)
                </label>
                <input ref={pjInputRef} type="file" onChange={handlePjUpload} className="hidden" />
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => pjInputRef.current?.click()}
                    disabled={uploadingPj}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2 disabled:opacity-50"
                  >
                    <FileText size={16} />
                    <span>{uploadingPj ? 'Upload...' : 'Choisir un fichier'}</span>
                  </button>
                  {formData.fichier_pj && (
                    <div className="flex items-center space-x-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                      <FileText size={16} />
                      <span className="truncate max-w-xs">{formData.fichier_pj}</span>
                      <button type="button" onClick={() => setFormData({ ...formData, fichier_pj: undefined })} className="text-red-600 hover:text-red-900">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire</label>
                <textarea value={formData.commentaire} onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Optionnel..." />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ Le mouvement sera créé en <strong>Brouillon</strong>. Il faudra le valider pour mettre à jour le stock.
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