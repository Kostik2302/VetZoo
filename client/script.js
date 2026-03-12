const API_URL = 'http://localhost:5000/api';
let currentAnimalModal = null;
let currentAnimalId = null;

// Загрузка всех животных
async function loadAnimals() {
    try {
        const response = await fetch(`${API_URL}/animals`);
        const animals = await response.json();
        displayAnimals(animals);
    } catch (error) {
        alert('Ошибка загрузки: ' + error);
    }
}

// Отображение животных в карточках
function displayAnimals(animals) {
    const container = document.getElementById('animalsList');
    container.innerHTML = '';
    
    animals.forEach(animal => {
        const statusClass = `status-${animal.health_status}`.replace(' ', '-');
        
        const card = `
            <div class="col-md-4">
                <div class="card animal-card">
                    <div class="card-body">
                        <h5 class="card-title">${animal.name}</h5>
                        <h6 class="card-subtitle mb-2 text-muted">${animal.species}</h6>
                        <p class="card-text">
                            <small>Вольер: ${animal.enclosure || 'не указан'}</small><br>
                            <span class="status-badge ${statusClass}">${animal.health_status}</span>
                        </p>
                        <button class="btn btn-sm btn-primary" onclick="viewAnimal(${animal.id})">
                            Подробнее
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

// Просмотр деталей животного
async function viewAnimal(id) {
    try {
        currentAnimalId = id;
        
        // Загружаем информацию о животном
        const response = await fetch(`${API_URL}/animals/${id}`);
        const animal = await response.json();
        
        document.getElementById('viewAnimalTitle').textContent = `${animal.name} (${animal.species})`;
        document.getElementById('healthStatus').value = animal.health_status;
        
        // Отображаем информацию
        document.getElementById('animalInfo').innerHTML = `
            <p><strong>ID:</strong> ${animal.id}</p>
            <p><strong>Дата прибытия:</strong> ${animal.arrival_date}</p>
            <p><strong>Дата рождения:</strong> ${animal.birth_date || 'не указана'}</p>
            <p><strong>Пол:</strong> ${animal.gender || 'не указан'}</p>
            <p><strong>Вольер:</strong> ${animal.enclosure || 'не указан'}</p>
            <p><strong>Примечания:</strong> ${animal.notes || 'нет'}</p>
        `;
        
        // Загружаем осмотры
        await loadExaminations(id);
        
        // Загружаем прививки
        await loadVaccinations(id);
        
        // Сохраняем ID для модальных окон
        document.getElementById('examAnimalId').value = id;
        document.getElementById('vaccineAnimalId').value = id;
        
        // Показываем модальное окно
        if (currentAnimalModal) {
            currentAnimalModal.hide();
        }
        currentAnimalModal = new bootstrap.Modal(document.getElementById('viewAnimalModal'));
        currentAnimalModal.show();
    } catch (error) {
        alert('Ошибка загрузки: ' + error);
    }
}

// Загрузка осмотров
async function loadExaminations(animalId) {
    const response = await fetch(`${API_URL}/animals/${animalId}/examinations`);
    const exams = await response.json();
    
    const container = document.getElementById('examsList');
    if (exams.length === 0) {
        container.innerHTML = '<p class="text-muted">Осмотров нет</p>';
        return;
    }
    
    container.innerHTML = exams.map(exam => `
        <div class="timeline-item">
            <div class="timeline-date">${exam.examination_date}</div>
            <div><strong>Ветеринар:</strong> ${exam.veterinarian}</div>
            <div><strong>Диагноз:</strong> ${exam.diagnosis}</div>
            <div><strong>Лечение:</strong> ${exam.treatment}</div>
            ${exam.notes ? `<div><small>${exam.notes}</small></div>` : ''}
        </div>
    `).join('');
}

// Загрузка прививок
async function loadVaccinations(animalId) {
    const response = await fetch(`${API_URL}/animals/${animalId}/vaccinations`);
    const vaccines = await response.json();
    
    const container = document.getElementById('vaccinesList');
    if (vaccines.length === 0) {
        container.innerHTML = '<p class="text-muted">Прививок нет</p>';
        return;
    }
    
    container.innerHTML = vaccines.map(v => `
        <div class="timeline-item">
            <div class="timeline-date">${v.vaccination_date}</div>
            <div><strong>Вакцина:</strong> ${v.vaccine_name}</div>
            <div><strong>Ветеринар:</strong> ${v.veterinarian}</div>
            ${v.next_due_date ? `<div><strong>Следующая:</strong> ${v.next_due_date}</div>` : ''}
        </div>
    `).join('');
}

// Добавление животного
async function addAnimal() {
    const data = {
        name: document.getElementById('animalName').value,
        species: document.getElementById('animalSpecies').value,
        arrival_date: document.getElementById('arrivalDate').value,
        gender: document.getElementById('gender').value,
        enclosure: document.getElementById('enclosure').value,
        notes: document.getElementById('notes').value
    };
    
    try {
        const response = await fetch(`${API_URL}/animals`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addAnimalModal'));
            modal.hide();
            loadAnimals();
            document.getElementById('addAnimalForm').reset();
            
            // Убираем затемнение
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Обновление статуса - ИСПРАВЛЕНО!
async function updateStatus() {
    if (!currentAnimalId) return;
    
    const status = document.getElementById('healthStatus').value;
    
    try {
        const response = await fetch(`${API_URL}/animals/${currentAnimalId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: status})
        });
        
        if (response.ok) {
            // Обновляем информацию в текущем модальном окне
            await viewAnimal(currentAnimalId);
            
            // Обновляем список животных на главной
            await loadAnimals();
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Показать форму добавления осмотра
function showAddExamForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addExamModal')).show();
    }, 300);
}

// Добавление осмотра
async function addExamination() {
    const data = {
        animal_id: parseInt(document.getElementById('examAnimalId').value),
        veterinarian: document.getElementById('veterinarian').value,
        diagnosis: document.getElementById('diagnosis').value,
        treatment: document.getElementById('treatment').value,
        examination_date: document.getElementById('examDate').value
    };
    
    try {
        const response = await fetch(`${API_URL}/examinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addExamModal'));
            modal.hide();
            
            // Убираем затемнение
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            // Возвращаемся к карточке животного
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Показать форму добавления прививки
function showAddVaccineForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addVaccineModal')).show();
    }, 300);
}

// Добавление прививки
async function addVaccination() {
    const data = {
        animal_id: parseInt(document.getElementById('vaccineAnimalId').value),
        vaccine_name: document.getElementById('vaccineName').value,
        veterinarian: document.getElementById('vaccineVeterinarian').value,
        vaccination_date: document.getElementById('vaccineDate').value,
        next_due_date: document.getElementById('nextVaccineDate').value
    };
    
    try {
        const response = await fetch(`${API_URL}/vaccinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addVaccineModal'));
            modal.hide();
            
            // Убираем затемнение
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            // Возвращаемся к карточке животного
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Добавляем обработчик закрытия модальных окон
document.addEventListener('hidden.bs.modal', function (event) {
    // Убираем затемнение при закрытии любого модального окна
    document.body.classList.remove('modal-open');
    document.querySelector('.modal-backdrop')?.remove();
});

// Загружаем животных при старте
document.addEventListener('DOMContentLoaded', loadAnimals);