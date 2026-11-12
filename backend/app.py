from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from flask_migrate import Migrate
from datetime import datetime, date, timedelta
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import cast, String, func, or_
import io
import csv
import jwt
import os
from models import db

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

from config import get_config
from models import (
    db, Article, Chantier, Stock, Mouvement, AuditLog, User,
    log_audit, get_stock_statistics, get_mouvement_statistics
)

# ==================================================================
# HELPERS EXPORT EXCEL / CSV
# ==================================================================

def _num(value):
    if value is None: return None
    try: return float(value)
    except (TypeError, ValueError): return None

def _build_xlsx_response(headers, rows, sheet_name, filename):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    ws.append(headers)
    header_fill = PatternFill(start_color='2563EB', end_color='2563EB', fill_type='solid')
    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
    for row in rows: ws.append(row)
    for idx, header in enumerate(headers, start=1):
        letter = get_column_letter(idx)
        max_len = max(12, min(42, len(str(header)) + 6))
        ws.column_dimensions[letter].width = max_len
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(output, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

def _build_csv_response(headers, rows, filename):
    string_buffer = io.StringIO()
    writer = csv.writer(string_buffer, delimiter=';')
    writer.writerow(headers)
    for row in rows: writer.writerow(['' if v is None else v for v in row])
    data = string_buffer.getvalue()
    output = io.BytesIO()
    output.write('\ufeff'.encode('utf-8'))
    output.write(data.encode('utf-8'))
    output.seek(0)
    return send_file(output, as_attachment=True, download_name=filename, mimetype='text/csv')

def export_response(headers, rows, sheet_name, base_filename):
    if HAS_OPENPYXL: return _build_xlsx_response(headers, rows, sheet_name, f'{base_filename}.xlsx')
    return _build_csv_response(headers, rows, f'{base_filename}.csv')

def build_stocks_query(search='', chantier_id=None, statut_validation=None, date_debut=None, date_fin=None):
    query = Stock.query.join(Article).join(Chantier)
    if search:
        search_term = f'%{search}%'
        query = query.filter(db.or_(
            cast(Stock.numero_fiche, String).ilike(search_term),
            Stock.reference_odoo.ilike(search_term),
            Stock.reference_document.ilike(search_term),
            Article.nom.ilike(search_term),
            Article.reference_interne.ilike(search_term),
            Chantier.code.ilike(search_term),
            Chantier.nom.ilike(search_term)
        ))
    if chantier_id:
        query = query.filter(Stock.chantier_id == chantier_id)
    if statut_validation:
        query = query.filter(Stock.statut_validation == statut_validation)
    
    if date_debut:
        try:
            d_debut = datetime.strptime(date_debut, '%Y-%m-%d').date()
            query = query.filter(Stock.date_inventaire >= d_debut)
        except ValueError: pass
    if date_fin:
        try:
            d_fin = datetime.strptime(date_fin, '%Y-%m-%d').date()
            query = query.filter(Stock.date_inventaire <= d_fin)
        except ValueError: pass
            
    return query.order_by(Stock.numero_fiche.desc(), Stock.id.desc())

def build_mouvements_query(search='', chantier_id=None, date_debut='', date_fin='', type_mouvement='', statut_validation=''):
    query = Mouvement.query.join(Chantier, Mouvement.chantier_id == Chantier.id, isouter=True)\
                           .join(Article, Mouvement.article_id == Article.id, isouter=True)
    
    if search:
        search_term = f'%{search}%'
        query = query.filter(db.or_(
            Mouvement.numero_bs_br_cj.ilike(search_term),
            Chantier.code.ilike(search_term),
            Chantier.nom.ilike(search_term),
            Article.reference_interne.ilike(search_term),
            Article.nom.ilike(search_term)
        ))
        
    if chantier_id: query = query.filter(Mouvement.chantier_id == chantier_id)
    if date_debut:
        try: query = query.filter(Mouvement.date >= datetime.strptime(date_debut, '%Y-%m-%d').date())
        except ValueError: pass
    if date_fin:
        try: query = query.filter(Mouvement.date <= datetime.strptime(date_fin, '%Y-%m-%d').date())
        except ValueError: pass
    if type_mouvement: query = query.filter(Mouvement.type_mouvement == type_mouvement)
    if statut_validation: query = query.filter(Mouvement.statut_validation == statut_validation)
    
    return query.order_by(Mouvement.date.desc())

VALID_ROLES = ('admin', 'RespStock', 'user')
VALIDATEURS = ('admin', 'RespStock')

def parse_import_csv(raw_bytes):
    try: text = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError: text = raw_bytes.decode('latin-1', errors='replace')
    lines = text.splitlines()
    if not lines: return [], []
    first = lines[0]
    delimiter = ';' if first.count(';') >= first.count(',') else ','
    reader = csv.DictReader(lines, delimiter=delimiter)
    fieldnames = [f.strip() for f in (reader.fieldnames or [])]
    rows = []
    for r in reader:
        row = {(k or '').strip(): (v or '').strip() for k, v in r.items()}
        if any(v for v in row.values()):
            row['_line'] = reader.line_num
            rows.append(row)
    return fieldnames, rows

def compute_stock_statut(quantite_finale):
    if quantite_finale <= 0: return 'Rupture de stock'
    if quantite_finale <= 5: return 'Approvisionnement URGENT!'
    if quantite_finale <= 10: return 'Approvisionnement nécessaire'
    return 'Stock Normal'


def create_app(config_name=None):
    app = Flask(__name__)
    config_class = get_config(config_name)
    app.config.from_object(config_class)
    db.init_app(app)
    
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    CORS(app, 
         resources={r"/api/*": {
             "origins": [
                 "http://localhost:3000", "http://127.0.0.1:3000",
                 "http://localhost:3001", "http://127.0.0.1:3001",
                 "http://localhost:5173", "http://127.0.0.1:5173",
                 "http://localhost:5880", "http://127.0.0.1:5880",
                 "http://192.168.2.41:3000", "http://192.168.2.41:5880",
                 "http://192.168.2.15:3000", "http://192.168.2.15:5880",
                 "http://192.168.2.*:3000", "http://192.168.2.*:5880",
                 "http://10.10.100.*:3000", "http://10.10.100.*:5880",
             ],
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             "allow_headers": ["Content-Type", "Authorization", "X-User", "X-Requested-With"],
             "expose_headers": ["Content-Type", "Authorization"],
             "supports_credentials": False,
             "max_age": 3600
         }}
    )

    def get_current_user():
        if hasattr(request, 'current_user'): return request.current_user.username
        return request.headers.get('X-User', 'Système')

    def get_client_ip():
        if request.headers.get('X-Forwarded-For'): return request.headers.get('X-Forwarded-For').split(',')[0]
        return request.remote_addr

    def token_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
            token = request.headers.get('Authorization')
            if not token: return jsonify({'error': 'Token manquant'}), 401
            try:
                if token.startswith('Bearer '): token = token[7:]
                data = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
                current_user = User.query.filter_by(username=data['username']).first()
                if not current_user or not current_user.is_active: return jsonify({'error': 'Utilisateur invalide'}), 401
                request.current_user = current_user
            except jwt.ExpiredSignatureError: return jsonify({'error': 'Token expiré'}), 401
            except jwt.InvalidTokenError: return jsonify({'error': 'Token invalide'}), 401
            return f(*args, **kwargs)
        return decorated

    def admin_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
            token = request.headers.get('Authorization')
            if not token: return jsonify({'error': 'Token manquant'}), 401
            try:
                if token.startswith('Bearer '): token = token[7:]
                data = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
                current_user = User.query.filter_by(username=data['username']).first()
                if not current_user or not current_user.is_active: return jsonify({'error': 'Utilisateur invalide'}), 401
                if current_user.role != 'admin': return jsonify({'error': 'Accès refusé'}), 403
                request.current_user = current_user
            except jwt.ExpiredSignatureError: return jsonify({'error': 'Token expiré'}), 401
            except jwt.InvalidTokenError: return jsonify({'error': 'Token invalide'}), 401
            return f(*args, **kwargs)
        return decorated

    def roles_required(*allowed_roles):
        def decorator(f):
            @wraps(f)
            def decorated(*args, **kwargs):
                if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
                token = request.headers.get('Authorization')
                if not token: return jsonify({'error': 'Token manquant'}), 401
                try:
                    if token.startswith('Bearer '): token = token[7:]
                    data = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
                    current_user = User.query.filter_by(username=data['username']).first()
                    if not current_user or not current_user.is_active: return jsonify({'error': 'Utilisateur invalide'}), 401
                    if current_user.role not in allowed_roles: return jsonify({'error': 'Accès refusé'}), 403
                    request.current_user = current_user
                except jwt.ExpiredSignatureError: return jsonify({'error': 'Token expiré'}), 401
                except jwt.InvalidTokenError: return jsonify({'error': 'Token invalide'}), 401
                return f(*args, **kwargs)
            return decorated
        return decorator

    # ==================================================================
    # ROUTES AUTH
    # ==================================================================
    
    @app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
    def login():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            data = request.json
            if not data or not data.get('username') or not data.get('password'):
                return jsonify({'error': 'Username et password requis'}), 400
            user = User.query.filter_by(username=data['username']).first()
            if not user: return jsonify({'error': 'Identifiants invalides'}), 401
            if not user.is_active: return jsonify({'error': 'Compte désactivé'}), 403
            if not check_password_hash(user.password, data['password']):
                return jsonify({'error': 'Identifiants invalides'}), 401
            from datetime import timezone
            user.last_login = datetime.now(timezone.utc)
            db.session.commit()
            try:
                token = jwt.encode({
                    'username': user.username, 'user_id': user.id, 'role': user.role,
                    'exp': datetime.now(timezone.utc) + timedelta(hours=24)
                }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
            except AttributeError:
                import jwt as pyjwt
                token = pyjwt.encode({
                    'username': user.username, 'user_id': user.id, 'role': user.role,
                    'exp': datetime.now(timezone.utc) + timedelta(hours=24)
                }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
            if hasattr(token, 'decode'): token = token.decode('utf-8')
            return jsonify({'token': token, 'user': user.to_dict()}), 200
        except Exception as e:
            print(f"❌ Erreur login: {str(e)}")
            import traceback; traceback.print_exc()
            return jsonify({'error': f'Erreur serveur: {str(e)}'}), 500
    
    @app.route('/api/auth/verify', methods=['GET', 'OPTIONS'])
    @token_required
    def verify_token():
        return jsonify({'valid': True, 'user': request.current_user.to_dict()}), 200

    @app.route('/api/profile', methods=['GET', 'OPTIONS'])
    @token_required
    def get_profile():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try: return jsonify(request.current_user.to_dict()), 200
        except Exception as e: return jsonify({'error': str(e)}), 500

    @app.route('/api/profile', methods=['PUT', 'OPTIONS'])
    @token_required
    def update_profile():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            user = request.current_user
            data = request.json
            old_values = user.to_dict()
            if data.get('username') and data['username'] != user.username:
                existing = User.query.filter(User.username == data['username'], User.id != user.id).first()
                if existing: return jsonify({'error': 'Ce nom d\'utilisateur est déjà pris'}), 400
                user.username = data['username']
            if data.get('email') and data['email'] != user.email:
                existing = User.query.filter(User.email == data['email'], User.id != user.id).first()
                if existing: return jsonify({'error': 'Cet email est déjà utilisé'}), 400
                user.email = data['email']
            if data.get('full_name') is not None: user.full_name = data['full_name']
            if data.get('password'):
                if len(data['password']) < 6: return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
                user.password = generate_password_hash(data['password'])
            db.session.commit()
            log_audit(user.username, 'UPDATE', 'users', user.id, old_values=old_values, new_values=user.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(user.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES UPLOAD / PJ
    # ==================================================================

    @app.route('/api/upload-pj', methods=['POST', 'OPTIONS'])
    @token_required
    def upload_pj():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            if 'file' not in request.files: return jsonify({'error': 'Aucun fichier fourni'}), 400
            file = request.files['file']
            if file.filename == '': return jsonify({'error': 'Aucun fichier sélectionné'}), 400
            filename = secure_filename(file.filename)
            unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            file.save(file_path)
            return jsonify({'filename': unique_filename, 'message': 'Fichier uploadé avec succès'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/download-pj/<filename>', methods=['GET', 'OPTIONS'])
    @token_required
    def download_pj(filename):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            safe_name = secure_filename(filename)
            return send_from_directory(app.config['UPLOAD_FOLDER'], safe_name, as_attachment=True)
        except Exception as e:
            return jsonify({'error': str(e)}), 404

    # ==================================================================
    # ROUTES ARTICLES
    # ==================================================================
    
    @app.route('/api/articles', methods=['GET', 'OPTIONS'])
    @token_required
    def get_articles():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 50, type=int)
            search = request.args.get('search', '').strip()
            query = Article.query
            if search:
                search_term = f'%{search}%'
                query = query.filter(db.or_(
                    Article.reference_interne.ilike(search_term),
                    Article.nom.ilike(search_term),
                    Article.responsable.ilike(search_term)
                ))
            paginated = query.order_by(Article.nom).paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                'articles': [a.to_dict() for a in paginated.items],
                'total': paginated.total, 'pages': paginated.pages, 'current_page': page
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/articles', methods=['POST'])
    @admin_required
    def create_article():
        try:
            data = request.json
            if not data.get('reference_interne') or not data.get('nom'): return jsonify({'error': 'Référence et nom requis'}), 400
            existing = Article.query.filter_by(reference_interne=data['reference_interne']).first()
            if existing: return jsonify({'error': 'Référence existe déjà'}), 400
            article = Article(
                reference_interne=data['reference_interne'], nom=data['nom'], cout=0.0,
                responsable=data.get('responsable', ''), unite_mesure=data.get('unite_mesure', 'unité')
            )
            db.session.add(article)
            db.session.commit()
            log_audit(get_current_user(), 'CREATE', 'articles', article.id, new_values=article.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(article.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/articles/<int:article_id>', methods=['PUT'])
    @admin_required
    def update_article(article_id):
        try:
            article = Article.query.get_or_404(article_id)
            old_values = article.to_dict()
            data = request.json
            if data.get('reference_interne'): article.reference_interne = data['reference_interne']
            if data.get('nom'): article.nom = data['nom']
            if 'responsable' in data: article.responsable = data['responsable']
            if 'unite_mesure' in data: article.unite_mesure = data['unite_mesure']
            db.session.commit()
            log_audit(get_current_user(), 'UPDATE', 'articles', article.id, old_values=old_values, new_values=article.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(article.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/articles/<int:article_id>', methods=['DELETE'])
    @admin_required
    def delete_article(article_id):
        try:
            article = Article.query.get_or_404(article_id)
            old_values = article.to_dict()
            db.session.delete(article)
            db.session.commit()
            log_audit(get_current_user(), 'DELETE', 'articles', article_id, old_values=old_values, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': 'Article supprimé'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES CHANTIERS
    # ==================================================================
    
    @app.route('/api/chantiers', methods=['GET', 'OPTIONS'])
    @token_required
    def get_chantiers():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 50, type=int)
            search = request.args.get('search', '').strip()
            query = Chantier.query
            if search:
                search_term = f'%{search}%'
                query = query.filter(db.or_(
                    Chantier.code.ilike(search_term), 
                    Chantier.nom.ilike(search_term),
                    Chantier.client.ilike(search_term)
                ))
            paginated = query.order_by(Chantier.code).paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                'chantiers': [c.to_dict() for c in paginated.items],
                'total': paginated.total, 'pages': paginated.pages, 'current_page': page
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/chantiers', methods=['POST'])
    @admin_required
    def create_chantier():
        try:
            data = request.json
            if not data.get('code') or not data.get('nom'): return jsonify({'error': 'Code et nom requis'}), 400
            existing = Chantier.query.filter_by(code=data['code']).first()
            if existing: return jsonify({'error': 'Code existe déjà'}), 400
            chantier = Chantier(
                code=data['code'], 
                nom=data['nom'], 
                client=data.get('client', ''), 
                statut=data.get('statut', 'Actif')
            )
            db.session.add(chantier)
            db.session.commit()
            log_audit(get_current_user(), 'CREATE', 'chantiers', chantier.id, new_values=chantier.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(chantier.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/chantiers/<int:chantier_id>', methods=['PUT', 'OPTIONS'])
    @admin_required
    def update_chantier(chantier_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            chantier = Chantier.query.get_or_404(chantier_id)
            old_values = chantier.to_dict()
            data = request.json
            if data.get('code'): chantier.code = data['code']
            if data.get('nom'): chantier.nom = data['nom']
            if 'client' in data: chantier.client = data['client']
            if 'statut' in data: chantier.statut = data['statut']
            db.session.commit()
            log_audit(get_current_user(), 'UPDATE', 'chantiers', chantier.id, old_values=old_values, new_values=chantier.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(chantier.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/chantiers/<int:chantier_id>', methods=['DELETE', 'OPTIONS'])
    @admin_required
    def delete_chantier(chantier_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            chantier = Chantier.query.get_or_404(chantier_id)
            old_values = chantier.to_dict()
            db.session.delete(chantier)
            db.session.commit()
            log_audit(get_current_user(), 'DELETE', 'chantiers', chantier_id, old_values=old_values, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': 'Chantier supprimé'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES STOCKS
    # ==================================================================
    
    @app.route('/api/stocks', methods=['GET', 'OPTIONS'])
    @token_required
    def get_stocks():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            search = request.args.get('search', '').strip()
            chantier_id = request.args.get('chantier_id', type=int)
            statut_validation = request.args.get('statut_validation', '')
            date_debut = request.args.get('date_debut', '')
            date_fin = request.args.get('date_fin', '')

            query = build_stocks_query(search, chantier_id, statut_validation, date_debut, date_fin)
            
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                'stocks': [s.to_dict() for s in paginated.items],
                'total': paginated.total, 'pages': paginated.pages, 'current_page': page
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    @app.route('/api/stocks/<int:stock_id>', methods=['GET', 'OPTIONS'])
    @token_required
    def get_stock_by_id(stock_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            stock = Stock.query.get_or_404(stock_id)
            return jsonify(stock.to_dict()), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/stocks/find', methods=['GET', 'OPTIONS'])
    @token_required
    def find_stock():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            chantier_id = request.args.get('chantier_id', type=int)
            article_id = request.args.get('article_id', type=int)

            if not chantier_id or not article_id:
                return jsonify({'error': 'Chantier et Article requis'}), 400

            stock = Stock.query.filter_by(
                chantier_id=chantier_id, 
                article_id=article_id
            ).first()

            if not stock:
                return jsonify({'error': 'Aucun stock trouvé pour ce chantier et cet article'}), 404

            return jsonify(stock.to_dict()), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/stocks', methods=['POST'])
    @roles_required('admin', 'RespStock', 'user')
    def create_stock():
        try:
            data = request.json
            if not data: return jsonify({'error': 'Données manquantes'}), 400
            numero_fiche = str(data.get('numero_fiche')) if data.get('numero_fiche') else None
            if not data.get('numero_fiche'): return jsonify({'error': 'Numéro de fiche requis'}), 400
            if not data.get('chantier_id'): return jsonify({'error': 'Chantier requis'}), 400
            if not data.get('article_id'): return jsonify({'error': 'Article requis'}), 400
            
            existing = Stock.query.filter_by(numero_fiche=data['numero_fiche']).first()
            if existing: return jsonify({'error': 'Ce numéro de fiche existe déjà'}), 400
            
            chantier = db.session.get(Chantier, data['chantier_id'])
            if not chantier: return jsonify({'error': 'Chantier introuvable'}), 404
            article = db.session.get(Article, data['article_id'])
            if not article: return jsonify({'error': 'Article introuvable'}), 404
            
            prix_initial = float(data.get('prix_unitaire', 0))
            quantite_initiale = float(data.get('quantite_initiale', 0))
            date_inv = None
            if data.get('date_inventaire'):
                try: date_inv = datetime.strptime(data['date_inventaire'], '%Y-%m-%d').date()
                except ValueError: pass

            stock = Stock(
                numero_fiche=numero_fiche, reference_odoo=data.get('reference_odoo', ''),
                chantier_id=data['chantier_id'], article_id=data['article_id'],
                unite=data.get('unite', article.unite_mesure),
                quantite_initiale=quantite_initiale, prix_unitaire=prix_initial,
                date_inventaire=date_inv, reference_document=data.get('reference_document', ''),
                fichier_pj=data.get('fichier_pj', None), statut_validation='Brouillon'
            )
            stock.quantite_finale = quantite_initiale
            stock.prix_total = quantite_initiale * prix_initial
            if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
            elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
            elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
            else: stock.statut = 'Stock Normal'
            
            db.session.add(stock)
            db.session.flush()
            db.session.commit()
            log_audit(get_current_user(), 'CREATE', 'stocks', stock.id, new_values=stock.to_dict(include_article=False, include_chantier=False), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(stock.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/stocks/<int:stock_id>', methods=['PUT', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def update_stock(stock_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            stock = db.session.get(Stock, stock_id)
            if not stock: return jsonify({'error': 'Stock non trouvé'}), 404
            if stock.statut_validation == 'Validé': return jsonify({'error': 'Impossible de modifier un stock validé'}), 400
            old_values = stock.to_dict(include_article=False, include_chantier=False)
            data = request.json
            
            if data.get('reference_odoo') is not None: stock.reference_odoo = data['reference_odoo']
            if data.get('unite'): stock.unite = data['unite']
            if data.get('prix_unitaire') is not None: stock.prix_unitaire = float(data['prix_unitaire'])
            if data.get('reference_document') is not None: stock.reference_document = data['reference_document']
            if data.get('fichier_pj') is not None: stock.fichier_pj = data['fichier_pj']
            if data.get('date_inventaire') is not None:
                try: stock.date_inventaire = datetime.strptime(data['date_inventaire'], '%Y-%m-%d').date()
                except ValueError: pass
            
            if data.get('quantite_initiale') is not None: stock.quantite_initiale = float(data['quantite_initiale'])
            
            if data.get('article_id') and data['article_id'] != stock.article_id:
                article = db.session.get(Article, data['article_id'])
                if article: stock.article_id = data['article_id']
            if data.get('chantier_id') and data['chantier_id'] != stock.chantier_id:
                chantier = db.session.get(Chantier, data['chantier_id'])
                if chantier: stock.chantier_id = data['chantier_id']
            
            if stock.statut_validation == 'Brouillon':
                quantite_initiale = float(stock.quantite_initiale) if stock.quantite_initiale else 0.0
                prix_unitaire = float(stock.prix_unitaire) if stock.prix_unitaire else 0.0
                stock.entree = 0.0
                stock.sortie = 0.0
                stock.quantite_finale = quantite_initiale
                stock.prix_total = quantite_initiale * prix_unitaire
                if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
                elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
                elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
                else: stock.statut = 'Stock Normal'
            else:
                stock.recalculer_stock()
                stock.recalculer_prix_stock()
            
            db.session.commit()
            log_audit(get_current_user(), 'UPDATE', 'stocks', stock.id, old_values=old_values, new_values=stock.to_dict(include_article=False, include_chantier=False), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(stock.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/stocks/<int:stock_id>/validate', methods=['PUT', 'OPTIONS'])
    @roles_required(*VALIDATEURS)
    def validate_stock(stock_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            stock = db.session.get(Stock, stock_id)
            if not stock: return jsonify({'error': 'Stock introuvable'}), 404
            if stock.statut_validation == 'Validé': return jsonify({'error': 'Déjà validé'}), 400
            
            stock.statut_validation = 'Validé'
            stock.validateur_id = request.current_user.id
            stock.date_validation = datetime.utcnow()
            
            if float(stock.quantite_initiale) > 0:
                mouvement_initial = Mouvement(
                    date=stock.date_inventaire or datetime.utcnow().date(),
                    numero_bs_br_cj=f"INV-{stock.numero_fiche}",
                    chantier_id=stock.chantier_id,
                    stock_id=stock.id,
                    article_id=stock.article_id,
                    entree=stock.quantite_initiale,
                    sortie=None,
                    prix_unitaire=stock.prix_unitaire,
                    type_mouvement='ENTREE',
                    utilisateur=get_current_user(),
                    commentaire="Entrée automatique (Validation d'inventaire)",
                    statut_validation='Validé'
                )
                db.session.add(mouvement_initial)

            if stock.article: stock.article.recalculer_cmup()
            db.session.commit()
            log_audit(get_current_user(), 'VALIDATE', 'stocks', stock.id, ip_address=get_client_ip())
            db.session.commit()
            return jsonify(stock.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/stocks/<int:stock_id>', methods=['DELETE', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def delete_stock(stock_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            stock = Stock.query.get_or_404(stock_id)
            if stock.statut_validation == 'Validé': return jsonify({'error': 'Impossible de supprimer un stock validé'}), 400
            nb_mouvements = Mouvement.query.filter_by(stock_id=stock_id).count()
            if nb_mouvements > 0: return jsonify({'error': f'Impossible de supprimer ce stock : {nb_mouvements} mouvement(s) associé(s)'}), 400
            old_values = stock.to_dict(include_article=False, include_chantier=False)
            db.session.delete(stock)
            db.session.commit()
            log_audit(get_current_user(), 'DELETE', 'stocks', stock_id, old_values=old_values, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': 'Stock supprimé'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES MOUVEMENTS
    # ==================================================================
    
    @app.route('/api/mouvements', methods=['GET', 'OPTIONS'])
    @token_required
    def get_mouvements():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            search = request.args.get('search', '').strip()
            chantier_id = request.args.get('chantier_id', type=int)
            date_debut = request.args.get('date_debut', '')
            date_fin = request.args.get('date_fin', '')
            type_mouvement = request.args.get('type_mouvement', '')
            statut_validation = request.args.get('statut_validation', '')
            
            query = build_mouvements_query(search, chantier_id, date_debut, date_fin, type_mouvement, statut_validation)
            
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                'mouvements': [m.to_dict() for m in paginated.items],
                'total': paginated.total, 'pages': paginated.pages, 'current_page': page
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/mouvements', methods=['POST'])
    @token_required
    def create_mouvement():
        try:
            data = request.json
            if not data.get('date'): return jsonify({'error': 'Date requise'}), 400
            if not data.get('article_id'): return jsonify({'error': 'Article requis'}), 400
            
            type_mouvement_saisi = data.get('type_mouvement', 'ENTREE')
            entree = float(data.get('entree', 0))
            sortie = float(data.get('sortie', 0))
            prix_unitaire = float(data.get('prix_unitaire', 0))
            
            if type_mouvement_saisi == 'RESERVATION':
                # ✅ LOGIQUE DE RÉSERVATION
                if not data.get('chantier_id'): return jsonify({'error': 'Chantier bénéficiaire requis'}), 400
                if sortie <= 0: return jsonify({'error': 'Quantité de réservation requise'}), 400
                
                # Le chantier source est figé sur O23005
                chantier_source = Chantier.query.filter_by(code='O23005').first()
                if not chantier_source:
                    return jsonify({'error': 'Le chantier source O23005 est introuvable. Veuillez le créer.'}), 404
                
                stock = Stock.query.filter_by(chantier_id=chantier_source.id, article_id=data['article_id']).first()
                if not stock:
                    return jsonify({'error': 'Aucun stock existant sur le chantier O23005 pour cet article.'}), 400
                if stock.statut_validation != 'Validé':
                    return jsonify({'error': 'Le stock du chantier O23005 doit être validé.'}), 400
                if sortie > stock.quantite_finale:
                    return jsonify({'error': f'Stock insuffisant sur O23005 ! Disponible: {stock.quantite_finale} {stock.unite}'}), 400
                
                article = db.session.get(Article, data['article_id'])
                prix_unitaire = float(article.cout or 0)
                if prix_unitaire <= 0: return jsonify({'error': 'CMUP à 0, impossible de valoriser la réservation'}), 400
                
                # Déduction immédiate du stock
                stock.quantite_finale = float(stock.quantite_finale or 0) - sortie
                stock.sortie = float(stock.sortie or 0) + sortie
                if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
                elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
                elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
                else: stock.statut = 'Stock Normal'
                
                mouvement = Mouvement(
                    date=datetime.fromisoformat(data['date'].replace('Z', '+00:00')).date() if 'T' in data['date'] else datetime.strptime(data['date'], '%Y-%m-%d').date(),
                    numero_bs_br_cj=data.get('numero_bs_br_cj', ''), 
                    chantier_id=data.get('chantier_id'), # Chantier bénéficiaire (temporaire)
                    stock_id=stock.id, 
                    article_id=data['article_id'],
                    entree=None, sortie=sortie,
                    prix_unitaire=prix_unitaire, type_mouvement='RESERVATION',
                    utilisateur=get_current_user(), commentaire=data.get('commentaire', ''),
                    fichier_pj=data.get('fichier_pj', None), statut_validation='Brouillon'
                )
                
                db.session.add(mouvement)
                db.session.flush()
                db.session.commit()
                log_audit(get_current_user(), 'CREATE', 'mouvements', mouvement.id, new_values=mouvement.to_dict(include_relations=False), ip_address=get_client_ip())
                db.session.commit()
                return jsonify(mouvement.to_dict()), 201

            # ✅ LOGIQUE NORMALE (ENTREE / SORTIE)
            if not data.get('chantier_id'): return jsonify({'error': 'Chantier requis'}), 400
            
            if entree == 0 and sortie == 0: return jsonify({'error': 'Veuillez saisir une entrée ou une sortie'}), 400
            if entree > 0 and sortie > 0: return jsonify({'error': 'Une entrée OU une sortie, pas les deux'}), 400
            if entree > 0 and prix_unitaire <= 0: return jsonify({'error': 'Le prix unitaire est obligatoire pour une entrée'}), 400
            
            stock = Stock.query.filter_by(chantier_id=data['chantier_id'], article_id=data['article_id']).first()
            
            if sortie > 0:
                if not stock:
                    return jsonify({'error': 'Aucun stock existant pour ce chantier et cet article. Impossible de faire une sortie.'}), 400
                if stock.statut_validation != 'Validé':
                    return jsonify({'error': 'Le stock doit être validé avant de faire une sortie.'}), 400
                if sortie > stock.quantite_finale:
                    return jsonify({'error': f'Stock insuffisant ! Disponible: {stock.quantite_finale} {stock.unite}'}), 400
                
                article = db.session.get(Article, data['article_id'])
                prix_unitaire = float(article.cout or 0)
                if prix_unitaire <= 0: return jsonify({'error': 'CMUP à 0, impossible de valoriser la sortie'}), 400
                
            elif entree > 0:
                if not stock:
                    article = db.session.get(Article, data['article_id'])
                    stock = Stock(
                        numero_fiche=f"AUTO-{int(datetime.utcnow().timestamp())}",
                        chantier_id=data['chantier_id'], article_id=data['article_id'],
                        unite=article.unite_mesure if article else 'unité',
                        quantite_initiale=0, prix_unitaire=prix_unitaire,
                        statut_validation='Brouillon'
                    )
                    db.session.add(stock)
                    db.session.flush()
                else:
                    if stock.statut_validation == 'Validé':
                        article = db.session.get(Article, data['article_id'])
                        if article:
                            val_actuelle = float(stock.quantite_finale or 0) * float(article.cout or 0)
                            val_entree = entree * prix_unitaire
                            qte_totale = float(stock.quantite_finale or 0) + entree
                            article.cout = (val_actuelle + val_entree) / qte_totale if qte_totale > 0 else 0

            type_mouvement = 'ENTREE' if entree > 0 else 'SORTIE'

            mouvement = Mouvement(
                date=datetime.fromisoformat(data['date'].replace('Z', '+00:00')).date() if 'T' in data['date'] else datetime.strptime(data['date'], '%Y-%m-%d').date(),
                numero_bs_br_cj=data.get('numero_bs_br_cj', ''), chantier_id=data.get('chantier_id'),
                stock_id=stock.id, article_id=data['article_id'],
                entree=entree if entree > 0 else None, sortie=sortie if sortie > 0 else None,
                prix_unitaire=prix_unitaire, type_mouvement=type_mouvement,
                utilisateur=get_current_user(), commentaire=data.get('commentaire', ''),
                fichier_pj=data.get('fichier_pj', None), statut_validation='Brouillon'
            )
            
            db.session.add(mouvement)
            db.session.flush()
            db.session.commit()
            log_audit(get_current_user(), 'CREATE', 'mouvements', mouvement.id, new_values=mouvement.to_dict(include_relations=False), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(mouvement.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/<int:mouvement_id>', methods=['PUT', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def update_mouvement(mouvement_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            mouvement = db.session.get(Mouvement, mouvement_id)
            if not mouvement: return jsonify({'error': 'Mouvement introuvable'}), 404
            if mouvement.statut_validation == 'Validé': 
                return jsonify({'error': 'Impossible de modifier un mouvement validé'}), 400

            data = request.json
            old_values = mouvement.to_dict(include_relations=False)

            if data.get('date'): 
                mouvement.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            if data.get('numero_bs_br_cj') is not None: mouvement.numero_bs_br_cj = data['numero_bs_br_cj']
            if data.get('commentaire') is not None: mouvement.commentaire = data['commentaire']
            if data.get('fichier_pj') is not None: mouvement.fichier_pj = data['fichier_pj']

            if data.get('entree') is not None or data.get('sortie') is not None:
                entree = float(data.get('entree', 0))
                sortie = float(data.get('sortie', 0))
                
                if entree == 0 and sortie == 0: return jsonify({'error': 'Entrée ou sortie requise'}), 400
                if entree > 0 and sortie > 0: return jsonify({'error': 'Entrée OU sortie, pas les deux'}), 400

                mouvement.entree = entree if entree > 0 else None
                mouvement.sortie = sortie if sortie > 0 else None
                mouvement.type_mouvement = 'ENTREE' if entree > 0 else 'SORTIE'
                
                if data.get('prix_unitaire') is not None:
                    mouvement.prix_unitaire = float(data['prix_unitaire'])

            if mouvement.type_mouvement == 'SORTIE':
                stock = db.session.get(Stock, mouvement.stock_id)
                if not stock or mouvement.sortie > stock.quantite_finale:
                    return jsonify({'error': f'Stock insuffisant. Disponible: {stock.quantite_finale if stock else 0}'}), 400

            db.session.commit()
            log_audit(get_current_user(), 'UPDATE', 'mouvements', mouvement.id, old_values=old_values, new_values=mouvement.to_dict(include_relations=False), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(mouvement.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/<int:mouvement_id>', methods=['DELETE', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def delete_mouvement(mouvement_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            mouvement = db.session.get(Mouvement, mouvement_id)
            if not mouvement: return jsonify({'error': 'Mouvement introuvable'}), 404
            
            if mouvement.statut_validation == 'Validé': 
                return jsonify({'error': 'Impossible de supprimer un mouvement validé'}), 400
            
            # ✅ SI C'EST UNE RESERVATION EN BROUILLON, ON RESTAURE LE STOCK
            if mouvement.type_mouvement == 'RESERVATION':
                stock = db.session.get(Stock, mouvement.stock_id)
                if stock and mouvement.sortie:
                    stock.quantite_finale = float(stock.quantite_finale or 0) + float(mouvement.sortie)
                    stock.sortie = float(stock.sortie or 0) - float(mouvement.sortie)
                    
                    if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
                    elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
                    elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
                    else: stock.statut = 'Stock Normal'

            old_values = mouvement.to_dict(include_relations=False)
            db.session.delete(mouvement)
            db.session.commit()
            
            log_audit(get_current_user(), 'DELETE', 'mouvements', mouvement_id, old_values=old_values, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': 'Mouvement supprimé avec succès'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/<int:mouvement_id>/validate', methods=['PUT', 'OPTIONS'])
    @roles_required(*VALIDATEURS)
    def validate_mouvement(mouvement_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            mouvement = db.session.get(Mouvement, mouvement_id)
            if not mouvement: return jsonify({'error': 'Mouvement introuvable'}), 404
            if mouvement.statut_validation == 'Validé': return jsonify({'error': 'Déjà validé'}), 400
            
            # ✅ SI C'EST UNE RESERVATION, ON LA TRANSFORME EN SORTIE (le stock a déjà été déduit)
            if mouvement.type_mouvement == 'RESERVATION':
                # On récupère le chantier source pour corriger l'affichage
                chantier_source = Chantier.query.filter_by(code='O23005').first()
                if chantier_source:
                    mouvement.chantier_id = chantier_source.id # ✅ On écrase par le vrai chantier de sortie
                
                mouvement.type_mouvement = 'SORTIE'
                mouvement.statut_validation = 'Validé'
                mouvement.validateur_id = request.current_user.id
                mouvement.date_validation = datetime.utcnow()
                
                db.session.commit()
                log_audit(get_current_user(), 'VALIDATE_RESERVATION', 'mouvements', mouvement.id, ip_address=get_client_ip())
                db.session.commit()
                return jsonify(mouvement.to_dict()), 200

            # ✅ LOGIQUE NORMALE
            mouvement.statut_validation = 'Validé'
            mouvement.validateur_id = request.current_user.id
            mouvement.date_validation = datetime.utcnow()
            
            article = db.session.get(Article, mouvement.article_id)
            stock = db.session.get(Stock, mouvement.stock_id)
            
            if mouvement.entree and mouvement.entree > 0 and article: 
                article.recalculer_cmup()
            
            if stock:
                if mouvement.entree:
                    stock.quantite_finale = float(stock.quantite_finale or 0) + float(mouvement.entree)
                    stock.entree = float(stock.entree or 0) + float(mouvement.entree)
                if mouvement.sortie:
                    stock.quantite_finale = float(stock.quantite_finale or 0) - float(mouvement.sortie)
                    stock.sortie = float(stock.sortie or 0) + float(mouvement.sortie)

                if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
                elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
                elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
                else: stock.statut = 'Stock Normal'

                if stock.quantite_finale > 0:
                    stock.prix_unitaire = float(article.cout or 0)
                    stock.prix_total = stock.quantite_finale * stock.prix_unitaire
                else:
                    stock.prix_total = 0
                
                if stock.statut_validation == 'Brouillon':
                    stock.statut_validation = 'Validé'

            db.session.commit()
            log_audit(get_current_user(), 'VALIDATE', 'mouvements', mouvement.id, ip_address=get_client_ip())
            db.session.commit()
            return jsonify(mouvement.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/validate-batch', methods=['PUT', 'OPTIONS'])
    @roles_required(*VALIDATEURS)
    def validate_mouvements_batch():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            data = request.json
            numero_piece = data.get('numero_piece')
            if not numero_piece:
                return jsonify({'error': 'Numéro de pièce requis'}), 400

            mouvements = Mouvement.query.filter_by(numero_bs_br_cj=numero_piece, statut_validation='Brouillon').all()
            if not mouvements: return jsonify({'error': 'Aucun mouvement en brouillon trouvé pour cette pièce'}), 404

            for mouvement in mouvements:
                if mouvement.type_mouvement == 'RESERVATION':
                    chantier_source = Chantier.query.filter_by(code='O23005').first()
                    if chantier_source:
                        mouvement.chantier_id = chantier_source.id
                        
                    mouvement.type_mouvement = 'SORTIE'
                    mouvement.statut_validation = 'Validé'
                    mouvement.validateur_id = request.current_user.id
                    mouvement.date_validation = datetime.utcnow()
                    continue

                mouvement.statut_validation = 'Validé'
                mouvement.validateur_id = request.current_user.id
                mouvement.date_validation = datetime.utcnow()
                
                article = db.session.get(Article, mouvement.article_id)
                stock = db.session.get(Stock, mouvement.stock_id)
                
                if mouvement.entree and mouvement.entree > 0 and article: 
                    article.recalculer_cmup()
                
                if stock:
                    if mouvement.entree:
                        stock.quantite_finale = float(stock.quantite_finale or 0) + float(mouvement.entree)
                        stock.entree = float(stock.entree or 0) + float(mouvement.entree)
                    if mouvement.sortie:
                        stock.quantite_finale = float(stock.quantite_finale or 0) - float(mouvement.sortie)
                        stock.sortie = float(stock.sortie or 0) + float(mouvement.sortie)

                    if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
                    elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
                    elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
                    else: stock.statut = 'Stock Normal'

                    if stock.quantite_finale > 0:
                        stock.prix_unitaire = float(article.cout or 0)
                        stock.prix_total = stock.quantite_finale * stock.prix_unitaire
                    else:
                        stock.prix_total = 0
                        
                    if stock.statut_validation == 'Brouillon':
                        stock.statut_validation = 'Validé'

            db.session.commit()
            log_audit(get_current_user(), 'VALIDATE_BATCH', 'mouvements', 0, new_values={'numero_piece': numero_piece, 'nb_mouvements': len(mouvements)}, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': f'{len(mouvements)} mouvement(s) validé(s) avec succès'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/batch', methods=['POST', 'OPTIONS'])
    @token_required
    def create_mouvements_batch():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            data = request.json
            if not data or not data.get('mouvements'): return jsonify({'error': 'Aucun mouvement fourni'}), 400
            
            numero_piece = data.get('numero_bs_br_cj', '')
            date_mouvement = data.get('date')
            fichier_pj = data.get('fichier_pj', None)
            commentaire_global = data.get('commentaire', '')
            
            if not date_mouvement: return jsonify({'error': 'Date requise'}), 400
            
            try:
                date_obj = datetime.fromisoformat(date_mouvement.replace('Z', '+00:00')).date() if 'T' in date_mouvement else datetime.strptime(date_mouvement, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'Format de date invalide'}), 400
            
            created = []
            erreurs = []
            
            for idx, mvt in enumerate(data['mouvements']):
                try:
                    chantier_id = mvt.get('chantier_id')
                    article_id = mvt.get('article_id')

                    if not chantier_id or not article_id:
                        erreurs.append({'ligne': idx + 1, 'erreur': 'chantier_id et article_id requis'}); continue
                    
                    entree = float(mvt.get('entree', 0))
                    sortie = float(mvt.get('sortie', 0))
                    if entree == 0 and sortie == 0: erreurs.append({'ligne': idx + 1, 'erreur': 'Entrée ou sortie requise'}); continue
                    if entree > 0 and sortie > 0: erreurs.append({'ligne': idx + 1, 'erreur': 'Entrée OU sortie, pas les deux'}); continue
                    
                    article = db.session.get(Article, article_id)
                    if not article: erreurs.append({'ligne': idx + 1, 'erreur': 'Article introuvable'}); continue

                    prix_unitaire = float(mvt.get('prix_unitaire', 0))

                    stock = Stock.query.filter_by(chantier_id=chantier_id, article_id=article_id).first()

                    if sortie > 0:
                        if not stock: erreurs.append({'ligne': idx + 1, 'erreur': 'Aucun stock existant pour cette sortie'}); continue
                        if stock.statut_validation != 'Validé': erreurs.append({'ligne': idx + 1, 'erreur': 'Le stock doit être validé'}); continue
                        if sortie > stock.quantite_finale: erreurs.append({'ligne': idx + 1, 'erreur': f'Stock insuffisant (dispo: {stock.quantite_finale})'}); continue
                        
                        prix_unitaire = float(article.cout or 0)
                        if prix_unitaire <= 0: erreurs.append({'ligne': idx + 1, 'erreur': 'CMUP à 0, impossible de valoriser la sortie'}); continue
                    
                    elif entree > 0:
                        if prix_unitaire <= 0: erreurs.append({'ligne': idx + 1, 'erreur': 'Prix unitaire requis'}); continue
                        if not stock:
                            stock = Stock(
                                numero_fiche=f"AUTO-{int(datetime.utcnow().timestamp())}",
                                chantier_id=chantier_id, article_id=article_id,
                                unite=article.unite_mesure if article else 'unité',
                                quantite_initiale=0, prix_unitaire=prix_unitaire,
                                statut_validation='Brouillon'
                            )
                            db.session.add(stock)
                            db.session.flush()
                        else:
                            if stock.statut_validation == 'Validé':
                                val_actuelle = float(stock.quantite_finale or 0) * float(article.cout or 0)
                                val_entree = entree * prix_unitaire
                                qte_totale = float(stock.quantite_finale or 0) + entree
                                article.cout = (val_actuelle + val_entree) / qte_totale if qte_totale > 0 else 0
                    
                    mouvement = Mouvement(
                        date=date_obj, numero_bs_br_cj=numero_piece,
                        chantier_id=chantier_id,
                        stock_id=stock.id, article_id=article_id,
                        entree=entree if entree > 0 else None, sortie=sortie if sortie > 0 else None,
                        prix_unitaire=prix_unitaire, type_mouvement='ENTREE' if entree > 0 else 'SORTIE',
                        utilisateur=get_current_user(), commentaire=commentaire_global,
                        fichier_pj=fichier_pj, statut_validation='Brouillon'
                    )
                    db.session.add(mouvement)
                    created.append(mouvement)
                except Exception as e:
                    erreurs.append({'ligne': idx + 1, 'erreur': str(e)})
            
            if created:
                db.session.flush()
                for mvt in created:
                    log_audit(get_current_user(), 'CREATE', 'mouvements', mvt.id, new_values=mvt.to_dict(include_relations=False), ip_address=get_client_ip())
                db.session.commit()
            
            return jsonify({'total': len(data['mouvements']), 'crees': len(created), 'erreurs': erreurs, 'mouvements': [m.to_dict() for m in created]}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES EXPORT
    # ==================================================================

    @app.route('/api/stocks/export', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def export_stocks():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            search = request.args.get('search', '').strip()
            stocks = build_stocks_query(search).all()
            headers = ['N° Fiche', 'Réf. Odoo', 'Réf. Doc', 'Date Inventaire', 'Code Chantier', 'Chantier', 'Réf. Article', 'Article', 'Unité', 'Qté Initiale', 'Entrées', 'Sorties', 'Qté Finale', 'Prix Unitaire', 'Prix Total', 'Statut Stock', 'Statut Validation', 'PJ', 'Créé le']
            rows = []
            for s in stocks:
                rows.append([
                    s.numero_fiche, s.reference_odoo or '', s.reference_document or '',
                    s.date_inventaire.strftime('%d/%m/%Y') if s.date_inventaire else '',
                    s.chantier.code if s.chantier else '', s.chantier.nom if s.chantier else '',
                    s.article.reference_interne if s.article else '', s.article.nom if s.article else '', s.unite or '',
                    _num(s.quantite_initiale) or 0.0, _num(s.entree) or 0.0, _num(s.sortie) or 0.0, _num(s.quantite_finale) or 0.0,
                    _num(s.prix_unitaire) or 0.0, _num(s.prix_total) or 0.0, s.statut or '',
                    s.statut_validation or '', s.fichier_pj or '',
                    s.created_at.strftime('%d/%m/%Y %H:%M') if s.created_at else ''
                ])
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            return export_response(headers, rows, 'Stocks', f'stocks_{timestamp}')
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/mouvements/export', methods=['GET', 'OPTIONS'])
    @token_required
    def export_mouvements():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            search = request.args.get('search', '').strip()
            chantier_id = request.args.get('chantier_id', type=int)
            date_debut = request.args.get('date_debut', '')
            date_fin = request.args.get('date_fin', '')
            type_mouvement = request.args.get('type_mouvement', '')
            
            mouvements = build_mouvements_query(search, chantier_id, date_debut, date_fin, type_mouvement).all()
            headers = ['Date Saisie', 'Date Mouvement', 'N° BS/BR/CJ', 'Code Chantier', 'Chantier', 'N° Fiche', 'Réf. Article', 'Article', 'Type', 'Entrée', 'Sortie', 'Prix Unitaire', 'Statut Validation', 'PJ', 'Utilisateur', 'Commentaire', 'Créé le']
            rows = []
            for m in mouvements:
                rows.append([
                    m.date_saisie.strftime('%d/%m/%Y %H:%M') if m.date_saisie else '',
                    m.date.strftime('%d/%m/%Y') if m.date else '',
                    m.numero_bs_br_cj or '', m.chantier.code if m.chantier else '', m.chantier.nom if m.chantier else '',
                    m.stock.numero_fiche if m.stock else '', m.article.reference_interne if m.article else '', m.article.nom if m.article else '',
                    m.type_mouvement or '', _num(m.entree), _num(m.sortie), _num(m.prix_unitaire),
                    m.statut_validation or '', m.fichier_pj or '', m.utilisateur or '', m.commentaire or '',
                    m.created_at.strftime('%d/%m/%Y %H:%M') if m.created_at else ''
                ])
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            return export_response(headers, rows, 'Mouvements', f'mouvements_{timestamp}')
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES IMPORT CSV
    # ==================================================================

    @app.route('/api/stocks/import', methods=['POST', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def import_stocks():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            if 'file' not in request.files: return jsonify({'error': 'Fichier CSV requis (champ "file")'}), 400
            file = request.files['file']
            if not file or not file.filename: return jsonify({'error': 'Aucun fichier sélectionné'}), 400
            raw = file.read()
            if not raw: return jsonify({'error': 'Fichier vide'}), 400

            fieldnames, rows = parse_import_csv(raw)
            required = {'numero_fiche', 'chantier_code', 'article_reference_interne', 'quantite_initiale', 'prix_unitaire'}
            missing = required - set(fieldnames)
            if missing: return jsonify({'error': 'Colonnes manquantes dans le CSV: ' + ', '.join(sorted(missing))}), 400
            if not rows: return jsonify({'error': 'Aucune ligne de données à importer'}), 400

            chantier_codes = {r.get('chantier_code') for r in rows if r.get('chantier_code')}
            chantiers = Chantier.query.filter(Chantier.code.in_(chantier_codes)).all() if chantier_codes else []
            chantier_by_code = {c.code: c for c in chantiers}

            article_refs = {r.get('article_reference_interne') for r in rows if r.get('article_reference_interne')}
            articles = Article.query.filter(Article.reference_interne.in_(article_refs)).all() if article_refs else []
            article_by_ref = {a.reference_interne: a for a in articles}

            existing_fiches = {n for (n,) in db.session.query(Stock.numero_fiche).all()}

            created = []
            erreurs = []
            seen_fiches = set()

            for r in rows:
                line_no = r.get('_line', 0)
                numero_raw = r.get('numero_fiche', '')
                try: numero_fiche = int(float(numero_raw))
                except (TypeError, ValueError): numero_fiche = None

                chantier_code = r.get('chantier_code', '')
                article_ref = r.get('article_reference_interne', '')
                unite = r.get('unite', '')
                quantite_raw = r.get('quantite_initiale', '')
                prix_raw = r.get('prix_unitaire', '')

                try: quantite_initiale = float(quantite_raw)
                except (TypeError, ValueError): quantite_initiale = None
                try: prix_initial = float(prix_raw)
                except (TypeError, ValueError): prix_initial = None

                if numero_fiche is None or numero_fiche <= 0:
                    erreurs.append({'ligne': line_no, 'erreur': f'numero_fiche invalide: "{numero_raw}"'}); continue
                if numero_fiche in existing_fiches or numero_fiche in seen_fiches:
                    erreurs.append({'ligne': line_no, 'erreur': f'numero_fiche "{numero_fiche}" existe déjà'}); continue
                if not chantier_code or chantier_code not in chantier_by_code:
                    erreurs.append({'ligne': line_no, 'erreur': f'chantier_code introuvable: "{chantier_code}"'}); continue
                if not article_ref or article_ref not in article_by_ref:
                    erreurs.append({'ligne': line_no, 'erreur': f'article_reference_interne introuvable: "{article_ref}"'}); continue
                if quantite_initiale is None or quantite_initiale < 0:
                    erreurs.append({'ligne': line_no, 'erreur': f'quantite_initiale invalide: "{quantite_raw}"'}); continue
                if prix_initial is None or prix_initial < 0:
                    erreurs.append({'ligne': line_no, 'erreur': f'prix_unitaire invalide: "{prix_raw}"'}); continue

                article = article_by_ref[article_ref]
                chantier = chantier_by_code[chantier_code]
                
                quantite_initiale = round(quantite_initiale, 2)
                prix_initial = round(prix_initial, 2)
                prix_total = round(quantite_initiale * prix_initial, 2)

                stock = Stock(
                    numero_fiche=numero_fiche, reference_odoo=r.get('reference_odoo', '') or '',
                    chantier_id=chantier.id, article_id=article.id,
                    unite=unite or article.unite_mesure or 'unité',
                    quantite_initiale=quantite_initiale, entree=0.0, sortie=0.0,
                    quantite_finale=quantite_initiale, prix_unitaire=prix_initial,
                    prix_total=prix_total, statut=compute_stock_statut(quantite_initiale),
                    statut_validation='Brouillon'
                )
                created.append(stock)
                seen_fiches.add(numero_fiche)

            if created:
                db.session.add_all(created)
                db.session.flush()
                db.session.commit()

            log_audit(get_current_user(), 'IMPORT', 'stocks', 0, new_values={'total': len(rows), 'importes': len(created), 'ignores': len(erreurs)}, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'total': len(rows), 'importes': len(created), 'ignores': len(erreurs), 'erreurs': erreurs}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES DASHBOARD
    # ==================================================================
    
    @app.route('/api/dashboard/stats', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def dashboard_stats():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            stock_stats = get_stock_statistics()
            mouvement_stats = get_mouvement_statistics()
            nb_articles = Article.query.count()
            nb_chantiers = Chantier.query.filter_by(statut='Actif').count()
            stocks_brouillon = Stock.query.filter_by(statut_validation='Brouillon').count()
            mouvements_brouillon = Mouvement.query.filter_by(statut_validation='Brouillon').count()
            
            return jsonify({
                'nb_articles': nb_articles, 'nb_chantiers': nb_chantiers, 
                'stock': stock_stats, 'mouvements': mouvement_stats,
                'validation': {'stocks_brouillon': stocks_brouillon, 'mouvements_brouillon': mouvements_brouillon}
            }), 200
        except Exception as e: return jsonify({'error': str(e)}), 500
    
    @app.route('/api/dashboard/stock-par-chantier', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def stock_par_chantier():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            from sqlalchemy import text
            result = db.session.execute(text("""
                SELECT c.nom as chantier,
                    COALESCE(SUM(CASE WHEN m.type_mouvement = 'ENTREE' THEN m.entree ELSE 0 END), 0) as entrees,
                    COALESCE(SUM(CASE WHEN m.type_mouvement = 'SORTIE' THEN m.sortie ELSE 0 END), 0) as sorties
                FROM chantiers c
                LEFT JOIN stocks s ON c.id = s.chantier_id
                LEFT JOIN mouvements m ON s.id = m.stock_id AND m.statut_validation = 'Validé'
                WHERE c.statut = 'Actif'
                GROUP BY c.id, c.nom
                ORDER BY entrees DESC
                LIMIT 10
            """)).fetchall()
            data = [{'chantier': r[0], 'entrees': float(r[1]), 'sorties': float(r[2])} for r in result]
            return jsonify(data), 200
        except Exception as e: return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES USERS
    # ==================================================================
    
    @app.route('/api/users', methods=['GET', 'OPTIONS'])
    @admin_required
    def get_users():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            users = User.query.all()
            return jsonify({'users': [u.to_dict() for u in users], 'total': len(users)}), 200
        except Exception as e: return jsonify({'error': str(e)}), 500
    
    @app.route('/api/users', methods=['POST'])
    @admin_required
    def create_user():
        try:
            data = request.json
            if not data.get('username'): return jsonify({'error': 'Nom d\'utilisateur requis'}), 400
            if not data.get('email'): return jsonify({'error': 'Email requis'}), 400
            if not data.get('password'): return jsonify({'error': 'Mot de passe requis'}), 400
            if len(data['password']) < 6: return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
            role = data.get('role', 'user')
            if role not in VALID_ROLES: return jsonify({'error': f'Rôle invalide. Rôles autorisés: {", ".join(VALID_ROLES)}'}), 400
            existing = User.query.filter((User.username == data['username']) | (User.email == data['email'])).first()
            if existing: return jsonify({'error': 'Nom d\'utilisateur ou email déjà utilisé'}), 400
            user = User(username=data['username'], email=data['email'], password=generate_password_hash(data['password']), full_name=data.get('full_name', ''), role=role)
            db.session.add(user)
            db.session.commit()
            log_audit(get_current_user(), 'CREATE', 'users', user.id, new_values={'username': user.username, 'email': user.email, 'role': user.role}, ip_address=get_client_ip())
            db.session.commit()
            return jsonify(user.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/users/<int:user_id>', methods=['PUT', 'OPTIONS'])
    @admin_required
    def update_user(user_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            user = db.session.get(User, user_id)
            if not user: return jsonify({'error': 'Utilisateur non trouvé'}), 404
            data = request.json
            old_values = user.to_dict()
            if data.get('email'):
                existing = User.query.filter(User.email == data['email'], User.id != user_id).first()
                if existing: return jsonify({'error': 'Cet email est déjà utilisé'}), 400
                user.email = data['email']
            if data.get('full_name') is not None: user.full_name = data['full_name']
            if data.get('role') is not None:
                role = data['role']
                if role not in VALID_ROLES: return jsonify({'error': f'Rôle invalide. Rôles autorisés: {", ".join(VALID_ROLES)}'}), 400
                user.role = role
            if data.get('password'):
                if len(data['password']) < 6: return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
                user.password = generate_password_hash(data['password'])
            db.session.commit()
            log_audit(get_current_user(), 'UPDATE', 'users', user.id, old_values=old_values, new_values=user.to_dict(), ip_address=get_client_ip())
            db.session.commit()
            return jsonify(user.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/users/<int:user_id>', methods=['DELETE', 'OPTIONS'])
    @admin_required
    def delete_user(user_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            user = db.session.get(User, user_id)
            if not user: return jsonify({'error': 'Utilisateur non trouvé'}), 404
            if request.current_user and user.id == request.current_user.id: return jsonify({'error': 'Impossible de supprimer votre propre compte'}), 400
            old_values = user.to_dict()
            db.session.delete(user)
            db.session.commit()
            log_audit(get_current_user(), 'DELETE', 'users', user_id, old_values=old_values, ip_address=get_client_ip())
            db.session.commit()
            return jsonify({'message': 'Utilisateur supprimé'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES AUDIT LOGS
    # ==================================================================
    
    @app.route('/api/audit-logs', methods=['GET', 'OPTIONS'])
    @admin_required
    def get_audit_logs():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            utilisateur = request.args.get('utilisateur', '')
            action = request.args.get('action', '')
            table_name = request.args.get('table_name', '')
            query = AuditLog.query
            if utilisateur: query = query.filter(AuditLog.utilisateur.ilike(f'%{utilisateur}%'))
            if action: query = query.filter(AuditLog.action == action)
            if table_name: query = query.filter(AuditLog.table_name == table_name)
            paginated = query.order_by(AuditLog.timestamp.desc()).paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({'logs': [log.to_dict() for log in paginated.items], 'total': paginated.total, 'pages': paginated.pages, 'current_page': page}), 200
        except Exception as e: return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES VALORISATION MENSUELLE
    # ==================================================================

    @app.route('/api/valorisation/mensuelle', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def valorisation_mensuelle():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            year = request.args.get('year', datetime.now().year, type=int)
            if year < 2000 or year > 2100: return jsonify({'error': 'Année invalide'}), 400
            
            resultats = []
            for mois in range(1, 13):
                debut_mois = date(year, mois, 1)
                if mois == 12:
                    fin_mois = date(year, 12, 31)
                else:
                    fin_mois = date(year, mois + 1, 1) - timedelta(days=1)
                
                mouvements_mois = Mouvement.query.filter(
                    Mouvement.statut_validation == 'Validé',
                    Mouvement.date >= debut_mois,
                    Mouvement.date <= fin_mois
                ).all()
                
                valeur_entrees = sum(float(m.entree or 0) * float(m.prix_unitaire or 0) for m in mouvements_mois if m.entree)
                valeur_sorties = sum(float(m.sortie or 0) * float(m.prix_unitaire or 0) for m in mouvements_mois if m.sortie)
                
                qte_entrees = sum(float(m.entree or 0) for m in mouvements_mois if m.entree)
                qte_sorties = sum(float(m.sortie or 0) for m in mouvements_mois if m.sortie)
                
                nb_articles = len(set(m.article_id for m in mouvements_mois))
                nb_mvts = len(mouvements_mois)
                
                resultats.append({
                    'mois': mois, 'label': debut_mois.strftime('%B %Y'), 'date_fin': fin_mois.isoformat(),
                    'qte_entrees': round(qte_entrees, 2), 'valeur_entrees': round(valeur_entrees, 2),
                    'qte_sorties': round(qte_sorties, 2), 'valeur_sorties': round(valeur_sorties, 2),
                    'nb_articles': nb_articles, 'nb_mouvements': nb_mvts
                })
            
            return jsonify({'year': year, 'mois': resultats}), 200
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/valorisation/mensuelle/<int:year>/<int:mois>', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def valorisation_mensuelle_detail(year, mois):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            if not (1 <= mois <= 12): return jsonify({'error': 'Mois invalide'}), 400
            if year < 2000 or year > 2100: return jsonify({'error': 'Année invalide'}), 400
            
            debut_mois = date(year, mois, 1)
            if mois == 12: fin_mois = date(year, 12, 31)
            else: fin_mois = date(year, mois + 1, 1) - timedelta(days=1)
            
            mouvements = Mouvement.query.filter(
                Mouvement.statut_validation == 'Validé',
                Mouvement.date >= debut_mois,
                Mouvement.date <= fin_mois
            ).all()
            
            detail = []
            total_entrees = 0.0
            total_sorties = 0.0
            
            for m in mouvements:
                if m.entree:
                    val = float(m.entree) * float(m.prix_unitaire or 0)
                    total_entrees += val
                    detail.append({
                        'mouvement_id': m.id, 'type': 'ENTREE', 'numero_piece': m.numero_bs_br_cj or '',
                        'article_ref': m.article.reference_interne if m.article else '', 'article_nom': m.article.nom if m.article else '',
                        'chantier_code': m.chantier.code if m.chantier else '', 'chantier_nom': m.chantier.nom if m.chantier else '',
                        'quantite': float(m.entree), 'prix_unitaire': float(m.prix_unitaire or 0), 'valeur': round(val, 2)
                    })
                elif m.sortie:
                    val = float(m.sortie) * float(m.prix_unitaire or 0)
                    total_sorties += val
                    detail.append({
                        'mouvement_id': m.id, 'type': 'SORTIE', 'numero_piece': m.numero_bs_br_cj or '',
                        'article_ref': m.article.reference_interne if m.article else '', 'article_nom': m.article.nom if m.article else '',
                        'chantier_code': m.chantier.code if m.chantier else '', 'chantier_nom': m.chantier.nom if m.chantier else '',
                        'quantite': float(m.sortie), 'prix_unitaire': float(m.prix_unitaire or 0), 'valeur': round(val, 2)
                    })
            
            detail.sort(key=lambda x: x['valeur'], reverse=True)
            
            return jsonify({
                'year': year, 'mois': mois, 'date_debut': debut_mois.isoformat(), 'date_fin': fin_mois.isoformat(),
                'total_entrees': round(total_entrees, 2), 'total_sorties': round(total_sorties, 2), 'detail': detail
            }), 200
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/valorisation/mensuelle/export', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def export_valorisation_mensuelle():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            year = request.args.get('year', datetime.now().year, type=int)
            mois = request.args.get('mois', datetime.now().month, type=int)
            if not (1 <= mois <= 12): return jsonify({'error': 'Mois invalide'}), 400
            if year < 2000 or year > 2100: return jsonify({'error': 'Année invalide'}), 400
            
            debut_mois = date(year, mois, 1)
            if mois == 12: fin_mois = date(year, 12, 31)
            else: fin_mois = date(year, mois + 1, 1) - timedelta(days=1)
            
            mouvements = Mouvement.query.filter(
                Mouvement.statut_validation == 'Validé',
                Mouvement.date >= debut_mois,
                Mouvement.date <= fin_mois
            ).all()
            
            rows = []
            for m in mouvements:
                qte = m.entree if m.entree else m.sortie
                type_mvt = 'Entrée' if m.entree else 'Sortie'
                val = float(qte or 0) * float(m.prix_unitaire or 0)
                
                rows.append([
                    m.date.strftime('%d/%m/%Y') if m.date else '', type_mvt, m.numero_bs_br_cj or '',
                    m.article.reference_interne if m.article else '', m.article.nom if m.article else '',
                    m.chantier.code if m.chantier else '', m.chantier.nom if m.chantier else '',
                    round(float(qte or 0), 2), round(float(m.prix_unitaire or 0), 2), round(val, 2)
                ])
            
            rows.sort(key=lambda x: x[9], reverse=True)
            
            headers = ['Date', 'Type', 'N° Pièce', 'Réf. Article', 'Article', 'Code Chantier', 'Chantier', 'Quantité', 'Prix Unitaire', 'Valeur (MGA)']
            sheet_name = f'Valorisation_{year}_{mois:02d}'
            filename = f'valorisation_{year}_{mois:02d}_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
            return export_response(headers, rows, sheet_name, filename)
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES COUT PAR CHANTIER (Point 3)
    # ==================================================================

    @app.route('/api/couts/chantiers', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def couts_chantiers():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            filtre_type = request.args.get('filtre_type', '')

            entrees_query = db.session.query(
                Mouvement.chantier_id,
                func.sum(Mouvement.entree).label('total_qte_entree'),
                func.sum(Mouvement.entree * Mouvement.prix_unitaire).label('total_cout_entree')
            ).filter(Mouvement.statut_validation == 'Validé', Mouvement.type_mouvement == 'ENTREE')\
             .group_by(Mouvement.chantier_id).all()
            
            entrees_map = {r.chantier_id: {'qte': float(r.total_qte_entree or 0), 'cout': float(r.total_cout_entree or 0)} for r in entrees_query}

            sorties_query = db.session.query(
                Mouvement.chantier_id,
                func.sum(Mouvement.sortie).label('total_qte_sortie'),
                func.sum(Mouvement.sortie * Mouvement.prix_unitaire).label('total_cout_sortie')
            ).filter(Mouvement.statut_validation == 'Validé', Mouvement.type_mouvement.in_(['SORTIE', 'RESERVATION']))\
             .group_by(Mouvement.chantier_id).all()

            sorties_map = {r.chantier_id: {'qte': float(r.total_qte_sortie or 0), 'cout': float(r.total_cout_sortie or 0)} for r in sorties_query}

            chantiers = Chantier.query.all()
            resultats = []
            for c in chantiers:
                e = entrees_map.get(c.id, {'qte': 0, 'cout': 0})
                s = sorties_map.get(c.id, {'qte': 0, 'cout': 0})
                
                if filtre_type == 'entrees' and e['qte'] == 0: continue
                if filtre_type == 'sorties' and s['qte'] == 0: continue
                
                if e['qte'] > 0 or s['qte'] > 0:
                    resultats.append({
                        'id': c.id, 'code': c.code, 'nom': c.nom,
                        'total_qte_entree': e['qte'], 'total_cout_entree': e['cout'],
                        'total_qte_sortie': s['qte'], 'total_cout_sortie': s['cout'],
                        'total_qte': e['qte'] + s['qte'],
                        'total_cout': e['cout'] + s['cout']
                    })
            
            resultats.sort(key=lambda x: x['total_cout'], reverse=True)
            
            return jsonify(resultats), 200
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/couts/chantiers/<int:chantier_id>', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def cout_detail_chantier(chantier_id):
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            chantier = db.session.get(Chantier, chantier_id)
            if not chantier: return jsonify({'error': 'Chantier introuvable'}), 404

            query = db.session.query(
                Article.reference_interne, Article.nom, Mouvement.type_mouvement,
                func.sum(Mouvement.entree + Mouvement.sortie).label('total_qte'),
                func.sum((Mouvement.entree + Mouvement.sortie) * Mouvement.prix_unitaire).label('total_cout')
            ).join(Mouvement, Article.id == Mouvement.article_id)\
             .filter(Mouvement.chantier_id == chantier_id, Mouvement.statut_validation == 'Validé')\
             .group_by(Article.id, Article.reference_interne, Article.nom, Mouvement.type_mouvement)\
             .order_by(Mouvement.type_mouvement, func.sum((Mouvement.entree + Mouvement.sortie) * Mouvement.prix_unitaire).desc()).all()

            detail = []
            total_qte = 0.0
            total_cout = 0.0
            for row in query:
                qte = float(row.total_qte or 0)
                cout = float(row.total_cout or 0)
                total_qte += qte
                total_cout += cout
                detail.append({
                    'article_ref': row.reference_interne, 'article_nom': row.nom,
                    'type': row.type_mouvement,
                    'total_qte': qte, 'total_cout': cout
                })

            return jsonify({
                'chantier_code': chantier.code, 'chantier_nom': chantier.nom,
                'total_qte': round(total_qte, 2), 'total_cout': round(total_cout, 2),
                'detail': detail
            }), 200
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/couts/chantiers/export', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def export_couts_chantiers():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            entrees_query = db.session.query(
                Mouvement.chantier_id,
                func.sum(Mouvement.entree).label('qte'),
                func.sum(Mouvement.entree * Mouvement.prix_unitaire).label('cout')
            ).filter(Mouvement.statut_validation == 'Validé', Mouvement.type_mouvement == 'ENTREE')\
             .group_by(Mouvement.chantier_id).all()
            entrees_map = {r.chantier_id: (float(r.qte or 0), float(r.cout or 0)) for r in entrees_query}

            sorties_query = db.session.query(
                Mouvement.chantier_id,
                func.sum(Mouvement.sortie).label('qte'),
                func.sum(Mouvement.sortie * Mouvement.prix_unitaire).label('cout')
            ).filter(Mouvement.statut_validation == 'Validé', Mouvement.type_mouvement.in_(['SORTIE', 'RESERVATION']))\
             .group_by(Mouvement.chantier_id).all()
            sorties_map = {r.chantier_id: (float(r.qte or 0), float(r.cout or 0)) for r in sorties_query}

            chantiers = Chantier.query.all()
            rows = []
            grand_qte_e, grand_cout_e, grand_qte_s, grand_cout_s = 0.0, 0.0, 0.0, 0.0
            
            for c in chantiers:
                qe, ce = entrees_map.get(c.id, (0, 0))
                qs, cs = sorties_map.get(c.id, (0, 0))
                
                if qe > 0 or qs > 0:
                    grand_qte_e += qe; grand_cout_e += ce
                    grand_qte_s += qs; grand_cout_s += cs
                    rows.append([c.code, c.nom, round(qe, 2), round(ce, 2), round(qs, 2), round(cs, 2)])
            
            rows.append(['', 'TOTAL GÉNÉRAL', round(grand_qte_e, 2), round(grand_cout_e, 2), round(grand_qte_s, 2), round(grand_cout_s, 2)])

            headers = ['Code Chantier', 'Nom du Chantier', 'Qté Entrées', 'Coût Entrées (MGA)', 'Qté Sorties', 'Coût Sorties (MGA)']
            filename = f'couts_chantiers_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
            return export_response(headers, rows, 'Coûts par Chantier', filename)
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTE HEALTH & DEBUG
    # ==================================================================
    
    @app.route('/api/health', methods=['GET', 'OPTIONS'])
    def health_check():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            db.session.execute(db.text('SELECT 1'))
            db.session.commit()
            return jsonify({'status': 'ok', 'database': 'connected'}), 200
        except Exception as e: return jsonify({'status': 'error', 'database': 'disconnected', 'error': str(e)}), 500

    @app.route('/api/routes', methods=['GET', 'OPTIONS'])
    def list_routes():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        routes = []
        for rule in app.url_map.iter_rules():
            if rule.rule.startswith('/api/'):
                routes.append({'path': rule.rule, 'methods': sorted(list(rule.methods - {'HEAD', 'OPTIONS'}))})
        return jsonify(sorted(routes, key=lambda x: x['path'])), 200

    migrate = Migrate(app, db)
    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        try:
            db.session.execute(db.text('SELECT 1'))
            db.session.commit()
            print("✅ MySQL connecté!")
        except Exception as e:
            print(f"❌ Erreur MySQL: {e}")
            exit(1)
    
    print("\n📋 Routes disponibles :")
    with app.app_context():
        for rule in app.url_map.iter_rules():
            if rule.rule.startswith('/api/'):
                methods = ', '.join(sorted(rule.methods - {'HEAD', 'OPTIONS'}))
                print(f"   {methods:20} {rule.rule}")
    
    print("\n🚀 Serveur démarré sur http://0.0.0.0:5880")
    app.run(host='0.0.0.0', port=5880, debug=True)