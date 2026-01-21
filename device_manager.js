const API_URL_DEV = ''; // Alterado para vazio

const AVAILABLE_SECTORS = [
    { id: 'CPD', name: 'CPD' },
    { id: 'REFEITORIO', name: 'Refeitório' },
    { id: 'PORTARIA', name: 'Portaria' },
    { id: 'BALANCA', name: 'Balança' },
    { id: 'PCTS', name: 'PCTS' },
    { id: 'COI', name: 'COI' },
    { id: 'OBEYA', name: 'OBEYA' },
    { id: 'VINHACA', name: 'Vinhaça' },
    { id: 'OLD', name: 'OLD' },
    { id: 'ADM', name: 'Administrativo' },
    { id: 'RH', name: 'RH' },
    { id: 'LABORATORIO', name: 'Laboratório' }
];

window.toggleDevicePanel = function() {
    const panel = document.getElementById('device-panel');
    
    document.querySelectorAll('.editor-sidebar').forEach(el => {
        if(el.id !== 'device-panel') el.classList.remove('open');
    });
    
    if (panel) {
        if(panel.classList.contains('open')) {
            panel.classList.remove('open');
        } else {
            panel.classList.add('open');
            loadDeviceList();
        }
    }
};

let currentDevices = [];

async function loadDeviceList() {
    const tbody = document.getElementById('device-tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr style="color:#64748b"><td colspan="4" style="text-align:center; padding:20px;">Carregando inventário...</td></tr>';

    try {
        const res = await fetch(`${API_URL_DEV}/devices`);
        const data = await res.json();
        
        currentDevices = data.sort((a, b) => {
            if(a.sector_id === b.sector_id) return a.name.localeCompare(b.name);
            return a.sector_id.localeCompare(b.sector_id);
        });
        
        renderDeviceTable();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#fb7185; padding:20px;">Erro de conexão com o servidor.</td></tr>';
    }
}

function renderDeviceTable() {
    const tbody = document.getElementById('device-tbody');
    tbody.innerHTML = '';

    currentDevices.forEach((dev) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold; color:#cbd5e1; font-size:12px;">${dev.sector_id}</td>
            <td>${dev.name}</td>
            <td style="font-family:monospace; color:#2dd4bf;">${dev.ip}</td>
            <td style="text-align:right;">
                <button onclick="deleteDevice(${dev.id})" class="btn-mini" style="color:#fb7185; background:none; border:none; cursor:pointer;" title="Remover">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const addTr = document.createElement('tr');
    addTr.style.background = 'rgba(45, 212, 191, 0.05)';
    addTr.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    
    let optionsHtml = `<option value="" disabled selected>Setor...</option>`;
    AVAILABLE_SECTORS.forEach(s => {
        optionsHtml += `<option value="${s.id}">${s.name}</option>`;
    });

    addTr.innerHTML = `
        <td style="padding:10px;">
            <select id="new-dev-sector" class="table-input" style="padding:5px; width:100%;">
                ${optionsHtml}
            </select>
        </td>
        <td style="padding:10px;">
            <input type="text" id="new-dev-name" placeholder="Nome/Modelo" class="table-input" style="width:100%;">
        </td>
        <td style="padding:10px;">
            <input type="text" id="new-dev-ip" placeholder="IP" class="table-input" style="width:100%;">
        </td>
        <td style="text-align:right; padding:10px;">
            <button onclick="addDevice()" class="btn-resolve" style="background:#2dd4bf; color:#0f172a; width:auto; padding:5px 10px; font-size:12px;">
                <i class="fas fa-plus"></i>
            </button>
        </td>
    `;
    tbody.appendChild(addTr);
}

async function addDevice() {
    const sectorId = document.getElementById('new-dev-sector').value;
    const name = document.getElementById('new-dev-name').value;
    const ip = document.getElementById('new-dev-ip').value;

    if(!sectorId || !name || !ip) return alert("Por favor, preencha o Setor, Nome e IP.");

    try {
        const res = await fetch(`${API_URL_DEV}/devices`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ sector_id: sectorId, name, ip })
        });
        if(res.ok) {
            loadDeviceList();
        } else {
            alert("Erro ao salvar no banco.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    }
}

async function deleteDevice(id) {
    if(!confirm("Tem certeza que deseja remover este equipamento?")) return;
    try {
        await fetch(`${API_URL_DEV}/devices/${id}`, { method: 'DELETE' });
        loadDeviceList();
    } catch(e) { alert("Erro ao deletar."); }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('device-panel')) {
        const panelHTML = `
        <div id="device-panel" class="editor-sidebar wide"> 
            <div class="editor-header" style="background: rgba(45, 212, 191, 0.05);">
                <h3 style="color: #2dd4bf;"><i class="fas fa-list-alt"></i> Inventário de Rede</h3>
                <button class="close-btn" onclick="toggleDevicePanel()"><i class="fas fa-times"></i></button>
            </div>
            <div class="editor-body">
                <p style="font-size:12px; color:#94a3b8; margin-bottom: 15px;">
                    Gerenciamento de Endpoints (Impressoras, Câmeras, PCs)
                </p>
                <div class="table-container">
                    <table class="server-table" style="width:100%">
                        <thead>
                            <tr>
                                <th style="width: 20%">SETOR</th>
                                <th style="width: 40%">EQUIPAMENTO</th>
                                <th style="width: 30%">IP</th>
                                <th style="width: 10%">AÇÃO</th>
                            </tr>
                        </thead>
                        <tbody id="device-tbody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
    }
});