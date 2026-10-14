"""
Routes d'audit log - Point 4
Backend pour l'historisation des actions
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from models import AuditLog, db  # Importer depuis votre models.py
from routes.auth import admin_required  # Importer le décorateur

audit_bp = Blueprint('audit', __name__, url_prefix='/api/audit-logs')

@audit_bp.route('', methods=['GET'])
@admin_required  # Accessible uniquement aux admins
def get_audit_logs(current_user):
    """
    Récupérer les logs d'audit avec filtres et pagination
    Accessible uniquement aux administrateurs
    """
    try:
        # Paramètres de pagination
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Filtres
        utilisateur = request.args.get('utilisateur', '')
        action = request.args.get('action', '')
        table_name = request.args.get('table_name', '')
        date_debut = request.args.get('date_debut', '')
        date_fin = request.args.get('date_fin', '')
        
        # Construire la requête
        query = AuditLog.query
        
        # Appliquer les filtres
        if utilisateur:
            query = query.filter(AuditLog.utilisateur.ilike(f'%{utilisateur}%'))
        
        if action:
            query = query.filter(AuditLog.action == action)
        
        if table_name:
            query = query.filter(AuditLog.table_name == table_name)
        
        if date_debut:
            try:
                date_debut_obj = datetime.strptime(date_debut, '%Y-%m-%d')
                query = query.filter(AuditLog.timestamp >= date_debut_obj)
            except ValueError:
                pass
        
        if date_fin:
            try:
                date_fin_obj = datetime.strptime(date_fin, '%Y-%m-%d')
                # Ajouter 1 jour pour inclure toute la journée
                from datetime import timedelta
                date_fin_obj = date_fin_obj + timedelta(days=1)
                query = query.filter(AuditLog.timestamp < date_fin_obj)
            except ValueError:
                pass
        
        # Trier par date décroissante (plus récent en premier)
        query = query.order_by(AuditLog.timestamp.desc())
        
        # Pagination
        paginated = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        # Formater les résultats
        logs = [log.to_dict() for log in paginated.items]
        
        return jsonify({
            'logs': logs,
            'total': paginated.total,
            'pages': paginated.pages,
            'current_page': page,
            'per_page': per_page
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@audit_bp.route('/<int:id>', methods=['GET'])
@admin_required
def get_audit_log_detail(current_user, id):
    """
    Récupérer les détails d'un log d'audit spécifique
    """
    try:
        log = AuditLog.query.get_or_404(id)
        return jsonify(log.to_dict()), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@audit_bp.route('/stats', methods=['GET'])
@admin_required
def get_audit_stats(current_user):
    """
    Récupérer des statistiques sur les logs d'audit
    """
    try:
        from sqlalchemy import func
        
        # Total de logs
        total_logs = AuditLog.query.count()
        
        # Par action
        actions_count = db.session.query(
            AuditLog.action,
            func.count(AuditLog.id).label('count')
        ).group_by(AuditLog.action).all()
        
        # Par table
        tables_count = db.session.query(
            AuditLog.table_name,
            func.count(AuditLog.id).label('count')
        ).group_by(AuditLog.table_name).all()
        
        # Par utilisateur
        users_count = db.session.query(
            AuditLog.utilisateur,
            func.count(AuditLog.id).label('count')
        ).group_by(AuditLog.utilisateur).order_by(
            func.count(AuditLog.id).desc()
        ).limit(10).all()
        
        # Dernières 24 heures
        from datetime import datetime, timedelta
        yesterday = datetime.utcnow() - timedelta(days=1)
        recent_count = AuditLog.query.filter(
            AuditLog.timestamp >= yesterday
        ).count()
        
        return jsonify({
            'total_logs': total_logs,
            'recent_24h': recent_count,
            'by_action': [{'action': a, 'count': c} for a, c in actions_count],
            'by_table': [{'table': t, 'count': c} for t, c in tables_count],
            'top_users': [{'user': u, 'count': c} for u, c in users_count]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@audit_bp.route('/export', methods=['GET'])
@admin_required
def export_audit_logs(current_user):
    """
    Exporter les logs d'audit en CSV
    """
    try:
        import csv
        from io import StringIO
        
        # Récupérer les logs (mêmes filtres que get_audit_logs)
        utilisateur = request.args.get('utilisateur', '')
        action = request.args.get('action', '')
        table_name = request.args.get('table_name', '')
        date_debut = request.args.get('date_debut', '')
        date_fin = request.args.get('date_fin', '')
        
        query = AuditLog.query
        
        if utilisateur:
            query = query.filter(AuditLog.utilisateur.ilike(f'%{utilisateur}%'))
        if action:
            query = query.filter(AuditLog.action == action)
        if table_name:
            query = query.filter(AuditLog.table_name == table_name)
        if date_debut:
            date_debut_obj = datetime.strptime(date_debut, '%Y-%m-%d')
            query = query.filter(AuditLog.timestamp >= date_debut_obj)
        if date_fin:
            date_fin_obj = datetime.strptime(date_fin, '%Y-%m-%d')
            from datetime import timedelta
            date_fin_obj = date_fin_obj + timedelta(days=1)
            query = query.filter(AuditLog.timestamp < date_fin_obj)
        
        query = query.order_by(AuditLog.timestamp.desc())
        logs = query.all()
        
        # Créer le CSV
        output = StringIO()
        writer = csv.writer(output)
        
        # En-têtes
        writer.writerow([
            'ID', 'Date/Heure', 'Utilisateur', 'Action', 
            'Table', 'ID Enregistrement', 'Adresse IP'
        ])
        
        # Données
        for log in logs:
            writer.writerow([
                log.id,
                log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                log.utilisateur,
                log.action,
                log.table_name,
                log.record_id,
                log.ip_address or ''
            ])
        
        # Préparer la réponse
        output.seek(0)
        from flask import make_response
        
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = f'attachment; filename=audit_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        response.headers['Content-Type'] = 'text/csv'
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# À ajouter dans app.py principal :
"""
from routes.audit import audit_bp

# Enregistrer le blueprint
app.register_blueprint(audit_bp)
"""

# Fonction helper pour créer des logs d'audit (à utiliser dans les autres routes)
"""
from models import log_audit

# Exemple dans une route de création de stock :
@app.route('/api/stocks', methods=['POST'])
@token_required
def create_stock(current_user):
    data = request.get_json()
    
    # Créer le stock
    stock = Stock(**data)
    db.session.add(stock)
    db.session.flush()  # Pour obtenir l'ID
    
    # Logger l'action
    log_audit(
        utilisateur=current_user['username'],
        action='CREATE',
        table_name='stock',
        record_id=stock.id,
        new_values=stock.to_dict(),
        ip_address=request.remote_addr
    )
    
    db.session.commit()
    return jsonify(stock.to_dict()), 201

# Exemple dans une route de mise à jour :
@app.route('/api/stocks/<int:id>', methods=['PUT'])
@token_required
def update_stock(current_user, id):
    stock = Stock.query.get_or_404(id)
    old_values = stock.to_dict()  # Sauvegarder l'ancien état
    
    data = request.get_json()
    for key, value in data.items():
        if hasattr(stock, key):
            setattr(stock, key, value)
    
    db.session.flush()
    new_values = stock.to_dict()
    
    # Logger l'action
    log_audit(
        utilisateur=current_user['username'],
        action='UPDATE',
        table_name='stock',
        record_id=stock.id,
        old_values=old_values,
        new_values=new_values,
        ip_address=request.remote_addr
    )
    
    db.session.commit()
    return jsonify(stock.to_dict()), 200

# Exemple dans une route de suppression :
@app.route('/api/stocks/<int:id>', methods=['DELETE'])
@admin_required  # Seulement les admins
def delete_stock(current_user, id):
    stock = Stock.query.get_or_404(id)
    old_values = stock.to_dict()
    
    # Logger l'action AVANT de supprimer
    log_audit(
        utilisateur=current_user['username'],
        action='DELETE',
        table_name='stock',
        record_id=stock.id,
        old_values=old_values,
        ip_address=request.remote_addr
    )
    
    db.session.delete(stock)
    db.session.commit()
    
    return jsonify({'message': 'Stock supprimé avec succès'}), 200
"""
