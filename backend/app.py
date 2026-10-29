from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_migrate import Migrate
from datetime import datetime, date, timedelta
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash
from sqlalchemy import cast, String
import io
import csv
import jwt
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

def build_stocks_query(search=''):
    query = Stock.query.join(Article).join(Chantier)
    if search:
        search_term = f'%{search}%'
        query = query.filter(db.or_(
            cast(Stock.numero_fiche, String).ilike(search_term),
            Stock.reference_odoo.ilike(search_term),
            Article.nom.ilike(search_term),
            Article.reference_interne.ilike(search_term),
            Chantier.code.ilike(search_term),
            Chantier.nom.ilike(search_term)
        ))
    return query.order_by(Stock.numero_fiche.desc(), Stock.id.desc())

def build_mouvements_query(chantier_id=None, date_debut='', date_fin='', type_mouvement=''):
    query = Mouvement.query
    if chantier_id: query = query.filter(Mouvement.chantier_id == chantier_id)
    if date_debut:
        try: query = query.filter(Mouvement.date >= datetime.strptime(date_debut, '%Y-%m-%d').date())
        except ValueError: pass
    if date_fin:
        try: query = query.filter(Mouvement.date <= datetime.strptime(date_fin, '%Y-%m-%d').date())
        except ValueError: pass
    if type_mouvement: query = query.filter(Mouvement.type_mouvement == type_mouvement)
    return query.order_by(Mouvement.date.desc())

VALID_ROLES = ('admin', 'RespStock', 'user')

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
    
    CORS(app, 
         resources={r"/api/*": {
             "origins": "*",
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             "allow_headers": ["Content-Type", "Authorization", "X-User", "X-Requested-With"],
             "expose_headers": ["Content-Type", "Authorization"],
             "supports_credentials": True,
             "max_age": 3600
         }}
    )
    
    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            response = jsonify({'status': 'ok'})
            origin = request.headers.get('Origin')
            if origin: response.headers['Access-Control-Allow-Origin'] = origin
            else: response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-User,X-Requested-With'
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS,PATCH'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response, 200
            
    @app.after_request
    def after_request(response):
        origin = request.headers.get('Origin')
        if origin: response.headers['Access-Control-Allow-Origin'] = origin
        else: response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-User, X-Requested-With'
        return response

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
                'total': paginated.total,
                'pages': paginated.pages,
                'current_page': page
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/articles', methods=['POST'])
    @admin_required
    def create_article():
        try:
            data = request.json
            if not data.get('reference_interne') or not data.get('nom'):
                return jsonify({'error': 'Référence et nom requis'}), 400
            existing = Article.query.filter_by(reference_interne=data['reference_interne']).first()
            if existing: return jsonify({'error': 'Référence existe déjà'}), 400
            
            article = Article(
                reference_interne=data['reference_interne'],
                nom=data['nom'],
                cout=0.0, # Le coût est calculé, on l'initialise à 0
                responsable=data.get('responsable', ''),
                unite_mesure=data.get('unite_mesure', 'unité')
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
            # Le champ 'cout' n'est plus modifiable manuellement
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
                query = query.filter(db.or_(Chantier.code.ilike(search_term), Chantier.nom.ilike(search_term)))
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
            chantier = Chantier(code=data['code'], nom=data['nom'], statut=data.get('statut', 'Actif'))
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
            query = Stock.query.join(Article).join(Chantier)
            if search:
                search_term = f'%{search}%'
                query = query.filter(db.or_(
                    cast(Stock.numero_fiche, String).ilike(search_term),
                    Stock.reference_odoo.ilike(search_term),
                    Article.nom.ilike(search_term),
                    Article.reference_interne.ilike(search_term),
                    Chantier.code.ilike(search_term),
                    Chantier.nom.ilike(search_term)
                ))
            paginated = query.order_by(Stock.numero_fiche.desc(), Stock.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
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
    
    @app.route('/api/stocks', methods=['POST'])
    @roles_required('admin', 'RespStock')
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
            
            # ✅ Récupération du prix initial
            prix_initial = float(data.get('prix_unitaire', 0))
            quantite_initiale = float(data.get('quantite_initiale', 0))

            stock = Stock(
                numero_fiche=numero_fiche,
                reference_odoo=data.get('reference_odoo', ''),
                chantier_id=data['chantier_id'],
                article_id=data['article_id'],
                unite=data.get('unite', article.unite_mesure),
                quantite_initiale=quantite_initiale,
                prix_unitaire=prix_initial # ✅ Prix initial
            )
            
            stock.quantite_finale = quantite_initiale
            stock.prix_total = quantite_initiale * prix_initial
            
            # Calcul du statut
            if stock.quantite_finale <= 0: stock.statut = 'Rupture de stock'
            elif stock.quantite_finale <= 5: stock.statut = 'Approvisionnement URGENT!'
            elif stock.quantite_finale <= 10: stock.statut = 'Approvisionnement nécessaire'
            else: stock.statut = 'Stock Normal'
            
            db.session.add(stock)
            db.session.flush() # Pour avoir l'ID

            # ✅ Recalculer le CMUP de l'article après ajout du stock initial
            article.recalculer_cmup()

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
            old_values = stock.to_dict(include_article=False, include_chantier=False)
            data = request.json
            
            if data.get('reference_odoo') is not None: stock.reference_odoo = data['reference_odoo']
            if data.get('unite'): stock.unite = data['unite']
            if data.get('quantite_initiale') is not None: stock.quantite_initiale = float(data['quantite_initiale'])
            if data.get('prix_unitaire') is not None: stock.prix_unitaire = float(data['prix_unitaire']) # Modifiable
            
            if data.get('article_id') and data['article_id'] != stock.article_id:
                article = db.session.get(Article, data['article_id'])
                if article: stock.article_id = data['article_id']
            
            if data.get('chantier_id') and data['chantier_id'] != stock.chantier_id:
                chantier = db.session.get(Chantier, data['chantier_id'])
                if chantier: stock.chantier_id = data['chantier_id']
            
            stock.recalculer_stock()
            stock.recalculer_prix_stock()
            db.session.commit()
            
            log_audit(get_current_user(), 'UPDATE', 'stocks', stock.id, old_values=old_values, new_values=stock.to_dict(include_article=False, include_chantier=False), ip_address=get_client_ip())
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
            nb_mouvements = Mouvement.query.filter_by(stock_id=stock_id).count()
            if nb_mouvements > 0:
                return jsonify({'error': f'Impossible de supprimer ce stock : {nb_mouvements} mouvement(s) associé(s)'}), 400
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
            chantier_id = request.args.get('chantier_id', type=int)
            date_debut = request.args.get('date_debut', '')
            date_fin = request.args.get('date_fin', '')
            type_mouvement = request.args.get('type_mouvement', '')
            
            query = Mouvement.query
            if chantier_id: query = query.filter(Mouvement.chantier_id == chantier_id)
            if date_debut:
                try: query = query.filter(Mouvement.date >= datetime.strptime(date_debut, '%Y-%m-%d').date())
                except ValueError: pass
            if date_fin:
                try: query = query.filter(Mouvement.date <= datetime.strptime(date_fin, '%Y-%m-%d').date())
                except ValueError: pass
            if type_mouvement: query = query.filter(Mouvement.type_mouvement == type_mouvement)
            
            paginated = query.order_by(Mouvement.date.desc()).paginate(page=page, per_page=per_page, error_out=False)
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
            if not data.get('stock_id'): return jsonify({'error': 'Stock requis'}), 400
            if not data.get('article_id'): return jsonify({'error': 'Article requis'}), 400
            
            entree = float(data.get('entree', 0))
            sortie = float(data.get('sortie', 0))
            
            # ✅ LE PRIX EST OBLIGATOIRE
            prix_unitaire = float(data.get('prix_unitaire', 0))
            if prix_unitaire <= 0:
                return jsonify({'error': 'Le prix unitaire est obligatoire et doit être supérieur à 0'}), 400

            if entree == 0 and sortie == 0: return jsonify({'error': 'Veuillez saisir une entrée ou une sortie'}), 400
            if entree > 0 and sortie > 0: return jsonify({'error': 'Une entrée OU une sortie, pas les deux'}), 400
            
            stock = Stock.query.get(data['stock_id'])
            if not stock: return jsonify({'error': 'Stock introuvable'}), 404
            
            article = Article.query.get(data['article_id'])
            if not article: return jsonify({'error': 'Article introuvable'}), 404

            if sortie > 0:
                if sortie > stock.quantite_finale:
                    return jsonify({'error': f'Stock insuffisant ! Disponible: {stock.quantite_finale} {stock.unite}, Demandé: {sortie} {stock.unite}'}), 400
            
            type_mouvement = 'ENTREE' if entree > 0 else 'SORTIE'
            
            mouvement = Mouvement(
                date=datetime.fromisoformat(data['date'].replace('Z', '+00:00')).date() if 'T' in data['date'] else datetime.strptime(data['date'], '%Y-%m-%d').date(),
                numero_bs_br_cj=data.get('numero_bs_br_cj', ''),
                chantier_id=data.get('chantier_id'),
                stock_id=data['stock_id'],
                article_id=data['article_id'],
                entree=entree if entree > 0 else None,
                sortie=sortie if sortie > 0 else None,
                prix_unitaire=prix_unitaire, # ✅ Enregistrement du prix
                type_mouvement=type_mouvement,
                utilisateur=get_current_user(),
                commentaire=data.get('commentaire', '')
            )
            
            db.session.add(mouvement)
            db.session.flush()

            # ✅ MISE À JOUR DU CMUP ET DES PRIX
            if entree > 0:
                article.recalculer_cmup()
            
            stock.recalculer_stock()
            stock.recalculer_prix_stock()

            db.session.commit()
            
            log_audit(get_current_user(), 'CREATE', 'mouvements', mouvement.id, new_values=mouvement.to_dict(include_relations=False), ip_address=get_client_ip())
            db.session.commit()
            
            return jsonify(mouvement.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES EXPORT EXCEL
    # ==================================================================

    @app.route('/api/stocks/export', methods=['GET', 'OPTIONS'])
    @roles_required('admin', 'RespStock')
    def export_stocks():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            search = request.args.get('search', '').strip()
            stocks = build_stocks_query(search).all()
            headers = ['N° Fiche', 'Réf. Odoo', 'Code Chantier', 'Chantier', 'Réf. Article', 'Article', 'Unité', 'Qté Initiale', 'Entrées', 'Sorties', 'Qté Finale', 'Prix Unitaire', 'Prix Total', 'Statut', 'Créé le']
            rows = []
            for s in stocks:
                rows.append([
                    s.numero_fiche, s.reference_odoo or '', s.chantier.code if s.chantier else '', s.chantier.nom if s.chantier else '',
                    s.article.reference_interne if s.article else '', s.article.nom if s.article else '', s.unite or '',
                    _num(s.quantite_initiale) or 0.0, _num(s.entree) or 0.0, _num(s.sortie) or 0.0, _num(s.quantite_finale) or 0.0,
                    _num(s.prix_unitaire) or 0.0, _num(s.prix_total) or 0.0, s.statut or '',
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
            chantier_id = request.args.get('chantier_id', type=int)
            date_debut = request.args.get('date_debut', '')
            date_fin = request.args.get('date_fin', '')
            type_mouvement = request.args.get('type_mouvement', '')
            mouvements = build_mouvements_query(chantier_id, date_debut, date_fin, type_mouvement).all()
            headers = ['Date', 'N° BS/BR/CJ', 'Code Chantier', 'Chantier', 'N° Fiche', 'Réf. Article', 'Article', 'Type', 'Entrée', 'Sortie', 'Prix Unitaire', 'Utilisateur', 'Commentaire', 'Créé le']
            rows = []
            for m in mouvements:
                rows.append([
                    m.date.strftime('%d/%m/%Y') if m.date else '', m.numero_bs_br_cj or '', m.chantier.code if m.chantier else '', m.chantier.nom if m.chantier else '',
                    m.stock.numero_fiche if m.stock else '', m.article.reference_interne if m.article else '', m.article.nom if m.article else '',
                    m.type_mouvement or '', _num(m.entree), _num(m.sortie), _num(m.prix_unitaire),
                    m.utilisateur or '', m.commentaire or '', m.created_at.strftime('%d/%m/%Y %H:%M') if m.created_at else ''
                ])
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            return export_response(headers, rows, 'Mouvements', f'mouvements_{timestamp}')
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # ==================================================================
    # ROUTES IMPORT CSV (STOCKS)
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
            required = {'numero_fiche', 'chantier_code', 'article_reference_interne', 'quantite_initiale', 'prix_unitaire'} # Ajout prix
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
                    numero_fiche=numero_fiche,
                    reference_odoo=r.get('reference_odoo', '') or '',
                    chantier_id=chantier.id,
                    article_id=article.id,
                    unite=unite or article.unite_mesure or 'unité',
                    quantite_initiale=quantite_initiale,
                    entree=0.0, sortie=0.0,
                    quantite_finale=quantite_initiale,
                    prix_unitaire=prix_initial,
                    prix_total=prix_total,
                    statut=compute_stock_statut(quantite_initiale)
                )
                created.append(stock)
                seen_fiches.add(numero_fiche)

            if created:
                db.session.add_all(created)
                db.session.flush()

                # Recalculer le CMUP pour tous les articles impactés
                impacted_article_ids = {s.article_id for s in created}
                for aid in impacted_article_ids:
                    art = db.session.get(Article, aid)
                    if art: art.recalculer_cmup()

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
            return jsonify({'nb_articles': nb_articles, 'nb_chantiers': nb_chantiers, 'stock': stock_stats, 'mouvements': mouvement_stats}), 200
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
                LEFT JOIN mouvements m ON s.id = m.stock_id
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
    # ROUTE HEALTH
    # ==================================================================
    
    @app.route('/api/health', methods=['GET', 'OPTIONS'])
    def health_check():
        if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
        try:
            db.session.execute(db.text('SELECT 1'))
            db.session.commit()
            return jsonify({'status': 'ok', 'database': 'connected'}), 200
        except Exception as e: return jsonify({'status': 'error', 'database': 'disconnected', 'error': str(e)}), 500

    @app.route('/api/routes', methods=['GET'])
    def list_routes():
        routes = []
        for rule in app.url_map.iter_rules():
            if rule.rule.startswith('/api/'): routes.append({'path': rule.rule, 'methods': list(rule.methods - {'HEAD', 'OPTIONS'})})
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
    
    print("\n📋 Routes disponibles:")
    with app.app_context():
        for rule in app.url_map.iter_rules():
            if rule.rule.startswith('/api/'):
                methods = ', '.join(sorted(rule.methods - {'HEAD', 'OPTIONS'}))
                print(f"   {methods:20} {rule.rule}")
    
    print("\n🚀 Serveur démarré sur http://0.0.0.0:5880 (accessible depuis le réseau)")
    app.run(host='0.0.0.0', port=5880, debug=True)