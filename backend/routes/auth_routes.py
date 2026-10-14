"""
Routes d'authentification - Point 3
Backend pour la gestion des utilisateurs et connexion
"""
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash, generate_password_hash
import jwt
import datetime
from functools import wraps

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Secret key pour JWT (à mettre dans .env en production)
SECRET_KEY = 'votre-secret-key-tres-securisee-a-changer'

# Utilisateurs de démonstration
# En production, utiliser une vraie base de données
USERS = {
    'admin': {
        'id': 1,
        'username': 'admin',
        'password': generate_password_hash('admin123'),
        'email': 'admin@example.com',
        'role': 'admin',
        'full_name': 'Administrateur Système'
    },
    'user': {
        'id': 2,
        'username': 'user',
        'password': generate_password_hash('user123'),
        'email': 'user@example.com',
        'role': 'user',
        'full_name': 'Utilisateur Standard'
    }
}

def token_required(f):
    """Décorateur pour protéger les routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token manquant'}), 401
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            current_user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expiré'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalide'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

def admin_required(f):
    """Décorateur pour les routes admin uniquement"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token manquant'}), 401
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            if payload.get('role') != 'admin':
                return jsonify({'error': 'Accès refusé - Droits administrateur requis'}), 403
            current_user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expiré'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalide'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

@auth_bp.route('/login', methods=['POST'])
def login():
    """Route de connexion"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Nom d\'utilisateur et mot de passe requis'}), 400
        
        username = data.get('username')
        password = data.get('password')
        
        # Vérifier l'utilisateur
        user = USERS.get(username)
        if not user:
            return jsonify({'error': 'Identifiants incorrects'}), 401
        
        # Vérifier le mot de passe
        if not check_password_hash(user['password'], password):
            return jsonify({'error': 'Identifiants incorrects'}), 401
        
        # Générer le token JWT
        token = jwt.encode({
            'user_id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, SECRET_KEY, algorithm='HS256')
        
        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role'],
                'full_name': user['full_name']
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user(current_user):
    """Récupérer l'utilisateur connecté"""
    try:
        username = current_user.get('username')
        user = USERS.get(username)
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        return jsonify({
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name']
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    """Déconnexion (côté client principalement)"""
    return jsonify({'message': 'Déconnexion réussie'}), 200

@auth_bp.route('/verify', methods=['POST'])
def verify_token():
    """Vérifier la validité d'un token"""
    try:
        token = request.get_json().get('token')
        
        if not token:
            return jsonify({'valid': False}), 400
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return jsonify({'valid': True, 'payload': payload}), 200
        
    except jwt.ExpiredSignatureError:
        return jsonify({'valid': False, 'error': 'Token expiré'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'valid': False, 'error': 'Token invalide'}), 401
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 500


# À ajouter dans app.py principal :
"""
from routes.auth import auth_bp, token_required, admin_required

# Enregistrer le blueprint
app.register_blueprint(auth_bp)

# Exemple d'utilisation dans d'autres routes :

@app.route('/api/stocks', methods=['GET'])
@token_required
def get_stocks(current_user):
    # Route protégée, accessible aux utilisateurs connectés
    pass

@app.route('/api/audit-logs', methods=['GET'])
@admin_required
def get_audit_logs(current_user):
    # Route protégée, accessible uniquement aux admins
    pass
"""
