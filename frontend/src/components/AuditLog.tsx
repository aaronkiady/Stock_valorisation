/**
 * Composant AuditLog - Historisation des actions
 * CORRECTION : Route changée vers /api/audit-logs
 */
import React, { useState, useEffect } from 'react';
import { History, Filter, RefreshCw, Eye, Download, Search, X } from 'lucide-react';

interface AuditLogEntry {
  id: number;
  timestamp: string;
  utilisateur: string;
  action: string;
  table_name: string;
  record_id: number;
  old_values?: any;
  new_values?: any;
  ip_address: string;
}

const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filtres
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal détails
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // CORRECTION PROBLÈME 1 : URL changée de /api/audit à /api/audit-logs
  const fetchLogs = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Non authentifié');
      }

      // Construction de l'URL avec filtres
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
      });

      if (filterUser) params.append('utilisateur', filterUser);
      if (filterAction) params.append('action', filterAction);
      if (filterTable) params.append('table_name', filterTable);

      // CORRECTION : Route /api/audit-logs
      const response = await fetch(`http://localhost:5880/api/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Accès refusé - Administrateur requis');
        }
        if (response.status === 404) {
			throw new Error('Route non trouvée - Vérifiez l\'URL');
		}
		  throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
	    // ✅ CORRECTION: Validation de la réponse
		if (!data || !Array.isArray(data.logs)) {
		  throw new Error('Format de réponse invalide');
		}
	  
      setLogs(data.logs);
      setTotalPages(data.pages);
      setTotal(data.total);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des logs');
      console.error('Erreur fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [filterUser, filterAction, filterTable]);

  const handleRefresh = () => {
    fetchLogs(currentPage);
  };

  const handleClearFilters = () => {
    setFilterUser('');
    setFilterAction('');
    setFilterTable('');
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-800';
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionLabel = (action: string) => {
    const labels: { [key: string]: string } = {
      'CREATE': 'Création',
      'UPDATE': 'Modification',
      'DELETE': 'Suppression',
      'LOGIN': 'Connexion',
      'LOGOUT': 'Déconnexion'
    };
    return labels[action] || action;
  };

  const getTableLabel = (tableName: string) => {
    const labels: { [key: string]: string } = {
      'articles': 'Articles',
      'chantiers': 'Chantiers',
      'stocks': 'Stocks',
      'mouvements': 'Mouvements',
      'users': 'Utilisateurs'
    };
    return labels[tableName] || tableName;
  };

  const handleViewDetails = (log: AuditLogEntry) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Utilisateur', 'Action', 'Table', 'ID', 'IP'];
    const rows = logs.map(log => [
      formatDate(log.timestamp),
      log.utilisateur,
      getActionLabel(log.action),
      getTableLabel(log.table_name),
      log.record_id,
      log.ip_address
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <History className="mr-3" size={32} />
            Historique des Actions
          </h1>
          <p className="text-gray-600 mt-1">
            Journal d'audit complet - {total} entrées
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              showFilters ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
            }`}
          >
            <Filter size={20} />
            <span>Filtres</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
          >
            <Download size={20} />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Filtres</h3>
            <button
              onClick={handleClearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <X size={16} />
              <span>Effacer les filtres</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Utilisateur
              </label>
              <input
                type="text"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                placeholder="Rechercher un utilisateur..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action
              </label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les actions</option>
                <option value="CREATE">Création</option>
                <option value="UPDATE">Modification</option>
                <option value="DELETE">Suppression</option>
                <option value="LOGIN">Connexion</option>
                <option value="LOGOUT">Déconnexion</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Table
              </label>
              <select
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les tables</option>
                <option value="articles">Articles</option>
                <option value="chantiers">Chantiers</option>
                <option value="stocks">Stocks</option>
                <option value="mouvements">Mouvements</option>
                <option value="users">Utilisateurs</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Messages d'erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Tableau des logs */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading && !logs.length ? (
          <div className="p-12 text-center">
            <RefreshCw className="mx-auto mb-4 animate-spin text-blue-600" size={48} />
            <p className="text-gray-600">Chargement des logs...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Heure
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Table
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {log.utilisateur}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getActionBadgeColor(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getTableLabel(log.table_name)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      #{log.record_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ip_address}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(log)}
                        className="text-blue-600 hover:text-blue-900 flex items-center space-x-1 ml-auto"
                      >
                        <Eye size={16} />
                        <span>Détails</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
            <div className="text-sm text-gray-700">
              Page <span className="font-medium">{currentPage}</span> sur{' '}
              <span className="font-medium">{totalPages}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => fetchLogs(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <button
                onClick={() => fetchLogs(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Détails */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Détails de l'Action</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Date & Heure</label>
                    <p className="text-lg font-semibold">{formatDate(selectedLog.timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Utilisateur</label>
                    <p className="text-lg font-semibold">{selectedLog.utilisateur}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Action</label>
                    <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${getActionBadgeColor(selectedLog.action)}`}>
                      {getActionLabel(selectedLog.action)}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Table</label>
                    <p className="text-lg font-semibold">{getTableLabel(selectedLog.table_name)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">ID Enregistrement</label>
                    <p className="text-lg font-semibold">#{selectedLog.record_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Adresse IP</label>
                    <p className="text-lg font-semibold">{selectedLog.ip_address}</p>
                  </div>
                </div>

                {selectedLog.action === 'UPDATE' && (
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-orange-600">
                        Anciennes Valeurs
                      </h3>
                      <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                        {JSON.stringify(selectedLog.old_values, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-green-600">
                        Nouvelles Valeurs
                      </h3>
                      <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                        {JSON.stringify(selectedLog.new_values, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedLog.action === 'CREATE' && selectedLog.new_values && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2 text-green-600">
                      Données Créées
                    </h3>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.action === 'DELETE' && selectedLog.old_values && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2 text-red-600">
                      Données Supprimées
                    </h3>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                      {JSON.stringify(selectedLog.old_values, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;