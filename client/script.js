const API_URL = 'http://localhost:5000/api';
let currentAnimalModal = null;
let currentAnimalId = null;
let currentUserRole = null;
let reminderInterval = null;

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
            checkReminders();
            startReminderChecker();
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
    document.getElementById('scheduleBtn').style.display = 'inline-block';
    document.getElementById('reportsBtn').style.display = (isAdmin || isVet) ? 'inline-block' : 'none';
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
        await loadUpcomingProcedures(id);
        
        document.getElementById('examAnimalId').value = id;
        document.getElementById('vaccineAnimalId').value = id;
        document.getElementById('dietAnimalId').value = id;
        
        const isVet = currentUserRole === 'vet';
        document.getElementById('statusUpdateSection').style.display = isVet ? 'block' : 'none';
        document.getElementById('editAnimalBtn').style.display = isVet ? 'inline-block' : 'none';
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
    
    container.innerHTML = vaccines.map(v => {
        const isOverdue = v.next_due_date && new Date(v.next_due_date) < new Date();
        const overdueClass = isOverdue ? 'text-danger fw-bold' : '';
        
        return `
        <div class="timeline-item">
            <div class="timeline-date">${v.vaccination_date}</div>
            <div><strong>Вакцина:</strong> ${v.vaccine_name}</div>
            <div><strong>Ветеринар:</strong> ${v.veterinarian}</div>
            ${v.next_due_date ? `
                <div class="${overdueClass}">
                    <strong>Следующая:</strong> ${v.next_due_date}
                    ${isOverdue ? ' ⚠️ Просрочена!' : ''}
                </div>
            ` : ''}
        </div>
    `}).join('');
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

// Загрузка предстоящих процедур для конкретного животного
async function loadUpcomingProcedures(animalId) {
    const response = await fetch(`${API_URL}/animals/${animalId}/upcoming-procedures`, {
        credentials: 'include'
    });
    const procedures = await response.json();
    
    const container = document.getElementById('upcomingProceduresList');
    if (procedures.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет предстоящих процедур</p>';
        return;
    }
    
    container.innerHTML = procedures.map(p => {
        const daysUntil = Math.ceil((new Date(p.date) - new Date()) / (1000 * 60 * 60 * 24));
        let urgencyClass = '';
        let urgencyText = '';
        
        if (daysUntil <= 0) {
            urgencyClass = 'text-danger fw-bold';
            urgencyText = '⚠️ Просрочено!';
        } else if (daysUntil <= 3) {
            urgencyClass = 'text-warning fw-bold';
            urgencyText = '⚠️ Скоро!';
        } else if (daysUntil <= 7) {
            urgencyClass = 'text-info';
            urgencyText = 'ℹ️ На этой неделе';
        }
        
        return `
        <div class="timeline-item ${urgencyClass}">
            <div class="d-flex justify-content-between">
                <div>
                    <div class="timeline-date">${p.date}</div>
                    <div><strong>Тип:</strong> ${p.type === 'examination' ? 'Осмотр' : 'Прививка'}</div>
                    <div><strong>Описание:</strong> ${p.description}</div>
                    <div><strong>Дней до:</strong> ${daysUntil > 0 ? daysUntil : 'просрочено'}</div>
                </div>
                <span class="badge ${urgencyClass}">${urgencyText}</span>
            </div>
        </div>
    `}).join('');
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
        
        if (currentAnimalModal) {
            currentAnimalModal.hide();
        }
        
        setTimeout(() => {
            new bootstrap.Modal(document.getElementById('editAnimalModal')).show();
        }, 300);
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
    
    document.getElementById('veterinarian').value = '';
    document.getElementById('diagnosis').value = '';
    document.getElementById('treatment').value = '';
    document.getElementById('examDate').value = new Date().toISOString().slice(0, 16);
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addExamModal')).show();
    }, 300);
}

// Предварительный просмотр осмотра
function previewExamination() {
    const data = {
        animal_id: parseInt(document.getElementById('examAnimalId').value),
        veterinarian: document.getElementById('veterinarian').value,
        diagnosis: document.getElementById('diagnosis').value,
        treatment: document.getElementById('treatment').value,
        examination_date: document.getElementById('examDate').value
    };
    
    document.getElementById('previewExamVeterinarian').textContent = data.veterinarian || '—';
    document.getElementById('previewExamDiagnosis').textContent = data.diagnosis || '—';
    document.getElementById('previewExamTreatment').textContent = data.treatment || '—';
    document.getElementById('previewExamDate').textContent = data.examination_date || '—';
    
    window.pendingExamData = data;
    
    const addModal = bootstrap.Modal.getInstance(document.getElementById('addExamModal'));
    addModal.hide();
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('confirmExamModal')).show();
    }, 300);
}

// Подтверждение и добавление осмотра
async function confirmAddExamination() {
    if (!window.pendingExamData) return;
    
    try {
        const response = await fetch(`${API_URL}/examinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(window.pendingExamData)
        });
        
        if (response.ok) {
            const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmExamModal'));
            confirmModal.hide();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            setTimeout(() => {
                viewAnimal(window.pendingExamData.animal_id);
            }, 300);
            
            checkReminders();
            alert('✅ Осмотр успешно добавлен');
            window.pendingExamData = null;
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
    
    document.getElementById('vaccineName').value = '';
    document.getElementById('vaccineVeterinarian').value = '';
    document.getElementById('vaccineDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('nextVaccineDate').value = '';
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addVaccineModal')).show();
    }, 300);
}

// Предварительный просмотр прививки
function previewVaccination() {
    const data = {
        animal_id: parseInt(document.getElementById('vaccineAnimalId').value),
        vaccine_name: document.getElementById('vaccineName').value,
        veterinarian: document.getElementById('vaccineVeterinarian').value,
        vaccination_date: document.getElementById('vaccineDate').value,
        next_due_date: document.getElementById('nextVaccineDate').value || null
    };
    
    document.getElementById('previewVaccineName').textContent = data.vaccine_name || '—';
    document.getElementById('previewVaccineVeterinarian').textContent = data.veterinarian || '—';
    document.getElementById('previewVaccineDate').textContent = data.vaccination_date || '—';
    document.getElementById('previewNextVaccineDate').textContent = data.next_due_date || '—';
    
    window.pendingVaccineData = data;
    
    const addModal = bootstrap.Modal.getInstance(document.getElementById('addVaccineModal'));
    addModal.hide();
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('confirmVaccineModal')).show();
    }, 300);
}

// Подтверждение и добавление прививки
async function confirmAddVaccination() {
    if (!window.pendingVaccineData) return;
    
    try {
        const response = await fetch(`${API_URL}/vaccinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(window.pendingVaccineData)
        });
        
        if (response.ok) {
            const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmVaccineModal'));
            confirmModal.hide();
            document.body.classList.remove('modal-open');
            document.querySelector('.modal-backdrop')?.remove();
            
            setTimeout(() => {
                viewAnimal(window.pendingVaccineData.animal_id);
            }, 300);
            
            checkReminders();
            alert('✅ Прививка успешно добавлена');
            window.pendingVaccineData = null;
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

// Функции для работы с расписанием и напоминаниями

// Открыть окно расписания
function showSchedule() {
    loadSchedule();
    new bootstrap.Modal(document.getElementById('scheduleModal')).show();
}

// Загрузить расписание процедур
async function loadSchedule() {
    try {
        const response = await fetch(`${API_URL}/schedule/upcoming`, {
            credentials: 'include'
        });
        const procedures = await response.json();
        
        const container = document.getElementById('scheduleList');
        if (procedures.length === 0) {
            container.innerHTML = '<p class="text-muted">Нет запланированных процедур</p>';
            return;
        }
        
        const grouped = {};
        procedures.forEach(p => {
            const date = p.date.split(' ')[0];
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(p);
        });
        
        let html = '';
        for (const [date, items] of Object.entries(grouped)) {
            const dateObj = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let dateClass = '';
            if (dateObj < today) {
                dateClass = 'text-danger';
            } else if (dateObj.getTime() === today.getTime()) {
                dateClass = 'text-success fw-bold';
            } else if (dateObj - today <= 3 * 24 * 60 * 60 * 1000) {
                dateClass = 'text-warning';
            }
            
            html += `<h6 class="mt-3 ${dateClass}">${new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h6>`;
            
            items.forEach(p => {
                const animal = p.animal_name || 'Неизвестное животное';
                const time = p.date.split(' ')[1] || '00:00';
                
                html += `
                    <div class="timeline-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge bg-primary me-2">${time}</span>
                                <strong>${animal}</strong> (${p.animal_species})
                                <br>
                                <small>${p.type === 'examination' ? '🔍 Осмотр' : '💉 Прививка'}: ${p.description}</small>
                            </div>
                            <button class="btn btn-sm btn-outline-primary" onclick="viewAnimal(${p.animal_id})">
                                Перейти
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        document.getElementById('scheduleList').innerHTML = '<p class="text-danger">Ошибка загрузки расписания</p>';
    }
}

// Проверка напоминаний
async function checkReminders() {
    try {
        const response = await fetch(`${API_URL}/reminders`, {
            credentials: 'include'
        });
        const reminders = await response.json();
        
        const container = document.getElementById('remindersList');
        const badge = document.getElementById('reminderBadge');
        
        if (reminders.length === 0) {
            container.innerHTML = '<p class="text-muted">Нет напоминаний</p>';
            if (badge) badge.style.display = 'none';
            return;
        }
        
        if (badge) {
            badge.textContent = reminders.length;
            badge.style.display = 'inline';
        }
        
        container.innerHTML = reminders.map(r => {
            let icon = r.type === 'examination' ? '🔍' : '💉';
            let urgencyClass = '';
            
            if (r.days_until <= 0) {
                urgencyClass = 'text-danger fw-bold';
                icon = '⚠️';
            } else if (r.days_until <= 3) {
                urgencyClass = 'text-warning';
            }
            
            return `
            <div class="timeline-item ${urgencyClass}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="me-2">${icon}</span>
                        <strong>${r.animal_name}</strong> (${r.animal_species})
                        <br>
                        <small>${r.description}</small>
                        <br>
                        <small class="text-muted">Дата: ${r.date}</small>
                    </div>
                    <div>
                        <span class="badge ${r.days_until <= 0 ? 'bg-danger' : r.days_until <= 3 ? 'bg-warning' : 'bg-info'} me-2">
                            ${r.days_until > 0 ? `Через ${r.days_until} дн.` : 'Просрочено!'}
                        </span>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewAnimal(${r.animal_id})">
                            Перейти
                        </button>
                    </div>
                </div>
            </div>
        `}).join('');
        
    } catch (error) {
        console.error('Ошибка проверки напоминаний:', error);
    }
}

// Запуск периодической проверки напоминаний
function startReminderChecker() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
    }
    reminderInterval = setInterval(checkReminders, 5 * 60 * 1000);
}

// Отмена подтверждения
function cancelConfirm() {
    window.pendingExamData = null;
    window.pendingVaccineData = null;
    
    const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmExamModal'));
    if (confirmModal) confirmModal.hide();
    
    const confirmVaccineModal = bootstrap.Modal.getInstance(document.getElementById('confirmVaccineModal'));
    if (confirmVaccineModal) confirmVaccineModal.hide();
}

// Переход к отчетам
function goToReports() {
    window.location.href = '/reports';
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