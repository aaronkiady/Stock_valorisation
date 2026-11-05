import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AuditLog from './components/AuditLog';
import Dashboard from './components/Dashboard';
import StockManagement from './components/Stock';
import Mouvements from './components/Mouvements';
import MouvementGroupe from './components/MouvementGroupe';
import ArticleManagement from './components/ArticleManagement';
import ChantierManagement from './components/ChantierManagement';
import UserManagement from './components/UserManagement';
import Profile from './components/Profile';
import ValorisationMensuelle from './components/ValorisationMensuelle';
import CoutsChantiers from './components/CoutsChantiers'; // ✅ NOUVEAU
import { canAccessMenu, defaultPathForRole, MenuId } from './roles';
import { 
  LayoutDashboard, Package, TrendingUp, Menu, X, History, LogOut, Box, Building2, Users, BarChart3, DollarSign
} from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const allNavigation: { id: MenuId; name: string; icon: any; path: string }[] = [
    { id: 'dashboard', name: 'Tableau de bord', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'stock', name: 'Gestion du Stock', icon: Package, path: '/stock' },
    { id: 'mouvements', name: 'Mouvements', icon: TrendingUp, path: '/mouvements' },
    { id: 'valorisation', name: 'Valorisation', icon: BarChart3, path: '/valorisation' },
    { id: 'couts', name: 'Coût par Chantier', icon: DollarSign, path: '/couts' }, // ✅ NOUVEAU
    { id: 'articles', name: 'Articles', icon: Box, path: '/articles' },
    { id: 'chantiers', name: 'Chantiers', icon: Building2, path: '/chantiers' },
    { id: 'users', name: 'Utilisateurs', icon: Users, path: '/users' },
    { id: 'audit-log', name: 'Historique', icon: History, path: '/audit-log' },
  ];

  const navigation = allNavigation.filter((item) => canAccessMenu(user?.role, item.id));

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gray-100">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-6 bg-blue-600">
          <h1 className="text-xl font-bold text-white">Gestion Stock</h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white hover:text-blue-200"><X className="w-6 h-6" /></button>
        </div>
        <nav className="px-4 py-6 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = window.location.pathname === item.path;
            return (
              <button key={item.id} onClick={() => { navigate(item.path); if (window.innerWidth < 1024) setSidebarOpen(false); }} className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${isActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
                <Icon className="w-5 h-5 mr-3" />
                <span>{item.name}</span>
                {item.id === 'users' && <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Admin</span>}
              </button>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white">
          <button onClick={() => navigate('/profile')} className="w-full flex items-center mb-3 p-2 -mx-2 rounded-lg hover:bg-gray-100 transition-colors text-left" title="Modifier mon compte">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-semibold text-sm">{user?.full_name?.charAt(0).toUpperCase() || 'U'}</span>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name || user?.username}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </button>
          <button onClick={handleLogout} className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <LogOut className="w-4 h-4 mr-2" /> Déconnexion
          </button>
        </div>
      </aside>
      <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : ''}`}>
        <header className="h-16 bg-white shadow-sm flex items-center px-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-600 hover:text-gray-900"><Menu className="w-6 h-6" /></button>
          <div className="ml-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {navigation.find(item => window.location.pathname.startsWith(item.path))?.name || 'Application'}
            </h2>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
};

const HomeRedirect: React.FC = () => {
  const { user } = useAuth();
  return <Navigate to={defaultPathForRole(user?.role)} replace />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/stock" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><StockManagement /></Layout></ProtectedRoute>} />
          <Route path="/mouvements" element={<ProtectedRoute allowedRoles={['admin', 'RespStock', 'user']}><Layout><Mouvements /></Layout></ProtectedRoute>} />
          <Route path="/mouvements/nouveau" element={<ProtectedRoute allowedRoles={['admin', 'RespStock', 'user']}><Layout><MouvementGroupe /></Layout></ProtectedRoute>} />
          
          <Route path="/valorisation" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><ValorisationMensuelle /></Layout></ProtectedRoute>} />
          {/* ✅ NOUVELLE ROUTE */}
          <Route path="/couts" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><CoutsChantiers /></Layout></ProtectedRoute>} />
          
          <Route path="/articles" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><ArticleManagement /></Layout></ProtectedRoute>} />
          <Route path="/chantiers" element={<ProtectedRoute allowedRoles={['admin', 'RespStock']}><Layout><ChantierManagement /></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><Layout><UserManagement /></Layout></ProtectedRoute>} />
          <Route path="/audit-log" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AuditLog /></Layout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;