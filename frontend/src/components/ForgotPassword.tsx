/**
 * Composant de réinitialisation de mot de passe
 */
import React, { useState } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

const ForgotPassword: React.FC<{ onBackToLogin: () => void }> = ({ onBackToLogin }) => {
  const [step, setStep] = useState<'email' | 'reset' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la demande');
      }

      setSuccess(data.message);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la demande');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation');
      }

      setSuccess('Mot de passe réinitialisé avec succès');
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* En-tête */}
        <div className="text-center mb-8">
          <button
            onClick={onBackToLogin}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
            Retour à la connexion
          </button>
          
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-purple-600" size={24} />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {step === 'email' && 'Mot de passe oublié'}
            {step === 'reset' && 'Réinitialiser le mot de passe'}
            {step === 'success' && 'Réinitialisation réussie'}
          </h1>
          
          <p className="text-gray-600">
            {step === 'email' && 'Entrez votre email pour recevoir un lien de réinitialisation'}
            {step === 'reset' && 'Entrez le code reçu par email et votre nouveau mot de passe'}
            {step === 'success' && 'Votre mot de passe a été réinitialisé avec succès'}
          </p>
        </div>

        {/* Messages d'erreur/succès */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="text-red-500 mr-3 mt-0.5 flex-shrink-0" size={20} />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && step !== 'success' && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <CheckCircle className="text-green-500 mr-3 mt-0.5 flex-shrink-0" size={20} />
            <p className="text-green-700 text-sm">{success}</p>
          </div>
        )}

        {/* Étape 1: Email */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
            </button>
          </form>
        )}

        {/* Étape 2: Réinitialisation */}
        {step === 'reset' && (
          <form onSubmit={handleResetSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Code de réinitialisation
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Collez le code reçu par email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum 6 caractères</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
            </button>
          </form>
        )}

        {/* Étape 3: Succès */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="text-green-600" size={32} />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Mot de passe réinitialisé !
              </h3>
              <p className="text-gray-600">
                Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
              </p>
            </div>

            <button
              onClick={onBackToLogin}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
            >
              Se connecter
            </button>
          </div>
        )}

        {/* Informations de sécurité */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700 text-center">
            💡 Pour des raisons de sécurité, le lien de réinitialisation expire après 1 heure.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;