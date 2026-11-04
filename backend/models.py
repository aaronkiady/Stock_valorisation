"""
Modèles de données pour l'application de gestion de stock - VERSION MYSQL
===========================================================================
Modèles adaptés pour MySQL avec optimisations et bonnes pratiques
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, Index, text, select
from werkzeug.security import generate_password_hash, check_password_hash
import json

db = SQLAlchemy()


# ==================================================================
# MODÈLE USER - GESTION DES UTILISATEURS
# ==================================================================

class User(db.Model):
    """Modèle pour les utilisateurs de l'application"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    
    def set_password(self, password):
        """Hasher le mot de passe"""
        self.password = generate_password_hash(password)
    
    def check_password(self, password):
        """Vérifier le mot de passe"""
        return check_password_hash(self.password, password)
    
    def to_dict(self):
        """Convertir en dictionnaire (sans le mot de passe)"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }


# ==================================================================
# MODÈLE ARTICLE
# ==================================================================

class Article(db.Model):
    """Modèle pour le référentiel des articles avec prix"""
    __tablename__ = 'articles'
    
    id = db.Column(db.Integer, primary_key=True)
    reference_interne = db.Column(db.String(50), unique=True, nullable=False, index=True)
    nom = db.Column(db.String(255), nullable=False)
    cout = db.Column(db.Numeric(12, 2), default=0.0)
    responsable = db.Column(db.String(100))
    unite_mesure = db.Column(db.String(50), default='unité')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    stocks = db.relationship('Stock', back_populates='article', lazy='dynamic')
    mouvements = db.relationship('Mouvement', back_populates='article', lazy='dynamic')
    
    def recalculer_cmup(self):
        """Calcule le Coût Moyen Unitaire Pondéré (CMUP)"""
        stocks = Stock.query.filter_by(article_id=self.id).all()
        
        qte_initiale_totale = sum(float(s.quantite_initiale or 0) for s in stocks)
        valeur_initiale_totale = sum(float(s.quantite_initiale or 0) * float(s.prix_unitaire or 0) for s in stocks)
        
        # On ne prend en compte que les mouvements VALIDÉS
        mouvements_entree = Mouvement.query.filter(
            Mouvement.article_id == self.id,
            Mouvement.entree > 0,
            Mouvement.statut_validation == 'Validé'
        ).all()
        
        qte_entrees = sum(float(m.entree) for m in mouvements_entree)
        valeur_entrees = sum(float(m.entree) * float(m.prix_unitaire) for m in mouvements_entree)

        qte_totale = qte_initiale_totale + qte_entrees
        valeur_totale = valeur_initiale_totale + valeur_entrees

        if qte_totale > 0:
            self.cout = valeur_totale / qte_totale
        else:
            self.cout = 0.0

    def to_dict(self):
        return {
            'id': self.id,
            'reference_interne': self.reference_interne,
            'nom': self.nom,
            'cout': float(self.cout) if self.cout else 0.0,
            'responsable': self.responsable,
            'unite_mesure': self.unite_mesure,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


# ==================================================================
# MODÈLE CHANTIER
# ==================================================================

class Chantier(db.Model):
    """Modèle pour les chantiers"""
    __tablename__ = 'chantiers'
    
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    nom = db.Column(db.String(255), nullable=False)
    statut = db.Column(db.String(20), default='Actif')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    stocks = db.relationship('Stock', back_populates='chantier', lazy='dynamic')
    mouvements = db.relationship('Mouvement', back_populates='chantier', lazy='dynamic')
    
    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'nom': self.nom,
            'statut': self.statut,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


# ==================================================================
# MODÈLE STOCK
# ==================================================================

class Stock(db.Model):
    """Modèle pour l'état du stock"""
    __tablename__ = 'stocks'
    
    id = db.Column(db.Integer, primary_key=True)
    numero_fiche = db.Column(db.Integer, unique=True, nullable=False, index=True)
    reference_odoo = db.Column(db.String(50), index=True)
    chantier_id = db.Column(db.Integer, db.ForeignKey('chantiers.id'), nullable=False, index=True)
    article_id = db.Column(db.Integer, db.ForeignKey('articles.id'), nullable=False, index=True)
    unite = db.Column(db.String(50))
    quantite_initiale = db.Column(db.Numeric(12, 2), default=0.0)
    
    # Champs calculés
    entree = db.Column(db.Numeric(12, 2), default=0.0)
    sortie = db.Column(db.Numeric(12, 2), default=0.0)
    quantite_finale = db.Column(db.Numeric(12, 2), default=0.0)
    prix_unitaire = db.Column(db.Numeric(12, 2), default=0.0)
    prix_total = db.Column(db.Numeric(15, 2), default=0.0)
    statut = db.Column(db.String(50), default='Stock Normal')
    
    # ✅ NOUVEAUX CHAMPS (cahier des charges)
    date_inventaire = db.Column(db.Date, nullable=True)
    reference_document = db.Column(db.String(100), nullable=True)
    fichier_pj = db.Column(db.String(255), nullable=True)
    statut_validation = db.Column(db.String(20), default='Brouillon', index=True)  # Brouillon | Validé
    validateur_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    date_validation = db.Column(db.DateTime, nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    chantier = db.relationship('Chantier', back_populates='stocks')
    article = db.relationship('Article', back_populates='stocks')
    mouvements = db.relationship('Mouvement', back_populates='stock', lazy='dynamic')
    validateur = db.relationship('User', foreign_keys=[validateur_id])
    
    def recalculer_stock(self):
        """Recalculer les totaux du stock (quantités) - UNIQUEMENT mouvements validés"""
        total_entrees = db.session.query(
            func.coalesce(func.sum(Mouvement.entree), 0)
        ).filter(
            Mouvement.stock_id == self.id,
            Mouvement.statut_validation == 'Validé'
        ).scalar()
        
        total_sorties = db.session.query(
            func.coalesce(func.sum(Mouvement.sortie), 0)
        ).filter(
            Mouvement.stock_id == self.id,
            Mouvement.statut_validation == 'Validé'
        ).scalar()
        
        self.entree = float(total_entrees) if total_entrees else 0.0
        self.sortie = float(total_sorties) if total_sorties else 0.0
        quantite_initiale = float(self.quantite_initiale) if self.quantite_initiale else 0.0
        self.quantite_finale = quantite_initiale + self.entree - self.sortie
        
        if self.quantite_finale <= 0:
            self.statut = 'Rupture de stock'
        elif self.quantite_finale <= 5:
            self.statut = 'Alerte stock critique'
        elif self.quantite_finale <= 10:
            self.statut = 'Approvisionnement nécessaire'
        else:
            self.statut = 'Stock Normal'
        
        self.updated_at = datetime.utcnow()

    def recalculer_prix_stock(self):
        """Recalcule le prix total du stock - UNIQUEMENT mouvements validés"""
        if not self.article:
            return

        entrees = Mouvement.query.filter_by(
            stock_id=self.id, statut_validation='Validé'
        ).filter(Mouvement.entree > 0).all()
        valeur_entrees = sum(float(m.entree) * float(m.prix_unitaire or 0) for m in entrees)
        
        sorties = Mouvement.query.filter_by(
            stock_id=self.id, statut_validation='Validé'
        ).filter(Mouvement.sortie > 0).all()
        valeur_sorties = sum(float(m.sortie) * float(self.article.cout or 0) for m in sorties)

        self.prix_total = valeur_entrees - valeur_sorties
        
        if self.quantite_finale > 0:
            self.prix_unitaire = self.prix_total / float(self.quantite_finale)
        else:
            self.prix_unitaire = 0
            
        self.updated_at = datetime.utcnow()
    
    def to_dict(self, include_article=True, include_chantier=True):
        result = {
            'id': self.id,
            'numero_fiche': self.numero_fiche,
            'reference_odoo': self.reference_odoo,
            'chantier_id': self.chantier_id,
            'article_id': self.article_id,
            'unite': self.unite,
            'quantite_initiale': float(self.quantite_initiale) if self.quantite_initiale else 0.0,
            'entree': float(self.entree) if self.entree else 0.0,
            'sortie': float(self.sortie) if self.sortie else 0.0,
            'quantite_finale': float(self.quantite_finale) if self.quantite_finale else 0.0,
            'prix_unitaire': float(self.prix_unitaire) if self.prix_unitaire else 0.0,
            'prix_total': float(self.prix_total) if self.prix_total else 0.0,
            'statut': self.statut,
            'date_inventaire': self.date_inventaire.isoformat() if self.date_inventaire else None,
            'reference_document': self.reference_document,
            'fichier_pj': self.fichier_pj,
            'statut_validation': self.statut_validation,
            'date_validation': self.date_validation.isoformat() if self.date_validation else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_article and self.article:
            result['article'] = self.article.to_dict()
        
        if include_chantier and self.chantier:
            result['chantier'] = self.chantier.to_dict()

        if self.validateur:
            result['validateur'] = self.validateur.to_dict()
        
        return result


# ==================================================================
# MODÈLE MOUVEMENT
# ==================================================================

class Mouvement(db.Model):
    """Modèle pour l'historique des mouvements de stock"""
    __tablename__ = 'mouvements'
    
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)  # Date du mouvement
    numero_bs_br_cj = db.Column(db.String(100))
    chantier_id = db.Column(db.Integer, db.ForeignKey('chantiers.id'), index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.id'), nullable=False, index=True)
    article_id = db.Column(db.Integer, db.ForeignKey('articles.id'), nullable=False, index=True)
    entree = db.Column(db.Numeric(12, 2))
    sortie = db.Column(db.Numeric(12, 2))
    prix_unitaire = db.Column(db.Numeric(12, 2), nullable=False)
    type_mouvement = db.Column(db.String(20))
    utilisateur = db.Column(db.String(100))
    commentaire = db.Column(db.Text)
    
    # ✅ NOUVEAUX CHAMPS (cahier des charges)
    date_saisie = db.Column(db.DateTime, default=datetime.utcnow, index=True)  # Date de saisie
    fichier_pj = db.Column(db.String(255), nullable=True)
    statut_validation = db.Column(db.String(20), default='Brouillon', index=True)  # Brouillon | Validé
    validateur_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    date_validation = db.Column(db.DateTime, nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relations
    stock = db.relationship('Stock', back_populates='mouvements')
    article = db.relationship('Article', back_populates='mouvements')
    chantier = db.relationship('Chantier', back_populates='mouvements')
    validateur = db.relationship('User', foreign_keys=[validateur_id])
    
    __table_args__ = (
        Index('idx_mouvement_date_chantier', 'date', 'chantier_id'),
        Index('idx_mouvement_stock_date', 'stock_id', 'date'),
    )
    
    def to_dict(self, include_relations=True):
        result = {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'date_saisie': self.date_saisie.isoformat() if self.date_saisie else None,
            'numero_bs_br_cj': self.numero_bs_br_cj,
            'chantier_id': self.chantier_id,
            'stock_id': self.stock_id,
            'article_id': self.article_id,
            'entree': float(self.entree) if self.entree else None,
            'sortie': float(self.sortie) if self.sortie else None,
            'prix_unitaire': float(self.prix_unitaire) if self.prix_unitaire else 0.0,
            'type_mouvement': self.type_mouvement,
            'utilisateur': self.utilisateur,
            'commentaire': self.commentaire,
            'fichier_pj': self.fichier_pj,
            'statut_validation': self.statut_validation,
            'date_validation': self.date_validation.isoformat() if self.date_validation else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_relations:
            if self.article:
                result['article'] = self.article.to_dict()
            if self.chantier:
                result['chantier'] = self.chantier.to_dict()
            if self.stock:
                result['stock_numero'] = self.stock.numero_fiche
            if self.validateur:
                result['validateur'] = self.validateur.to_dict()
        
        return result


# ==================================================================
# MODÈLE AUDIT LOG
# ==================================================================

class AuditLog(db.Model):
    """Modèle pour le journal d'audit"""
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    utilisateur = db.Column(db.String(100), nullable=False, index=True)
    action = db.Column(db.String(20), nullable=False, index=True)
    table_name = db.Column(db.String(50), nullable=False, index=True)
    record_id = db.Column(db.Integer, nullable=False)
    old_values = db.Column(db.Text)
    new_values = db.Column(db.Text)
    ip_address = db.Column(db.String(50))
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'utilisateur': self.utilisateur,
            'action': self.action,
            'table_name': self.table_name,
            'record_id': self.record_id,
            'old_values': json.loads(self.old_values) if self.old_values else None,
            'new_values': json.loads(self.new_values) if self.new_values else None,
            'ip_address': self.ip_address
        }


# ==================================================================
# FONCTIONS UTILITAIRES
# ==================================================================

def log_audit(utilisateur, action, table_name, record_id, old_values=None, new_values=None, ip_address=None):
    """Créer une entrée dans le journal d'audit"""
    try:
        audit = AuditLog(
            utilisateur=utilisateur,
            action=action,
            table_name=table_name,
            record_id=record_id,
            old_values=json.dumps(old_values) if old_values else None,
            new_values=json.dumps(new_values) if new_values else None,
            ip_address=ip_address
        )
        db.session.add(audit)
        return audit
    except Exception as e:
        print(f"Erreur lors de la création du log d'audit: {e}")
        return None


def get_stock_statistics():
    """Récupérer les statistiques des stocks"""
    try:
        result = db.session.execute(text("""
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(quantite_finale), 0) as total_quantite,
                COALESCE(SUM(prix_total), 0) as total_valeur,
                SUM(CASE WHEN statut = 'Stock Normal' THEN 1 ELSE 0 END) as count_normal,
                SUM(CASE WHEN statut IN ('Alerte stock critique', 'Approvisionnement nécessaire') THEN 1 ELSE 0 END) as count_alert,
                SUM(CASE WHEN statut IN ('Approvisionnement URGENT!', 'Rupture de stock') THEN 1 ELSE 0 END) as count_urgent
            FROM stocks
        """)).first()
        
        return {
            'total': int(result[0]) if result[0] else 0,
            'total_quantite': float(result[1]) if result[1] else 0.0,
            'total_valeur': float(result[2]) if result[2] else 0.0,
            'count_normal': int(result[3]) if result[3] else 0,
            'count_alert': int(result[4]) if result[4] else 0,
            'count_urgent': int(result[5]) if result[5] else 0
        }
    except Exception as e:
        print(f"Erreur lors du calcul des statistiques: {e}")
        return {
            'total': 0, 'total_quantite': 0.0, 'total_valeur': 0.0,
            'count_normal': 0, 'count_alert': 0, 'count_urgent': 0
        }


def get_mouvement_statistics():
    """Récupérer les statistiques des mouvements"""
    try:
        result = db.session.execute(text("""
            SELECT 
                COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN entree ELSE 0 END), 0) as total_entrees,
                COALESCE(SUM(CASE WHEN type_mouvement = 'SORTIE' THEN sortie ELSE 0 END), 0) as total_sorties,
                COUNT(*) as total_mouvements
            FROM mouvements
            WHERE MONTH(date) = MONTH(CURRENT_DATE)
            AND YEAR(date) = YEAR(CURRENT_DATE)
        """)).first()
        
        return {
            'total_entrees': float(result[0]) if result[0] else 0.0,
            'total_sorties': float(result[1]) if result[1] else 0.0,
            'total_mouvements': int(result[2]) if result[2] else 0
        }
    except Exception as e:
        print(f"Erreur lors du calcul des statistiques de mouvements: {e}")
        return {'total_entrees': 0.0, 'total_sorties': 0.0, 'total_mouvements': 0}