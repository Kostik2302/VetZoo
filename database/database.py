import sqlite3
from datetime import datetime

class Database:
    def __init__(self, db_name="vetzoo.db"):
        self.conn = sqlite3.connect(db_name, check_same_thread=False)
        self.cursor = self.conn.cursor()
        self.create_tables()
    
    def create_tables(self):
        # Таблица животных
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS animals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                species TEXT NOT NULL,
                arrival_date TEXT NOT NULL,
                birth_date TEXT,
                gender TEXT,
                enclosure TEXT,
                health_status TEXT DEFAULT 'здоров',
                notes TEXT
            )
        ''')
        
        # Таблица осмотров
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS examinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                examination_date TEXT NOT NULL,
                veterinarian TEXT NOT NULL,
                diagnosis TEXT,
                treatment TEXT,
                notes TEXT,
                FOREIGN KEY (animal_id) REFERENCES animals (id)
            )
        ''')
        
        # Таблица прививок
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS vaccinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                vaccination_date TEXT NOT NULL,
                vaccine_name TEXT NOT NULL,
                veterinarian TEXT NOT NULL,
                next_due_date TEXT,
                FOREIGN KEY (animal_id) REFERENCES animals (id)
            )
        ''')
        
        # Таблица рационов
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS diets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                animal_id INTEGER NOT NULL,
                diet_name TEXT NOT NULL,
                food_type TEXT NOT NULL,
                quantity TEXT NOT NULL,
                schedule TEXT,
                start_date TEXT NOT NULL,
                end_date TEXT,
                FOREIGN KEY (animal_id) REFERENCES animals (id)
            )
        ''')
        
        # Таблица пользователей
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT NOT NULL CHECK(role IN ('admin', 'vet', 'keeper')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        self.conn.commit()
    
    # ----- Животные -----
    def add_animal(self, name, species, arrival_date, birth_date=None, gender=None, enclosure=None, notes=None):
        self.cursor.execute('''
            INSERT INTO animals (name, species, arrival_date, birth_date, gender, enclosure, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (name, species, arrival_date, birth_date, gender, enclosure, notes))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_all_animals(self):
        self.cursor.execute('SELECT * FROM animals')
        return self.cursor.fetchall()
    
    def get_animal(self, animal_id):
        self.cursor.execute('SELECT * FROM animals WHERE id = ?', (animal_id,))
        return self.cursor.fetchone()
    
    def update_animal_status(self, animal_id, status):
        self.cursor.execute('UPDATE animals SET health_status = ? WHERE id = ?', (status, animal_id))
        self.conn.commit()

    def update_animal(self, animal_id, name=None, species=None, arrival_date=None, 
                  birth_date=None, gender=None, enclosure=None, notes=None):
        """Обновление информации о животном"""
        current = self.get_animal(animal_id)
        if not current:
            return False
        
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
        ''', (new_name, new_species, new_arrival, new_birth, 
            new_gender, new_enclosure, new_notes, animal_id))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    # ----- Осмотры -----
    def add_examination(self, animal_id, examination_date, veterinarian, diagnosis, treatment, notes=None):
        self.cursor.execute('''
            INSERT INTO examinations (animal_id, examination_date, veterinarian, diagnosis, treatment, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (animal_id, examination_date, veterinarian, diagnosis, treatment, notes))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_animal_examinations(self, animal_id):
        self.cursor.execute('SELECT * FROM examinations WHERE animal_id = ? ORDER BY examination_date DESC', (animal_id,))
        return self.cursor.fetchall()
    
    # ----- Прививки -----
    def add_vaccination(self, animal_id, vaccination_date, vaccine_name, veterinarian, next_due_date=None):
        self.cursor.execute('''
            INSERT INTO vaccinations (animal_id, vaccination_date, vaccine_name, veterinarian, next_due_date)
            VALUES (?, ?, ?, ?, ?)
        ''', (animal_id, vaccination_date, vaccine_name, veterinarian, next_due_date))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_animal_vaccinations(self, animal_id):
        self.cursor.execute('SELECT * FROM vaccinations WHERE animal_id = ? ORDER BY vaccination_date DESC', (animal_id,))
        return self.cursor.fetchall()
    
    # ----- Рационы -----
    def add_diet(self, animal_id, diet_name, food_type, quantity, schedule, start_date, end_date=None):
        self.cursor.execute('''
            INSERT INTO diets (animal_id, diet_name, food_type, quantity, schedule, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (animal_id, diet_name, food_type, quantity, schedule, start_date, end_date))
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
        self.cursor.execute('SELECT id, username, full_name, role, created_at FROM users')
        return self.cursor.fetchall()
    
    def delete_user(self, user_id):
        self.cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def update_user_role(self, user_id, new_role):
        self.cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
        self.conn.commit()
    
    def update_user_credentials(self, user_id, new_username=None, new_password_hash=None):
        if new_username:
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
        self.cursor.execute('UPDATE users SET full_name = ? WHERE id = ?', 
                        (new_full_name, user_id))
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def close(self):
        self.conn.close()