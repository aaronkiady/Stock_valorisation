/**
 * SearchableSelectAPI - Composant de sélection avec recherche CÔTÉ SERVEUR
 * 
 * ⚠️ IMPORTANT : À utiliser pour les grandes quantités de données (>1000 éléments)
 * 
 * Différence avec SearchableSelect :
 * - SearchableSelect : Filtre côté client (bon pour <1000 éléments)
 * - SearchableSelectAPI : Recherche côté serveur (bon pour >1000 éléments)
 * 
 * Pour 150 000 articles, ce composant est OBLIGATOIRE
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';

interface OptionAPI {
  value: number;
  label: string;
  sublabel?: string;
}

interface SearchableSelectAPIProps {
  label?: string;
  placeholder?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  searchFunction: (searchTerm: string) => Promise<OptionAPI[]>; // Fonction de recherche API
  getSelectedLabel?: (value: number) => Promise<string>; // Récupérer le label de la valeur sélectionnée
  allowEmpty?: boolean;
  disabled?: boolean;
  error?: string;
  minChars?: number; // Nombre minimum de caractères avant de lancer la recherche
}

const SearchableSelectAPI: React.FC<SearchableSelectAPIProps> = ({
  label,
  placeholder = 'Rechercher...',
  value,
  onChange,
  searchFunction,
  getSelectedLabel,
  allowEmpty = false,
  disabled = false,
  error,
  minChars = 2
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState<OptionAPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce pour éviter trop de requêtes
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Charger le label de la valeur sélectionnée
  useEffect(() => {
    const loadSelectedLabel = async () => {
      if (value && getSelectedLabel) {
        try {
          const label = await getSelectedLabel(value);
          setSelectedLabel(label);
        } catch (err) {
          console.error('Erreur chargement label:', err);
          setSelectedLabel(`ID: ${value}`);
        }
      } else {
        setSelectedLabel('');
      }
    };

    loadSelectedLabel();
  }, [value, getSelectedLabel]);

  // Effectuer la recherche quand le terme change
  useEffect(() => {
    const performSearch = async () => {
      // Ne pas rechercher si le terme est trop court
      if (debouncedSearchTerm.length < minChars) {
        setOptions([]);
        return;
      }

      try {
        setLoading(true);
        const results = await searchFunction(debouncedSearchTerm);
        setOptions(results);
      } catch (err) {
        console.error('Erreur recherche:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      performSearch();
    }
  }, [debouncedSearchTerm, isOpen, searchFunction, minChars]);

  // Fermer quand on clique à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: number | undefined) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setSelectedLabel('');
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
      // Focus automatique sur l'input de recherche
      setTimeout(() => {
        const input = containerRef.current?.querySelector('input');
        input?.focus();
      }, 50);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {/* Champ de sélection */}
      <div
        onClick={handleOpen}
        className={`
          relative flex items-center justify-between px-3 py-2 border rounded-lg
          cursor-pointer transition-all duration-200
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'}
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        `}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {selectedLabel || placeholder}
        </span>
        <div className="flex items-center space-x-2">
          {value && allowEmpty && !disabled && (
            <X
              size={16}
              className="text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            />
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Dropdown avec recherche */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-hidden">
          {/* Champ de recherche */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Tapez au moins ${minChars} caractères...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {loading && (
                <Loader className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-600 animate-spin" size={18} />
              )}
            </div>
          </div>

          {/* Liste des résultats */}
          <div className="overflow-y-auto max-h-80">
            {allowEmpty && (
              <div
                onClick={() => handleSelect(undefined)}
                className={`
                  px-4 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100
                  ${value === undefined ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-700'}
                `}
              >
                <em className="text-gray-500">(Aucune sélection)</em>
              </div>
            )}

            {/* Indication de chargement */}
            {loading && (
              <div className="px-4 py-8 text-center text-gray-500">
                <Loader className="animate-spin mx-auto mb-2" size={24} />
                <p>Recherche en cours...</p>
              </div>
            )}

            {/* Message si pas assez de caractères */}
            {!loading && searchTerm.length < minChars && searchTerm.length > 0 && (
              <div className="px-4 py-8 text-center text-gray-500">
                <Search className="mx-auto mb-2 text-gray-400" size={24} />
                <p>Tapez au moins {minChars} caractères pour rechercher</p>
              </div>
            )}

            {/* Message si aucun résultat */}
            {!loading && searchTerm.length >= minChars && options.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500">
                <p>Aucun résultat trouvé pour "{searchTerm}"</p>
              </div>
            )}

            {/* Affichage des résultats */}
            {!loading && options.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 border-b">
                  {options.length} résultat{options.length > 1 ? 's' : ''} trouvé{options.length > 1 ? 's' : ''}
                </div>
                {options.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      px-4 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0
                      ${option.value === value ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-700'}
                    `}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      {option.sublabel && (
                        <span className="text-sm text-gray-500">{option.sublabel}</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelectAPI;
