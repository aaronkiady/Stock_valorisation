import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mouvement, Chantier, StatutValidation, User } from '../types';
import { mouvementsApi, chantiersApi, exportApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Trash2, Edit2, AlertCircle, CheckCircle, X, Eye } from 'lucide-react';

const Mouvements: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUser = user as User | null;

  const canValidate =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'RespStock' ||
    currentUser?.role === 'RespChantier';

  const canEditOrDelete =
    currentUser?.role === 'admin' || currentUser?.role === 'RespStock';

  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMouvement, setSelectedMouvement] = useState<Mouvement | null>(null);
  const [editingMouvement, setEditingMouvement] = useState<Mouvement | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterChantier, setFilterChantier] = useState<number | ''>('');
  const [filterStatut, setFilterStatut] = useState<StatutValidation | ''>('');
  const [filterType, setFilterType] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const perPage = 20;

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    numero_bs_br_cj: '',
    entree: '' as number | '',
    sortie: '' as number | '',
    prix_unitaire: '' as number | '',
    commentaire: '',
  });

  const fetchChantiers = useCallback(async () => {
    try {
      const data = await chantiersApi.getAll({ per_page: 1000 });
      let arr: Chantier[] = [];
      if (Array.isArray(data)) arr = data;
      else if (data && typeof data === 'object') arr = (data as any).chantiers || [];
      setChantiers(arr);
    } catch (e) {
      console.error('Erreur chargement chantiers:', e);
    }
  }, []);

  const fetchMouvements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: currentPage, per_page: perPage };
      if (searchTerm) params.search = searchTerm;
      if (filterChantier) params.chantier_id = filterChantier;
      if (filterStatut) params.statut_validation = filterStatut;
      if (filterType) params.type_mouvement = filterType;
      if (dateDebut) params.date_debut = dateDebut;
      if (dateFin) params.date_fin = dateFin;

      const data = await mouvementsApi.getAll(params);
      const list = Array.isArray(data) ? data : (data as any).mouvements || [];
      setMouvements(list);
      setTotalPages((data as any).pages || 1);
      setTotalItems((data as any).total || list.length);
    } catch (e: any) {
      setError(e?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterChantier, filterStatut, filterType, dateDebut, dateFin]);

  useEffect(() => { fetchChantiers(); }, [fetchChantiers]);
  useEffect(() => { fetchMouvements(); }, [fetchMouvements]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMouvement) return;
    setError(null); setSuccess(null);
    try {
      const payload: any = {
        date: formData.date,
        numero_bs_br_cj: formData.numero_bs_br_cj,
        commentaire: formData.commentaire,
        entree: formData.entree !== '' ? Number(formData.entree) : undefined,
        sortie: formData.sortie !== '' ? Number(formData.sortie) : undefined,
        prix_unitaire: formData.prix_unitaire !== '' ? Number(formData.prix_unitaire) : undefined,
      };
      await mouvementsApi.update(editingMouvement.id, payload);
      setSuccess('Mouvement mis à jour');
      setShowEditModal(false);
      setEditingMouvement(null);
      fetchMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  };

  const handleValidate = async (id: number) => {
    if (!window.confirm('Confirmer la validation de ce mouvement ?')) return;
    setError(null); setSuccess(null);
    try {
      await mouvementsApi.validate(id);
      setSuccess('Mouvement validé');
      fetchMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur validation');
    }
  };

  const handleAnnuler = async (id: number) => {
    if (!window.confirm('Annuler ce mouvement ?')) return;
    setError(null);
    try {
      await mouvementsApi.annuler(id);
      setSuccess('Mouvement annulé');
      fetchMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer ce mouvement ?')) return;
    setError(null);
    try {
      await mouvementsApi.delete(id);
      setSuccess('Mouvement supprimé');
      fetchMouvements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  };

  const handleExport = async () => {
    try {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (filterChantier) params.chantier_id = filterChantier;
      if (dateDebut) params.date_debut = dateDebut;
      if (dateFin) params.date_fin = dateFin;
      if (filterType) params.type_mouvement = filterType;
      await exportApi.mouvements(params);
      setSuccess('Export Excel généré');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur export');
    }
  };

  const openEdit = (m: Mouvement) => {
    setEditingMouvement(m);
    setFormData({
      date: m.date?.split('T')[0] || '',
      numero_bs_br_cj: m.numero_bs_br_cj || '',
      entree: m.entree ?? '',
      sortie: m.sortie ?? '',
      prix_unitaire: m.prix_unitaire ?? '',
      commentaire: m.commentaire || '',
    });
    setShowEditModal(true);
  };

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '-');
  const formatNumber = (n?: number | null) => n != null ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '0';

  const statutColor = (s: StatutValidation) => {
    if (s === 'Validé') return 'bg-green-100 text-green-800';
    if (s === 'Annulé') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const canValidateMouvement = (m: Mouvement) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'RespStock') return true;
    if (currentUser.role === 'RespChantier') {
      return m.chantier_id != null && (currentUser.chantiers || []).includes(m.chantier_id);
    }
    return false;
  };

  // Formate l'affichage d'un chantier : Client - Code - Nom
  const formatChantier = (c?: Chantier) => {
    if (!c) return '-';
    return `${c.client ? c.client + ' - ' : ''}${c.code} - ${c.nom}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des Mouvements</h1>
          <p className="text-gray-600 mt-1">Suivi des entrées / sorties / réservations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Retour</button>
          <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Exporter Excel</button>
          {currentUser && (
            <button onClick={() => navigate('/mouvements/nouveau')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
              <Plus size={18} /><span>Nouvelle Pièce</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start"><AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} /><span>{error}</span></div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>}

      {/* Filtres alignés (Grille 12 colonnes) */}
            {/* Filtres repensés (2 lignes) */}
      <form 
        onSubmit={(e) => { e.preventDefault(); fetchMouvements(); }} 
        className="bg-white rounded-lg shadow p-5 mb-6 space-y-4"
      >
        {/* Ligne 1 : Recherche, Chantier, Type, Statut */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text" 
                placeholder="N° pièce, article..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chantier</label>
            <select 
              value={filterChantier} 
              onChange={(e) => setFilterChantier(e.target.value ? Number(e.target.value) : '')} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les chantiers</option>
              {chantiers.map((c) => <option key={c.id} value={c.id}>{formatChantier(c)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les types</option>
              <option value="ENTREE">Entrée</option>
              <option value="SORTIE">Sortie</option>
              <option value="RESERVATION">Réservation</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select 
              value={filterStatut} 
              onChange={(e) => setFilterStatut(e.target.value as StatutValidation | '')} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les statuts</option>
              <option value="Brouillon">Brouillon</option>
              <option value="Validé">Validé</option>
              <option value="Annulé">Annulé</option>
            </select>
          </div>
        </div>

        {/* Ligne 2 : Dates et Boutons */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date mouvement (début)</label>
            <input 
              type="date" 
              value={dateDebut} 
              onChange={(e) => setDateDebut(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date mouvement (fin)</label>
            <input 
              type="date" 
              value={dateFin} 
              onChange={(e) => setDateFin(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>

          {/* Les boutons occupent les 2 dernières colonnes de la grille */}
          <div className="md:col-span-2 flex justify-end space-x-3">
            <button 
              type="button" 
              onClick={() => {
                setSearchTerm('');
                setFilterChantier('');
                setFilterType('');
                setFilterStatut('');
                setDateDebut('');
                setDateFin('');
                setCurrentPage(1);
              }} 
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors"
            >
              Réinitialiser
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors font-medium"
            >
              <Search size={18} />
              <span>Rechercher</span>
            </button>
          </div>
        </div>
      </form>

      {/* Tableau */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Pièce</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chantier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entrée</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sortie</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Prix Unit.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-500">Chargement...</td></tr>}
              {!loading && mouvements.length === 0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-500">Aucun mouvement</td></tr>}
              {!loading && mouvements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(m.date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.numero_bs_br_cj || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatChantier(m.chantier)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div>
                      <p className="font-medium">{m.article?.nom || '-'}</p>
                      <p className="text-gray-500 text-xs">{m.article?.reference_interne || ''}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${m.type_mouvement === 'ENTREE' ? 'bg-blue-100 text-blue-800' : m.type_mouvement === 'SORTIE' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}>
                      {m.type_mouvement}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(m.entree)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(m.sortie)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(m.prix_unitaire)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${statutColor(m.statut_validation)}`}>{m.statut_validation}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.utilisateur || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => { setSelectedMouvement(m); setShowDetailsModal(true); }} className="text-gray-600 hover:text-gray-900" title="Voir">
                        <Eye size={18} />
                      </button>
                      {canValidate && canValidateMouvement(m) && m.statut_validation === 'Brouillon' && (
                        <button onClick={() => handleValidate(m.id)} className="text-green-600 hover:text-green-900" title="Valider">
                          <CheckCircle size={18} />
                        </button>
                      )}
                      {canEditOrDelete && m.statut_validation === 'Brouillon' && (
                        <>
                          <button onClick={() => openEdit(m)} className="text-blue-600 hover:text-blue-900" title="Éditer">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleAnnuler(m.id)} className="text-yellow-600 hover:text-yellow-900" title="Annuler">
                            <X size={18} />
                          </button>
                          <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-900" title="Supprimer">
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">Page {currentPage} sur {totalPages} ({totalItems} mouvements)</div>
            <div className="flex space-x-2">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100">Précédent</button>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100">Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal édition (similaire à précédemment) */}
      {showEditModal && editingMouvement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">Éditer le mouvement</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600"><span className="text-2xl">&times;</span></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ</label>
                <input type="text" value={formData.numero_bs_br_cj} onChange={(e) => setFormData({ ...formData, numero_bs_br_cj: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entrée</label>
                  <input type="number" step="0.01" value={formData.entree} onChange={(e) => setFormData({ ...formData, entree: e.target.value ? Number(e.target.value) : '', sortie: '' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sortie</label>
                  <input type="number" step="0.01" value={formData.sortie} onChange={(e) => setFormData({ ...formData, sortie: e.target.value ? Number(e.target.value) : '', entree: '' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix unitaire</label>
                <input type="number" step="0.01" value={formData.prix_unitaire} onChange={(e) => setFormData({ ...formData, prix_unitaire: e.target.value ? Number(e.target.value) : '' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire</label>
                <textarea value={formData.commentaire} onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal détails */}
      {showDetailsModal && selectedMouvement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">Détails du mouvement</h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600"><span className="text-2xl">&times;</span></button>
            </div>
            <div className="p-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Date :</span><span>{formatDate(selectedMouvement.date)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">N° Pièce :</span><span>{selectedMouvement.numero_bs_br_cj || '-'}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Chantier :</span><span className="text-right">{formatChantier(selectedMouvement.chantier)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Article :</span><span className="text-right">{selectedMouvement.article?.nom || '-'}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Type :</span><span>{selectedMouvement.type_mouvement}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Entrée :</span><span>{formatNumber(selectedMouvement.entree)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Sortie :</span><span>{formatNumber(selectedMouvement.sortie)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Prix :</span><span>{formatNumber(selectedMouvement.prix_unitaire)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Statut :</span><span>{selectedMouvement.statut_validation}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Utilisateur :</span><span>{selectedMouvement.utilisateur || '-'}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Commentaire :</span><span className="text-right">{selectedMouvement.commentaire || '-'}</span></div>
            </div>
            <div className="flex justify-end p-6 border-t">
              <button onClick={() => setShowDetailsModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mouvements;