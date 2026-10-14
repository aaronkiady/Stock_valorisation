/**
 * Hook useDebounce - Optimise les recherches en temps réel
 * 
 * Retarde l'exécution d'une mise à jour de valeur pour éviter
 * trop de requêtes API lors de la saisie utilisateur
 * 
 * @param value - La valeur à débouncer
 * @param delay - Le délai en millisecondes (défaut: 500ms)
 * @returns La valeur débouncée
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 * 
 * useEffect(() => {
 *   // Cette requête ne s'exécutera que 500ms après
 *   // que l'utilisateur a arrêté de taper
 *   fetchResults(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 */

import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Créer un timer qui met à jour la valeur débouncée après le délai
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Nettoyer le timer si la valeur change avant la fin du délai
    // Cela évite de lancer plusieurs requêtes inutiles
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
