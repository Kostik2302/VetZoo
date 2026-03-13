const API_URL = 'http://localhost:5000/api';
let currentAnimalModal = null;
let currentAnimalId = null;
let currentUserRole = null;

// Функция для перевода роли на русский
function translateRole(role) {
    const roles = {
        'admin': 'администратор',
        'vet': 'ветеринар',
        'keeper': 'кипер'
    };
    return roles[role] || role;
}

// Проверка авторизации и получение роли
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/me`, {
            credentials: 'include'
        });
        if (response.ok) {
            const user = await response.json();
            currentUserRole = user.role;
            document.getElementById('userDisplay').innerText = 
                `${user.full_name || user.username} (${translateRole(user.role)})`;
            updateUIBasedOnRole();
        } else {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        window.location.href = '/login';
    }
}

// Обновление интерфейса в зависимости от роли
function updateUIBasedOnRole() {
    const isVet = currentUserRole === 'vet';
    const isAdmin = currentUserRole === 'admin';

    document.getElementById('addAnimalBtn').style.display = isVet ? 'inline-block' : 'none';
    document.getElementById('adminPanelBtn').style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('changeCredentialsBtn').style.display = 'inline-block';
}

// Загрузка всех животных
async function loadAnimals() {
    try {
        const response = await fetch(`${API_URL}/animals`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Ошибка загрузки');
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
                        ${currentUserRole === 'vet' ? `
                            <button class="btn btn-sm btn-warning mt-2" onclick="editAnimal(${animal.id})">
                                ✏️ Редактировать
                            </button>
                        ` : ''}
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
        
        const response = await fetch(`${API_URL}/animals/${id}`, {
            credentials: 'include'
        });
        const animal = await response.json();
        
        document.getElementById('viewAnimalTitle').textContent = `${animal.name} (${animal.species})`;
        document.getElementById('healthStatus').value = animal.health_status;
        
        document.getElementById('animalInfo').innerHTML = `
            <p><strong>ID:</strong> ${animal.id}</p>
            <p><strong>Дата прибытия:</strong> ${animal.arrival_date}</p>
            <p><strong>Дата рождения:</strong> ${animal.birth_date || 'не указана'}</p>
            <p><strong>Пол:</strong> ${animal.gender || 'не указан'}</p>
            <p><strong>Вольер:</strong> ${animal.enclosure || 'не указан'}</p>
            <p><strong>Примечания:</strong> ${animal.notes || 'нет'}</p>
        `;
        
        await loadExaminations(id);
        await loadVaccinations(id);
        await loadDiets(id);
        
        document.getElementById('examAnimalId').value = id;
        document.getElementById('vaccineAnimalId').value = id;
        document.getElementById('dietAnimalId').value = id;
        
        const isVet = currentUserRole === 'vet';
        document.getElementById('statusUpdateSection').style.display = isVet ? 'block' : 'none';
        document.getElementById('addExamBtn').style.display = isVet ? 'inline-block' : 'none';
        document.getElementById('addVaccineBtn').style.display = isVet ? 'inline-block' : 'none';
        document.getElementById('addDietBtn').style.display = isVet ? 'inline-block' : 'none';
        
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
    const response = await fetch(`${API_URL}/animals/${animalId}/examinations`, {
        credentials: 'include'
    });
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
    const response = await fetch(`${API_URL}/animals/${animalId}/vaccinations`, {
        credentials: 'include'
    });
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

// Загрузка рационов
async function loadDiets(animalId) {
    const response = await fetch(`${API_URL}/animals/${animalId}/diets`, {
        credentials: 'include'
    });
    const diets = await response.json();
    
    const container = document.getElementById('dietsList');
    if (diets.length === 0) {
        container.innerHTML = '<p class="text-muted">Рационов нет</p>';
        return;
    }
    
    container.innerHTML = diets.map(d => `
        <div class="timeline-item">
            <div class="d-flex justify-content-between">
                <div>
                    <div class="timeline-date">${d.start_date} ${d.end_date ? '— ' + d.end_date : ''}</div>
                    <div><strong>Рацион:</strong> ${d.diet_name}</div>
                    <div><strong>Тип корма:</strong> ${d.food_type}</div>
                    <div><strong>Количество:</strong> ${d.quantity}</div>
                    ${d.schedule ? `<div><strong>Расписание:</strong> ${d.schedule}</div>` : ''}
                </div>
                ${currentUserRole === 'vet' ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteDiet(${d.id}, ${animalId})">
                        🗑️
                    </button>
                ` : ''}
            </div>
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
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addAnimalModal'));
            modal.hide();
            loadAnimals();
            document.getElementById('addAnimalForm').reset();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            alert('✅ Животное успешно добавлено');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Обновление статуса
async function updateStatus() {
    if (!currentAnimalId) return;
    
    const status = document.getElementById('healthStatus').value;
    
    try {
        const response = await fetch(`${API_URL}/animals/${currentAnimalId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({status: status})
        });
        
        if (response.ok) {
            await viewAnimal(currentAnimalId);
            await loadAnimals();
            alert('✅ Статус здоровья обновлён');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Редактирование животного
async function editAnimal(id) {
    try {
        const response = await fetch(`${API_URL}/animals/${id}`, {
            credentials: 'include'
        });
        const animal = await response.json();
        
        document.getElementById('editAnimalId').value = animal.id;
        document.getElementById('editAnimalName').value = animal.name;
        document.getElementById('editAnimalSpecies').value = animal.species;
        document.getElementById('editArrivalDate').value = animal.arrival_date;
        document.getElementById('editBirthDate').value = animal.birth_date || '';
        document.getElementById('editEnclosure').value = animal.enclosure || '';
        document.getElementById('editGender').value = animal.gender || '';
        document.getElementById('editNotes').value = animal.notes || '';
        
        new bootstrap.Modal(document.getElementById('editAnimalModal')).show();
    } catch (error) {
        alert('Ошибка загрузки данных: ' + error);
    }
}

// Сохранение изменений животного
async function saveAnimalChanges() {
    const animalId = document.getElementById('editAnimalId').value;
    
    const data = {
        name: document.getElementById('editAnimalName').value,
        species: document.getElementById('editAnimalSpecies').value,
        arrival_date: document.getElementById('editArrivalDate').value,
        birth_date: document.getElementById('editBirthDate').value || null,
        gender: document.getElementById('editGender').value || null,
        enclosure: document.getElementById('editEnclosure').value || null,
        notes: document.getElementById('editNotes').value || null
    };
    
    try {
        const response = await fetch(`${API_URL}/animals/${animalId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('editAnimalModal'));
            modal.hide();
            loadAnimals();
            alert('✅ Данные животного обновлены');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
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
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addExamModal'));
            modal.hide();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
            alert('✅ Осмотр успешно добавлен');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
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
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addVaccineModal'));
            modal.hide();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
            alert('✅ Прививка успешно добавлена');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Показать форму добавления рациона
function showAddDietForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addDietModal')).show();
    }, 300);
}

// Добавление рациона
async function addDiet() {
    const data = {
        animal_id: parseInt(document.getElementById('dietAnimalId').value),
        diet_name: document.getElementById('dietName').value,
        food_type: document.getElementById('foodType').value,
        quantity: document.getElementById('quantity').value,
        schedule: document.getElementById('schedule').value,
        start_date: document.getElementById('dietStartDate').value,
        end_date: document.getElementById('dietEndDate').value || null
    };
    
    try {
        const response = await fetch(`${API_URL}/diets`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addDietModal'));
            modal.hide();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
            alert('✅ Рацион успешно добавлен');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Удаление рациона
async function deleteDiet(dietId, animalId) {
    if (!confirm('Вы уверены, что хотите удалить этот рацион?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/diets/${dietId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('✅ Рацион удалён');
            await viewAnimal(animalId);
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Не удалось удалить рацион'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

// Показать модальное окно смены данных
function showChangeCredentialsModal() {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    
    new bootstrap.Modal(document.getElementById('changeCredentialsModal')).show();
}

// Смена логина/пароля
async function changeCredentials() {
    const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword || confirmPassword) {
        if (newPassword !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }
        if (newPassword.length < 3) {
            alert('Пароль должен быть не менее 3 символов');
            return;
        }
    }
    
    if (!newUsername && !newPassword) {
        alert('Введите новые данные для изменения');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/user/change-credentials`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({
                new_username: newUsername || undefined,
                new_password: newPassword || undefined
            })
        });
        
        if (response.ok) {
            alert('✅ Данные успешно обновлены');
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('changeCredentialsModal'));
            modal.hide();
            
            await checkAuth();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('Ошибка соединения: ' + error);
    }
}

// Обработчик закрытия модальных окон
document.addEventListener('hidden.bs.modal', function () {
    document.body.classList.remove('modal-open');
    document.querySelector('.modal-backdrop')?.remove();
});

// При загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(() => loadAnimals());
});