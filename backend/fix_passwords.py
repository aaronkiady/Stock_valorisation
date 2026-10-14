"""
Script pour corriger les mots de passe - Utilisation de mysqlclient
"""
import sys
import os

# Ajouter le chemin du projet
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db, User
from werkzeug.security import generate_password_hash

def fix_passwords():
    """Corriger tous les mots de passe avec le bon hachage"""
    app = create_app('production')
    
    with app.app_context():
        try:
            # Récupérer tous les utilisateurs
            users = User.query.all()
            print(f"🔧 Correction de {len(users)} utilisateurs...")
            
            updated_count = 0
            for user in users:
                print(f"📝 Traitement de l'utilisateur: {user.username}")
                
                # Vérifier si le mot de passe a besoin d'être corrigé
                needs_fix = False
                
                # Vérifier différents cas problématiques
                if not user.password:
                    print(f"   ❌ Mot de passe vide")
                    needs_fix = True
                elif user.password == '':
                    print(f"   ❌ Mot de passe vide (chaîne vide)")
                    needs_fix = True
                elif not user.password.startswith('pbkdf2:sha256:'):
                    print(f"   ❌ Format de hachage incorrect: {user.password[:50]}...")
                    needs_fix = True
                else:
                    print(f"   ✅ Format de hachage correct")
                
                if needs_fix:
                    # Définir un mot de passe par défaut
                    default_password = 'admin123'
                    user.set_password(default_password)
                    updated_count += 1
                    print(f"   🔑 Mot de passe réinitialisé pour {user.username}")
            
            if updated_count > 0:
                db.session.commit()
                print(f"\n✅ {updated_count} mots de passe corrigés avec succès!")
                print("🔑 Informations de connexion par défaut:")
                print("   Username: admin (ou autre utilisateur existant)")
                print("   Password: admin123")
            else:
                print("\n✅ Tous les mots de passe sont déjà au bon format!")
            
            # Afficher la liste des utilisateurs
            print(f"\n📋 Liste des utilisateurs:")
            for user in User.query.all():
                status = "✅ OK" if user.password and user.password.startswith('pbkdf2:sha256:') else "❌ À corriger"
                print(f"   {user.username} - {user.role} - {status}")
                
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erreur lors de la correction: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    fix_passwords()