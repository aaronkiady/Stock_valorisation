/**
 * MouvementGroupe - Saisie groupée de mouvements pour une même pièce justificative
 * ✅ Plusieurs articles dans une seule fenêtre (BS, BR, CJ, etc.)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stock, Chantier } from '../types';
import { mouvementsApi, stocksApi, chantiersApi, uploadApi } from '../services/api';
import { Plus, Trash2, Layers, AlertCircle, FileText, ArrowDownCircle, ArrowUpCircle, X, Save } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

interface LigneMouvement {
  id: string; // UUID local
  stock_id?: number;
  article_id?: number;
  chantier_id?: number;
  type: 'ENTREE' | 'SORTIE';
  quantite: number;
  prix_unitaire: number;
}

const MouvementGroupe: React.FC = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Champs communs
  const [dateMouvement, setDateMouvement] = useState(new Date().toISOString().split('T')[0]);
  const [numeroPiece, setNumeroPiece] = useState('');
  const [fichierPj, setFichierPj] = useState<string | undefined>(undefined);
  const [commentaire, setCommentaire] = useState('');
  const [uploadingPj, setUploadingPj] = useState(false);
  const pjInputRef = React.useRef<HTMLInputElement>(null);

  // Lignes de mouvements
  const [lignes, setLignes] = useState<LigneMouvement[]>([{
    id: crypto.randomUUID(),
    type: 'ENTREE',
    quantite: 0,
    prix_unitaire: 0
  }]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [stocksData, chantiersData] = await Promise.all([
        stocksApi.getAll({ per_page: 1000 }),
        chantiersApi.getAll({ per_page: 1000 })
      ]);
      setStocks(stocksData.stocks || []);
      let chantiersArray: Chantier[] = [];
      if (Array.isArray(chantiersData)) chantiersArray = chantiersData;
      else if (chantiersData && typeof chantiersData === 'object') chantiersArray = (chantiersData as any).chantiers || [];
      setChantiers(chantiersArray);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement');
    } finally {
      setLoading(false);
    }
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
    } finally {
      setUploadingPj(false);
    }
  };

  const addLigne = () => {
    setLignes([...lignes, {
      id: crypto.randomUUID(),
      type: 'ENTREE',
      quantite: 0,
      prix_unitaire: 0
    }]);
  };

  const removeLigne = (id: string) => {
    if (lignes.length === 1) {
      setError('Il doit y avoir au moins une ligne');
      return;
    }
    setLignes(lignes.filter(l => l.id !== id));
  };

  const updateLigne = (id: string, updates: Partial<LigneMouvement>) => {
    setLignes(lignes.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleStockChange = (id: string, stockId: number) => {
    const stock = stocks.find(s => s.id === stockId);
    updateLigne(id, {
      stock_id: stockId,
      article_id: stock?.article_id,
      chantier_id: stock?.chantier_id
    });
  };

  const stockOptions = stocks
    .filter(s => s.statut_validation === 'Validé')
    .map(stock => ({
      value: stock.id,
      label: `Fiche N°${stock.numero_fiche} - ${stock.article?.reference_interne}`,
      sublabel: `${stock.article?.nom} (${stock.chantier?.code}) - Dispo: ${stock.quantite_finale}`
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!dateMouvement) { setError('Date du mouvement requise'); return; }
    if (!numeroPiece.trim()) { setError('N° de pièce (BS/BR/CJ) requis'); return; }
    if (lignes.length === 0) { setError('Ajoutez au moins une ligne'); return; }

    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (!l.stock_id) { setError(`Ligne ${i + 1} : stock requis`); return; }
      if (!l.article_id) { setError(`Ligne ${i + 1} : article requis`); return; }
      if (l.quantite <= 0) { setError(`Ligne ${i + 1} : quantité > 0 requise`); return; }
      if (l.prix_unitaire <= 0) { setError(`Ligne ${i + 1} : prix unitaire > 0 requis`); return; }
    }

    try {
      setSaving(true);
      const result = await mouvementsApi.createBatch({
        date: dateMouvement,
        numero_bs_br_cj: numeroPiece,
        fichier_pj: fichierPj,
        commentaire: commentaire,
        mouvements: lignes.map(l => ({
          stock_id: l.stock_id!,
          article_id: l.article_id!,
          chantier_id: l.chantier_id,
          entree: l.type === 'ENTREE' ? l.quantite : undefined,
          sortie: l.type === 'SORTIE' ? l.quantite : undefined,
          prix_unitaire: l.prix_unitaire,
        }))
      });

      if (result.erreurs && result.erreurs.length > 0) {
        const details = result.erreurs.map(e => `Ligne ${e.ligne}: ${e.erreur}`).join(' | ');
        setError(`Certaines lignes ont échoué : ${details}`);
        if (result.crees > 0) {
          setSuccess(`${result.crees} mouvement(s) créé(s) sur ${result.total}`);
        }
      } else {
        setSuccess(`${result.crees} mouvement(s) créé(s) avec succès (en attente de validation)`);
        setTimeout(() => navigate('/mouvements'), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Layers className="mr-3" size={32} />
            Saisie groupée de mouvements
          </h1>
          <p className="text-gray-600 mt-1">
            Une pièce justificative (BS/BR/CJ) = plusieurs lignes d'articles
          </p>
        </div>
        <button
          onClick={() => navigate('/mouvements')}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
        >
          <X size={18} />
          <span>Retour</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* En-tête : infos communes */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Informations de la pièce justificative</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date du mouvement <span className="text-red-500">*</span></label>
              <input type="date" value={dateMouvement} onChange={(e) => setDateMouvement(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° BS/BR/CJ <span className="text-red-500">*</span></label>
              <input type="text" value={numeroPiece} onChange={(e) => setNumeroPiece(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: BS-2025-001" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="inline mr-1" size={14} /> Pièce jointe</label>
              <input ref={pjInputRef} type="file" onChange={handlePjUpload} className="hidden" />
              <button type="button" onClick={() => pjInputRef.current?.click()} disabled={uploadingPj} className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center space-x-2 disabled:opacity-50">
                <FileText size={16} />
                <span className="truncate">{uploadingPj ? 'Upload...' : fichierPj || 'Choisir un fichier'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire global</label>
            <input type="text" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Observation générale..." />
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Lignes d'articles ({lignes.length})</h2>
            <button type="button" onClick={addLigne} className="btn btn-primary flex items-center space-x-2">
              <Plus size={18} />
              <span>Ajouter une ligne</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock (Article)</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Type</th>
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
                      <SearchableSelect
                        options={stockOptions}
                        value={ligne.stock_id}
                        onChange={(v) => handleStockChange(ligne.id, v as number)}
                        placeholder="Rechercher un stock..."
                        allowEmpty={false}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col space-y-1">
                        <label className="flex items-center text-xs cursor-pointer">
                          <input type="radio" name={`type-${ligne.id}`} checked={ligne.type === 'ENTREE'} onChange={() => updateLigne(ligne.id, { type: 'ENTREE' })} className="mr-1" />
                          <ArrowDownCircle className="text-green-600 mr-1" size={12} />
                          Entrée
                        </label>
                        <label className="flex items-center text-xs cursor-pointer">
                          <input type="radio" name={`type-${ligne.id}`} checked={ligne.type === 'SORTIE'} onChange={() => updateLigne(ligne.id, { type: 'SORTIE' })} className="mr-1" />
                          <ArrowUpCircle className="text-red-600 mr-1" size={12} />
                          Sortie
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={ligne.quantite || ''}
                        onChange={(e) => updateLigne(ligne.id, { quantite: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2 py-1 border-2 rounded focus:outline-none ${ligne.type === 'ENTREE' ? 'border-green-400' : 'border-red-400'}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={ligne.prix_unitaire || ''}
                        onChange={(e) => updateLigne(ligne.id, { prix_unitaire: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeLigne(ligne.id)} className="text-red-600 hover:text-red-900" title="Supprimer la ligne">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="bg-gray-50 px-4 py-3 border-t flex justify-end">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Total HT : </span>
              <span className="font-bold text-gray-900">
                {formatPrice(lignes.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0))}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          ⚠️ Les {lignes.length} mouvement(s) seront créés en <strong>Brouillon</strong>. Il faudra les valider un par un dans la liste des mouvements.
        </div>

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={() => navigate('/mouvements')} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50">
            <Save size={18} />
            <span>{saving ? 'Enregistrement...' : `Enregistrer ${lignes.length} mouvement(s)`}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default MouvementGroupe;