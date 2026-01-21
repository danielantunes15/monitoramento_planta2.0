const API_URL_TOPO = ''; // Relativo

let cachedLinks = [];

window.toggleTopologyPanel = function() {
    const panel = document.getElementById('topology-panel');
    const wasOpen = panel.classList.contains('open');
    
    document.querySelectorAll('.editor-sidebar').forEach(el => el.classList.remove('open'));
    
    if (!wasOpen) {
        panel.classList.add('open');
        initTopologyEditor();
        loadLinksData();
    }
};

async function loadLinksData() {
    try {
        const res = await fetch(`${API_URL_TOPO}/links`);
        const data = await res.json();
        cachedLinks = data;
        renderLinksTable();
        
        if(window.update3DCables) {
            window.update3DCables(data);
        }
    } catch (e) { console.error("Erro ao carregar links", e); }
}

function renderLinksTable() {
    const list = document.getElementById('links-list-db');
    const countSpan = document.getElementById('link-count-db');
    if(!list) return;
    
    list.innerHTML = '';
    if(countSpan) countSpan.innerText = cachedLinks.length;

    if(cachedLinks.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#64748b; padding:20px;">Nenhuma conexão.</div>';
        return;
    }

    cachedLinks.forEach((link) => {
        const html = `
            <div class="link-card" style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:10px; margin-bottom:5px; border-radius:5px; align-items:center;">
                <div class="link-info" style="font-size:12px;">
                    <span style="color:#2dd4bf; font-weight:bold;">${link.from_sector}</span>
                    <i class="fas fa-arrow-right" style="color:#64748b; margin:0 5px;"></i>
                    <span style="color:#2dd4bf; font-weight:bold;">${link.to_sector}</span>
                </div>
                <button onclick="deleteLinkDB(${link.id})" style="background:none; border:none; color:#fb7185; cursor:pointer;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        list.innerHTML += html;
    });
}

// Salvar link manual (dropdown)
window.addLinkDB = async function() {
    const from = document.getElementById('from-sector-db').value;
    const to = document.getElementById('to-sector-db').value;

    if(from === to) return alert("Origem e Destino são iguais.");
    if(!from || !to) return alert("Selecione os dois pontos.");

    // Verifica duplicidade
    const exists = cachedLinks.some(l => 
        (l.from_sector === from && l.to_sector === to) || 
        (l.from_sector === to && l.to_sector === from)
    );
    if(exists) return alert("Essa conexão já existe.");

    // Salva com waypoints vazio (reta)
    saveCustomLink(from, to, []);
};

// [NOVO] Função genérica para salvar (usada pelo desenho 3D também)
window.saveCustomLink = async function(from, to, waypoints) {
    try {
        const body = {
            from_sector: from,
            to_sector: to,
            waypoints: waypoints
        };

        const res = await fetch(`${API_URL_TOPO}/links`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        
        if(res.ok) {
            loadLinksData();
            if(waypoints.length > 0) alert("Rota desenhada salva com sucesso!");
        } else {
            alert("Erro ao salvar.");
        }
    } catch (e) { alert("Erro de conexão."); }
}

window.deleteLinkDB = async function(id) {
    if(!confirm("Remover esta conexão física?")) return;
    try {
        await fetch(`${API_URL_TOPO}/links/${id}`, { method: 'DELETE' });
        loadLinksData();
    } catch(e) { alert("Erro ao deletar."); }
};

function initTopologyEditor() {
    const s1 = document.getElementById('from-sector-db');
    const s2 = document.getElementById('to-sector-db');
    
    if(s1 && s2 && window.SETORES) {
        s1.innerHTML = '<option value="" disabled selected>Origem</option>'; 
        s2.innerHTML = '<option value="" disabled selected>Destino</option>';
        
        window.SETORES.forEach(s => {
            s1.add(new Option(s.name, s.id));
            s2.add(new Option(s.name, s.id));
        });
    }
}

// Configura o Painel HTML
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('topology-panel')) {
        const panelHTML = `
        <div id="topology-panel" class="editor-sidebar wide">
            <div class="editor-header" style="background: rgba(147, 51, 234, 0.1);">
                <h3 style="color: #a855f7;"><i class="fas fa-bezier-curve"></i> Topologia de Rede</h3>
                <button class="close-btn" onclick="toggleTopologyPanel()"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="editor-body">
                <p style="font-size:12px; color:#94a3b8; margin-bottom:15px;">
                    Defina conexões via dropdown ou desenhe no chão.
                </p>

                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <select id="from-sector-db" class="table-input"></select>
                        <i class="fas fa-exchange-alt" style="color:#64748b"></i>
                        <select id="to-sector-db" class="table-input"></select>
                    </div>
                    <button onclick="addLinkDB()" class="btn-resolve" style="background:#a855f7; color:white; margin-top:10px; width:100%;">
                        <i class="fas fa-plus"></i> Adicionar Cabo (Direto)
                    </button>
                    
                    <div style="text-align:center; margin:10px 0; color:#64748b; font-size:10px;">— OU —</div>

                    <button onclick="window.startCableDrawing()" class="btn-resolve" style="background:#3b82f6; color:white; width:100%;">
                        <i class="fas fa-pen"></i> Desenhar Rota no Mapa
                    </button>
                    <p style="font-size:10px; color:#94a3b8; margin-top:5px; text-align:center;">
                        Clique na Origem -> Clique no Chão -> Clique no Destino
                    </p>
                </div>

                <div style="margin-top: 20px;">
                    <h4 style="color:#cbd5e1; font-size:11px; text-transform:uppercase; margin-bottom:10px;">
                        Cabos Instalados (<span id="link-count-db">0</span>)
                    </h4>
                    <div id="links-list-db" class="links-container"></div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
    }
});