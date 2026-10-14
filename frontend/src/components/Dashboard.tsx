/**
 * Composant Dashboard - Tableau de bord avec statistiques et vue d'ensemble
 */
import React, { useState, useEffect } from 'react';
import { DashboardStats, StockParChantier } from '../types';
import { dashboardApi } from '../services/api';
import { Package, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stockParChantier, setStockParChantier] = useState<StockParChantier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, chantiersData] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getStockParChantier()
      ]);
      setStats(statsData);
      setStockParChantier(chantiersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <p className="font-medium">Erreur</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Tableau de Bord</h1>
        <button
          onClick={loadData}
          className="btn btn-secondary"
        >
          Actualiser
        </button>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Valeur totale du stock */}
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Valeur Totale</p>
              <p className="text-3xl font-bold mt-2">
                {stats.stock.total_valeur.toLocaleString('fr-FR')} Ar
              </p>
            </div>
            <Package className="w-12 h-12 text-blue-200" />
          </div>
        </div>

        {/* Quantité totale */}
        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Quantité Totale</p>
              <p className="text-3xl font-bold mt-2">
                {stats.stock.total_quantite.toLocaleString('fr-FR')}
              </p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-200" />
          </div>
        </div>

        {/* Nombre d'articles */}
        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Articles</p>
              <p className="text-3xl font-bold mt-2">{stats.nb_articles}</p>
            </div>
            <Package className="w-12 h-12 text-purple-200" />
          </div>
        </div>

        {/* Nombre de chantiers */}
        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Chantiers</p>
              <p className="text-3xl font-bold mt-2">{stats.nb_chantiers}</p>
            </div>
            <TrendingDown className="w-12 h-12 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Statut des stocks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Normal */}
        <div className="card">
          <div className="flex items-center">
            <CheckCircle className="w-10 h-10 text-green-500 mr-4" />
            <div>
              <p className="text-gray-600 text-sm">Stock Normal</p>
              <p className="text-2xl font-bold text-gray-900">{stats.stock.count_normal}</p>
            </div>
          </div>
        </div>

        {/* Approvisionnement nécessaire */}
        <div className="card">
          <div className="flex items-center">
            <AlertCircle className="w-10 h-10 text-yellow-500 mr-4" />
            <div>
              <p className="text-gray-600 text-sm">Appro. Nécessaire</p>
              <p className="text-2xl font-bold text-gray-900">{stats.stock.count_alert}</p>
            </div>
          </div>
        </div>

        {/* Approvisionnement URGENT */}
        <div className="card">
          <div className="flex items-center">
            <AlertCircle className="w-10 h-10 text-red-500 mr-4" />
            <div>
              <p className="text-gray-600 text-sm">Appro. URGENT</p>
              <p className="text-2xl font-bold text-gray-900">{stats.stock.count_urgent}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mouvements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <p className="text-gray-600 text-sm font-medium">Total Entrées</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            +{stats.mouvements.total_entrees.toLocaleString('fr-FR')}
          </p>
        </div>

        <div className="card">
          <p className="text-gray-600 text-sm font-medium">Total Sorties</p>
          <p className="text-3xl font-bold text-red-600 mt-2">
            -{stats.mouvements.total_sorties.toLocaleString('fr-FR')}
          </p>
        </div>

        <div className="card">
          <p className="text-gray-600 text-sm font-medium">Nombre de Mouvements</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {stats.mouvements.total_mouvements.toLocaleString('fr-FR')}
          </p>
        </div>
      </div>

      {/* Top 10 Chantiers */}
      {stockParChantier.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Top 10 Chantiers - Mouvements
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Chantier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entrées
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sorties
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Différence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockParChantier.map((item, index) => {
                  const difference = item.entrees - item.sorties;
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.chantier}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        +{item.entrees.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        -{item.sorties.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={difference >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {difference >= 0 ? '+' : ''}{difference.toLocaleString('fr-FR')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
