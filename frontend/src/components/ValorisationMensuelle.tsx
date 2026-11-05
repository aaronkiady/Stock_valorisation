import React, { useState, useEffect } from 'react';
import { ValorisationMois, ValorisationDetailResponse, ValorisationDetailLigne } from '../types';
import { valorisationApi } from '../services/api';
import { BarChart3, Download, AlertCircle, ChevronRight, X, Package, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'MGA', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(price);
};

const formatNumber = (n: number): string => {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const ValorisationMensuelle: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [mois, setMois] = useState<ValorisationMois[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ValorisationDetailResponse | null>(null);

  useEffect(() => { loadMois(); }, [year]);

  const loadMois = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await valorisationApi.getMensuelle(year);
      setMois(data.mois || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (moisNum: number) => {
    try {
      setExporting(moisNum);
      setError(null);
      await valorisationApi.exportMois(year, moisNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(null);
    }
  };

  const handleShowDetail = async (moisNum: number) => {
    try {
      setDetailLoading(true);
      setError(null);
      setShowDetail(true);
      const data = await valorisationApi.getDetail(year, moisNum);
      setDetailData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du détail');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => { setShowDetail(false); setDetailData(null); };

  const totalAnnuelEntrees = mois.reduce((acc, m) => acc + m.valeur_entrees, 0);
  const totalAnnuelSorties = mois.reduce((acc, m) => acc + m.valeur_sorties, 0);
  
  const currentYear = new Date().getFullYear();
  const annees = Array.from({ length: 6 }, (_, i) => currentYear - i);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BarChart3 className="mr-3" size={32} />
            Flux mensuels des stocks
          </h1>
          <p className="text-gray-600 mt-1">Valorisation des entrées et sorties mois par mois</p>
        </div>
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">Année :</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Cartes totaux annuels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Entrées {year}</p>
              <p className="text-3xl font-bold mt-2">{formatPrice(totalAnnuelEntrees)}</p>
            </div>
            <TrendingUp className="w-16 h-16 text-green-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Total Sorties {year}</p>
              <p className="text-3xl font-bold mt-2">{formatPrice(totalAnnuelSorties)}</p>
            </div>
            <TrendingDown className="w-16 h-16 text-red-200" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mois</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entrées (Qté)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valeur Entrées</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sorties (Qté)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valeur Sorties</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nb Mvts</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mois.map((m) => (
                <tr key={m.mois} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{MOIS_FR[m.mois - 1]}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(m.qte_entrees)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-700">{formatPrice(m.valeur_entrees)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(m.qte_sorties)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-700">{formatPrice(m.valeur_sorties)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{m.nb_mouvements}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    <button onClick={() => handleShowDetail(m.mois)} className="text-blue-600 hover:text-blue-900 inline-flex items-center" title="Voir le détail">
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => handleExport(m.mois)} disabled={exporting === m.mois} className="text-green-600 hover:text-green-900 inline-flex items-center disabled:opacity-50" title="Exporter en Excel">
                      <Download size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Package className="mr-2" size={24} />
                Détail {detailData ? `${MOIS_FR[detailData.mois - 1]} ${detailData.year}` : ''}
              </h2>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : detailData ? (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Total Entrées</p>
                      <p className="text-2xl font-bold text-green-900">{formatPrice(detailData.total_entrees)}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-600 font-medium">Total Sorties</p>
                      <p className="text-2xl font-bold text-red-900">{formatPrice(detailData.total_sorties)}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">N° Pièce</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Chantier</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">P.U.</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valeur</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {detailData.detail.length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Aucun mouvement validé ce mois-ci</td></tr>
                        ) : (
                          detailData.detail.map((d, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-sm font-medium">
                                <span className={d.type === 'ENTREE' ? 'text-green-600' : 'text-red-600'}>{d.type}</span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700">{d.numero_piece}</td>
                              <td className="px-3 py-2 text-sm"><p className="font-medium text-gray-900">{d.article_ref}</p><p className="text-gray-500 text-xs">{d.article_nom}</p></td>
                              <td className="px-3 py-2 text-sm"><p className="font-medium text-gray-900">{d.chantier_code}</p><p className="text-gray-500 text-xs">{d.chantier_nom}</p></td>
                              <td className="px-3 py-2 text-sm text-right text-gray-900">{formatNumber(d.quantite)}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-700">{formatPrice(d.prix_unitaire)}</td>
                              <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">{formatPrice(d.valeur)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex justify-end p-4 border-t bg-gray-50">
              <button onClick={() => detailData && handleExport(detailData.mois)} disabled={exporting === (detailData?.mois || 0)} className="mr-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 disabled:opacity-50">
                <Download size={18} />
                <span>Exporter Excel</span>
              </button>
              <button onClick={closeDetail} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValorisationMensuelle;