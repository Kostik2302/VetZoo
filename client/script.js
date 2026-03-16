const API_URL = 'http://localhost:5000/api';
let currentAnimalModal = null;
let currentAnimalId = null;
let currentUserRole = null;
let reminderInterval = null;

function translateRole(role) {
    const roles = {
        'admin': 'администратор',
        'vet': 'ветеринар',
        'keeper': 'кипер'
    };
    return roles[role] || role;
}

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

function updateUIBasedOnRole() {
    const isVet = currentUserRole === 'vet';
    const isAdmin = currentUserRole === 'admin';

    document.getElementById('addAnimalBtn').style.display = isVet ? 'inline-block' : 'none';
    document.getElementById('adminPanelBtn').style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('changeCredentialsBtn').style.display = 'inline-block';
    document.getElementById('scheduleBtn').style.display = 'inline-block';
    document.getElementById('reportsBtn').style.display = (isAdmin || isVet) ? 'inline-block' : 'none';
}

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
        document.getElementById('scheduleExamBtn').style.display = isVet ? 'inline-block' : 'none';
        document.getElementById('scheduleVaccineBtn').style.display = isVet ? 'inline-block' : 'none';
        
        if (currentAnimalModal) {
            currentAnimalModal.hide();
        }
        currentAnimalModal = new bootstrap.Modal(document.getElementById('viewAnimalModal'));
        currentAnimalModal.show();
    } catch (error) {
        alert('Ошибка загрузки: ' + error);
    }
}

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
    
    container.innerHTML = exams.map(exam => {
        const isScheduled = exam.is_scheduled === 1;
        const statusBadge = isScheduled ? '<span class="badge bg-warning ms-2">Запланирован</span>' : '';
        
        const examDate = new Date(exam.examination_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let dateClass = '';
        if (isScheduled && examDate < today) {
            dateClass = 'text-danger fw-bold';
        }
        
        return `
        <div class="timeline-item">
            <div class="d-flex justify-content-between">
                <div>
                    <div class="timeline-date ${dateClass}">${exam.examination_date} ${statusBadge}</div>
                    <div><strong>Ветеринар:</strong> ${exam.veterinarian}</div>
                    <div><strong>Диагноз:</strong> ${exam.diagnosis}</div>
                    <div><strong>Лечение:</strong> ${exam.treatment}</div>
                    ${exam.notes ? `<div><small>${exam.notes}</small></div>` : ''}
                </div>
                ${currentUserRole === 'vet' && isScheduled ? `
                    <div>
                        <button class="btn btn-sm btn-success" onclick="markExaminationCompleted(${exam.id}, ${animalId})">✓ Проведен</button>
                    </div>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const isScheduled = v.is_scheduled === 1;
        const statusBadge = isScheduled ? '<span class="badge bg-warning ms-2">Запланирована</span>' : '';
        
        let overdueClass = '';
        let overdueText = '';
        
        if (isScheduled) {
            const plannedDate = new Date(v.vaccination_date);
            if (plannedDate < today) {
                overdueClass = 'text-danger fw-bold';
                overdueText = ' ⚠️ Просрочена!';
            }
        } else {
            if (v.next_due_date) {
                const nextDate = new Date(v.next_due_date);
                if (nextDate < today) {
                    overdueClass = 'text-danger fw-bold';
                    overdueText = ' ⚠️ Просрочена!';
                }
            }
        }
        
        return `
        <div class="timeline-item">
            <div class="d-flex justify-content-between">
                <div>
                    <div class="timeline-date">
                        ${isScheduled ? '📅 План: ' + v.vaccination_date : '📋 Проведена: ' + v.vaccination_date}
                        ${statusBadge}
                    </div>
                    <div><strong>Вакцина:</strong> ${v.vaccine_name}</div>
                    <div><strong>Ветеринар:</strong> ${v.veterinarian}</div>
                    ${!isScheduled && v.next_due_date ? `
                        <div class="${overdueClass}">
                            <strong>Следующая:</strong> ${v.next_due_date}${overdueText}
                        </div>
                    ` : ''}
                    ${isScheduled ? `
                        <div class="${overdueClass}">
                            <strong>Статус:</strong> Ожидает проведения${overdueText}
                        </div>
                    ` : ''}
                </div>
                ${currentUserRole === 'vet' && isScheduled ? `
                    <div>
                        <button class="btn btn-sm btn-success" onclick="markVaccinationCompleted(${v.id}, ${animalId})">
                            ✓ Отметить проведенной
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

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

async function loadUpcomingProcedures(animalId) {
    try {
        const response = await fetch(`${API_URL}/animals/${animalId}/upcoming-procedures`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки');
        }
        
        const procedures = await response.json();
        
        const container = document.getElementById('upcomingProceduresList');
        if (!procedures || procedures.length === 0) {
            container.innerHTML = '<p class="text-muted">Нет предстоящих процедур</p>';
            return;
        }
        
        container.innerHTML = procedures.map(p => {
            const daysUntil = p.days_until;
            let urgencyClass = '';
            let urgencyText = '';
            let statusBadge = '';
            
            if (p.is_scheduled) {
                statusBadge = '<span class="badge bg-warning ms-2">Запланировано</span>';
            }
            
            if (daysUntil <= 0) {
                urgencyClass = 'text-danger fw-bold';
                urgencyText = '⚠️ Просрочено!';
            } else if (daysUntil <= 3) {
                urgencyClass = 'text-warning fw-bold';
                urgencyText = '⚠️ Скоро!';
            } else if (daysUntil <= 7) {
                urgencyClass = 'text-info';
                urgencyText = 'ℹ️ На этой неделе';
            } else if (daysUntil <= 30) {
                urgencyClass = 'text-secondary';
                urgencyText = '📅 В этом месяце';
            } else {
                urgencyClass = 'text-muted';
                urgencyText = `📅 Через ${daysUntil} дн.`;
            }
            
            let daysText = '';
            if (daysUntil > 0) {
                daysText = `Через ${daysUntil} дн.`;
            } else if (daysUntil === 0) {
                daysText = 'Сегодня';
            } else {
                daysText = `Просрочено на ${Math.abs(daysUntil)} дн.`;
            }
            
            let displayDate = p.date;
            if (p.date && p.date.includes(' ')) {
                displayDate = p.date.split(' ')[0] + ' ' + p.date.split(' ')[1].substring(0, 5);
            }
            
            return `
            <div class="timeline-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center">
                            <span class="timeline-date">${displayDate}</span>
                            ${statusBadge}
                        </div>
                        <div><strong>Тип:</strong> ${p.type === 'examination' ? '🔍 Осмотр' : '💉 Прививка'}</div>
                        <div><strong>Описание:</strong> ${p.description}</div>
                        <div class="${urgencyClass}"><strong>Статус:</strong> ${daysText}</div>
                    </div>
                    <div class="ms-3">
                        <span class="badge ${daysUntil <= 0 ? 'bg-danger' : daysUntil <= 3 ? 'bg-warning' : 'bg-info'}">
                            ${urgencyText}
                        </span>
                    </div>
                </div>
            </div>
        `}).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки предстоящих процедур:', error);
        const container = document.getElementById('upcomingProceduresList');
        container.innerHTML = '<p class="text-danger">Ошибка загрузки данных</p>';
    }
}

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

function showScheduleExamForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    
    document.getElementById('scheduleVeterinarian').value = '';
    document.getElementById('scheduleDiagnosis').value = '';
    document.getElementById('scheduleTreatment').value = '';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('scheduleExamDate').value = tomorrow.toISOString().slice(0, 16);
    document.getElementById('scheduleNotes').value = '';
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('scheduleExamModal')).show();
    }, 300);
}

async function addScheduledExamination() {
    const selectedDate = new Date(document.getElementById('scheduleExamDate').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
        alert('❌ Нельзя запланировать осмотр на прошедшую дату');
        return;
    }
    
    const veterinarian = document.getElementById('scheduleVeterinarian').value;
    const diagnosis = document.getElementById('scheduleDiagnosis').value;
    const treatment = document.getElementById('scheduleTreatment').value;
    
    if (!veterinarian || !diagnosis || !treatment) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
    }

    const data = {
        animal_id: currentAnimalId,
        veterinarian: veterinarian,
        diagnosis: diagnosis,
        treatment: treatment,
        examination_date: document.getElementById('scheduleExamDate').value,
        notes: document.getElementById('scheduleNotes').value,
        is_scheduled: true
    };
    
    console.log('Отправляемые данные осмотра:', data);
    
    try {
        const response = await fetch(`${API_URL}/examinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleExamModal'));
            modal.hide();
            document.body.classList.remove('modal-open');
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
            
            checkReminders();
            alert('✅ Осмотр запланирован');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

function showScheduleVaccineForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    
    document.getElementById('scheduleVaccineName').value = '';
    document.getElementById('scheduleVaccineVeterinarian').value = '';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    document.getElementById('scheduleVaccineDate').value = `${year}-${month}-${day}`;
    document.getElementById('scheduleNextVaccineDate').value = '';
    
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('scheduleVaccineModal')).show();
    }, 300);
}

async function addScheduledVaccination() {
    const selectedDate = new Date(document.getElementById('scheduleVaccineDate').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
        alert('❌ Нельзя запланировать прививку на прошедшую дату');
        return;
    }
    
    const data = {
        animal_id: currentAnimalId,
        vaccine_name: document.getElementById('scheduleVaccineName').value,
        veterinarian: document.getElementById('scheduleVaccineVeterinarian').value,
        vaccination_date: document.getElementById('scheduleVaccineDate').value,
        next_due_date: document.getElementById('scheduleNextVaccineDate').value || null,
        is_scheduled: true
    };
    
    try {
        const response = await fetch(`${API_URL}/vaccinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleVaccineModal'));
            modal.hide();
            document.body.classList.remove('modal-open');
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            
            setTimeout(() => {
                viewAnimal(data.animal_id);
            }, 300);
            
            checkReminders();
            alert('✅ Прививка запланирована');
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Недостаточно прав'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

async function markExaminationCompleted(examId, animalId) {
    try {
        const response = await fetch(`${API_URL}/examinations/${examId}/complete`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('✅ Осмотр отмечен как проведенный');
            await viewAnimal(animalId);
            checkReminders();
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Не удалось отметить'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

async function markVaccinationCompleted(vaccId, animalId) {
    try {
        const response = await fetch(`${API_URL}/vaccinations/${vaccId}/complete`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('✅ Прививка отмечена как проведенная');
            await viewAnimal(animalId);
            checkReminders();
        } else {
            const err = await response.json();
            alert('Ошибка: ' + (err.error || 'Не удалось отметить'));
        }
    } catch (error) {
        alert('Ошибка: ' + error);
    }
}

function previewExamination() {
    const veterinarian = document.getElementById('veterinarian').value;
    const diagnosis = document.getElementById('diagnosis').value;
    const treatment = document.getElementById('treatment').value;
    const examDate = document.getElementById('examDate').value;
    
    if (!veterinarian || !diagnosis || !treatment || !examDate) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    const data = {
        animal_id: parseInt(document.getElementById('examAnimalId').value),
        veterinarian: veterinarian,
        diagnosis: diagnosis,
        treatment: treatment,
        examination_date: examDate,
        is_scheduled: false
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

async function confirmAddExamination() {
    if (!window.pendingExamData) {
        alert('Ошибка: данные не найдены');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/examinations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify(window.pendingExamData)
        });
        
        if (response.ok) {
            const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmExamModal'));
            if (confirmModal) {
                confirmModal.hide();
            }
            
            document.body.classList.remove('modal-open');
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            
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

function previewVaccination() {
    const vaccineName = document.getElementById('vaccineName').value;
    const veterinarian = document.getElementById('vaccineVeterinarian').value;
    const vaccineDate = document.getElementById('vaccineDate').value;
    
    if (!vaccineName || !veterinarian || !vaccineDate) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    const data = {
        animal_id: parseInt(document.getElementById('vaccineAnimalId').value),
        vaccine_name: vaccineName,
        veterinarian: veterinarian,
        vaccination_date: vaccineDate,
        next_due_date: document.getElementById('nextVaccineDate').value || null,
        is_scheduled: false
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
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            
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

function showAddDietForm() {
    if (currentAnimalModal) {
        currentAnimalModal.hide();
    }
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('addDietModal')).show();
    }, 300);
}

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
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            
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

function showChangeCredentialsModal() {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    
    new bootstrap.Modal(document.getElementById('changeCredentialsModal')).show();
}

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

function showSchedule() {
    loadSchedule();
    new bootstrap.Modal(document.getElementById('scheduleModal')).show();
}

async function loadSchedule() {
    try {
        const response = await fetch(`${API_URL}/schedule/upcoming`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки');
        }
        
        const procedures = await response.json();
        
        const container = document.getElementById('scheduleList');
        if (!procedures || procedures.length === 0) {
            container.innerHTML = '<p class="text-muted">Нет запланированных процедур</p>';
            return;
        }
        
        const grouped = {};
        procedures.forEach(p => {
            let datePart = p.date;
            if (p.date.includes('T')) {
                datePart = p.date.split('T')[0];
            } else if (p.date.includes(' ')) {
                datePart = p.date.split(' ')[0];
            }
            
            if (!grouped[datePart]) {
                grouped[datePart] = [];
            }
            grouped[datePart].push(p);
        });
        
        let html = '';
        const sortedDates = Object.keys(grouped).sort();
        
        for (const date of sortedDates) {
            const items = grouped[date];
            const dateObj = new Date(date + 'T12:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let dateClass = '';
            let dateText = '';
            
            const diffTime = dateObj - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                dateClass = 'text-danger';
                dateText = ` (просрочено на ${Math.abs(diffDays)} дн.)`;
            } else if (diffDays === 0) {
                dateClass = 'text-success fw-bold';
                dateText = ' (сегодня)';
            } else if (diffDays === 1) {
                dateClass = 'text-warning';
                dateText = ' (завтра)';
            } else if (diffDays <= 3) {
                dateClass = 'text-warning';
                dateText = ` (через ${diffDays} дн.)`;
            }
            
            const formattedDate = dateObj.toLocaleDateString('ru-RU', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            html += `<h6 class="mt-3 ${dateClass}">${formattedDate}${dateText}</h6>`;
            
            items.sort((a, b) => {
                const timeA = a.date.includes('T') ? a.date.split('T')[1] : (a.date.split(' ')[1] || '00:00');
                const timeB = b.date.includes('T') ? b.date.split('T')[1] : (b.date.split(' ')[1] || '00:00');
                return timeA.localeCompare(timeB);
            });
            
            items.forEach(p => {
                const animal = p.animal_name || 'Неизвестное животное';
                let timePart = '00:00';
                if (p.date.includes('T')) {
                    timePart = p.date.split('T')[1];
                } else if (p.date.includes(' ')) {
                    timePart = p.date.split(' ')[1];
                }
                const time = timePart.length > 5 ? timePart.substring(0, 5) : timePart;
                
                let statusBadge = '';
                if (p.is_scheduled) {
                    statusBadge = '<span class="badge bg-warning ms-1">Запл.</span>';
                }
                
                let daysText = '';
                if (p.days_until < 0) {
                    daysText = ` <span class="text-danger">(просрочено на ${Math.abs(p.days_until)} дн.)</span>`;
                } else if (p.days_until === 0) {
                    daysText = ' <span class="text-success">(сегодня)</span>';
                } else if (p.days_until === 1) {
                    daysText = ' <span class="text-warning">(завтра)</span>';
                }
                
                html += `
                    <div class="timeline-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge bg-primary me-2">${time}</span>
                                <strong>${animal}</strong> (${p.animal_species}) ${statusBadge} ${daysText}
                                <br>
                                <small>${p.type === 'examination' ? '🔍 Осмотр' : '💉 Прививка'}: ${p.description}</small>
                            </div>
                            <button class="btn btn-sm btn-outline-primary" onclick="goToAnimalFromSchedule(${p.animal_id})">
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

async function goToAnimalFromSchedule(animalId) {
    try {
        const scheduleModal = bootstrap.Modal.getInstance(document.getElementById('scheduleModal'));
        if (scheduleModal) {
            scheduleModal.hide();
        }
        
        setTimeout(() => {
            if (currentAnimalModal) {
                currentAnimalModal.hide();
                currentAnimalModal = null;
            }
            
            viewAnimal(animalId);
        }, 300);
    } catch (error) {
        console.error('Ошибка при переходе:', error);
    }
}

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
            
            const statusText = r.is_scheduled ? ' (запл.)' : '';
            
            return `
            <div class="timeline-item ${urgencyClass}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="me-2">${icon}</span>
                        <strong>${r.animal_name}</strong> (${r.animal_species})${statusText}
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

function startReminderChecker() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
    }
    reminderInterval = setInterval(checkReminders, 5 * 60 * 1000);
}

function cancelConfirm() {
    window.pendingExamData = null;
    window.pendingVaccineData = null;
    
    const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmExamModal'));
    if (confirmModal) confirmModal.hide();
    
    const confirmVaccineModal = bootstrap.Modal.getInstance(document.getElementById('confirmVaccineModal'));
    if (confirmVaccineModal) confirmVaccineModal.hide();
}

function goToReports() {
    window.location.href = '/reports';
}

document.addEventListener('hidden.bs.modal', function () {
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
});

document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(() => loadAnimals());
});

document.addEventListener('DOMContentLoaded', function() {
    const animalId = sessionStorage.getItem('returnToAnimal');
    if (animalId) {
        sessionStorage.removeItem('returnToAnimal');
        setTimeout(() => {
            viewAnimal(parseInt(animalId));
        }, 1000);
    }
});