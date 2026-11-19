import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mouvement, Stock, Chantier } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, articlesApi, exportApi, uploadApi } from '../services/api';
import { Plus, Trash2, TrendingUp, ArrowDownCircle, ArrowUpCircle, AlertCircle, Download, DollarSign, CheckCircle, FileText, Calendar, X, Layers, Search, CheckSquare, Edit2, Lock, Ban, AlertTriangle } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SearchableSelectAPI from './SearchableSelectAPI';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';

const Mouvements: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canValidate = user?.role === 'admin' || user?.role === 'RespStock';

  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [localFilters, setLocalFilters] = useState({
    search: '',
    chantier_id: '' as number | '',
    type_mouvement: '',
    statut_validation: '',
    date_debut: '',
    date_fin: ''
  });

  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    chantier_id: '' as number | '',
    type_mouvement: '',
    statut_validation: '',
    date_debut: '',
    date_fin: ''
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    numero_bs_br_cj: '',
    chantier_id: undefined as number | undefined,
    article_id: undefined as number | undefined,
    type: 'ENTREE' as 'ENTREE' | 'SORTIE' | 'RESERVATION',
    quantite: 0,
    prix_unitaire: 0,
    commentaire: '',
    fichier_pj: '' as string | undefined,
  });

  const [foundStock, setFoundStock] = useState<Stock | null>(null);
  const [searchingStock, setSearchingStock] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [uploadingPj, setUploadingPj] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const pjInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMouvements();
  }, [currentPage, appliedFilters]);

  useEffect(() => {
    loadChantiers();
  }, []);

  useEffect(() => {
    const findStock = async () => {
      if (formData.type === 'SORTIE' && formData.chantier_id && formData.article_id) {
        try {
          setSearchingStock(true);
          setError(null);
          setFoundStock(null);
          const stock = await stocksApi.find(formData.chantier_id, formData.article_id);
          setFoundStock(stock);
          if (stock.article && stock.article.cout && !editingId) {
            setFormData(prev => ({ ...prev, prix_unitaire: stock.article?.cout || 0 }));
          }
        } catch (err) {
          setError('Aucun stock validé trouvé pour ce chantier et cet article (obligatoire pour une sortie).');
          setFoundStock(null);
        } finally {
          setSearchingStock(false);
        }
      } 
      else if (formData.type === 'RESERVATION' && formData.article_id) {
        try {
          setSearchingStock(true);
          setError(null);
          setFoundStock(null);
          
          const chantierSource = chantiers.find(c => c.code === 'O23005');
          if (!chantierSource) {
            setError("Le chantier source O23005 est introuvable. Veuillez le créer.");
            setFoundStock(null);
            return;
          }

          const stock = await stocksApi.find(chantierSource.id, formData.article_id);
          setFoundStock(stock);
          if (stock.article && stock.article.cout && !editingId) {
            setFormData(prev => ({ ...prev, prix_unitaire: stock.article?.cout || 0 }));
          }
        } catch (err) {
          setError('Aucun stock validé trouvé sur le chantier O23005 pour cet article.');
          setFoundStock(null);
        } finally {
          setSearchingStock(false);
        }
      } else {
        setFoundStock(null);
      }
    };
    findStock();
  }, [formData.chantier_id, formData.article_id, formData.type, editingId, chantiers]);

  const loadMouvements = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mouvementsApi.getAll({
        search: appliedFilters.search || undefined,
        chantier_id: appliedFilters.chantier_id || undefined,
        type_mouvement: (appliedFilters.type_mouvement || undefined) as any,
        statut_validation: appliedFilters.statut_validation || undefined,
        date_debut: appliedFilters.date_debut || undefined,
        date_fin: appliedFilters.date_fin || undefined,
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
  }, [currentPage, appliedFilters]);

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

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setAppliedFilters(localFilters);
  };

  const handleResetFilters = () => {
    const emptyFilters = { search: '', chantier_id: '' as number | '', type_mouvement: '', statut_validation: '', date_debut: '', date_fin: '' };
    setLocalFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrentPage(1);
  };

  // ✅ RECHERCHE D'ARTICLES : Uniquement ceux avec stock > 0 sur le chantier
  const searchArticles = useCallback(async (searchTerm: string) => {
    try {
      // ENTREE : afficher tous les articles
      if (formData.type === 'ENTREE') {
        const data = await articlesApi.getAll({
          search: searchTerm,
          per_page: 50
        });

        return (data.articles || []).map(a => ({
          value: a.id,
          label: a.nom,
          sublabel: a.reference_interne
        }));
      }

      // SORTIE et RESERVATION : filtrer selon le stock disponible
      let chantierSourceId = formData.chantier_id;

      if (formData.type === 'RESERVATION') {
        const source = chantiers.find(c => c.code === 'O23005');

        if (!source) return [];

        chantierSourceId = source.id;
      }

      if (!chantierSourceId) return [];

      const stockData = await stocksApi.getAll({
        chantier_id: chantierSourceId,
        search: searchTerm,
        statut_validation: 'Validé',
        per_page: 50
      });

      return (stockData.stocks || [])
        .filter(s => s.quantite_finale > 0)
        .map(s => ({
          value: s.article_id,
          label: s.article?.nom || `Article #${s.article_id}`,
          sublabel: `${s.article?.reference_interne} - Dispo: ${s.quantite_finale} ${s.unite}`
        }));

    } catch (err) {
      return [];
    }
  }, [formData.chantier_id, formData.type, chantiers]);

  const getArticleLabel = useCallback(async (articleId: number) => {
    try {
      const article = await articlesApi.getById(articleId);
      return `${article.nom} (${article.reference_interne})`;
    } catch (err) { return `Article inconnu (ID: ${articleId})`; }
  }, []);

  const chantierOptions = chantiers
    .filter(c => c.statut === 'Actif')
    .map(chantier => ({ value: chantier.id, label: chantier.code, sublabel: chantier.nom }));

  const formatChantierAffichage = (chantier?: Chantier) => {
    if (!chantier) return '-';
    const client = chantier.client ? chantier.client : '-';
    const code = chantier.code ? chantier.code : '-';
    const nom = chantier.nom ? chantier.nom : '-';
    return `${client} - ${code} - ${nom}`;
  };

  const handlePjUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingPj(true); setError(null);
      const result = await uploadApi.uploadFile(file);
      setFormData(prev => ({ ...prev, fichier_pj: result.filename }));
      setSuccess(`Fichier "${file.name}" uploadé`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally { setUploadingPj(false); }
  };

  const handleDownloadPj = async (filename: string) => {
    try { await uploadApi.downloadPj(filename); }
    catch (err) { setError('Impossible de télécharger le fichier'); }
  };

  const handleEdit = async (m: Mouvement) => {
    if (m.statut_validation !== 'Brouillon') {
      setError(`Impossible de modifier un mouvement ${m.statut_validation.toLowerCase()}`);
      return;
    }
    
    if (m.numero_bs_br_cj) {
      try {
        const pieceMvts = await mouvementsApi.getByPiece(m.numero_bs_br_cj);
        if (pieceMvts.length > 1) {
          navigate(`/mouvements/nouveau?piece=${encodeURIComponent(m.numero_bs_br_cj)}`);
          return;
        }
      } catch (err) {
        // En cas d'erreur, on continue en mode simple
      }
    }

    setEditingId(m.id);
    setFormData({
      date: m.date,
      numero_bs_br_cj: m.numero_bs_br_cj || '',
      chantier_id: m.chantier_id,
      article_id: m.article_id,
      type: m.type_mouvement,
      quantite: m.entree || m.sortie || 0,
      prix_unitaire: m.prix_unitaire || 0,
      commentaire: m.commentaire || '',
      fichier_pj: m.fichier_pj || undefined,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);

    if (!formData.article_id) { setError('Veuillez sélectionner un article'); return; }
    if (!formData.chantier_id && formData.type !== 'RESERVATION') { setError('Veuillez sélectionner un chantier'); return; }
    if (formData.type === 'RESERVATION' && !formData.chantier_id) { setError('Veuillez sélectionner le chantier bénéficiaire'); return; }
    
    if ((formData.type === 'SORTIE' || formData.type === 'RESERVATION') && !foundStock && !editingId) { 
      setError(`Aucun stock valide trouvé pour cette ${formData.type.toLowerCase()}`); 
      return; 
    }
    if ((formData.type === 'ENTREE' || formData.type === 'SORTIE') && !foundStock && !editingId) {
      setError("Aucune fiche de stock n'existe pour cet article. Veuillez la créer d'abord.");
      return;
    }
    
    if (formData.quantite <= 0) { setError('La quantité doit être supérieure à 0'); return; }
    if ((formData.type === 'SORTIE' || formData.type === 'RESERVATION') && foundStock && formData.quantite > foundStock.quantite_finale) {
      setError(`Stock insuffisant ! Disponible: ${foundStock.quantite_finale} ${foundStock.unite}`); return;
    }
    if (formData.type === 'ENTREE' && (!formData.prix_unitaire || formData.prix_unitaire <= 0)) {
      setError('Le prix unitaire est obligatoire pour une entrée'); return;
    }

    try {
      const payload = {
        date: formData.date, 
        numero_bs_br_cj: formData.numero_bs_br_cj, 
        chantier_id: formData.chantier_id,
        article_id: formData.article_id,
        entree: formData.type === 'ENTREE' ? formData.quantite : undefined,
        sortie: (formData.type === 'SORTIE' || formData.type === 'RESERVATION') ? formData.quantite : undefined,
        prix_unitaire: formData.prix_unitaire, 
        commentaire: formData.commentaire, 
        fichier_pj: formData.fichier_pj || undefined,
        type_mouvement: formData.type,
      };

      if (editingId) {
        await mouvementsApi.update(editingId, payload);
        setSuccess('Mouvement modifié avec succès');
      } else {
        await mouvementsApi.create(payload);
        setSuccess(`Mouvement (${formData.type}) enregistré`);
      }
      
      loadMouvements(); resetForm(); setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleValidate = async (id: number) => {
    if (!window.confirm('Confirmer la validation de ce mouvement ?')) return;
    try {
      setValidatingId(id); setError(null);
      await mouvementsApi.validate(id);
      setSuccess('Mouvement validé !');
      loadMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur validation');
    } finally { setValidatingId(null); }
  };

  const handleValidateBatch = async (numero_piece: string) => {
    if (!window.confirm(`Valider TOUS les mouvements en brouillon pour la pièce "${numero_piece}" ?`)) return;
    try {
      setError(null);
      await mouvementsApi.validateBatch(numero_piece);
      setSuccess(`Tous les mouvements de la pièce ${numero_piece} ont été validés !`);
      loadMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur validation groupée');
    }
  };

  const handleAnnuler = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir annuler ce mouvement ? Le stock sera restauré si nécessaire.')) return;
    try {
      await mouvementsApi.annuler(id);
      setSuccess('Mouvement annulé avec succès');
      loadMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'annulation');
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true); setError(null);
      await exportApi.mouvements({ 
        search: appliedFilters.search || undefined,
        chantier_id: appliedFilters.chantier_id || undefined, 
        type_mouvement: (appliedFilters.type_mouvement || undefined) as any,
        date_debut: appliedFilters.date_debut || undefined,
        date_fin: appliedFilters.date_fin || undefined
      });
      setSuccess('Export Excel généré avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally { setExporting(false); }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0], numero_bs_br_cj: '', chantier_id: undefined,
      article_id: undefined, type: 'ENTREE', quantite: 0, prix_unitaire: 0, commentaire: '', fichier_pj: undefined,
    });
    setFoundStock(null); setError(null); setEditingId(null);
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MGA', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  };
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return dateStr; }
  };
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleDateString('fr-FR'); } catch { return dateStr; }
  };

  if (loading && mouvements.length === 0) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mouvements de Stock</h1>
          <p className="text-gray-600 mt-1">Suivi des entrées et sorties</p>
        </div>
        <div className="flex items-center space-x-3">       
          <button onClick={handleExport} disabled={exporting} className="btn btn-secondary flex items-center space-x-2">
            <Download size={20} /><span>{exporting ? 'Export...' : 'Exporter Excel'}</span>
          </button>
          <button onClick={() => navigate('/mouvements/nouveau')} className="btn bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-2">
            <Layers size={20} /><span>Nouveau mouvement</span>
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start"><AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} /><span>{error}</span></div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>}

      <form onSubmit={handleApplyFilters} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-1 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="N° pièce, réf doc, chantier..." 
                value={localFilters.search} 
                onChange={(e) => setLocalFilters({ ...localFilters, search: e.target.value })} 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chantier</label>
            <select 
              value={localFilters.chantier_id} 
              onChange={(e) => setLocalFilters({ ...localFilters, chantier_id: e.target.value ? Number(e.target.value) : '' })} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous</option>
              {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select 
              value={localFilters.type_mouvement} 
              onChange={(e) => setLocalFilters({ ...localFilters, type_mouvement: e.target.value })} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous</option>
              <option value="ENTREE">Entrées</option>
              <option value="SORTIE">Sorties</option>
              <option value="RESERVATION">Réservations</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select 
              value={localFilters.statut_validation} 
              onChange={(e) => setLocalFilters({ ...localFilters, statut_validation: e.target.value })} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous</option>
              <option value="Brouillon">Brouillon</option>
              <option value="Validé">Validé</option>
              <option value="Annulé">Annulé</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date mouvement (début)</label>
            <input 
              type="date" 
              value={localFilters.date_debut} 
              onChange={(e) => setLocalFilters({ ...localFilters, date_debut: e.target.value })} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date mouvement (fin)</label>
            <input 
              type="date" 
              value={localFilters.date_fin} 
              onChange={(e) => setLocalFilters({ ...localFilters, date_fin: e.target.value })} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>

          <div className="md:col-span-6 flex justify-end space-x-3 pt-2">
            <button type="button" onClick={handleResetFilters} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium">
              Réinitialiser
            </button>
            <button type="submit" className="btn btn-primary flex items-center space-x-2">
              <Search size={18} />
              <span>Rechercher</span>
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Date saisie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Date mouvement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">N° BS/BR/CJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Réf. Doc</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Chantier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Article</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Qté</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Prix Unit.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">PJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mouvements.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center">
                    <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">{appliedFilters.search || appliedFilters.chantier_id || appliedFilters.type_mouvement || appliedFilters.statut_validation || appliedFilters.date_debut || appliedFilters.date_fin ? 'Aucun mouvement trouvé' : 'Aucun mouvement enregistré'}</p>
                  </td>
                </tr>
              ) : (
                mouvements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{formatDateTime(m.date_saisie || m.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(m.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">{m.numero_bs_br_cj || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{m.reference_document || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatChantierAffichage(m.chantier)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"><div><p className="font-medium">{m.article?.nom}</p><p className="text-gray-500 text-xs">{m.article?.reference_interne}</p></div></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.type_mouvement === 'ENTREE' ? <span className="flex items-center text-green-600 text-sm font-medium"><ArrowDownCircle className="mr-1" size={16} /> Entrée</span> : 
                       m.type_mouvement === 'RESERVATION' ? <span className="flex items-center text-orange-600 text-sm font-medium"><Lock className="mr-1" size={16} /> Réservation</span> :
                       <span className="flex items-center text-red-600 text-sm font-medium"><ArrowUpCircle className="mr-1" size={16} /> Sortie</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{m.entree ? `+${m.entree}` : `-${m.sortie}`}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatPrice(m.prix_unitaire || 0)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {m.fichier_pj ? <button onClick={() => handleDownloadPj(m.fichier_pj!)} className="text-blue-600 hover:text-blue-900" title="Télécharger PJ"><FileText size={18} /></button> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        m.statut_validation === 'Validé' ? 'bg-green-100 text-green-800' : 
                        m.statut_validation === 'Annulé' ? 'bg-gray-100 text-gray-800' : 
                        'bg-yellow-100 text-yellow-800'}`}>
                        {m.statut_validation || 'Brouillon'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {canValidate && m.statut_validation === 'Brouillon' && m.numero_bs_br_cj && (
                        <button onClick={() => handleValidateBatch(m.numero_bs_br_cj!)} className="text-indigo-600 hover:text-indigo-900 inline-flex" title={`Valider tout le lot ${m.numero_bs_br_cj}`}><CheckSquare size={18} /></button>
                      )}
                      {canValidate && m.statut_validation === 'Brouillon' && !m.numero_bs_br_cj && (
                        <button onClick={() => handleValidate(m.id)} disabled={validatingId === m.id} className="text-green-600 hover:text-green-900 inline-flex" title="Valider"><CheckCircle size={18} /></button>
                      )}
                      
                      {m.statut_validation === 'Brouillon' && (
                        <button onClick={() => handleEdit(m)} className="text-blue-600 hover:text-blue-900 inline-flex" title="Modifier"><Edit2 size={18} /></button>
                      )}

                      {m.statut_validation === 'Brouillon' && (
                        <button onClick={() => handleAnnuler(m.id)} className="text-orange-600 hover:text-orange-900" title="Annuler le mouvement"><Ban size={18} /></button>
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

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <TrendingUp className="mr-2" size={24} /> 
                {editingId ? 'Modifier le Mouvement' : 'Nouveau Mouvement'}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><span className="text-2xl">&times;</span></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><Calendar className="inline mr-1" size={14} /> Date de saisie</label>
                  <input type="text" value={new Date().toLocaleString('fr-FR')} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600" readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><Calendar className="inline mr-1" size={14} /> Date du mouvement <span className="text-red-500">*</span></label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ</label>
                <input type="text" value={formData.numero_bs_br_cj} onChange={(e) => setFormData({ ...formData, numero_bs_br_cj: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: BS-001" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de mouvement <span className="text-red-500">*</span></label>
                <div className="flex space-x-4">
                  <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'ENTREE' ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-300'}`}>
                    <input type="radio" name="type" value="ENTREE" checked={formData.type === 'ENTREE'} onChange={() => setFormData({ ...formData, type: 'ENTREE' })} className="mr-2" />
                    <ArrowDownCircle className="mr-1 text-green-600" size={18} /><span className="font-medium text-green-700">Entrée</span>
                  </label>
                  <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'SORTIE' ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-300'}`}>
                    <input type="radio" name="type" value="SORTIE" checked={formData.type === 'SORTIE'} onChange={() => setFormData({ ...formData, type: 'SORTIE' })} className="mr-2" />
                    <ArrowUpCircle className="mr-1 text-red-600" size={18} /><span className="font-medium text-red-700">Sortie</span>
                  </label>
                  <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${formData.type === 'RESERVATION' ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-orange-300'}`}>
                    <input type="radio" name="type" value="RESERVATION" checked={formData.type === 'RESERVATION'} onChange={() => setFormData({ ...formData, type: 'RESERVATION' })} className="mr-2" />
                    <Lock className="mr-1 text-orange-600" size={18} /><span className="font-medium text-orange-700">Réservation</span>
                  </label>
                </div>
              </div>

              {formData.type === 'RESERVATION' ? (
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chantier bénéficiaire (qui réserve)</label>
                  <SearchableSelect options={chantierOptions} value={formData.chantier_id} onChange={(value) => setFormData({ ...formData, chantier_id: value as number | undefined, article_id: undefined })} placeholder="Sélectionner le chantier bénéficiaire..." allowEmpty={false} />
                </div>
              ) : (
                <SearchableSelect label="Chantier" options={chantierOptions} value={formData.chantier_id} onChange={(value) => setFormData({ ...formData, chantier_id: value as number | undefined, article_id: undefined })} placeholder="Rechercher un chantier..." allowEmpty={false} />
              )}

              <SearchableSelectAPI 
                label="Article" 
                placeholder={formData.chantier_id ? "Tapez pour rechercher..." : "Sélectionnez d'abord un chantier"} 
                value={formData.article_id} 
                onChange={(value) => setFormData({ ...formData, article_id: value })} 
                searchFunction={searchArticles} 
                getSelectedLabel={getArticleLabel} 
                allowEmpty={false} 
                minChars={2}
                disabled={!formData.chantier_id && formData.type !== 'RESERVATION'}
              />

              {searchingStock && <div className="text-sm text-blue-600 italic">Recherche du stock en cours...</div>}
              
              {(formData.type === 'SORTIE' || formData.type === 'RESERVATION') && foundStock && (
                <div className={`p-4 rounded-lg border ${formData.type === 'RESERVATION' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-sm font-bold ${formData.type === 'RESERVATION' ? 'text-orange-800' : 'text-green-800'}`}>Stock disponible sur le chantier source (Fiche N°{foundStock.numero_fiche})</p>
                  <p className={`text-sm ${formData.type === 'RESERVATION' ? 'text-orange-800' : 'text-green-800'}`}><strong>Stock Actuel :</strong> {foundStock.quantite_finale} {foundStock.unite}</p>
                  <p className={`text-sm ${formData.type === 'RESERVATION' ? 'text-orange-800' : 'text-green-800'}`}><strong>CMUP de l'article :</strong> {formatPrice(foundStock.article?.cout || 0)}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0.01" value={formData.quantite || ''} onChange={(e) => setFormData({ ...formData, quantite: parseFloat(e.target.value) || 0 })} className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none ${formData.type === 'ENTREE' ? 'border-green-400 focus:ring-green-500' : formData.type === 'SORTIE' ? 'border-red-400 focus:ring-red-500' : 'border-orange-400 focus:ring-orange-500'}`} placeholder="0" required />
              </div>

              {formData.type === 'ENTREE' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><DollarSign className="inline mr-1" size={16} /> Prix Unitaire (MGA) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0.01" value={formData.prix_unitaire || ''} onChange={(e) => setFormData({ ...formData, prix_unitaire: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 15000" required />
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium"><DollarSign className="inline mr-1" size={16} /> Valorisation automatique</p>
                  <p className="text-sm text-blue-700 mt-1">La {formData.type.toLowerCase()} sera valorisée automatiquement au <strong>CMUP actuel de l'article</strong>.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="inline mr-1" size={16} /> Pièce jointe (PJ)</label>
                <input ref={pjInputRef} type="file" onChange={handlePjUpload} className="hidden" />
                <div className="flex items-center space-x-2">
                  <button type="button" onClick={() => pjInputRef.current?.click()} disabled={uploadingPj} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2 disabled:opacity-50">
                    <FileText size={16} /><span>{uploadingPj ? 'Upload...' : 'Choisir un fichier'}</span>
                  </button>
                  {formData.fichier_pj && (
                    <div className="flex items-center space-x-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                      <FileText size={16} /><span className="truncate max-w-xs">{formData.fichier_pj}</span>
                      <button type="button" onClick={() => setFormData({ ...formData, fichier_pj: undefined })} className="text-red-600 hover:text-red-900"><X size={16} /></button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire</label>
                <textarea value={formData.commentaire} onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Optionnel..." />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ Le mouvement sera {editingId ? 'modifié' : 'créé'} en <strong>Brouillon</strong>. Il faudra le valider pour mettre à jour le stock.
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled={searchingStock}>
                  {editingId ? 'Mettre à jour' : 'Enregistrer'}
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