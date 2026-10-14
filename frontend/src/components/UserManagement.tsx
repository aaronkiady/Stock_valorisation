/**
 * UserManagement - Gestion des utilisateurs (Admin uniquement)
 * Permet de créer, modifier, supprimer et gérer les utilisateurs
 */
import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Shield, User, AlertCircle, X, Eye, EyeOff, ClipboardList } from 'lucide-react';
import { Role } from '../roles';

interface UserData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  created_at?: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'user' as Role
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('http://192.168.2.15:5880/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erreur de chargement des utilisateurs');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!formData.username.trim()) {
      setError('Le nom d\'utilisateur est obligatoire');
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Email valide requis');
      return;
    }

    if (!editingId && !formData.password) {
      setError('Le mot de passe est obligatoire pour un nouvel utilisateur');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = editingId
        ? `http://192.168.2.15:5880/api/users/${editingId}`
        : 'http://192.168.2.15:5880/api/users';

      const method = editingId ? 'PUT' : 'POST';

      const dataToSend = editingId
        ? {
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            ...(formData.password && { password: formData.password })
          }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur ${response.status}`);
      }

      setSuccess(editingId ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès');
      loadUsers();
      resetForm();
      setShowModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleEdit = (user: UserData) => {
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      password: '',
      role: user.role as Role
    });
    setEditingId(user.id);
    setShowModal(true);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://192.168.2.15:5880/api/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la suppression');
      }

      setSuccess('Utilisateur supprimé avec succès');
      loadUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role: 'user'
    });
    setEditingId(null);
    setError(null);
    setShowPassword(false);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Users className="mr-3" size={32} />
            Gestion des Utilisateurs
          </h1>
          <p className="text-gray-600 mt-1">{users.length} utilisateurs enregistrés</p>
        </div>
        <button
          onClick={handleOpenModal}
          className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Nouvel Utilisateur</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          ✓ {success}
        </div>
      )}

      {/* Tableau des utilisateurs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Utilisateur
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nom Complet
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rôle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date de Création
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Users className="mx-auto mb-2 text-gray-400" size={48} />
                  <p>Aucun utilisateur trouvé</p>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <User className="text-purple-600" size={20} />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{user.email}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{user.full_name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'RespStock'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {user.role === 'admin' ? (
                        <><Shield size={14} className="mr-1" /> Administrateur</>
                      ) : user.role === 'RespStock' ? (
                        <><ClipboardList size={14} className="mr-1" /> Resp. Stock</>
                      ) : (
                        <><User size={14} className="mr-1" /> Utilisateur</>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString('fr-FR')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                      title="Modifier"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-900 inline-flex items-center"
                      title="Supprimer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Formulaire */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold flex items-center">
                <Users className="mr-2" size={24} />
                {editingId ? 'Modifier l\'Utilisateur' : 'Nouvel Utilisateur'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded flex items-start">
                  <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom d'utilisateur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Ex: jdupont"
                  disabled={editingId !== null}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                />
                {editingId && (
                  <p className="mt-1 text-xs text-gray-500">Le nom d'utilisateur ne peut pas être modifié</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Ex: jean.dupont@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom Complet
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Ex: Jean Dupont"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe {!editingId && <span className="text-red-500">*</span>}
                  {editingId && <span className="text-gray-500 text-xs">(Laisser vide pour ne pas modifier)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!editingId}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Minimum 6 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rôle
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="user">Utilisateur (Mouvements uniquement)</option>
                  <option value="RespStock">Responsable Stock</option>
                  <option value="admin">Administrateur</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {formData.role === 'admin'
                    ? 'Accès complet à toutes les fonctionnalités'
                    : formData.role === 'RespStock'
                    ? 'Tous les menus sauf Utilisateurs et Historique'
                    : 'Accès limité au menu Mouvements'}
                </p>
              </div>

              {/* Boutons */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingId ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
