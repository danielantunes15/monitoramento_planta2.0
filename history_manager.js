const API_URL_HIST = ''; // Alterado para vazio
let cachedHistory = []; // Cache local

window.toggleHistoryPanel = function() {
    const panel = document.getElementById('history-panel');
    const wasOpen = panel.classList.contains('open');
    document.querySelectorAll('.editor-sidebar').forEach(el => el.classList.remove('open'));
    if (!wasOpen) {
        panel.classList.add('open');
        renderHistoryTable(cachedHistory);
        loadHistoryData();
    }
};

window.clearHistory = async function() {
    if(!confirm("Limpar histórico?")) return;
    try { 
        await fetch(`${API_URL_HIST}/history`, { method: 'DELETE' }); 
        cachedHistory = [];
        renderHistoryTable(cachedHistory);
    } catch (e) {}
};

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('history-panel')) {
        const panelHTML = `
        <div id="history-panel" class="editor-sidebar wide">
            <div class="editor-header" style="background: rgba(251, 113, 133, 0.05);">
                <h3 style="color: #fb7185;"><i class="fas fa-history"></i> Histórico</h3>
                <button class="close-btn" onclick="toggleHistoryPanel()"><i class="fas fa-times"></i></button>
            </div>
            <div class="editor-body">
                <div style="margin-bottom:20px; display:flex; justify-content:space-between;">
                    <p style="font-size:12px; color:#94a3b8;">Registros de queda.</p>
                    <button onclick="clearHistory()" class="btn-mini" style="background:#fb7185; border:none; padding:5px; border-radius:4px; color:white;">Limpar</button>
                </div>
                <div class="table-container"><table class="server-table"><thead><tr><th>Data</th><th>Setor</th><th>Duração</th></tr></thead><tbody id="history-tbody"></tbody></table></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
    }
    loadHistoryData();
});

async function loadHistoryData() {
    try {
        const res = await fetch(`${API_URL_HIST}/history`);
        const data = await res.json();
        
        cachedHistory = data;
        
        if(document.getElementById('history-panel').classList.contains('open')) {
            renderHistoryTable(cachedHistory);
        }
    } catch (error) { }
}

function renderHistoryTable(data) {
    const tbody = document.getElementById('history-tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b">Nenhum registro recente.</td></tr>';
        return;
    }
    
    [...data].reverse().forEach(log => {
        tbody.innerHTML += `<tr><td style="color:#cbd5e1">${new Date(log.timestamp).toLocaleTimeString()}</td><td style="font-weight:bold; color:#fb7185">${log.sector}</td><td>${log.duration}</td></tr>`;
    });
}