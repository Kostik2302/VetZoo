import sys
import os
from flask import Flask, request, jsonify, render_template, redirect, url_for, flash
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from functools import wraps

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.database import Database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            static_folder=os.path.join(BASE_DIR, '../client'),
            static_url_path='',
            template_folder=os.path.join(BASE_DIR, 'templates'))
app.secret_key = 'super-secret-key-vetzoo'
CORS(app, supports_credentials=True, origins=['http://localhost:5000'])

db = Database()
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

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

def create_default_admin():
    admin = db.get_user_by_username('admin')
    if not admin:
        pwd_hash = generate_password_hash('admin')
        db.create_user('admin', pwd_hash, 'admin', 'Default Admin')
        print("✅ Администратор по умолчанию создан: admin / admin")

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

@app.route('/reports')
@login_required
@role_required('admin', 'vet')
def reports_panel():
    return render_template('reports.html')

@app.route('/api/me', methods=['GET'])
@login_required
def get_current_user():
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'role': current_user.role,
        'full_name': current_user.full_name
    })

@app.route('/api/user/change-credentials', methods=['PUT'])
@login_required
def change_credentials():
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
    data = request.json
    new_full_name = data.get('full_name')
    
    if not new_full_name:
        return jsonify({'error': 'Полное имя не может быть пустым'}), 400
    
    success = db.update_user_fullname(user_id, new_full_name)
    if success:
        return jsonify({'message': 'Полное имя обновлено'})
    return jsonify({'error': 'Пользователь не найден'}), 404

@app.route('/api/animals', methods=['GET'])
@login_required
def get_animals():
    try:
        animals = db.get_all_animals()
        result = []
        for a in animals:
            result.append({
                'id': a[0], 'name': a[1], 'species': a[2], 'arrival_date': a[3],
                'birth_date': a[4], 'gender': a[5], 'enclosure': a[6],
                'health_status': a[7], 'notes': a[8]
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>', methods=['GET'])
@login_required
def get_animal(animal_id):
    try:
        animal = db.get_animal(animal_id)
        if not animal:
            return jsonify({'error': 'Животное не найдено'}), 404
        return jsonify({
            'id': animal[0], 'name': animal[1], 'species': animal[2],
            'arrival_date': animal[3], 'birth_date': animal[4], 'gender': animal[5],
            'enclosure': animal[6], 'health_status': animal[7], 'notes': animal[8]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals', methods=['POST'])
@login_required
@role_required('vet')
def add_animal():
    try:
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>', methods=['PUT'])
@login_required
@role_required('vet')
def update_animal(animal_id):
    try:
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>/status', methods=['PUT'])
@login_required
@role_required('vet')
def update_animal_status(animal_id):
    try:
        data = request.json
        if not db.get_animal(animal_id):
            return jsonify({'error': 'Животное не найдено'}), 404
        db.update_animal_status(animal_id, data['status'])
        return jsonify({'message': 'Статус обновлён'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>/examinations', methods=['GET'])
@login_required
def get_examinations(animal_id):
    try:
        exams = db.get_animal_examinations(animal_id)
        result = []
        for e in exams:
            is_scheduled = 0
            if len(e) > 7:
                is_scheduled = e[7] if e[7] is not None else 0
                
            result.append({
                'id': e[0], 
                'animal_id': e[1], 
                'examination_date': e[2],
                'veterinarian': e[3], 
                'diagnosis': e[4], 
                'treatment': e[5], 
                'notes': e[6],
                'is_scheduled': is_scheduled
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/examinations', methods=['POST'])
@login_required
@role_required('vet')
def add_examination():
    try:
        data = request.json
        animal = db.get_animal(data['animal_id'])
        if not animal:
            return jsonify({'error': 'Животное не найдено'}), 404
        
        is_scheduled = data.get('is_scheduled', False)
        
        exam_id = db.add_examination(
            data['animal_id'],
            data.get('examination_date', datetime.now().strftime('%Y-%m-%d %H:%M')),
            data['veterinarian'],
            data['diagnosis'],
            data['treatment'],
            data.get('notes'),
            1 if is_scheduled else 0
        )
        return jsonify({'id': exam_id, 'message': 'Осмотр добавлен'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/examinations/<int:exam_id>/complete', methods=['PUT'])
@login_required
@role_required('vet')
def complete_examination(exam_id):
    try:
        success = db.complete_examination(exam_id)
        if success:
            return jsonify({'message': 'Осмотр отмечен как проведенный'})
        return jsonify({'error': 'Осмотр не найден'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/examinations/<int:exam_id>', methods=['DELETE'])
@login_required
@role_required('vet')
def delete_examination(exam_id):
    try:
        success = db.delete_examination(exam_id)
        if success:
            return jsonify({'message': 'Осмотр удален'})
        return jsonify({'error': 'Осмотр не найден'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>/vaccinations', methods=['GET'])
@login_required
def get_vaccinations(animal_id):
    try:
        vaccines = db.get_animal_vaccinations(animal_id)
        result = []
        for v in vaccines:
            is_scheduled = 0
            if len(v) > 6:
                is_scheduled = v[6] if v[6] is not None else 0
                
            result.append({
                'id': v[0], 
                'animal_id': v[1], 
                'vaccination_date': v[2],
                'vaccine_name': v[3], 
                'veterinarian': v[4], 
                'next_due_date': v[5],
                'is_scheduled': is_scheduled
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vaccinations', methods=['POST'])
@login_required
@role_required('vet')
def add_vaccination():
    try:
        data = request.json
        animal = db.get_animal(data['animal_id'])
        if not animal:
            return jsonify({'error': 'Животное не найдено'}), 404
        
        is_scheduled = data.get('is_scheduled', False)
        
        vacc_id = db.add_vaccination(
            data['animal_id'],
            data.get('vaccination_date', datetime.now().strftime('%Y-%m-%d')),
            data['vaccine_name'],
            data['veterinarian'],
            data.get('next_due_date'),
            1 if is_scheduled else 0
        )
        return jsonify({'id': vacc_id, 'message': 'Прививка добавлена'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vaccinations/<int:vacc_id>/complete', methods=['PUT'])
@login_required
@role_required('vet')
def complete_vaccination(vacc_id):
    try:
        success = db.complete_vaccination(vacc_id)
        if success:
            return jsonify({'message': 'Прививка отмечена как проведенная'})
        return jsonify({'error': 'Прививка не найдена'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vaccinations/<int:vacc_id>', methods=['DELETE'])
@login_required
@role_required('vet')
def delete_vaccination(vacc_id):
    try:
        success = db.delete_vaccination(vacc_id)
        if success:
            return jsonify({'message': 'Прививка удалена'})
        return jsonify({'error': 'Прививка не найдена'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>/diets', methods=['GET'])
@login_required
def get_diets(animal_id):
    try:
        diets = db.get_animal_diets(animal_id)
        result = []
        for d in diets:
            result.append({
                'id': d[0], 'animal_id': d[1], 'diet_name': d[2], 'food_type': d[3],
                'quantity': d[4], 'schedule': d[5], 'start_date': d[6], 'end_date': d[7]
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/diets', methods=['POST'])
@login_required
@role_required('vet')
def add_diet():
    try:
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/diets/<int:diet_id>', methods=['DELETE'])
@login_required
@role_required('vet')
def delete_diet(diet_id):
    try:
        success = db.delete_diet(diet_id)
        if success:
            return jsonify({'message': 'Рацион удалён'})
        return jsonify({'error': 'Рацион не найден'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/animals/<int:animal_id>/upcoming-procedures', methods=['GET'])
@login_required
def get_animal_upcoming_procedures(animal_id):
    try:
        animal = db.get_animal(animal_id)
        if not animal:
            return jsonify({'error': 'Животное не найдено'}), 404
        
        result = []
        today = datetime.now().date()

        animal_name = animal[1]
        animal_species = animal[2]
        
        # Обработка осмотров
        exams = db.get_animal_examinations(animal_id)
        
        for exam in exams:
            try:
                is_scheduled = 0
                if len(exam) > 7 and exam[7] is not None:
                    is_scheduled = exam[7]

                exam_date_str = exam[2]
                if 'T' in exam_date_str:
                    exam_date_str = exam_date_str.split('T')[0]
                elif ' ' in exam_date_str:
                    exam_date_str = exam_date_str.split(' ')[0]
                
                print(f"Осмотр ID {exam[0]}, is_scheduled: {is_scheduled}, дата: {exam_date_str}")

                if is_scheduled == 1:
                    exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d').date()
                    days_until = (exam_date - today).days
                    
                    description = f'{exam[4]}'
                    if days_until < 0:
                        description += f" (просрочен на {abs(days_until)} дн.)"
                    
                    result.append({
                        'type': 'examination',
                        'date': exam[2],
                        'description': description,
                        'animal_id': animal_id,
                        'animal_name': animal_name,
                        'animal_species': animal_species,
                        'is_scheduled': True,
                        'procedure_id': exam[0],
                        'days_until': days_until,
                        'status': 'scheduled'
                    })
                    print(f"Добавлен запланированный осмотр в результат")
            except Exception as e:
                print(f"Ошибка обработки осмотра: {e}")
                pass
        
        # Обработка прививок
        vaccines = db.get_animal_vaccinations(animal_id)
        print(f"Найдено прививок: {len(vaccines)}")
        
        for vaccine in vaccines:
            try:
                is_scheduled = 0
                if len(vaccine) > 6 and vaccine[6] is not None:
                    is_scheduled = vaccine[6]
                
                if is_scheduled == 1:
                    try:
                        vaccine_date_str = vaccine[2]
                        if 'T' in vaccine_date_str:
                            vaccine_date_str = vaccine_date_str.split('T')[0]
                        
                        planned_date = datetime.strptime(vaccine_date_str, '%Y-%m-%d').date()
                        days_until = (planned_date - today).days
                        
                        description = f'{vaccine[3]} (запланирована)'
                        if days_until < 0:
                            description += f" ⚠️ просрочена на {abs(days_until)} дн."
                        
                        result.append({
                            'type': 'vaccination',
                            'date': vaccine[2],
                            'description': description,
                            'animal_id': animal_id,
                            'animal_name': animal_name,
                            'animal_species': animal_species,
                            'is_scheduled': True,
                            'procedure_id': vaccine[0],
                            'days_until': days_until,
                            'status': 'scheduled'
                        })
                    except Exception as e:
                        print(f"Ошибка обработки запланированной прививки: {e}")
                        pass
                else:
                    if vaccine[5]:
                        try:
                            due_date_str = vaccine[5]
                            if 'T' in due_date_str:
                                due_date_str = due_date_str.split('T')[0]
                            
                            due_date = datetime.strptime(due_date_str, '%Y-%m-%d').date()
                            days_until = (due_date - today).days
                            
                            if days_until >= -30:
                                description = f'Ревакцинация: {vaccine[3]}'
                                if days_until < 0:
                                    description += f" ⚠️ просрочена на {abs(days_until)} дн."
                                
                                result.append({
                                    'type': 'vaccination',
                                    'date': vaccine[5],
                                    'description': description,
                                    'animal_id': animal_id,
                                    'animal_name': animal_name,
                                    'animal_species': animal_species,
                                    'is_scheduled': False,
                                    'procedure_id': vaccine[0],
                                    'days_until': days_until,
                                    'status': 'upcoming' if days_until > 0 else 'overdue'
                                })
                        except Exception as e:
                            print(f"Ошибка обработки ревакцинации: {e}")
                            pass
            except Exception as e:
                print(f"Ошибка обработки прививки: {e}")
                pass
        
        print(f"Итоговый результат: {len(result)} процедур")
        result.sort(key=lambda x: x['date'])
        return jsonify(result)
    except Exception as e:
        print(f"Ошибка в get_animal_upcoming_procedures: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/schedule/upcoming', methods=['GET'])
@login_required
def get_upcoming_schedule():
    try:
        animals = db.get_all_animals()
        result = []
        today = datetime.now().date()
        
        for animal in animals:
            animal_id = animal[0]
            animal_name = animal[1]
            animal_species = animal[2]
            
            # Обработка осмотров
            exams = db.get_animal_examinations(animal_id)
            for exam in exams:
                try:
                    is_scheduled = 0
                    if len(exam) > 7 and exam[7] is not None:
                        is_scheduled = exam[7]

                    exam_date_str = exam[2]
                    if 'T' in exam_date_str:
                        exam_date_str = exam_date_str.split('T')[0]
                    elif ' ' in exam_date_str:
                        exam_date_str = exam_date_str.split(' ')[0]

                    if is_scheduled == 1:
                        exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d').date()
                        days_until = (exam_date - today).days
                        
                        description = f'{exam[4]}'
                        if days_until < 0:
                            description += f" (просрочен на {abs(days_until)} дн.)"
                        
                        result.append({
                            'type': 'examination',
                            'date': exam[2],
                            'description': description,
                            'animal_id': animal_id,
                            'animal_name': animal_name,
                            'animal_species': animal_species,
                            'is_scheduled': True,
                            'procedure_id': exam[0],
                            'days_until': days_until
                        })
                except Exception as e:
                    print(f"Ошибка обработки осмотра: {e}")
                    pass
            
            # Обработка прививок
            vaccines = db.get_animal_vaccinations(animal_id)
            for vaccine in vaccines:
                try:
                    is_scheduled = 0
                    if len(vaccine) > 6 and vaccine[6] is not None:
                        is_scheduled = vaccine[6]
                    
                    if is_scheduled == 1:
                        try:
                            vaccine_date_str = vaccine[2]
                            if 'T' in vaccine_date_str:
                                vaccine_date_str = vaccine_date_str.split('T')[0]
                            
                            planned_date = datetime.strptime(vaccine_date_str, '%Y-%m-%d').date()
                            days_until = (planned_date - today).days
                            
                            description = f'Вакцинация: {vaccine[3]} (запланирована)'
                            if days_until < 0:
                                description += f" ⚠️ Просрочена на {abs(days_until)} дн."
                            
                            result.append({
                                'type': 'vaccination',
                                'date': vaccine[2],
                                'description': description,
                                'animal_id': animal_id,
                                'animal_name': animal_name,
                                'animal_species': animal_species,
                                'is_scheduled': True,
                                'procedure_id': vaccine[0],
                                'days_until': days_until
                            })
                        except Exception as e:
                            print(f"Ошибка обработки запланированной прививки: {e}")
                            pass
                    else:
                        if vaccine[5]:
                            try:
                                due_date_str = vaccine[5]
                                if 'T' in due_date_str:
                                    due_date_str = due_date_str.split('T')[0]
                                
                                due_date = datetime.strptime(due_date_str, '%Y-%m-%d').date()
                                days_until = (due_date - today).days
                                
                                description = f'Ревакцинация: {vaccine[3]}'
                                if days_until < 0:
                                    description += f" ⚠️ Просрочена на {abs(days_until)} дн."
                                
                                result.append({
                                    'type': 'vaccination',
                                    'date': vaccine[5],
                                    'description': description,
                                    'animal_id': animal_id,
                                    'animal_name': animal_name,
                                    'animal_species': animal_species,
                                    'is_scheduled': False,
                                    'procedure_id': vaccine[0],
                                    'days_until': days_until
                                })
                            except Exception as e:
                                print(f"Ошибка обработки ревакцинации: {e}")
                                pass
                except Exception as e:
                    print(f"Ошибка обработки прививки: {e}")
                    pass
        
        result.sort(key=lambda x: x['date'])
        return jsonify(result)
    except Exception as e:
        print(f"Ошибка в get_upcoming_schedule: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/reminders', methods=['GET'])
@login_required
def get_reminders():
    try:
        animals = db.get_all_animals()
        reminders = []
        today = datetime.now().date()
        
        for animal in animals:
            animal_id = animal[0]
            animal_name = animal[1]
            animal_species = animal[2]
            
            vaccines = db.get_animal_vaccinations(animal_id)
            for vaccine in vaccines:
                is_scheduled = vaccine[6] if len(vaccine) > 6 and vaccine[6] == 1 else 0
                
                if is_scheduled:
                    try:
                        planned_date = datetime.strptime(vaccine[2], '%Y-%m-%d').date()
                        days_until = (planned_date - today).days
                        
                        if -3 <= days_until <= 7:
                            reminders.append({
                                'type': 'vaccination',
                                'date': vaccine[2],
                                'description': f'Запланированная прививка: {vaccine[3]}',
                                'animal_id': animal_id,
                                'animal_name': animal_name,
                                'animal_species': animal_species,
                                'days_until': days_until,
                                'is_scheduled': True
                            })
                    except:
                        pass
                else:
                    if vaccine[5]:
                        try:
                            due_date = datetime.strptime(vaccine[5], '%Y-%m-%d').date()
                            days_until = (due_date - today).days
                            
                            if days_until <= 7:
                                reminders.append({
                                    'type': 'vaccination',
                                    'date': vaccine[5],
                                    'description': f'Прививка: {vaccine[3]}',
                                    'animal_id': animal_id,
                                    'animal_name': animal_name,
                                    'animal_species': animal_species,
                                    'days_until': days_until,
                                    'is_scheduled': False
                                })
                        except:
                            pass
            
            exams = db.get_animal_examinations(animal_id)
            for exam in exams:
                try:
                    exam_date = datetime.strptime(exam[2].split()[0], '%Y-%m-%d').date()
                    days_until = (exam_date - today).days
                    if -3 <= days_until <= 7:
                        is_scheduled = exam[7] if len(exam) > 7 and exam[7] == 1 else 0
                        reminders.append({
                            'type': 'examination',
                            'date': exam[2],
                            'description': f'Осмотр: {exam[4]}',
                            'animal_id': animal_id,
                            'animal_name': animal_name,
                            'animal_species': animal_species,
                            'days_until': days_until,
                            'is_scheduled': is_scheduled
                        })
                except:
                    pass
        
        reminders.sort(key=lambda x: (x['days_until'] > 0, x['days_until']))
        return jsonify(reminders)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/health-status', methods=['GET'])
@login_required
@role_required('admin', 'vet')
def get_health_status_report():
    try:
        animals = db.get_all_animals()
        
        status_counts = {}
        species_stats = {}
        
        for animal in animals:
            status = animal[7]
            species = animal[2]
            
            status_counts[status] = status_counts.get(status, 0) + 1
            
            if species not in species_stats:
                species_stats[species] = {'total': 0, 'statuses': {}}
            species_stats[species]['total'] += 1
            species_stats[species]['statuses'][status] = species_stats[species]['statuses'].get(status, 0) + 1
        
        return jsonify({
            'total_animals': len(animals),
            'status_counts': status_counts,
            'species_stats': species_stats
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/vaccinations', methods=['GET'])
@login_required
@role_required('admin', 'vet')
def get_vaccination_report():
    try:
        animals = db.get_all_animals()
        today = datetime.now().date()
        
        report = {
            'total_vaccinations': 0,
            'upcoming_vaccinations': 0,
            'overdue_vaccinations': 0,
            'vaccines_by_type': {},
            'animals_without_vaccinations': [],
            'vaccination_coverage': 0,
            'vaccinations_by_month': {},
            'scheduled_vaccinations': 0
        }
        
        animals_with_vaccines = 0
        
        for animal in animals:
            animal_id = animal[0]
            animal_name = animal[1]
            animal_species = animal[2]
            
            vaccines = db.get_animal_vaccinations(animal_id)
            
            if vaccines:
                animals_with_vaccines += 1
                report['total_vaccinations'] += len(vaccines)
                
                for vaccine in vaccines:
                    vaccine_name = vaccine[3]
                    report['vaccines_by_type'][vaccine_name] = report['vaccines_by_type'].get(vaccine_name, 0) + 1
                    
                    is_scheduled = vaccine[6] if len(vaccine) > 6 and vaccine[6] == 1 else 0
                    
                    if vaccine[5] and not is_scheduled:
                        try:
                            due_date = datetime.strptime(vaccine[5], '%Y-%m-%d').date()
                            if due_date < today:
                                report['overdue_vaccinations'] += 1
                            elif due_date <= today + timedelta(days=30):
                                report['upcoming_vaccinations'] += 1
                        except:
                            pass
                    
                    if not is_scheduled:
                        try:
                            vac_date = datetime.strptime(vaccine[2], '%Y-%m-%d').date()
                            month_key = vac_date.strftime('%Y-%m')
                            report['vaccinations_by_month'][month_key] = report['vaccinations_by_month'].get(month_key, 0) + 1
                        except:
                            pass
                    
                    if is_scheduled:
                        report['scheduled_vaccinations'] += 1
            else:
                report['animals_without_vaccinations'].append({
                    'id': animal_id,
                    'name': animal_name,
                    'species': animal_species
                })
        
        if animals:
            report['vaccination_coverage'] = round((animals_with_vaccines / len(animals)) * 100, 2)
        
        return jsonify(report)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/examinations', methods=['GET'])
@login_required
@role_required('admin', 'vet')
def get_examinations_report():
    try:
        animals = db.get_all_animals()
        today = datetime.now().date()
        three_months_ago = today - timedelta(days=90)
        
        report = {
            'total_examinations': 0,
            'examinations_by_vet': {},
            'common_diagnoses': {},
            'animals_without_examinations': [],
            'recent_examinations': 0,
            'examinations_by_month': {},
            'scheduled_examinations': 0
        }
        
        animals_with_exams = 0
        
        for animal in animals:
            animal_id = animal[0]
            animal_name = animal[1]
            animal_species = animal[2]
            
            exams = db.get_animal_examinations(animal_id)
            
            if exams:
                animals_with_exams += 1
                report['total_examinations'] += len(exams)
                
                for exam in exams:
                    vet = exam[3]
                    diagnosis = exam[4]
                    
                    is_scheduled = exam[7] if len(exam) > 7 and exam[7] == 1 else 0
                    
                    try:
                        exam_date = datetime.strptime(exam[2].split()[0], '%Y-%m-%d').date()
                        
                        report['examinations_by_vet'][vet] = report['examinations_by_vet'].get(vet, 0) + 1
                        report['common_diagnoses'][diagnosis] = report['common_diagnoses'].get(diagnosis, 0) + 1
                        
                        if not is_scheduled and exam_date >= three_months_ago:
                            report['recent_examinations'] += 1
                        
                        if not is_scheduled:
                            month_key = exam_date.strftime('%Y-%m')
                            report['examinations_by_month'][month_key] = report['examinations_by_month'].get(month_key, 0) + 1
                        
                        if is_scheduled:
                            report['scheduled_examinations'] += 1
                    except Exception as e:
                        pass
            else:
                report['animals_without_examinations'].append({
                    'id': animal_id,
                    'name': animal_name,
                    'species': animal_species
                })
        
        sorted_diagnoses = sorted(report['common_diagnoses'].items(), key=lambda x: x[1], reverse=True)[:10]
        report['common_diagnoses'] = dict(sorted_diagnoses)
        
        return jsonify(report)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/export', methods=['POST'])
@login_required
@role_required('admin', 'vet')
def export_report():
    try:
        data = request.json
        report_type = data.get('type')
        format = data.get('format', 'json')
        
        if report_type == 'health':
            report_data = get_health_status_report().json
        elif report_type == 'vaccinations':
            report_data = get_vaccination_report().json
        elif report_type == 'examinations':
            report_data = get_examinations_report().json
        else:
            return jsonify({'error': 'Неверный тип отчета'}), 400
        
        if format == 'json':
            return jsonify(report_data)
        elif format == 'csv':
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.writer(output)
            
            if report_type == 'health':
                writer.writerow(['Статус', 'Количество'])
                for status, count in report_data['status_counts'].items():
                    writer.writerow([status, count])
            
            return output.getvalue(), 200, {'Content-Type': 'text/csv'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    create_default_admin()
    print("🚀 VetZoo Control Server запускается...")
    print("🔐 Администратор по умолчанию: admin / admin")
    print("📡 API доступен по адресу: http://localhost:5000/api")
    print("🌐 Веб-интерфейс: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)