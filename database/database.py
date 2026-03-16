import sqlite3
from datetime import datetime

class Database:
    def __init__(self, db_name="vetzoo.db"):
        self.conn = sqlite3.connect(db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        self.create_tables()
        self.migrate_tables()
    
    def create_tables(self):
        # Таблица животных с ограничениями на уровне БД
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS animals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL CHECK(length(name) <= 100),
                species TEXT NOT NULL CHECK(length(species) <= 100),
                arrival_date TEXT NOT NULL,
                birth_date TEXT,
                gender TEXT CHECK(gender IN ('М', 'Ж', NULL)),
                enclosure TEXT CHECK(length(enclosure) <= 50),
                health_status TEXT DEFAULT 'здоров' 
                    CHECK(health_status IN ('здоров', 'болен', 'на лечении', 'карантин', 'снят с учета')),
                notes TEXT CHECK(length(notes) <= 1000)
            )
        ''')
        
        # Таблица осмотров
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS examinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                examination_date TEXT NOT NULL,
                veterinarian TEXT NOT NULL CHECK(length(veterinarian) <= 100),
                diagnosis TEXT CHECK(length(diagnosis) <= 500),
                treatment TEXT CHECK(length(treatment) <= 500),
                notes TEXT CHECK(length(notes) <= 1000),
                is_scheduled INTEGER DEFAULT 0 CHECK(is_scheduled IN (0, 1)),
                FOREIGN KEY (animal_id) REFERENCES animals (id) ON DELETE CASCADE
            )
        ''')
        
        # Таблица прививок
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS vaccinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                vaccination_date TEXT NOT NULL,
                vaccine_name TEXT NOT NULL CHECK(length(vaccine_name) <= 100),
                veterinarian TEXT NOT NULL CHECK(length(veterinarian) <= 100),
                next_due_date TEXT,
                is_scheduled INTEGER DEFAULT 0 CHECK(is_scheduled IN (0, 1)),
                FOREIGN KEY (animal_id) REFERENCES animals (id) ON DELETE CASCADE
            )
        ''')
        
        # Таблица рационов
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS diets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                diet_name TEXT NOT NULL CHECK(length(diet_name) <= 100),
                food_type TEXT NOT NULL CHECK(length(food_type) <= 100),
                quantity TEXT NOT NULL CHECK(length(quantity) <= 50),
                schedule TEXT CHECK(length(schedule) <= 200),
                start_date TEXT NOT NULL,
                end_date TEXT,
                FOREIGN KEY (animal_id) REFERENCES animals (id) ON DELETE CASCADE
            )
        ''')
        
        # Таблица пользователей
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL CHECK(length(username) <= 50),
                password_hash TEXT NOT NULL,
                full_name TEXT CHECK(length(full_name) <= 100),
                role TEXT NOT NULL CHECK(role IN ('admin', 'vet', 'keeper')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        self.conn.commit()
    
    def migrate_tables(self):
        try:
            self.cursor.execute("PRAGMA table_info(examinations)")
            columns = [column[1] for column in self.cursor.fetchall()]
            
            if 'is_scheduled' not in columns:
                print("📦 Добавляем колонку is_scheduled в таблицу examinations...")
                self.cursor.execute("ALTER TABLE examinations ADD COLUMN is_scheduled INTEGER DEFAULT 0")
                self.conn.commit()

            self.cursor.execute("PRAGMA table_info(vaccinations)")
            columns = [column[1] for column in self.cursor.fetchall()]
            
            if 'is_scheduled' not in columns:
                print("📦 Добавляем колонку is_scheduled в таблицу vaccinations...")
                self.cursor.execute("ALTER TABLE vaccinations ADD COLUMN is_scheduled INTEGER DEFAULT 0")
                self.conn.commit()
                
        except Exception as e:
            print(f"⚠️ Ошибка при миграции: {e}")
    
    # ----- Животные с валидацией -----
    def add_animal(self, name, species, arrival_date, birth_date=None, gender=None, enclosure=None, notes=None):
        # Проверка обязательных полей
        if not name or not species:
            raise ValueError("Имя и вид животного обязательны для заполнения")
        
        # Проверка длины строк
        if len(name) > 100:
            raise ValueError("Кличка не может быть длиннее 100 символов")
        
        if len(species) > 100:
            raise ValueError("Вид животного не может быть длиннее 100 символов")
        
        if enclosure and len(enclosure) > 50:
            raise ValueError("Название вольера не может быть длиннее 50 символов")
        
        if notes and len(notes) > 1000:
            raise ValueError("Примечания не могут быть длиннее 1000 символов")
        
        # Проверка дат
        today = datetime.now().date()
        
        if arrival_date:
            try:
                arrival = datetime.strptime(arrival_date, '%Y-%m-%d').date()
                if arrival > today:
                    raise ValueError("Дата прибытия не может быть в будущем")
            except ValueError:
                raise ValueError("Неверный формат даты прибытия. Используйте ГГГГ-ММ-ДД")
        
        if birth_date:
            try:
                birth = datetime.strptime(birth_date, '%Y-%m-%d').date()
                if birth > today:
                    raise ValueError("Дата рождения не может быть в будущем")
                
                if arrival_date and birth > datetime.strptime(arrival_date, '%Y-%m-%d').date():
                    raise ValueError("Дата рождения не может быть позже даты прибытия")
            except ValueError:
                raise ValueError("Неверный формат даты рождения. Используйте ГГГГ-ММ-ДД")
        
        # Проверка пола
        if gender and gender not in ['М', 'Ж']:
            raise ValueError("Пол должен быть 'М', 'Ж' или NULL")
        
        self.cursor.execute('''
            INSERT INTO animals (name, species, arrival_date, birth_date, gender, enclosure, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (name[:100], species[:100], arrival_date, birth_date, gender, 
              enclosure[:50] if enclosure else None, 
              notes[:1000] if notes else None))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_all_animals(self):
        self.cursor.execute('SELECT * FROM animals ORDER BY name')
        return self.cursor.fetchall()
    
    def get_animal(self, animal_id):
        self.cursor.execute('SELECT * FROM animals WHERE id = ?', (animal_id,))
        return self.cursor.fetchone()
    
    def update_animal_status(self, animal_id, status):
        valid_statuses = ['здоров', 'болен', 'на лечении', 'карантин', 'снят с учета']
        if status not in valid_statuses:
            raise ValueError("Недопустимый статус здоровья")
        
        self.cursor.execute('UPDATE animals SET health_status = ? WHERE id = ?', (status, animal_id))
        self.conn.commit()

    def update_animal(self, animal_id, name=None, species=None, arrival_date=None, 
                  birth_date=None, gender=None, enclosure=None, notes=None):
        """Обновление информации о животном с валидацией"""
        current = self.get_animal(animal_id)
        if not current:
            return False
        
        # Валидация как в add_animal
        if name is not None:
            if not name:
                raise ValueError("Имя животного не может быть пустым")
            if len(name) > 100:
                raise ValueError("Кличка не может быть длиннее 100 символов")
        
        if species is not None:
            if not species:
                raise ValueError("Вид животного не может быть пустым")
            if len(species) > 100:
                raise ValueError("Вид животного не может быть длиннее 100 символов")
        
        if enclosure is not None and len(enclosure) > 50:
            raise ValueError("Название вольера не может быть длиннее 50 символов")
        
        if notes is not None and len(notes) > 1000:
            raise ValueError("Примечания не могут быть длиннее 1000 символов")
        
        if gender is not None and gender not in ['М', 'Ж', '']:
            raise ValueError("Пол должен быть 'М', 'Ж' или пустым")
        
        # Проверка дат
        today = datetime.now().date()
        
        if arrival_date is not None:
            if arrival_date:
                try:
                    arrival = datetime.strptime(arrival_date, '%Y-%m-%d').date()
                    if arrival > today:
                        raise ValueError("Дата прибытия не может быть в будущем")
                except ValueError:
                    raise ValueError("Неверный формат даты прибытия. Используйте ГГГГ-ММ-ДД")
        
        if birth_date is not None:
            if birth_date:
                try:
                    birth = datetime.strptime(birth_date, '%Y-%m-%d').date()
                    if birth > today:
                        raise ValueError("Дата рождения не может быть в будущем")
                    
                    check_arrival = arrival_date if arrival_date is not None else current[3]
                    if check_arrival and birth > datetime.strptime(check_arrival, '%Y-%m-%d').date():
                        raise ValueError("Дата рождения не может быть позже даты прибытия")
                except ValueError:
                    raise ValueError("Неверный формат даты рождения. Используйте ГГГГ-ММ-ДД")
        
        new_name = name if name is not None else current[1]
        new_species = species if species is not None else current[2]
        new_arrival = arrival_date if arrival_date is not None else current[3]
        new_birth = birth_date if birth_date is not None else current[4]
        new_gender = gender if gender is not None else current[5]
        new_enclosure = enclosure if enclosure is not None else current[6]
        new_notes = notes if notes is not None else current[8]
        
        self.cursor.execute('''
            UPDATE animals 
            SET name = ?, species = ?, arrival_date = ?, birth_date = ?, 
                gender = ?, enclosure = ?, notes = ?
            WHERE id = ?
        ''', (new_name[:100] if new_name else None, 
              new_species[:100] if new_species else None, 
              new_arrival, 
              new_birth if new_birth else None, 
              new_gender if new_gender else None, 
              new_enclosure[:50] if new_enclosure else None, 
              new_notes[:1000] if new_notes else None, 
              animal_id))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    # ----- Осмотры -----
    def add_examination(self, animal_id, examination_date, veterinarian, diagnosis, treatment, notes=None, is_scheduled=0):
        # Проверка существования животного
        animal = self.get_animal(animal_id)
        if not animal:
            raise ValueError("Животное с указанным ID не найдено")
        
        # Валидация полей
        if not veterinarian or not diagnosis or not treatment:
            raise ValueError("Ветеринар, диагноз и лечение обязательны для заполнения")
        
        if len(veterinarian) > 100:
            raise ValueError("Имя ветеринара не может быть длиннее 100 символов")
        
        if len(diagnosis) > 500:
            raise ValueError("Диагноз не может быть длиннее 500 символов")
        
        if len(treatment) > 500:
            raise ValueError("Лечение не может быть длиннее 500 символов")
        
        if notes and len(notes) > 1000:
            raise ValueError("Примечания не могут быть длиннее 1000 символов")
        
        # Проверка даты
        if examination_date:
            try:
                # Проверка формата даты
                if 'T' in examination_date:
                    datetime.strptime(examination_date.split('T')[0], '%Y-%m-%d')
                elif ' ' in examination_date:
                    datetime.strptime(examination_date.split(' ')[0], '%Y-%m-%d')
                else:
                    datetime.strptime(examination_date, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Неверный формат даты осмотра")
        
        self.cursor.execute('''
            INSERT INTO examinations (animal_id, examination_date, veterinarian, diagnosis, treatment, notes, is_scheduled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (animal_id, examination_date, veterinarian[:100], diagnosis[:500], treatment[:500], 
              notes[:1000] if notes else None, is_scheduled))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_animal_examinations(self, animal_id):
        self.cursor.execute('SELECT * FROM examinations WHERE animal_id = ? ORDER BY examination_date DESC', (animal_id,))
        return self.cursor.fetchall()
    
    def complete_examination(self, exam_id):
        """Отметить осмотр как проведенный (снять статус запланированного)"""
        self.cursor.execute('UPDATE examinations SET is_scheduled = 0 WHERE id = ?', (exam_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def delete_examination(self, exam_id):
        """Удалить осмотр"""
        self.cursor.execute('DELETE FROM examinations WHERE id = ?', (exam_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    # ----- Прививки -----
    def add_vaccination(self, animal_id, vaccination_date, vaccine_name, veterinarian, next_due_date=None, is_scheduled=0):
        # Проверка существования животного
        animal = self.get_animal(animal_id)
        if not animal:
            raise ValueError("Животное с указанным ID не найдено")
        
        # Валидация полей
        if not vaccine_name or not veterinarian:
            raise ValueError("Название вакцины и ветеринар обязательны для заполнения")
        
        if len(vaccine_name) > 100:
            raise ValueError("Название вакцины не может быть длиннее 100 символов")
        
        if len(veterinarian) > 100:
            raise ValueError("Имя ветеринара не может быть длиннее 100 символов")
        
        # Проверка дат
        today = datetime.now().date()
        
        if vaccination_date:
            try:
                vac_date = datetime.strptime(vaccination_date, '%Y-%m-%d').date()
                if not is_scheduled and vac_date > today:
                    raise ValueError("Дата проведенной прививки не может быть в будущем")
            except ValueError:
                raise ValueError("Неверный формат даты прививки. Используйте ГГГГ-ММ-ДД")
        
        if next_due_date:
            try:
                next_date = datetime.strptime(next_due_date, '%Y-%m-%d').date()
                if vaccination_date and next_date <= datetime.strptime(vaccination_date, '%Y-%m-%d').date():
                    raise ValueError("Дата следующей прививки должна быть позже даты текущей")
            except ValueError:
                raise ValueError("Неверный формат даты следующей прививки. Используйте ГГГГ-ММ-ДД")
        
        self.cursor.execute('''
            INSERT INTO vaccinations (animal_id, vaccination_date, vaccine_name, veterinarian, next_due_date, is_scheduled)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (animal_id, vaccination_date, vaccine_name[:100], veterinarian[:100], next_due_date, is_scheduled))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_animal_vaccinations(self, animal_id):
        self.cursor.execute('SELECT * FROM vaccinations WHERE animal_id = ? ORDER BY vaccination_date DESC', (animal_id,))
        return self.cursor.fetchall()
    
    def complete_vaccination(self, vacc_id):
        """Отметить прививку как проведенную (снять статус запланированной)"""
        self.cursor.execute('UPDATE vaccinations SET is_scheduled = 0 WHERE id = ?', (vacc_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def delete_vaccination(self, vacc_id):
        """Удалить прививку"""
        self.cursor.execute('DELETE FROM vaccinations WHERE id = ?', (vacc_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    # ----- Рационы -----
    def add_diet(self, animal_id, diet_name, food_type, quantity, schedule, start_date, end_date=None):
        # Проверка существования животного
        animal = self.get_animal(animal_id)
        if not animal:
            raise ValueError("Животное с указанным ID не найдено")
        
        # Валидация полей
        if not diet_name or not food_type or not quantity:
            raise ValueError("Название рациона, тип корма и количество обязательны для заполнения")
        
        if len(diet_name) > 100:
            raise ValueError("Название рациона не может быть длиннее 100 символов")
        
        if len(food_type) > 100:
            raise ValueError("Тип корма не может быть длиннее 100 символов")
        
        if len(quantity) > 50:
            raise ValueError("Количество не может быть длиннее 50 символов")
        
        if schedule and len(schedule) > 200:
            raise ValueError("Расписание не может быть длиннее 200 символов")
        
        # Проверка дат
        today = datetime.now().date()
        
        if start_date:
            try:
                start = datetime.strptime(start_date, '%Y-%m-%d').date()
                if start > today:
                    raise ValueError("Дата начала не может быть в будущем")
            except ValueError:
                raise ValueError("Неверный формат даты начала. Используйте ГГГГ-ММ-ДД")
        
        if end_date:
            try:
                end = datetime.strptime(end_date, '%Y-%m-%d').date()
                if start_date and end <= datetime.strptime(start_date, '%Y-%m-%d').date():
                    raise ValueError("Дата окончания должна быть позже даты начала")
            except ValueError:
                raise ValueError("Неверный формат даты окончания. Используйте ГГГГ-ММ-ДД")
        
        self.cursor.execute('''
            INSERT INTO diets (animal_id, diet_name, food_type, quantity, schedule, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (animal_id, diet_name[:100], food_type[:100], quantity[:50], 
              schedule[:200] if schedule else None, start_date, end_date))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_animal_diets(self, animal_id):
        self.cursor.execute('SELECT * FROM diets WHERE animal_id = ? ORDER BY start_date DESC', (animal_id,))
        return self.cursor.fetchall()
    
    def delete_diet(self, diet_id):
        """Удаление рациона по ID"""
        self.cursor.execute('DELETE FROM diets WHERE id = ?', (diet_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    # ----- Пользователи -----
    def create_user(self, username, password_hash, role, full_name=None):
        try:
            # Валидация
            if not username or not password_hash or not role:
                raise ValueError("Имя пользователя, пароль и роль обязательны")
            
            if len(username) > 50:
                raise ValueError("Имя пользователя не может быть длиннее 50 символов")
            
            if full_name and len(full_name) > 100:
                raise ValueError("Полное имя не может быть длиннее 100 символов")
            
            if role not in ['admin', 'vet', 'keeper']:
                raise ValueError("Роль должна быть 'admin', 'vet' или 'keeper'")
            
            self.cursor.execute('''
                INSERT INTO users (username, password_hash, full_name, role)
                VALUES (?, ?, ?, ?)
            ''', (username, password_hash, full_name, role))
            self.conn.commit()
            return self.cursor.lastrowid
        except sqlite3.IntegrityError:
            return None
    
    def get_user_by_username(self, username):
        self.cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        return self.cursor.fetchone()
    
    def get_user(self, user_id):
        self.cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        return self.cursor.fetchone()
    
    def get_all_users(self):
        self.cursor.execute('SELECT id, username, full_name, role, created_at FROM users ORDER BY id')
        return self.cursor.fetchall()
    
    def delete_user(self, user_id):
        self.cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def update_user_role(self, user_id, new_role):
        if new_role not in ['admin', 'vet', 'keeper']:
            raise ValueError("Роль должна быть 'admin', 'vet' или 'keeper'")
        
        self.cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
        self.conn.commit()
    
    def update_user_credentials(self, user_id, new_username=None, new_password_hash=None):
        if new_username:
            if len(new_username) > 50:
                return False, "Имя пользователя не может быть длиннее 50 символов"
            
            existing = self.get_user_by_username(new_username)
            if existing and existing[0] != user_id:
                return False, "Логин уже занят"
            
            self.cursor.execute('UPDATE users SET username = ? WHERE id = ?', 
                               (new_username, user_id))
        
        if new_password_hash:
            self.cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', 
                               (new_password_hash, user_id))
        
        self.conn.commit()
        return True, "Данные обновлены"
    
    def update_user_fullname(self, user_id, new_full_name):
        if new_full_name and len(new_full_name) > 100:
            return False
        
        self.cursor.execute('UPDATE users SET full_name = ? WHERE id = ?', 
                        (new_full_name, user_id))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def close(self):
        self.conn.close()
