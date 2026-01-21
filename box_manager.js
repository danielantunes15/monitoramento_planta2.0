let maintenanceData = [];
let currentBoxId = null; // { linkId, index }

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadMaintenanceData();
});

// Carrega dados do servidor
window.loadMaintenanceData = async function() {
    try {
        const res = await fetch('/maintenance');
        maintenanceData = await res.json();
        // Se a função do 3D existir, pede para atualizar as cores
        if(window.refreshBoxColors) window.refreshBoxColors();
    } catch(e) { console.error("Erro ao carregar manutenção", e); }
};

// Chamado pelo script.js quando clica numa caixa
window.openBoxPanel = function(linkId, boxIndex, fromName, toName) {
    const panel = document.getElementById('box-panel');
    if(panel) panel.classList.add('open');
    
    // Fecha outros painéis para não sobrepor
    document.querySelectorAll('.editor-sidebar').forEach(el => {
        if(el.id !== 'box-panel') el.classList.remove('open');
    });

    currentBoxId = { linkId, index: boxIndex };
    
    // Preenche infos
    document.getElementById('box-location-info').innerText = `Rota: ${fromName} ➡ ${toName}\nCaixa Nº: ${boxIndex + 1}`;
    
    // Busca dados salvos dessa caixa
    const record = maintenanceData.find(m => m.link_id == linkId && m.box_index == boxIndex);
    
    const dateInput = document.getElementById('box-date-input');
    const notesInput = document.getElementById('box-notes-input');
    const badge = document.getElementById('box-status-badge');

    if (record && record.last_cleaned) {
        // Formata data para o input (YYYY-MM-DD)
        const dateObj = new Date(record.last_cleaned);
        dateInput.value = dateObj.toISOString().split('T')[0];
        notesInput.value = record.notes || '';
        
        // Verifica validade (1 ano = 365 dias)
        const now = new Date();
        const diffTime = Math.abs(now - dateObj);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays > 365) {
            badge.style.background = '#ef4444'; // Vermelho
            badge.style.color = '#fff';
            badge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> VENCIDO (${diffDays} dias)`;
        } else {
            badge.style.background = '#22c55e'; // Verde
            badge.style.color = '#fff';
            badge.innerHTML = `<i class="fas fa-check-circle"></i> EM DIA (${diffDays} dias)`;
        }
    } else {
        // Nunca foi limpa
        dateInput.value = '';
        notesInput.value = '';
        badge.style.background = '#f59e0b'; // Laranja
        badge.style.color = '#fff';
        badge.innerHTML = "⚠️ SEM REGISTRO";
    }
};

window.saveBoxMaintenance = async function() {
    if (!currentBoxId) return;
    
    const dateVal = document.getElementById('box-date-input').value;
    const notesVal = document.getElementById('box-notes-input').value;

    if (!dateVal) return alert("Selecione uma data.");

    // [INTELIGÊNCIA] 1. Descobre quais caixas estão perto (incluindo a atual)
    let targets = [];
    if (window.getNearbyBoxes) {
        targets = window.getNearbyBoxes(currentBoxId.linkId, currentBoxId.index);
    } else {
        // Fallback se não tiver a função 3D carregada
        targets = [{ link_id: currentBoxId.linkId, box_index: currentBoxId.index }];
    }

    // 2. Envia atualização para TODAS elas em paralelo
    const promises = targets.map(t => {
        const payload = {
            link_id: t.link_id,
            box_index: t.box_index,
            last_cleaned: dateVal,
            notes: notesVal
        };
        return fetch('/maintenance', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
    });

    try {
        await Promise.all(promises);
        
        const msg = targets.length > 1 
            ? `Manutenção registrada para ${targets.length} caixas próximas!` 
            : "Manutenção registrada!";
            
        alert(msg);
        loadMaintenanceData();
        closeBoxPanel();
    } catch(e) { 
        alert("Erro ao salvar."); 
        console.error(e);
    }
};

window.closeBoxPanel = function() {
    const panel = document.getElementById('box-panel');
    if(panel) panel.classList.remove('open');
    currentBoxId = null;
};

// Verifica status para pintar no 3D
// Retorna: 'OK', 'EXPIRED', 'UNKNOWN'
window.getBoxStatus = function(linkId, boxIndex) {
    const record = maintenanceData.find(m => m.link_id == linkId && m.box_index == boxIndex);
    if (!record || !record.last_cleaned) return 'UNKNOWN'; // Laranja padrão
    
    const last = new Date(record.last_cleaned);
    const now = new Date();
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);
    
    if (diffDays > 365) return 'EXPIRED'; // Vermelho
    return 'OK'; // Verde
};