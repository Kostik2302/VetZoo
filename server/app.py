import sys
import os
from flask import Flask, request, jsonify, send_from_directory, render_template, redirect, url_for, flash
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from functools import wraps

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.database import Database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            static_folder=os.path.join(BASE_DIR, '../client'),
            static_url_path='',
            template_folder=os.path.join(BASE_DIR, 'templates'))
app.secret_key = 'super-secret-key-vetzoo'
CORS(app, supports_credentials=True)

db = Database()
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# ----- Модель пользователя для Flask-Login -----
class User(UserMixin):
    def __init__(self, user_id, username, role, full_name):
        self.id = user_id
        self.username = username
        self.role = role
        self.full_name = full_name

@login_manager.user_loader
def load_user(user_id):
    user_data = db.get_user(user_id)
    if user_data:
        return User(
            user_id=user_data[0],
            username=user_data[1],
            role=user_data[4],
            full_name=user_data[3]
        )
    return None

# ----- Декоратор для проверки ролей -----
def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Требуется авторизация'}), 401
            if current_user.role not in roles:
                return jsonify({'error': 'Недостаточно прав'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ----- Создание администратора по умолчанию -----
def create_default_admin():
    admin = db.get_user_by_username('admin')
    if not admin:
        pwd_hash = generate_password_hash('admin')
        db.create_user('admin', pwd_hash, 'admin', 'Default Admin')

# ----- СТРАНИЦЫ -----
@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user_data = db.get_user_by_username(username)
        
        if user_data and check_password_hash(user_data[2], password):
            user = User(
                user_id=user_data[0],
                username=user_data[1],
                role=user_data[4],
                full_name=user_data[3]
            )
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Неверное имя пользователя или пароль')
            return render_template('login.html'), 401
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/admin')
@login_required
@role_required('admin')
def admin_panel():
    return render_template('admin.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# ----- API: текущий пользователь -----
@app.route('/api/me', methods=['GET'])
@login_required
def get_current_user():
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'role': current_user.role,
        'full_name': current_user.full_name
    })

# ----- API: смена логина/пароля -----
@app.route('/api/user/change-credentials', methods=['PUT'])
@login_required
def change_credentials():
    """Смена логина и/или пароля для текущего пользователя"""
    data = request.json
    new_username = data.get('new_username')
    new_password = data.get('new_password')
    
    if not new_username and not new_password:
        return jsonify({'error': 'Нет данных для изменения'}), 400
    
    new_password_hash = None
    if new_password:
        new_password_hash = generate_password_hash(new_password)
    
    success, message = db.update_user_credentials(
        current_user.id, 
        new_username, 
        new_password_hash
    )
    
    if not success:
        return jsonify({'error': message}), 400
    
    if new_username:
        updated_user = User(
            user_id=current_user.id,
            username=new_username,
            role=current_user.role,
            full_name=current_user.full_name
        )
        login_user(updated_user)
    
    return jsonify({'message': 'Данные успешно обновлены'})

# ----- API: управление пользователями (только admin) -----
@app.route('/api/users', methods=['GET'])
@login_required
@role_required('admin')
def get_users():
    users = db.get_all_users()
    result = []
    for u in users:
        result.append({
            'id': u[0],
            'username': u[1],
            'full_name': u[2],
            'role': u[3],
            'created_at': u[4]
        })
    return jsonify(result)

@app.route('/api/users', methods=['POST'])
@login_required
@role_required('admin')
def create_user():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')
    full_name = data.get('full_name', '')

    if not username or not password or role not in ['vet', 'keeper']:
        return jsonify({'error': 'Неверные данные'}), 400

    existing = db.get_user_by_username(username)
    if existing:
        return jsonify({'error': 'Пользователь с таким именем уже существует'}), 400

    pwd_hash = generate_password_hash(password)
    user_id = db.create_user(username, pwd_hash, role, full_name)
    if user_id:
        return jsonify({'id': user_id, 'message': 'Пользователь создан'}), 201
    return jsonify({'error': 'Ошибка создания'}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
@role_required('admin')
def delete_user(user_id):
    if user_id == current_user.id:
        return jsonify({'error': 'Нельзя удалить себя'}), 400
    success = db.delete_user(user_id)
    if success:
        return jsonify({'message': 'Пользователь удалён'})
    return jsonify({'error': 'Пользователь не найден'}), 404

@app.route('/api/users/<int:user_id>/fullname', methods=['PUT'])
@login_required
@role_required('admin')
def update_user_fullname(user_id):
    """Обновление полного имени пользователя"""
    data = request.json
    new_full_name = data.get('full_name')
    
    if not new_full_name:
        return jsonify({'error': 'Полное имя не может быть пустым'}), 400
    
    success = db.update_user_fullname(user_id, new_full_name)
    if success:
        return jsonify({'message': 'Полное имя обновлено'})
    return jsonify({'error': 'Пользователь не найден'}), 404

# ==================== ЖИВОТНЫЕ ====================

# Получить всех животных
@app.route('/api/animals', methods=['GET'])
@login_required
def get_animals():
    animals = db.get_all_animals()
    result = []
    for a in animals:
        result.append({
            'id': a[0], 'name': a[1], 'species': a[2], 'arrival_date': a[3],
            'birth_date': a[4], 'gender': a[5], 'enclosure': a[6],
            'health_status': a[7], 'notes': a[8]
        })
    return jsonify(result)

# Получить одно животное по ID
@app.route('/api/animals/<int:animal_id>', methods=['GET'])
@login_required
def get_animal(animal_id):
    animal = db.get_animal(animal_id)
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    return jsonify({
        'id': animal[0], 'name': animal[1], 'species': animal[2],
        'arrival_date': animal[3], 'birth_date': animal[4], 'gender': animal[5],
        'enclosure': animal[6], 'health_status': animal[7], 'notes': animal[8]
    })

# Добавить новое животное (только vet)
@app.route('/api/animals', methods=['POST'])
@login_required
@role_required('vet')
def add_animal():
    data = request.json
    animal_id = db.add_animal(
        data['name'],
        data['species'],
        data.get('arrival_date', datetime.now().strftime('%Y-%m-%d')),
        data.get('birth_date'),
        data.get('gender'),
        data.get('enclosure'),
        data.get('notes')
    )
    return jsonify({'id': animal_id, 'message': 'Животное добавлено'}), 201

# Обновить данные животного (только vet)
@app.route('/api/animals/<int:animal_id>', methods=['PUT'])
@login_required
@role_required('vet')
def update_animal(animal_id):
    data = request.json
    
    animal = db.get_animal(animal_id)
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    
    success = db.update_animal(
        animal_id,
        data.get('name'),
        data.get('species'),
        data.get('arrival_date'),
        data.get('birth_date'),
        data.get('gender'),
        data.get('enclosure'),
        data.get('notes')
    )
    
    if success:
        return jsonify({'message': 'Данные животного обновлены'})
    return jsonify({'error': 'Ошибка при обновлении'}), 500

# Обновить только статус здоровья (только vet)
@app.route('/api/animals/<int:animal_id>/status', methods=['PUT'])
@login_required
@role_required('vet')
def update_animal_status(animal_id):
    data = request.json
    if not db.get_animal(animal_id):
        return jsonify({'error': 'Животное не найдено'}), 404
    db.update_animal_status(animal_id, data['status'])
    return jsonify({'message': 'Статус обновлён'})

# ==================== ОСМОТРЫ ====================

# Получить все осмотры животного
@app.route('/api/animals/<int:animal_id>/examinations', methods=['GET'])
@login_required
def get_examinations(animal_id):
    exams = db.get_animal_examinations(animal_id)
    result = []
    for e in exams:
        result.append({
            'id': e[0], 'animal_id': e[1], 'examination_date': e[2],
            'veterinarian': e[3], 'diagnosis': e[4], 'treatment': e[5], 'notes': e[6]
        })
    return jsonify(result)

# Добавить осмотр (только vet)
@app.route('/api/examinations', methods=['POST'])
@login_required
@role_required('vet')
def add_examination():
    data = request.json
    animal = db.get_animal(data['animal_id'])
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    exam_id = db.add_examination(
        data['animal_id'],
        data.get('examination_date', datetime.now().strftime('%Y-%m-%d %H:%M')),
        data['veterinarian'],
        data['diagnosis'],
        data['treatment'],
        data.get('notes')
    )
    return jsonify({'id': exam_id, 'message': 'Осмотр добавлен'}), 201

# ==================== ПРИВИВКИ ====================

# Получить все прививки животного
@app.route('/api/animals/<int:animal_id>/vaccinations', methods=['GET'])
@login_required
def get_vaccinations(animal_id):
    vaccines = db.get_animal_vaccinations(animal_id)
    result = []
    for v in vaccines:
        result.append({
            'id': v[0], 'animal_id': v[1], 'vaccination_date': v[2],
            'vaccine_name': v[3], 'veterinarian': v[4], 'next_due_date': v[5]
        })
    return jsonify(result)

# Добавить прививку (только vet)
@app.route('/api/vaccinations', methods=['POST'])
@login_required
@role_required('vet')
def add_vaccination():
    data = request.json
    animal = db.get_animal(data['animal_id'])
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    vacc_id = db.add_vaccination(
        data['animal_id'],
        data.get('vaccination_date', datetime.now().strftime('%Y-%m-%d')),
        data['vaccine_name'],
        data['veterinarian'],
        data.get('next_due_date')
    )
    return jsonify({'id': vacc_id, 'message': 'Прививка добавлена'}), 201

# ==================== РАЦИОНЫ ====================

# Получить все рационы животного
@app.route('/api/animals/<int:animal_id>/diets', methods=['GET'])
@login_required
def get_diets(animal_id):
    diets = db.get_animal_diets(animal_id)
    result = []
    for d in diets:
        result.append({
            'id': d[0], 'animal_id': d[1], 'diet_name': d[2], 'food_type': d[3],
            'quantity': d[4], 'schedule': d[5], 'start_date': d[6], 'end_date': d[7]
        })
    return jsonify(result)

# Добавить рацион (только vet)
@app.route('/api/diets', methods=['POST'])
@login_required
@role_required('vet')
def add_diet():
    data = request.json
    animal = db.get_animal(data['animal_id'])
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    diet_id = db.add_diet(
        data['animal_id'],
        data['diet_name'],
        data['food_type'],
        data['quantity'],
        data.get('schedule'),
        data.get('start_date', datetime.now().strftime('%Y-%m-%d')),
        data.get('end_date')
    )
    return jsonify({'id': diet_id, 'message': 'Рацион добавлен'}), 201

# Удалить рацион (только vet)
@app.route('/api/diets/<int:diet_id>', methods=['DELETE'])
@login_required
@role_required('vet')
def delete_diet(diet_id):
    """Удаление рациона по ID"""
    success = db.delete_diet(diet_id)
    if success:
        return jsonify({'message': 'Рацион удалён'})
    return jsonify({'error': 'Рацион не найден'}), 404

if __name__ == '__main__':
    print("🚀 VetZoo Control Server запускается...")
    print("🔐 Администратор по умолчанию: admin / admin")
    print("📡 API доступен по адресу: http://localhost:5000/api")
    print("🌐 Веб-интерфейс: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)