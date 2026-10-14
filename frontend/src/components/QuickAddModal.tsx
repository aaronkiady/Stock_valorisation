/**
 * QuickAddModal - Modal pour l'ajout rapide d'articles et chantiers
 * CORRECTION PROBLÈME 2 : Permet l'ajout rapide sans quitter la page
 */
import React, { useState } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';

interface QuickAddModalProps {
  type: 'article' | 'chantier';
  onClose: () => void;
  onSuccess: (newItem: any) => void;
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({ type, onClose, onSuccess }) => {
  // États pour Article
  const [referenceInterne, setReferenceInterne] = useState('');
  const [nom, setNom] = useState('');
  const [cout, setCout] = useState('');
  const [responsable, setResponsable] = useState('');
  const [uniteMesure, setUniteMesure] = useState('unité');

  // États pour Chantier
  const [code, setCode] = useState('');
  const [nomChantier, setNomChantier] = useState('');
  const [statut, setStatut] = useState('Actif');

  // États communs
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const endpoint = type === 'article' ? '/api/articles' : '/api/chantiers';
      
      const data = type === 'article' 
        ? {
            reference_interne: referenceInterne,
            nom,
            cout: parseFloat(cout) || 0,
            responsable,
            unite_mesure: uniteMesure
          }
        : {
            code,
            nom: nomChantier,
            statut
          };

      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur ${response.status}`);
      }

      const result = await response.json();
      onSuccess(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold flex items-center">
            <Plus className="mr-2" size={24} />
            {type === 'article' ? 'Nouvel Article' : 'Nouveau Chantier'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="text-red-600 mr-2 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {type === 'article' ? (
            <>
              {/* Formulaire Article */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence Interne *
                </label>
                <input
                  type="text"
                  value={referenceInterne}
                  onChange={(e) => setReferenceInterne(e.target.value)}
                  required
                  placeholder="Ex: 1100BA2I003"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de l'Article *
                </label>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  placeholder="Ex: Boulon inox A2"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coût (Ar)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cout}
                    onChange={(e) => setCout(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unité
                  </label>
                  <select
                    value={uniteMesure}
                    onChange={(e) => setUniteMesure(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="unité">unité</option>
                    <option value="kg">kg</option>
                    <option value="m">m</option>
                    <option value="m²">m²</option>
                    <option value="m³">m³</option>
                    <option value="L">L</option>
                    <option value="boîte">boîte</option>
                    <option value="sac">sac</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Responsable
                </label>
                <input
                  type="text"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Nom du responsable"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <>
              {/* Formulaire Chantier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code Chantier *
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="Ex: EHL32"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du Chantier *
                </label>
                <input
                  type="text"
                  value={nomChantier}
                  onChange={(e) => setNomChantier(e.target.value)}
                  required
                  placeholder="Ex: Construction Bâtiment A"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Statut
                </label>
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Actif">Actif</option>
                  <option value="En pause">En pause</option>
                  <option value="Terminé">Terminé</option>
                </select>
              </div>
            </>
          )}

          {/* Boutons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Création...
                </>
              ) : (
                <>
                  <Plus size={20} className="mr-2" />
                  Créer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddModal;
