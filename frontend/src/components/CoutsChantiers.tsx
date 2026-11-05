import React, { useState, useEffect } from 'react';
import { Download, AlertCircle, ChevronRight, X, DollarSign, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5880/api';

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'MGA', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(price);
};

const formatNumber = (n: number): string => {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

interface ChantierCout {
  id: number;
  code: string;
  nom: string;
  total_qte_sortie: number;
  total_cout: number;
}

interface DetailCout {
  article_ref: string;
  article_nom: string;
  total_qte: number;
  total_cout: number;
}

const CoutsChantiers: React.FC = () => {
  const { user } = useAuth();
  const [chantiers, setChantiers] = useState<ChantierCout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Détail
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);

  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };

  useEffect(() => {
    loadChantiers();
  }, []);

  const loadChantiers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/couts/chantiers`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setChantiers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/couts/chantiers/export`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const contentType = response.headers.get('Content-Type') || '';
      const ext = contentType.includes('spreadsheetml') ? 'xlsx' : 'csv';
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `couts_chantiers_${new Date().toISOString().slice(0,10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const handleShowDetail = async (chantierId: number) => {
    try {
      setDetailLoading(true);
      setError(null);
      setShowDetail(true);
      const response = await fetch(`${API_BASE_URL}/couts/chantiers/${chantierId}`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erreur lors du chargement du détail');
      const data = await response.json();
      setDetailData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du détail');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => { setShowDetail(false); setDetailData(null); };

  const totalGeneral = chantiers.reduce((acc, c) => acc + c.total_cout, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <DollarSign className="mr-3" size={32} />
            Coût réel par chantier
          </h1>
          <p className="text-gray-600 mt-1">Valorisation des articles consommés (sorties de stock validées)</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn btn-success flex items-center space-x-2">
          <Download size={20} />
          <span>{exporting ? 'Export...' : 'Exporter Excel'}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Carte Total Général */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-100 text-sm font-medium">Dépense Totale Engagée (Tous Chantiers)</p>
            <p className="text-3xl font-bold mt-2">{formatPrice(totalGeneral)}</p>
          </div>
          <DollarSign className="w-16 h-16 text-indigo-200" />
        </div>
      </div>

      {/* Tableau des chantiers */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chantier</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qté Consommée</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coût Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {chantiers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Aucune sortie de stock validée pour le moment.
                  </td>
                </tr>
              ) : (
                chantiers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{c.nom}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatNumber(c.total_qte_sortie)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-indigo-700">{formatPrice(c.total_cout)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button onClick={() => handleShowDetail(c.id)} className="text-blue-600 hover:text-blue-900 inline-flex items-center" title="Voir le détail">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Détail */}
      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Package className="mr-2" size={24} />
                Détail du chantier : {detailData ? `${detailData.chantier_code} - ${detailData.chantier_nom}` : ''}
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
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <p className="text-sm text-indigo-600 font-medium">Coût Total</p>
                      <p className="text-2xl font-bold text-indigo-900">{formatPrice(detailData.total_cout)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-600 font-medium">Quantité Totale</p>
                      <p className="text-2xl font-bold text-blue-900">{formatNumber(detailData.total_qte)}</p>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Réf. Article</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté Consommée</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Coût Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {detailData.detail.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Aucun article consommé</td></tr>
                        ) : (
                          detailData.detail.map((d: DetailCout, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.article_ref}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{d.article_nom}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(d.total_qte)}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-indigo-700">{formatPrice(d.total_cout)}</td>
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
              <button onClick={closeDetail} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoutsChantiers;