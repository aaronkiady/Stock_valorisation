"""
Configuration de l'application - Migration MySQL
================================================
Ce fichier contient toutes les configurations nécessaires pour la connexion MySQL
"""
import os
from datetime import timedelta

class Config:
    """Configuration de base de l'application"""
    
    # ==================================================================
    # CONFIGURATION MYSQL - À ADAPTER SELON VOTRE ENVIRONNEMENT
    # ==================================================================
    
    # Option 1 : Configuration pour WAMP Server (Windows)
    MYSQL_HOST = 'localhost'
    MYSQL_PORT = 3306
    MYSQL_USER = 'stock_app'
    MYSQL_PASSWORD = 'AdminfOti2025!'  # ⚠️ CHANGEZ CE MOT DE PASSE !
    MYSQL_DATABASE = 'stock_management'
    
    # Construction de l'URI de connexion MySQL
    # Utilisation de mysqlclient (MySQLdb) qui est déjà installé
    SQLALCHEMY_DATABASE_URI = (
        f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}'
        f'@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}'
        '?charset=utf8mb4'
    )
    
    # ==================================================================
    # CONFIGURATION SQLALCHEMY
    # ==================================================================
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20,
        'echo': False,
    }
    
    # ==================================================================
    # CONFIGURATION DE SÉCURITÉ
    # ==================================================================
    
    # Clés secrètes pour la production
    SECRET_KEY = 'AdminfOti2025!-secret-key-production'
    JWT_SECRET_KEY = 'AdminfOti2025!-jwt-secret-production'
    
    # Durée de validité du token JWT
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # ==================================================================
    # CONFIGURATION CORS
    # ==================================================================
    
    # Origines autorisées pour CORS (frontend)
    CORS_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
    ]
    
    # ==================================================================
    # CONFIGURATION GÉNÉRALE
    # ==================================================================
    
    JSON_AS_ASCII = False
    JSON_SORT_KEYS = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024


class DevelopmentConfig(Config):
    """Configuration pour le développement"""
    DEBUG = True
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 5,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'echo': True,
    }


class ProductionConfig(Config):
    """Configuration pour la production"""
    DEBUG = False
    TESTING = False
    
    # Configuration MySQL optimisée pour la production
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 20,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 40,
        'echo': False,
    }


class TestingConfig(Config):
    """Configuration pour les tests"""
    TESTING = True
    DEBUG = True
    MYSQL_DATABASE = 'stock_management_test'


# ==================================================================
# DICTIONNAIRE DES CONFIGURATIONS
# ==================================================================

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(config_name=None):
    """
    Récupérer la configuration appropriée
    """
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'production')
    
    return config.get(config_name, DevelopmentConfig)


# ==================================================================
# VÉRIFICATION DE LA CONNEXION MYSQL
# ==================================================================

def test_mysql_connection():
    """
    Tester la connexion à MySQL avec mysqlclient
    """
    try:
        import MySQLdb
            
        config_obj = Config()
        connection = MySQLdb.connect(
            host=config_obj.MYSQL_HOST,
            port=config_obj.MYSQL_PORT,
            user=config_obj.MYSQL_USER,
            passwd=config_obj.MYSQL_PASSWORD,
            db=config_obj.MYSQL_DATABASE
        )
        
        if connection.open:
            cursor = connection.cursor()
            cursor.execute("SELECT VERSION();")
            db_info = cursor.fetchone()
            cursor.execute("SELECT DATABASE();")
            database = cursor.fetchone()
            
            print("✅ Connexion MySQL réussie!")
            print(f"   Version du serveur: {db_info[0]}")
            print(f"   Base de données: {database[0]}")
            
            cursor.close()
            connection.close()
            return True
                
    except Exception as e:
        print(f"❌ Erreur de connexion MySQL: {e}")
        print("\n📋 Vérifications à effectuer:")
        print("   1. WAMP/MySQL est-il démarré?")
        print("   2. Les identifiants sont-ils corrects?")
        print("   3. La base de données existe-t-elle?")
        print("   4. L'utilisateur a-t-il les droits nécessaires?")
        return False
    
    finally:
        if 'connection' in locals():
            try:
                if hasattr(connection, 'close'):
                    connection.close()
            except:
                pass