var firebaseConfig = {
    apiKey: "AIzaSyDgTFBPipaSGqJlahiT-THgzBH4JKuQSA4",
    authDomain: "sistema-de-receitas-e-despesas.firebaseapp.com",
    databaseURL: "https://sistema-de-receitas-e-despesas-default-rtdb.firebaseio.com",
    projectId: "sistema-de-receitas-e-despesas",
    storageBucket: "sistema-de-receitas-e-despesas.firebasestorage.app",
    messagingSenderId: "252102478972",
    appId: "1:252102478972:web:c7e9e4c25b3bc7c6c50df9",
    measurementId: "G-K2HCS7WNZV"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let transactions = [];
let allUsers = [];
let reminders = [];
let monthlyLimit = parseCurrency(localStorage.getItem('monthlyLimit') || '0,00');
let selectedReminderId = null;
let transactionToDelete = null;

auth.onAuthStateChanged(user => {
    if (user) {
        const userId = user.uid;
        console.log('Usuário autenticado:', userId);
        loadTheme(userId);
        database.ref('users/' + userId).once('value').then((snapshot) => {
            const userData = snapshot.val();
            const userName = userData ? userData.name : "Usuário";
            localStorage.setItem('username', userName);
            document.getElementById('userGreeting').innerHTML = '<span>Olá, <strong>' + userName + '</strong>!</span>';
            loadTransactions();
            checkAdmin(user.email);
            loadReminders(userId);
            updateFilteredView();
        }).catch(error => {
            console.error('Erro ao carregar dados do usuário:', error);
        });
    } else {
        window.location.href = 'index.html';
    }
});

function loadTheme(userId) {
    database.ref('users/' + userId + '/theme').once('value').then((snapshot) => {
        const themeColor = snapshot.val();
        if (themeColor) {
            document.documentElement.style.setProperty('--button-color', themeColor);
            document.documentElement.style.setProperty('--input-border-color', themeColor);
            document.getElementById('colorPicker').value = themeColor;
        }
    }).catch(error => {
        console.error('Erro ao carregar tema:', error);
    });
}

function loadTransactions() {
    const userId = auth.currentUser.uid;
    database.ref('transactions/' + userId).once('value', function(snapshot) {
        if (snapshot.val()) {
            transactions = Object.values(snapshot.val());
            updateDescriptionList();
            updateFilteredView();
            calculateBalances();
            checkMonthlyLimit();
        }
    }).catch(error => {
        console.error('Erro ao carregar transações:', error);
    });
}

function saveTransactions() {
    const userId = auth.currentUser.uid;
    database.ref('transactions/' + userId).set(transactions).catch(error => {
        console.error('Erro ao salvar transações:', error);
    });
}

function checkAdmin(email) {
    const adminIcon = document.querySelector('.admin-icon');
    if (email === 'fernandolapa1987@gmail.com') {
        adminIcon.style.display = 'inline-block';
        loadAllUsers();
    } else {
        adminIcon.style.display = 'none';
    }
}

function loadAllUsers() {
    database.ref('users').once('value').then((snapshot) => {
        const users = snapshot.val();
        for (let uid in users) {
            allUsers.push({ uid, name: users[uid].name });
        }
    }).catch(error => {
        console.error('Erro ao carregar usuários:', error);
    });
}

function validateAmount(input) {
    let value = input.value.replace(/[^0-9,]/g, '');
    const parts = value.split(',');
    if (parts.length > 2) {
        value = parts[0] + ',' + parts.slice(1).join('');
    }
    if (parts[1] && parts[1].length > 2) {
        value = parts[0] + ',' + parts[1].slice(0, 2);
    }
    input.value = value || '';
}

function addTransaction() {
    const date = document.getElementById('date').value;
    const description = document.getElementById('description').value;
    const amountInput = document.getElementById('amount');
    const amount = parseCurrency(amountInput.value);
    const type = document.getElementById('type').value;

    if (!date || !description || isNaN(amount) || !type) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }

    const transaction = { id: generateTransactionId(), date, description, amount, type };
    transactions.push(transaction);
    saveTransactions();
    updateDescriptionList();
    updateFilteredView();
    calculateBalances();
    checkMonthlyLimit();

    document.getElementById('date').value = getCurrentDate();
    document.getElementById('description').value = '';
    amountInput.value = '0,00';
    document.getElementById('type').value = 'receita';
}

function generateTransactionId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function updateDescriptionList() {
    const filterDescription = document.getElementById('filterDescription');
    filterDescription.innerHTML = '<option value="">Todos</option>';
    const uniqueDescriptions = [...new Set(transactions.map(t => t.description))];
    uniqueDescriptions.forEach(description => {
        const option = document.createElement('option');
        option.value = description;
        option.text = description;
        filterDescription.appendChild(option);
    });
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

function updateFilteredView() {
    const selectedDate = document.getElementById('date').value;
    const tbody = document.getElementById('transactionsTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    const filteredTransactions = transactions
        .filter(transaction => transaction.date === selectedDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    filteredTransactions.forEach(transaction => {
        const row = tbody.insertRow();
        const cellDate = row.insertCell(0);
        const cellDescription = row.insertCell(1);
        const cellAmount = row.insertCell(2);
        const cellType = row.insertCell(3);
        const cellAction = row.insertCell(4);

        cellDate.innerText = formatDate(transaction.date);
        cellDescription.innerHTML = `<div class="transaction-description">
                                        <i class="transaction-icon ${transaction.type === 'receita' ? 'fas fa-arrow-circle-up' : 'fas fa-arrow-circle-down'}" style="color: ${transaction.type === 'receita' ? 'var(--positive-color)' : 'var(--negative-color)'};"></i>
                                        ${transaction.description}
                                    </div>`;
        cellAmount.innerHTML = `<div class="transaction-amount ${transaction.type}">${formatCurrency(transaction.amount)}</div>`;
        cellType.innerText = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
        cellAction.innerHTML = `<i class="fas fa-trash-alt remove-icon" onclick="openDeleteTransactionConfirmModal('${transaction.id}')" style="cursor:pointer;"></i>`;
    });

    calculateBalances();
    loadReminders(auth.currentUser.uid);
}

function openDeleteTransactionConfirmModal(transactionId) {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;
    transactionToDelete = transaction;
    const modal = document.getElementById('deleteTransactionConfirmModal');
    const message = document.getElementById('deleteTransactionMessage');
    message.innerText = `Tem certeza que deseja remover a transação "${transaction.description}" de ${formatCurrency(transaction.amount)} em ${formatDate(transaction.date)}?`;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeDeleteTransactionConfirmModal() {
    const modal = document.getElementById('deleteTransactionConfirmModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
        transactionToDelete = null;
    }, 500);
}

function deleteTransaction(confirmed) {
    if (!transactionToDelete) return;

    if (confirmed) {
        removeTransaction(transactionToDelete.id);
    }
    closeDeleteTransactionConfirmModal();
}

function removeTransaction(transactionId) {
    transactions = transactions.filter(transaction => transaction.id !== transactionId);
    saveTransactions();
    updateDescriptionList();
    updateFilteredView();
    calculateBalances();
    checkMonthlyLimit();
}

function calculateBalances() {
    const selectedDate = document.getElementById('date').value;
    const currentMonth = selectedDate.slice(0, 7);
    const currentYear = selectedDate.slice(0, 4);

    let dailyBalance = 0;
    let monthlyBalance = 0;
    let annualBalance = 0;

    transactions.forEach(transaction => {
        if (transaction.date === selectedDate) {
            dailyBalance += transaction.type === 'receita' ? transaction.amount : -transaction.amount;
        }
        if (transaction.date.startsWith(currentMonth)) {
            monthlyBalance += transaction.type === 'receita' ? transaction.amount : -transaction.amount;
        }
        if (transaction.date.startsWith(currentYear)) {
            annualBalance += transaction.type === 'receita' ? transaction.amount : -transaction.amount;
        }
    });

    const dailyBalanceSpan = document.getElementById('dailyBalance');
    const monthlyBalanceSpan = document.getElementById('monthlyBalance');
    const annualBalanceSpan = document.getElementById('annualBalance');

    dailyBalanceSpan.innerHTML = `<span class="balance-label">Saldo do Dia</span><span class="balance-value">${formatCurrency(dailyBalance)}</span>`;
    monthlyBalanceSpan.innerHTML = `<span class="balance-label">Saldo do Mês</span><span class="balance-value">${formatCurrency(monthlyBalance)}</span>`;
    annualBalanceSpan.innerHTML = `<span class="balance-label">Saldo do Ano</span><span class="balance-value">${formatCurrency(annualBalance)}</span>`;

    dailyBalanceSpan.classList.toggle('negative', dailyBalance < 0);
    monthlyBalanceSpan.classList.toggle('negative', monthlyBalance < 0);
    annualBalanceSpan.classList.toggle('negative', annualBalance < 0);

    dailyBalanceSpan.classList.toggle('positive', dailyBalance >= 0);
    monthlyBalanceSpan.classList.toggle('positive', monthlyBalance >= 0);
    annualBalanceSpan.classList.toggle('positive', annualBalance >= 0);
}

function checkMonthlyLimit() {
    const currentMonth = getCurrentDate().slice(0, 7);
    let monthlyExpenses = transactions
        .filter(transaction => transaction.type === 'despesa' && transaction.date.startsWith(currentMonth))
        .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (monthlyLimit > 0 && monthlyExpenses > monthlyLimit) {
        showAlert(`Você ultrapassou seu limite de gastos mensais! Limite: ${formatCurrency(monthlyLimit)}, Gastos: ${formatCurrency(monthlyExpenses)}`);
    }
}

function showAlert(message) {
    const modal = document.getElementById('reminderAlertModal');
    document.getElementById('reminderAlertMessage').innerText = message;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeReminderAlertModal() {
    const modal = document.getElementById('reminderAlertModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return "R$ 0,00";
    }
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseCurrency(value) {
    return parseFloat(value.replace(/\./g, '').replace(',', '.').replace('R$', '')) || 0;
}

function getCurrentDate() {
    const now = new Date();
    const offset = -3;
    const brasiliaTime = new Date(now.getTime() + offset * 3600 * 1000);
    return brasiliaTime.toISOString().split('T')[0];
}

function getNextMonthDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
}

function openAdminModal() {
    const user = auth.currentUser;
    if (user && user.email === 'fernandolapa1987@gmail.com') {
        const modal = document.getElementById('adminModal');
        modal.style.display = 'block';
        modal.style.animation = 'slideIn 0.4s';
    } else {
        alert('Acesso restrito ao administrador.');
    }
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const user = auth.currentUser;

    if (!currentPassword || !newPassword) {
        alert('Por favor, preencha ambos os campos de senha.');
        return;
    }

    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);

    user.reauthenticateWithCredential(credential).then(() => {
        user.updatePassword(newPassword).then(() => {
            alert('Senha alterada com sucesso.');
            closeChangePasswordModal();
        }).catch(error => {
            alert('Erro ao alterar senha: ' + error.message);
        });
    }).catch(error => {
        alert('Senha atual incorreta: ' + error.message);
    });
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById('toggle' + inputId.charAt(0).toUpperCase() + inputId.slice(1));
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function openLogoutConfirmModal() {
    const modal = document.getElementById('logoutConfirmModal');
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeLogoutConfirmModal() {
    const modal = document.getElementById('logoutConfirmModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function confirmLogout(confirmed) {
    if (confirmed) {
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        }).catch(error => {
            console.error('Erro ao fazer logout:', error);
            alert('Erro ao fazer logout: ' + error.message);
        });
    }
    closeLogoutConfirmModal();
}

function openFilterPeriodModal() {
    const modal = document.getElementById('filterPeriodModal');
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeFilterPeriodModal() {
    const modal = document.getElementById('filterPeriodModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function filterByPeriod() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const filterType = document.getElementById('filterType').value;
    const filterDescription = document.getElementById('filterDescription').value;

    if (!startDate || !endDate) {
        alert('Por favor, preencha as datas inicial e final.');
        return;
    }

    const filteredTransactions = transactions.filter(t => {
        const withinDateRange = t.date >= startDate && t.date <= endDate;
        const matchesType = !filterType || t.type === filterType;
        const matchesDescription = !filterDescription || t.description === filterDescription;
        return withinDateRange && matchesType && matchesDescription;
    });

    const tbody = document.getElementById('filteredTransactionsTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    filteredTransactions.forEach(t => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = formatDate(t.date);
        row.insertCell(1).innerText = t.description;
        row.insertCell(2).innerHTML = `<span class="${t.type}">${formatCurrency(t.amount)}</span>`;
        row.insertCell(3).innerText = t.type.charAt(0).toUpperCase() + t.type.slice(1);
    });

    const totalReceitas = filteredTransactions
        .filter(t => t.type === 'receita')
        .reduce((sum, t) => sum + t.amount, 0);
    const totalDespesas = filteredTransactions
        .filter(t => t.type === 'despesa')
        .reduce((sum, t) => sum + t.amount, 0);
    const totalSaldo = totalReceitas - totalDespesas;

    document.getElementById('totalReceitas').innerText = formatCurrency(totalReceitas);
    document.getElementById('totalDespesas').innerText = formatCurrency(totalDespesas);
    document.getElementById('totalSaldo').innerText = formatCurrency(totalSaldo);
    document.getElementById('totalSaldo').style.color = totalSaldo >= 0 ? 'var(--positive-color)' : 'var(--negative-color)';
}

function clearFilter() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterDescription').value = '';
    const tbody = document.getElementById('filteredTransactionsTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    document.getElementById('totalReceitas').innerText = formatCurrency(0);
    document.getElementById('totalDespesas').innerText = formatCurrency(0);
    document.getElementById('totalSaldo').innerText = formatCurrency(0);
    document.getElementById('totalSaldo').style.color = 'var(--text-color)';
    updateFilteredView();
}

function loadReminders(userId) {
    console.log('Carregando lembretes para o usuário:', userId);
    const selectedDate = document.getElementById('date').value || getCurrentDate();
    const selectedMonth = selectedDate.slice(0, 7);
    console.log('Mês selecionado para exibir lembretes:', selectedMonth);

    database.ref(`reminders/${userId}`).once('value').then((snapshot) => {
        const remindersList = document.getElementById('remindersList');
        remindersList.innerHTML = '';
        const data = snapshot.val();
        console.log('Dados brutos retornados do Firebase:', data);

        if (!data) {
            reminders = [];
            remindersList.innerHTML = '<li>Nenhum lembrete cadastrado.</li>';
            console.log('Nenhum dado de lembretes encontrado no Firebase');
            return;
        }

        reminders = Object.entries(data)
            .map(([id, reminder]) => ({
                id,
                date: reminder.date,
                description: reminder.description,
                amount: reminder.amount,
                type: reminder.type,
                monthly: reminder.monthly || false
            }))
            .filter(reminder => reminder.date && reminder.description && reminder.amount !== undefined && reminder.type);
        console.log('Lembretes carregados e filtrados:', reminders);

        let displayReminders = [];

        reminders.forEach(reminder => {
            console.log('Processando lembrete:', reminder);
            const reminderMonth = reminder.date.slice(0, 7);
            const reminderDay = reminder.date.split('-')[2].padStart(2, '0');
            const selectedDateObj = new Date(selectedDate);
            const reminderDateObj = new Date(reminder.date);

            if (reminder.monthly) {
                let currentDate = new Date(reminderDateObj);
                console.log('Lembrete mensal, verificando meses até:', selectedDate);
                while (currentDate <= selectedDateObj) {
                    const currentMonth = currentDate.toISOString().slice(0, 7);
                    console.log('Verificando mês para lembrete mensal:', currentMonth);
                    if (currentMonth === selectedMonth) {
                        const displayDate = `${currentMonth}-${reminderDay}`;
                        displayReminders.push({
                            ...reminder,
                            displayDate,
                            displayId: `${reminder.id}_${currentMonth}`
                        });
                        console.log('Adicionado lembrete mensal para exibição:', { displayDate });
                    }
                    currentDate.setMonth(currentDate.getMonth() + 1);
                }
            } else if (reminderMonth === selectedMonth) {
                displayReminders.push({
                    ...reminder,
                    displayDate: reminder.date,
                    displayId: reminder.id
                });
                console.log('Adicionado lembrete único para exibição:', { displayDate: reminder.date });
            }
        });

        console.log('Lembretes prontos para exibição:', displayReminders);

        if (displayReminders.length > 0) {
            displayReminders.forEach(reminder => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="reminder-info" onclick="openReminderConfirmModal('${reminder.id}', '${reminder.displayDate}')">
                        <span>${formatDate(reminder.displayDate)}</span>
                        <span>${reminder.description}${reminder.monthly ? ' (Mensal)' : ''}</span>
                    </div>
                    <span class="reminder-amount ${reminder.type}">${formatCurrency(reminder.amount)}</span>
                    <i class="fas fa-edit edit-icon" onclick="openEditReminderModal('${reminder.id}')"></i>
                    <i class="fas fa-trash-alt delete-icon" onclick="openDeleteReminderConfirmModal('${reminder.id}')"></i>
                `;
                remindersList.appendChild(li);
            });
            console.log('Lembretes exibidos na lista:', displayReminders.length);
        } else {
            remindersList.innerHTML = '<li>Nenhum lembrete para o mês selecionado.</li>';
            console.log('Nenhum lembrete encontrado para o mês:', selectedMonth);
        }
    }).catch(error => {
        console.error('Erro ao carregar lembretes:', error);
        document.getElementById('remindersList').innerHTML = '<li>Erro ao carregar lembretes.</li>';
    });
}

function openAddReminderModal() {
    const modal = document.getElementById('addReminderModal');
    document.getElementById('reminderDate').value = getCurrentDate();
    document.getElementById('reminderDescription').value = '';
    document.getElementById('reminderAmount').value = '0,00';
    document.getElementById('reminderType').value = 'payment';
    document.getElementById('reminderMonthly').checked = false;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeAddReminderModal() {
    const modal = document.getElementById('addReminderModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function addReminder() {
    const date = document.getElementById('reminderDate').value;
    const description = document.getElementById('reminderDescription').value.trim();
    const amount = parseCurrency(document.getElementById('reminderAmount').value);
    const type = document.getElementById('reminderType').value;
    const monthly = document.getElementById('reminderMonthly').checked;

    if (!date || !description || isNaN(amount) || amount <= 0) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }

    const userId = auth.currentUser.uid;
    const reminder = {
        id: generateTransactionId(),
        date,
        description,
        amount,
        type,
        monthly
    };

    console.log('Adicionando novo lembrete:', reminder);

    database.ref(`reminders/${userId}/${reminder.id}`).set(reminder)
        .then(() => {
            alert('Lembrete adicionado com sucesso!');
            closeAddReminderModal();
            loadReminders(userId);
        })
        .catch(error => {
            console.error('Erro ao adicionar lembrete:', error);
            alert('Erro ao adicionar lembrete. Tente novamente.');
        });
}

function openEditReminderModal(reminderId) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) {
        alert('Lembrete não encontrado.');
        loadReminders(auth.currentUser.uid);
        return;
    }

    selectedReminderId = reminderId;
    const modal = document.getElementById('editReminderModal');
    document.getElementById('editReminderDate').value = reminder.date;
    document.getElementById('editReminderDescription').value = reminder.description;
    document.getElementById('editReminderAmount').value = formatCurrency(reminder.amount).replace('R$', '').trim();
    document.getElementById('editReminderType').value = reminder.type;
    document.getElementById('editReminderMonthly').checked = reminder.monthly || false;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeEditReminderModal() {
    const modal = document.getElementById('editReminderModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
        selectedReminderId = null;
    }, 500);
}

function updateReminder() {
    if (!selectedReminderId) return;

    const date = document.getElementById('editReminderDate').value;
    const description = document.getElementById('editReminderDescription').value.trim();
    const amount = parseCurrency(document.getElementById('editReminderAmount').value);
    const type = document.getElementById('editReminderType').value;
    const monthly = document.getElementById('editReminderMonthly').checked;

    if (!date || !description || isNaN(amount) || amount <= 0) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }

    const userId = auth.currentUser.uid;
    const updatedReminder = {
        id: selectedReminderId,
        date,
        description,
        amount,
        type,
        monthly
    };

    console.log('Atualizando lembrete:', updatedReminder);

    database.ref(`reminders/${userId}/${selectedReminderId}`).set(updatedReminder)
        .then(() => {
            alert('Lembrete atualizado com sucesso!');
            closeEditReminderModal();
            loadReminders(userId);
        })
        .catch(error => {
            console.error('Erro ao atualizar lembrete:', error);
            alert('Erro ao atualizar lembrete. Tente novamente.');
        });
}

function openDeleteReminderConfirmModal(reminderId) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) {
        alert('Lembrete não encontrado.');
        loadReminders(auth.currentUser.uid);
        return;
    }

    selectedReminderId = reminderId;
    const modal = document.getElementById('deleteReminderConfirmModal');
    const message = document.getElementById('deleteReminderMessage');
    message.innerText = `Tem certeza que deseja excluir o lembrete "${reminder.description}" de ${formatCurrency(reminder.amount)} em ${formatDate(reminder.date)}?`;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeDeleteReminderConfirmModal() {
    const modal = document.getElementById('deleteReminderConfirmModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
        selectedReminderId = null;
    }, 500);
}

function deleteReminder(confirmed) {
    if (!selectedReminderId || !confirmed) {
        closeDeleteReminderConfirmModal();
        return;
    }

    const userId = auth.currentUser.uid;
    database.ref(`reminders/${userId}/${selectedReminderId}`).remove()
        .then(() => {
            alert('Lembrete excluído com sucesso!');
            closeDeleteReminderConfirmModal();
            loadReminders(userId);
        })
        .catch(error => {
            console.error('Erro ao excluir lembrete:', error);
            alert('Erro ao excluir lembrete. Tente novamente.');
        });
}

function openReminderConfirmModal(reminderId, displayDate) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) {
        alert('Lembrete não encontrado.');
        loadReminders(auth.currentUser.uid);
        return;
    }

    selectedReminderId = reminderId;
    const modal = document.getElementById('reminderConfirmModal');
    const title = document.getElementById('reminderConfirmTitle');
    const message = document.getElementById('reminderConfirmMessage');
    title.innerText = `Confirmar ${reminder.type === 'payment' ? 'Pagamento' : 'Receita'}`;
    message.innerText = `${reminder.description} - ${formatCurrency(reminder.amount)} em ${formatDate(displayDate)}\nJá foi ${reminder.type === 'payment' ? 'pago' : 'recebido'}?`;
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeReminderConfirmModal() {
    const modal = document.getElementById('reminderConfirmModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
        selectedReminderId = null;
    }, 500);
}

function confirmReminder(confirmed) {
    if (!selectedReminderId || !confirmed) {
        closeReminderConfirmModal();
        return;
    }

    const reminder = reminders.find(r => r.id === selectedReminderId);
    if (!reminder) {
        alert('Lembrete não encontrado.');
        closeReminderConfirmModal();
        loadReminders(auth.currentUser.uid);
        return;
    }

    const userId = auth.currentUser.uid;
    const transaction = {
        id: generateTransactionId(),
        date: document.getElementById('date').value,
        description: reminder.description,
        amount: reminder.type === 'payment' ? -reminder.amount : reminder.amount,
        type: reminder.type === 'payment' ? 'despesa' : 'receita'
    };

    transactions.push(transaction);
    saveTransactions();

    if (!reminder.monthly) {
        database.ref(`reminders/${userId}/${selectedReminderId}`).remove()
            .then(() => {
                alert(`Transação de ${transaction.type} registrada com sucesso!`);
                closeReminderConfirmModal();
                loadReminders(userId);
                updateFilteredView();
                calculateBalances();
            })
            .catch(error => {
                console.error('Erro ao remover lembrete:', error);
                alert('Erro ao processar o lembrete. Tente novamente.');
            });
    } else {
        alert(`Transação de ${transaction.type} registrada com sucesso!`);
        closeReminderConfirmModal();
        updateFilteredView();
        calculateBalances();
    }
}

function openCompoundInterestModal() {
    const modal = document.getElementById('compoundInterestModal');
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeCompoundInterestModal() {
    const modal = document.getElementById('compoundInterestModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function calculateCompoundInterest() {
    const initialCapital = parseFloat(document.getElementById('initialAmount').value) || 0;
    const monthlyDeposit = parseFloat(document.getElementById('monthlyContribution').value) || 0;
    const yearlyRate = parseFloat(document.getElementById('interestRate').value) || 0;
    const years = parseInt(document.getElementById('years').value) || 0;
    const frequency = parseInt(document.getElementById('compoundingFrequency').value) || 1;

    if (initialCapital < 0 || monthlyDeposit < 0 || yearlyRate < 0 || years <= 0 || frequency <= 0) {
        document.getElementById('compoundInterestResult').innerHTML = 
            '<span style="color: var(--negative-color);">Por favor, insira valores válidos (positivos e período maior que zero).</span>';
        return;
    }

    const monthlyRate = yearlyRate / 100 / frequency;
    const totalPeriods = years * frequency;
    let finalAmount = initialCapital;

    for (let i = 0; i < totalPeriods; i++) {
        finalAmount = (finalAmount + monthlyDeposit) * (1 + monthlyRate);
    }

    const totalInvested = initialCapital + (monthlyDeposit * totalPeriods);
    const interestEarned = finalAmount - totalInvested;

    document.getElementById('compoundInterestResult').innerHTML = `
        <p>Montante Final: <span class="highlight-amount">${formatCurrency(finalAmount)}</span></p>
        <p>Total Investido: <span style="color: var(--text-color);">${formatCurrency(totalInvested)}</span></p>
        <p>Juros Acumulados: <span style="color: var(--positive-color);">${formatCurrency(interestEarned)}</span></p>
    `;
}

function openThemeSelectorModal() {
    const modal = document.getElementById('themeSelectorModal');
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closeThemeSelectorModal() {
    const modal = document.getElementById('themeSelectorModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function applyTheme(color) {
    document.documentElement.style.setProperty('--button-color', color);
    document.documentElement.style.setProperty('--input-border-color', color);
    const userId = auth.currentUser.uid;
    if (userId) {
        database.ref('users/' + userId + '/theme').set(color)
            .then(() => {
                console.log('Tema salvo com sucesso:', color);
                closeThemeSelectorModal();
            })
            .catch(error => {
                console.error('Erro ao salvar tema:', error);
                alert('Erro ao salvar o tema. Tente novamente.');
            });
    }
}

function registerNewUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;

    if (!name || !email || !password) {
        alert('Por favor, preencha todos os campos para registrar o novo usuário.');
        return;
    }

    if (password.length < 6) {
        alert('A senha deve ter pelo menos 6 caracteres.');
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            const userData = {
                name: name,
                email: email,
                createdAt: new Date().toISOString()
            };

            return database.ref('users/' + user.uid).set(userData);
        })
        .then(() => {
            alert('Novo usuário registrado com sucesso!');
            document.getElementById('newUserName').value = '';
            document.getElementById('newUserEmail').value = '';
            document.getElementById('newUserPassword').value = '';
            closeAdminModal();
            loadAllUsers();
        })
        .catch((error) => {
            console.error('Erro ao registrar novo usuário:', error);
            alert('Erro ao registrar usuário: ' + error.message);
        });
}

function markAsPaid() {
    closeReminderAlertModal();
    openReminderConfirmModal(selectedReminderId, document.getElementById('date').value);
}

function snoozeReminder() {
    closeReminderAlertModal();
    const reminder = reminders.find(r => r.id === selectedReminderId);
    if (!reminder) return;

    const userId = auth.currentUser.uid;
    const newDate = getNextMonthDate(reminder.date);

    database.ref(`reminders/${userId}/${selectedReminderId}`).update({ date: newDate })
        .then(() => {
            alert('Lembrete adiado para o próximo mês!');
            loadReminders(userId);
        })
        .catch(error => {
            console.error('Erro ao adiar lembrete:', error);
            alert('Erro ao adiar lembrete. Tente novamente.');
        });
}

function goToLimitPage() {
    const limit = prompt('Digite o novo limite de gastos mensais (R$):', formatCurrency(monthlyLimit).replace('R$', '').trim());
    if (limit !== null) {
        const parsedLimit = parseCurrency(limit);
        if (isNaN(parsedLimit) || parsedLimit < 0) {
            alert('Por favor, insira um valor válido.');
        } else {
            monthlyLimit = parsedLimit;
            localStorage.setItem('monthlyLimit', formatCurrency(monthlyLimit).replace('R$', '').trim());
            checkMonthlyLimit();
            alert('Limite de gastos mensais atualizado para ' + formatCurrency(monthlyLimit));
        }
    }
}

function openPieChartModal() {
    const modal = document.getElementById('pieChartModal');
    document.getElementById('chartStartDate').value = '';
    document.getElementById('chartEndDate').value = '';
    document.getElementById('chartType').value = 'receita';
    modal.style.display = 'block';
    modal.style.animation = 'slideIn 0.4s';
}

function closePieChartModal() {
    const modal = document.getElementById('pieChartModal');
    modal.style.animation = 'fadeout 0.5s';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 500);
}

function generatePieChart() {
    const startDate = document.getElementById('chartStartDate').value;
    const endDate = document.getElementById('chartEndDate').value;
    const chartType = document.getElementById('chartType').value;

    if (!startDate || !endDate) {
        alert('Por favor, preencha as datas inicial e final.');
        return;
    }

    const filteredTransactions = transactions.filter(t => {
        return t.date >= startDate && t.date <= endDate && t.type === chartType;
    });

    // Agrupar transações pelo nome da descrição e somar os valores
    const descriptionTotals = {};
    filteredTransactions.forEach(t => {
        descriptionTotals[t.description] = (descriptionTotals[t.description] || 0) + t.amount;
    });

    const labels = Object.keys(descriptionTotals);
    const data = Object.values(descriptionTotals);

    if (labels.length === 0) {
        alert('Nenhuma transação encontrada para o período e tipo selecionados.');
        return;
    }

    const totalAmount = data.reduce((sum, value) => sum + value, 0);
    const percentages = data.map(value => ((value / totalAmount) * 100).toFixed(1));

    const ctx = document.getElementById('pieChart').getContext('2d');
    if (window.pieChartInstance) {
        window.pieChartInstance.destroy();
    }

    window.pieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: labels.map(() => getRandomColor()),
                borderColor: 'rgba(255, 255, 255, 0.8)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            layout: {
                padding: 5
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'var(--text-color)',
                        font: {
                            size: 10,
                            family: "'Poppins', sans-serif"
                        },
                        padding: 5,
                        boxWidth: 15,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} (${percentages[i]}%)`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                strokeStyle: 'rgba(255, 255, 255, 0.8)',
                                lineWidth: 2,
                                hidden: isNaN(data.datasets[0].data[i]) || data.datasets[0].data[i] === null,
                                index: i
                            }));
                        }
                    }
                },
                title: {
                    display: true,
                    text: `Distribuição de ${chartType === 'receita' ? 'Receitas' : 'Despesas'} (${formatDate(startDate)} a ${formatDate(endDate)})`,
                    color: 'var(--positive-color)',
                    font: {
                        size: 14,
                        family: "'Orbitron', sans-serif"
                    },
                    padding: {
                        top: 5,
                        bottom: 5
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = percentages[context.dataIndex];
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    },
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 10 },
                    bodyFont: { size: 10 }
                }
            }
        }
    });

    const canvas = document.getElementById('pieChart');
    canvas.style.maxWidth = '350px';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.parentElement.style.minHeight = '200px';
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

document.getElementById('date').value = getCurrentDate();
