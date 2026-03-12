from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from database import Database
from datetime import datetime
import os

app = Flask(__name__, static_folder='../client', static_url_path='')
CORS(app)
db = Database()

# Главная страница - сайт
@app.route('/')
def index():
    return send_from_directory('../client', 'index.html')

# Статические файлы сайта
@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('../client', path)

# API endpoints (такие же как были)
@app.route('/api/animals', methods=['GET'])
def get_animals():
    animals = db.get_all_animals()
    result = []
    for a in animals:
        result.append({
            'id': a[0],
            'name': a[1],
            'species': a[2],
            'arrival_date': a[3],
            'birth_date': a[4],
            'gender': a[5],
            'enclosure': a[6],
            'health_status': a[7],
            'notes': a[8]
        })
    return jsonify(result)

@app.route('/api/animals/<int:animal_id>', methods=['GET'])
def get_animal(animal_id):
    animal = db.get_animal(animal_id)
    if not animal:
        return jsonify({'error': 'Животное не найдено'}), 404
    
    return jsonify({
        'id': animal[0],
        'name': animal[1],
        'species': animal[2],
        'arrival_date': animal[3],
        'birth_date': animal[4],
        'gender': animal[5],
        'enclosure': animal[6],
        'health_status': animal[7],
        'notes': animal[8]
    })

@app.route('/api/animals', methods=['POST'])
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
    return jsonify({'id': animal_id, 'message': 'Животное добавлено'})

@app.route('/api/animals/<int:animal_id>/status', methods=['PUT'])
def update_animal_status(animal_id):
    data = request.json
    db.update_animal_status(animal_id, data['status'])
    return jsonify({'message': 'Статус обновлен'})

@app.route('/api/animals/<int:animal_id>/examinations', methods=['GET'])
def get_examinations(animal_id):
    exams = db.get_animal_examinations(animal_id)
    result = []
    for e in exams:
        result.append({
            'id': e[0],
            'animal_id': e[1],
            'examination_date': e[2],
            'veterinarian': e[3],
            'diagnosis': e[4],
            'treatment': e[5],
            'notes': e[6]
        })
    return jsonify(result)

@app.route('/api/examinations', methods=['POST'])
def add_examination():
    data = request.json
    exam_id = db.add_examination(
        data['animal_id'],
        data.get('examination_date', datetime.now().strftime('%Y-%m-%d %H:%M')),
        data['veterinarian'],
        data['diagnosis'],
        data['treatment'],
        data.get('notes')
    )
    return jsonify({'id': exam_id, 'message': 'Осмотр добавлен'})

@app.route('/api/animals/<int:animal_id>/vaccinations', methods=['GET'])
def get_vaccinations(animal_id):
    vaccines = db.get_animal_vaccinations(animal_id)
    result = []
    for v in vaccines:
        result.append({
            'id': v[0],
            'animal_id': v[1],
            'vaccination_date': v[2],
            'vaccine_name': v[3],
            'veterinarian': v[4],
            'next_due_date': v[5]
        })
    return jsonify(result)

@app.route('/api/vaccinations', methods=['POST'])
def add_vaccination():
    data = request.json
    vacc_id = db.add_vaccination(
        data['animal_id'],
        data.get('vaccination_date', datetime.now().strftime('%Y-%m-%d')),
        data['vaccine_name'],
        data['veterinarian'],
        data.get('next_due_date')
    )
    return jsonify({'id': vacc_id, 'message': 'Прививка добавлена'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)