import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Chantier, UserRole } from '../types';
import { usersApi, chantiersApi } from '../services/api';
import { Plus, Trash2, Edit2, AlertCircle, Shield, Building2, User as UserIcon } from 'lucide-react';

const ROLES: UserRole[] = ['admin', 'RespStock', 'user', 'magasinier', 'RespChantier'];

const emptyForm = {
  username: '',
  email: '',
  full_name: '',
  password: '',
  role: 'user' as UserRole,
  is_active: true,
  chantiers: [] as number[],
};

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.getAll();
      setUsers(data.users || []);
    } catch (e: any) {
      setError(e?.message || 'Erreur chargement utilisateurs');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChantiers = useCallback(async () => {
    try {
      const data = await chantiersApi.getAll({ per_page: 1000 });
      let arr: Chantier[] = [];
      if (Array.isArray(data)) arr = data;
      else if (data && typeof data === 'object') arr = (data as any).chantiers || [];
      setChantiers(arr);
    } catch (e) {
      console.error('Erreur chargement chantiers:', e);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchChantiers();
  }, [fetchUsers, fetchChantiers]);

  const openCreate = () => {
    setEditingUser(null);
    setFormData(emptyForm);
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      password: '',
      role: u.role,
      is_active: u.is_active,
      chantiers: u.chantiers || [],
    });
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!editingUser && !formData.password) {
      setError('Le mot de passe est requis pour un nouvel utilisateur');
      return;
    }
    if (formData.password && formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (
      (formData.role === 'magasinier' || formData.role === 'RespChantier') &&
      formData.chantiers.length === 0
    ) {
      setError(`Le rôle ${formData.role} doit être associé à au moins un chantier.`);
      return;
    }

    try {
      const payload: any = {
        username: formData.username,
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        is_active: formData.is_active,
        chantiers: formData.chantiers,
      };
      if (formData.password) payload.password = formData.password;

      if (editingUser) {
        await usersApi.update(editingUser.id, payload);
        setSuccess('Utilisateur mis à jour avec succès');
      } else {
        await usersApi.create(payload);
        setSuccess('Utilisateur créé avec succès');
      }
      setShowModal(false);
      fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  };

  const handleDelete = async (u: User) => {
    if (!window.confirm(`Supprimer l'utilisateur ${u.username} ?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await usersApi.delete(u.id);
      setSuccess('Utilisateur supprimé avec succès');
      fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  };

  const toggleChantier = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      chantiers: prev.chantiers.includes(id)
        ? prev.chantiers.filter((c) => c !== id)
        : [...prev.chantiers, id],
    }));
  };

  const roleColor = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'RespStock':
        return 'bg-purple-100 text-purple-800';
      case 'RespChantier':
        return 'bg-blue-100 text-blue-800';
      case 'magasinier':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <UserIcon className="mr-2" size={28} />
            Gestion des utilisateurs
          </h1>
          <p className="text-gray-600 mt-1">Rôles et chantiers autorisés</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Retour
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>Nouvel utilisateur</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={20} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          ✓ {success}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom complet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chantiers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actif</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-gray-500">
                    Aucun utilisateur
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {u.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{u.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${roleColor(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700">
                      {(u.chantiers || []).length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(u.chantiers || []).map((id) => {
                            const c = chantiers.find((x) => x.id === id);
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700"
                              >
                                <Building2 size={12} className="mr-1" />
                                {c?.code || `#${id}`}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {u.is_active ? (
                        <span className="text-green-600">Oui</span>
                      ) : (
                        <span className="text-red-600">Non</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Éditer"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold flex items-center">
                <Shield className="mr-2" size={20} />
                {editingUser ? 'Éditer utilisateur' : 'Nouvel utilisateur'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom d'utilisateur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  disabled={!!editingUser}
                />
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe {!editingUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  placeholder={
                    editingUser
                      ? 'Laisser vide pour conserver le mot de passe actuel'
                      : 'Minimum 6 caractères'
                  }
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rôle <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Compte actif
                </label>
              </div>

              {(formData.role === 'magasinier' || formData.role === 'RespChantier') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chantiers autorisés <span className="text-red-500">*</span>
                  </label>
                  <div className="border border-gray-300 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                    {chantiers.length === 0 && (
                      <p className="text-gray-400 text-xs p-2">Aucun chantier disponible</p>
                    )}
                    {chantiers.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={formData.chantiers.includes(c.id)}
                          onChange={() => toggleChantier(c.id)}
                          className="h-4 w-4"
                        />
                        <Building2 size={14} className="text-gray-500" />
                        <span className="font-medium">{c.code}</span>
                        <span className="text-gray-600">— {c.nom}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.chantiers.length} chantier(s) sélectionné(s)
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingUser ? 'Enregistrer' : 'Créer'}
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