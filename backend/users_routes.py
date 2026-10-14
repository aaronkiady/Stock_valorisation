"""
Routes de gestion des utilisateurs - Version CORRIGÉE
CORRECTIONS:
1. Ajout du support OPTIONS pour CORS
2. Meilleure gestion des erreurs avec retour JSON
3. Validation renforcée des données
"""
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from functools import wraps

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

# Base de données temporaire (remplacer par votre DB)
USERS_DB = {
    1: {
        'id': 1,
        'username': 'admin',
        'password': generate_password_hash('admin123'),
        'email': 'admin@lpsa.mg',
        'full_name': 'Administrateur LPSA',
        'role': 'admin',
        'created_at': datetime.utcnow().isoformat()
    }
}

NEXT_USER_ID = 2


def admin_required(f):
    """Décorateur pour vérifier les droits admin"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # ✅ CORRECTION: Ignorer les requêtes OPTIONS
        if request.method == 'OPTIONS':
            return jsonify({}), 200
            
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token manquant'}), 401
        
        # Vérification du token (à adapter selon votre système)
        # Pour l'instant, on accepte tous les tokens valides
        
        return f(*args, **kwargs)
    
    return decorated


# ✅ CORRECTION: Ajout du support OPTIONS pour CORS
@users_bp.route('', methods=['OPTIONS'])
def users_options():
    """Gérer les requêtes OPTIONS pour CORS"""
    response = jsonify({})
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    return response, 200


@users_bp.route('/<int:user_id>', methods=['OPTIONS'])
def user_options(user_id):
    """Gérer les requêtes OPTIONS pour CORS sur les routes avec ID"""
    response = jsonify({})
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS')
    return response, 200


@users_bp.route('', methods=['GET'])
@admin_required
def get_users():
    """Récupérer tous les utilisateurs"""
    try:
        users_list = []
        for user_id, user in USERS_DB.items():
            user_data = {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'role': user['role'],
                'created_at': user.get('created_at')
            }
            users_list.append(user_data)
        
        return jsonify({
            'users': users_list,
            'total': len(users_list)
        }), 200
        
    except Exception as e:
        print(f"❌ Erreur get_users: {e}")
        return jsonify({'error': str(e)}), 500


@users_bp.route('/<int:user_id>', methods=['GET'])
@admin_required
def get_user(user_id):
    """Récupérer un utilisateur spécifique"""
    try:
        user = USERS_DB.get(user_id)
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        user_data = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'created_at': user.get('created_at')
        }
        
        return jsonify(user_data), 200
        
    except Exception as e:
        print(f"❌ Erreur get_user: {e}")
        return jsonify({'error': str(e)}), 500


@users_bp.route('', methods=['POST'])
@admin_required
def create_user():
    """
    Créer un nouvel utilisateur
    ✅ CORRECTION: Meilleure gestion des erreurs et validation
    """
    global NEXT_USER_ID
    
    try:
        # ✅ CORRECTION: Vérifier que le contenu est JSON
        if not request.is_json:
            return jsonify({'error': 'Le contenu doit être en JSON'}), 400
            
        data = request.get_json()
        
        # ✅ CORRECTION: Validation stricte
        if not data:
            return jsonify({'error': 'Données manquantes'}), 400
        
        if not data.get('username') or not data['username'].strip():
            return jsonify({'error': 'Nom d\'utilisateur requis'}), 400
        
        if not data.get('email') or not data['email'].strip():
            return jsonify({'error': 'Email requis'}), 400
        
        if not data.get('password') or not data['password'].strip():
            return jsonify({'error': 'Mot de passe requis'}), 400
        
        if len(data['password']) < 6:
            return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
        
        # Vérifier si le nom d'utilisateur existe déjà
        for user in USERS_DB.values():
            if user['username'].lower() == data['username'].lower():
                return jsonify({'error': 'Ce nom d\'utilisateur existe déjà'}), 400
        
        # Vérifier si l'email existe déjà
        for user in USERS_DB.values():
            if user['email'].lower() == data['email'].lower():
                return jsonify({'error': 'Cet email est déjà utilisé'}), 400
        
        # ✅ CORRECTION: Créer le nouvel utilisateur avec validation
        new_user = {
            'id': NEXT_USER_ID,
            'username': data['username'].strip(),
            'password': generate_password_hash(data['password']),
            'email': data['email'].strip(),
            'full_name': data.get('full_name', '').strip(),
            'role': data.get('role', 'user'),
            'created_at': datetime.utcnow().isoformat()
        }
        
        USERS_DB[NEXT_USER_ID] = new_user
        
        print(f"✅ Utilisateur créé: {new_user['username']} (ID: {NEXT_USER_ID})")
        
        NEXT_USER_ID += 1
        
        # Retourner l'utilisateur sans le mot de passe
        user_response = {
            'id': new_user['id'],
            'username': new_user['username'],
            'email': new_user['email'],
            'full_name': new_user['full_name'],
            'role': new_user['role'],
            'created_at': new_user['created_at']
        }
        
        return jsonify(user_response), 201
        
    except Exception as e:
        # ✅ CORRECTION: Toujours retourner du JSON
        print(f"❌ Erreur création utilisateur: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Erreur serveur: {str(e)}'}), 500


@users_bp.route('/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Mettre à jour un utilisateur"""
    try:
        user = USERS_DB.get(user_id)
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        if not request.is_json:
            return jsonify({'error': 'Le contenu doit être en JSON'}), 400
            
        data = request.get_json()
        
        # Mise à jour des champs
        if 'username' in data and data['username'].strip():
            # Vérifier l'unicité
            for uid, u in USERS_DB.items():
                if uid != user_id and u['username'].lower() == data['username'].lower():
                    return jsonify({'error': 'Ce nom d\'utilisateur existe déjà'}), 400
            user['username'] = data['username'].strip()
        
        if 'email' in data and data['email'].strip():
            # Vérifier l'unicité
            for uid, u in USERS_DB.items():
                if uid != user_id and u['email'].lower() == data['email'].lower():
                    return jsonify({'error': 'Cet email est déjà utilisé'}), 400
            user['email'] = data['email'].strip()
        
        if 'full_name' in data:
            user['full_name'] = data['full_name'].strip()
        
        if 'role' in data and data['role'] in ['admin', 'user']:
            user['role'] = data['role']
        
        if 'password' in data and data['password'].strip():
            if len(data['password']) >= 6:
                user['password'] = generate_password_hash(data['password'])
            else:
                return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
        
        user['updated_at'] = datetime.utcnow().isoformat()
        
        print(f"✅ Utilisateur modifié: {user['username']} (ID: {user_id})")
        
        user_response = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'updated_at': user['updated_at']
        }
        
        return jsonify(user_response), 200
        
    except Exception as e:
        print(f"❌ Erreur update_user: {e}")
        return jsonify({'error': str(e)}), 500


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Supprimer un utilisateur"""
    try:
        if user_id not in USERS_DB:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        if user_id == 1:  # Protéger l'admin principal
            return jsonify({'error': 'Impossible de supprimer l\'administrateur principal'}), 400
        
        deleted_user = USERS_DB[user_id]
        del USERS_DB[user_id]
        
        print(f"✅ Utilisateur supprimé: {deleted_user['username']} (ID: {user_id})")
        
        return jsonify({'message': 'Utilisateur supprimé avec succès'}), 200
        
    except Exception as e:
        print(f"❌ Erreur delete_user: {e}")
        return jsonify({'error': str(e)}), 500


@users_bp.route('/change-password', methods=['POST'])
def change_password():
    """
    Permettre à un utilisateur de changer son propre mot de passe
    """
    try:
        if not request.is_json:
            return jsonify({'error': 'Le contenu doit être en JSON'}), 400
            
        data = request.get_json()
        
        # Récupérer l'utilisateur connecté depuis le token
        # Pour l'exemple, on suppose user_id = 1
        user_id = 1
        user = USERS_DB.get(user_id)
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        # Validation
        if not data.get('current_password'):
            return jsonify({'error': 'Mot de passe actuel requis'}), 400
        
        if not data.get('new_password'):
            return jsonify({'error': 'Nouveau mot de passe requis'}), 400
        
        if len(data['new_password']) < 6:
            return jsonify({'error': 'Le nouveau mot de passe doit contenir au moins 6 caractères'}), 400
        
        # Vérifier le mot de passe actuel
        if not check_password_hash(user['password'], data['current_password']):
            return jsonify({'error': 'Mot de passe actuel incorrect'}), 400
        
        # Mettre à jour le mot de passe
        user['password'] = generate_password_hash(data['new_password'])
        user['updated_at'] = datetime.utcnow().isoformat()
        
        print(f"✅ Mot de passe modifié pour: {user['username']}")
        
        return jsonify({'message': 'Mot de passe modifié avec succès'}), 200
        
    except Exception as e:
        print(f"❌ Erreur change_password: {e}")
        return jsonify({'error': str(e)}), 500


def register_users_routes(app):
    """
    Enregistrer les routes des utilisateurs
    ✅ CORRECTION: S'assurer que le blueprint est bien enregistré
    """
    app.register_blueprint(users_bp)
    print("✅ Blueprint 'users' enregistré sur /api/users")