import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chantier, Stock } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, articlesApi, uploadApi } from '../services/api';
import { Plus, Trash2, Layers, AlertCircle, FileText, ArrowDownCircle, ArrowUpCircle, X, Save, Calendar, Lock, Info } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SearchableSelectAPI from './SearchableSelectAPI';

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface LigneMouvement {
  id: string;
  article_id?: number;
  stock_id?: number;
  quantite: number;
  prix_unitaire: number;
  unite: string;
  stock_info?: Stock | null; // ✅ Pour stocker les infos du stock
}

const MouvementGroupe: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pieceToEdit = searchParams.get('piece'); 
  const isEditing = !!pieceToEdit;

  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEdit, setLoadingEdit] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [chantierId, setChantierId] = useState<number | undefined>(undefined);
  const [typeMouvement, setTypeMouvement] = useState<'ENTREE' | 'SORTIE' | 'RESERVATION'>('ENTREE');

  const [dateMouvement, setDateMouvement] = useState(new Date().toISOString().split('T')[0]);
  const [numeroPiece, setNumeroPiece] = useState(pieceToEdit || '');
  const [fichierPj, setFichierPj] = useState<string | undefined>(undefined);
  const [commentaire, setCommentaire] = useState('');
  const [uploadingPj, setUploadingPj] = useState(false);
  const pjInputRef = React.useRef<HTMLInputElement>(null);

  const [lignes, setLignes] = useState<LigneMouvement[]>([{
    id: generateId(), quantite: 0, prix_unitaire: 0, unite: 'unité', stock_info: null
  }]);

  useEffect(() => { loadChantiers(); }, []);

  useEffect(() => {
    if (isEditing && pieceToEdit && !loading) {
      const loadEditData = async () => {
        try {
          setLoadingEdit(true);
          const mvts = await mouvementsApi.getByPiece(pieceToEdit);
          if (mvts.length > 0) {
            const first = mvts[0];
            setDateMouvement(first.date);
            setNumeroPiece(first.numero_bs_br_cj);
            setTypeMouvement(first.type_mouvement);
            setChantierId(first.chantier_id);
            setCommentaire(first.commentaire || '');
            setFichierPj(first.fichier_pj || undefined);

            const loadedLignes: LigneMouvement[] = await Promise.all(mvts.map(async (m, idx) => {
              let stockInfo = null;
              try {
                if (first.chantier_id) {
                  stockInfo = await stocksApi.find(first.chantier_id, m.article_id);
                }
              } catch(e) {}
              
              return {
                id: `edit-${idx}-${Date.now()}`,
                article_id: m.article_id,
                stock_id: m.stock_id,
                quantite: m.entree || m.sortie || 0,
                prix_unitaire: m.prix_unitaire || 0,
                unite: m.article?.unite_mesure || 'unité',
                stock_info: stockInfo
              };
            }));
            setLignes(loadedLignes);
          }
        } catch (err) {
          setError("Impossible de charger les mouvements existants.");
        } finally {
          setLoadingEdit(false);
        }
      };
      loadEditData();
    }
  }, [isEditing, pieceToEdit, loading]);

  const loadChantiers = async () => {
    try {
      setLoading(true);
      const chantiersData = await chantiersApi.getAll({ per_page: 1000 });
      let chantiersArray: Chantier[] = [];
      if (Array.isArray(chantiersData)) chantiersArray = chantiersData;
      else if (chantiersData && typeof chantiersData === 'object') chantiersArray = (chantiersData as any).chantiers || [];
      setChantiers(chantiersArray);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement');
    } finally { setLoading(false); }
  };

  const handlePjUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingPj(true);
      const result = await uploadApi.uploadFile(file);
      setFichierPj(result.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally { setUploadingPj(false); }
  };

  const addLigne = () => {
    setLignes([...lignes, { id: generateId(), quantite: 0, prix_unitaire: 0, unite: 'unité', stock_info: null }]);
  };

  const removeLigne = (id: string) => {
    if (lignes.length === 1) { setError('Il doit y avoir au moins une ligne'); return; }
    setLignes(lignes.filter(l => l.id !== id));
  };

  const updateLigne = (id: string, updates: Partial<LigneMouvement>) => {
    setLignes(lignes.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleArticleChange = async (ligneId: string, articleId: number) => {
    if (!chantierId && typeMouvement !== 'RESERVATION') {
      setError("Veuillez d'abord sélectionner un chantier dans les informations de la pièce.");
      return;
    }
    
    try {
      setError(null);
      const article = await articlesApi.getById(articleId);
      const uniteArticle = article.unite_mesure || 'unité';

      let stockId: number | undefined = undefined;
      let prixUnitaire: number = 0;
      let currentStock: Stock | null = null;

      if (typeMouvement !== 'ENTREE') {
        let idChantierSource = chantierId;
        
        if (typeMouvement === 'RESERVATION') {
          const source = chantiers.find(c => c.code === 'O23005');
          if (!source) {
            setError("Le chantier source O23005 est introuvable.");
            updateLigne(ligneId, { article_id: articleId, unite: uniteArticle });
            return;
          }
          idChantierSource = source.id;
        }

        const stock = await stocksApi.find(idChantierSource!, articleId);
        stockId = stock.id;
        prixUnitaire = stock.article?.cout || 0;
        currentStock = stock;
      } else {
        const stock = await stocksApi.find(chantierId!, articleId);
        stockId = stock.id;
        currentStock = stock;
      }

      updateLigne(ligneId, { 
        article_id: articleId, 
        unite: uniteArticle,
        stock_id: stockId,
        prix_unitaire: prixUnitaire,
        stock_info: currentStock
      });
      
    } catch (err) {
      updateLigne(ligneId, { article_id: articleId, stock_id: undefined, stock_info: null });
      setError(`Aucun stock validé trouvé pour cet article sur le chantier source.`);
    }
  };

  // ✅ FILTRAGE : Uniquement les articles avec stock > 0 sur le chantier
  const searchArticles = useCallback(async (searchTerm: string) => {
    try {
      // ENTREE : afficher tous les articles
      if (typeMouvement === 'ENTREE') {
        const data = await articlesApi.getAll({
          search: searchTerm,
          per_page: 50
        });

        const selectedIds = lignes
          .map(l => l.article_id)
          .filter((id): id is number => id !== undefined);

        return (data.articles || [])
          .filter(a => !selectedIds.includes(a.id))
          .map(a => ({
            value: a.id,
            label: a.nom,
            sublabel: a.reference_interne
          }));
      }

      // SORTIE et RESERVATION : vérifier le stock disponible
      let idChantierSource = chantierId;

      if (typeMouvement === 'RESERVATION') {
        const source = chantiers.find(c => c.code === 'O23005');

        if (!source) return [];

        idChantierSource = source.id;
      }

      if (!idChantierSource) return [];

      const stockData = await stocksApi.getAll({
        chantier_id: idChantierSource,
        search: searchTerm,
        statut_validation: 'Validé',
        per_page: 50
      });

      const selectedIds = lignes
        .map(l => l.article_id)
        .filter((id): id is number => id !== undefined);

      return (stockData.stocks || [])
        .filter(s =>
          s.quantite_finale > 0 &&
          !selectedIds.includes(s.article_id)
        )
        .map(s => ({
          value: s.article_id,
          label: s.article?.nom || `Article #${s.article_id}`,
          sublabel: `${s.article?.reference_interne} - Dispo: ${s.quantite_finale} ${s.unite}`
        }));

    } catch (err) {
      return [];
    }
  }, [chantierId, typeMouvement, chantiers, lignes]);

  const getArticleLabel = useCallback(async (articleId: number) => {
    try {
      const article = await articlesApi.getById(articleId);
      return `${article.nom} (${article.reference_interne})`;
    } catch (err) { return `Article #${articleId}`; }
  }, []);

  const chantierOptions = chantiers
    .filter(c => c.statut === 'Actif')
    .map(chantier => ({ value: chantier.id, label: chantier.code, sublabel: chantier.nom }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);

    if (!chantierId) { setError('Veuillez sélectionner un chantier'); return; }
    if (!dateMouvement) { setError('Date du mouvement requise'); return; }
    if (!numeroPiece.trim()) { setError('N° de pièce (BS/BR/CJ) requis'); return; }
    if (lignes.length === 0) { setError('Ajoutez au moins une ligne'); return; }

    const articleIds = lignes.map(l => l.article_id).filter(id => id !== undefined);
    const hasDoublons = new Set(articleIds).size !== articleIds.length;
    if (hasDoublons) {
      setError("Vous avez sélectionné le même article plusieurs fois. Veuillez corriger les lignes.");
      return;
    }

    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (!l.article_id) { setError(`Ligne ${i + 1} : article requis`); return; }
      if (typeMouvement !== 'ENTREE' && !l.stock_id) { 
        setError(`Ligne ${i + 1} : aucun stock trouvé pour cette ${typeMouvement.toLowerCase()}`); 
        return; 
      }
      if (l.quantite <= 0) { setError(`Ligne ${i + 1} : quantité > 0 requise`); return; }
      if (typeMouvement === 'ENTREE' && l.prix_unitaire <= 0) { setError(`Ligne ${i + 1} : prix unitaire > 0 requis`); return; }
      if ((typeMouvement === 'SORTIE' || typeMouvement === 'RESERVATION') && l.stock_info && l.quantite > l.stock_info.quantite_finale) {
         setError(`Ligne ${i + 1} : Stock insuffisant (dispo: ${l.stock_info.quantite_finale})`); return;
      }
    }

    try {
      setSaving(true);
      const payload = {
        date: dateMouvement,
        numero_bs_br_cj: numeroPiece,
        fichier_pj: fichierPj,
        commentaire: commentaire,
        type_mouvement: typeMouvement,
        mouvements: lignes.map(l => ({
          chantier_id: chantierId,
          article_id: l.article_id!,
          unite: l.unite,
          entree: typeMouvement === 'ENTREE' ? l.quantite : undefined,
          sortie: (typeMouvement === 'SORTIE' || typeMouvement === 'RESERVATION') ? l.quantite : undefined,
          prix_unitaire: l.prix_unitaire,
        }))
      };

      const result = isEditing 
        ? await mouvementsApi.updateBatch(pieceToEdit!, payload)
        : await mouvementsApi.createBatch(payload);

      if (result.erreurs && result.erreurs.length > 0) {
        const details = result.erreurs.map((e: { ligne: number; erreur: string }) => `Ligne ${e.ligne}: ${e.erreur}`).join(' | ');
        setError(`Certaines lignes ont échoué : ${details}`);
        if (result.crees > 0) setSuccess(`${result.crees} mouvement(s) enregistré(s)`);
      } else {
        setSuccess(`${result.crees} mouvement(s) enregistré(s) avec succès`);
        setTimeout(() => navigate('/mouvements'), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally { setSaving(false); }
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MGA' }).format(price);
  };

  if (loading || loadingEdit) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        {loadingEdit && <p className="text-gray-500">Chargement des mouvements de la pièce...</p>}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Layers className="mr-3" size={32} /> 
            {isEditing ? 'Modifier la pièce justificative' : 'Saisie groupée de mouvements'}
          </h1>
          <p className="text-gray-600 mt-1">Une pièce justificative = plusieurs lignes d'articles</p>
        </div>
        <button onClick={() => navigate('/mouvements')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2">
          <X size={18} /><span>Retour</span>
        </button>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start"><AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} /><span>{error}</span></div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Informations de la pièce justificative</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><Calendar className="inline mr-1" size={14} /> Date de saisie</label>
              <input type="text" value={new Date().toLocaleString('fr-FR')} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600" readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><Calendar className="inline mr-1" size={14} /> Date du mouvement <span className="text-red-500">*</span></label>
              <input type="date" value={dateMouvement} onChange={(e) => setDateMouvement(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ <span className="text-red-500">*</span></label>
              <input type="text" value={numeroPiece} onChange={(e) => setNumeroPiece(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100" placeholder="Ex: BS-2025-001" required readOnly={isEditing} />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chantier {typeMouvement === 'RESERVATION' ? '(Bénéficiaire)' : ''} <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={chantierOptions}
                value={chantierId}
                onChange={(v) => setChantierId(v as number)}
                placeholder="Sélectionner le chantier..."
                allowEmpty={false}
                disabled={isEditing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="inline mr-1" size={14} /> Pièce jointe</label>
              <input ref={pjInputRef} type="file" onChange={handlePjUpload} className="hidden" />
              <button type="button" onClick={() => pjInputRef.current?.click()} disabled={uploadingPj} className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center space-x-2 disabled:opacity-50">
                <FileText size={16} /><span className="truncate">{uploadingPj ? 'Upload...' : fichierPj || 'Choisir un fichier'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de mouvement de la pièce <span className="text-red-500">*</span></label>
            <div className="flex space-x-4">
              <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${typeMouvement === 'ENTREE' ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-300'}`}>
                <input type="radio" name="type_global" value="ENTREE" checked={typeMouvement === 'ENTREE'} onChange={() => setTypeMouvement('ENTREE')} className="mr-2" disabled={isEditing} />
                <ArrowDownCircle className="mr-1 text-green-600" size={18} /><span className="font-medium text-green-700">Entrée</span>
              </label>
              <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${typeMouvement === 'SORTIE' ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-300'}`}>
                <input type="radio" name="type_global" value="SORTIE" checked={typeMouvement === 'SORTIE'} onChange={() => setTypeMouvement('SORTIE')} className="mr-2" disabled={isEditing} />
                <ArrowUpCircle className="mr-1 text-red-600" size={18} /><span className="font-medium text-red-700">Sortie</span>
              </label>
              <label className={`flex items-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${typeMouvement === 'RESERVATION' ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-orange-300'}`}>
                <input type="radio" name="type_global" value="RESERVATION" checked={typeMouvement === 'RESERVATION'} onChange={() => setTypeMouvement('RESERVATION')} className="mr-2" disabled={isEditing} />
                <Lock className="mr-1 text-orange-600" size={18} /><span className="font-medium text-orange-700">Réservation</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire global</label>
            <input type="text" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Observation générale..." />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-visible">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Lignes d'articles ({lignes.length})</h2>
            <button type="button" onClick={addLigne} className="btn btn-primary flex items-center space-x-2">
              <Plus size={18} /><span>Ajouter une ligne</span>
            </button>
          </div>

          <div className="overflow-x-auto min-h-[300px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article (Taper pour chercher)</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Unité</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Quantité</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Prix unit.</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {lignes.map((ligne, idx) => (
                  <tr key={ligne.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-600">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <SearchableSelectAPI
                        value={ligne.article_id}
                        onChange={(v) => handleArticleChange(ligne.id, v as number)}
                        searchFunction={searchArticles}
                        getSelectedLabel={getArticleLabel}
                        placeholder={chantierId ? "Taper le nom..." : "Sélectionnez d'abord un chantier"}
                        allowEmpty={false}
                        minChars={2}
                        disabled={!chantierId}
                      />
                      {/* ✅ NOUVEAU : Affichage du stock disponible */}
                      {ligne.stock_info && typeMouvement !== 'ENTREE' && (
                        <div className="mt-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 flex items-center">
                          <Info size={12} className="mr-1" />
                          Dispo: <strong className="ml-1">{ligne.stock_info.quantite_finale} {ligne.stock_info.unite}</strong> 
                          {' | '}CMUP: <strong className="ml-1">{formatPrice(ligne.stock_info.article?.cout || 0)}</strong>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={ligne.unite} readOnly className="w-full px-2 py-1 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" min="0.01" value={ligne.quantite || ''} onChange={(e) => updateLigne(ligne.id, { quantite: parseFloat(e.target.value) || 0 })} className={`w-full px-2 py-1 border-2 rounded focus:outline-none ${typeMouvement === 'ENTREE' ? 'border-green-400' : typeMouvement === 'SORTIE' ? 'border-red-400' : 'border-orange-400'}`} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" min="0.01" value={ligne.prix_unitaire || ''} onChange={(e) => updateLigne(ligne.id, { prix_unitaire: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={typeMouvement !== 'ENTREE'} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeLigne(ligne.id)} className="text-red-600 hover:text-red-900" title="Supprimer la ligne"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 px-4 py-3 border-t flex justify-end">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Total HT (Entrées) : </span>
              <span className="font-bold text-gray-900">{formatPrice(lignes.reduce((sum, l) => sum + (typeMouvement === 'ENTREE' ? l.quantite * l.prix_unitaire : 0), 0))}</span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          ⚠️ Les {lignes.length} mouvement(s) seront {isEditing ? 'mis à jour' : 'créés'} en <strong>Brouillon</strong>.
        </div>

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={() => navigate('/mouvements')} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
          <button type="submit" disabled={saving || !chantierId} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50">
            <Save size={18} /><span>{saving ? 'Enregistrement...' : (isEditing ? 'Mettre à jour la pièce' : `Enregistrer ${lignes.length} mouvement(s)`)}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default MouvementGroupe;