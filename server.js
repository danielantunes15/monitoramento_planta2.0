const express = require('express');
const ping = require('ping');
const cors = require('cors');
const supabase = require('./supabase');
const path = require('path');
const { exec } = require('child_process');
const http = require('http'); 
const { Server } = require('socket.io');

// Configuração do App e Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());

// Serve os arquivos do Front-end (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, '/')));

// --- CONFIGURAÇÃO ---
const PING_INTERVAL = 10 * 1000; // Atualiza a cada 10 segundos
const PING_CONFIG = {
    timeout: 2, 
    extra: ['-i', '1'] 
};

// Cache em memória
let cachedStatus = [];

// Dados de Backup (caso o banco falhe)
const FALLBACK_DATA = [
    { id: 'REFEITORIO', name: 'Refeitório', ip: '192.168.39.1' },
    { id: 'CPD', name: 'CPD', ip: '192.168.36.53' },
    { id: 'OLD', name: 'OLD', ip: '192.168.36.60' },
    { id: 'SUPERVISAO', name: 'Supervisão', ip: '192.168.36.14' },
    { id: 'COI', name: 'COI', ip: '192.168.36.15' },
    { id: 'PCTS', name: 'PCTS', ip: '192.168.36.17' },
    { id: 'BALANCA', name: 'Balança', ip: '192.168.36.18' },
    { id: 'PORTARIA', name: 'Portaria', ip: '192.168.36.19' },
    { id: 'VINHACA', name: 'Vinhaça', ip: '192.168.36.20' }
];

// --- FUNÇÃO DE PING OTIMIZADA (PARALELA) ---
async function runPingCycle() {
    // console.log(`\n[${new Date().toLocaleTimeString()}] Iniciando Ping...`);
    
    let hosts = [];
    let allDevices = [];

    // 1. Busca Dados do Banco
    try { 
        const { data: hostData } = await supabase.from('hosts').select('*').order('name');
        hosts = (hostData && hostData.length > 0) ? hostData : FALLBACK_DATA;
        
        const { data: devData } = await supabase.from('devices').select('*');
        allDevices = devData || [];
    } catch (e) { 
        hosts = FALLBACK_DATA; 
    }

    const checkTime = new Date().toLocaleString('pt-BR'); 

    // 2. Dispara Pings em Paralelo (Promise.all)
    const promises = hosts.map(async (host) => {
        // A. Ping no Switch Principal
        let hostAlive = false;
        let hostLatency = 'timeout';
        const hostIp = host.ip ? host.ip.trim() : null;

        if(hostIp) {
            try {
                const res = await ping.promise.probe(hostIp, PING_CONFIG);
                hostAlive = res.alive;
                hostLatency = hostAlive ? res.time + 'ms' : 'timeout';
            } catch (err) { hostAlive = false; }
        }

        // B. Ping nos Dispositivos do Setor
        const sectorDevices = allDevices.filter(d => d.sector_id === host.id);
        
        const devicePromises = sectorDevices.map(async (dev) => {
            let devAlive = false;
            if(dev.ip) {
                try {
                    const resDev = await ping.promise.probe(dev.ip.trim(), PING_CONFIG);
                    devAlive = resDev.alive;
                } catch(e) {}
            }
            return {
                name: dev.name,
                ip: dev.ip,
                online: devAlive
            };
        });

        const deviceStatuses = await Promise.all(devicePromises);

        // C. Define Status (OK / WARNING / CRITICAL)
        const anyDeviceDown = deviceStatuses.some(d => !d.online);
        let status = 'OK';

        if (!hostAlive) {
            status = 'CRITICAL'; 
        } else if (anyDeviceDown) {
            status = 'WARNING'; 
        }

        // D. Log de Histórico
        const previous = cachedStatus.find(c => c.id === host.id);
        const prevStatus = previous ? previous.status : 'OK';

        if (status !== 'OK' && status !== prevStatus) {
            const reason = status === 'CRITICAL' ? "Switch Offline" : "Falha em Equipamento";
            logHistory(host.id, reason);
        }

        return {
            id: host.id,
            name: host.name,
            ip: hostIp,
            online: hostAlive,
            devices: deviceStatuses,
            status: status,
            latency: hostLatency,
            last_check: checkTime
        };
    });

    // Aguarda todos terminarem
    const results = await Promise.all(promises);
    cachedStatus = results;
    
    // Envia para o Front-end via Socket
    io.emit('update', results);
}

// Inicia o Loop
runPingCycle();
setInterval(runPingCycle, PING_INTERVAL);


// --- ROTAS DA API ---

app.get('/status-rede', (req, res) => res.json(cachedStatus));

// CRUD HOSTS
app.get('/hosts', async (req, res) => {
    const { data } = await supabase.from('hosts').select('*').order('name');
    res.json(data || []);
});
app.post('/hosts', async (req, res) => {
    const { error } = await supabase.from('hosts').upsert(req.body, { onConflict: 'id' });
    if (error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});

// CRUD DEVICES
app.get('/devices', async (req, res) => {
    const { sector } = req.query;
    let query = supabase.from('devices').select('*');
    if(sector) query = query.eq('sector_id', sector);
    const { data, error } = await query;
    if(error) return res.status(500).json([]);
    res.json(data);
});
app.post('/devices', async (req, res) => {
    const { error } = await supabase.from('devices').insert(req.body);
    if(error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});
app.delete('/devices/:id', async (req, res) => {
    const { error } = await supabase.from('devices').delete().eq('id', req.params.id);
    if(error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});

// CRUD HISTÓRICO
app.get('/history', async (req, res) => {
    const { data } = await supabase.from('history').select('*').order('timestamp', { ascending: false }).limit(50);
    res.json(data || []);
});
app.delete('/history', async (req, res) => {
    await supabase.from('history').delete().gt('id', 0);
    res.json({ success: true });
});

// --- NOVAS ROTAS DE TOPOLOGIA (LINKS/CABOS) ---
app.get('/links', async (req, res) => {
    const { data, error } = await supabase.from('links').select('*');
    if(error) return res.status(500).json([]);
    res.json(data || []);
});

app.post('/links', async (req, res) => {
    const { error } = await supabase.from('links').insert(req.body);
    if(error) return res.status(500).json({error: error.message});
    
    // Avisa todos os clientes para redesenhar os cabos
    const { data } = await supabase.from('links').select('*');
    io.emit('topology-update', data);
    
    res.json({ success: true });
});

app.delete('/links/:id', async (req, res) => {
    const { error } = await supabase.from('links').delete().eq('id', req.params.id);
    if(error) return res.status(500).json({error: error.message});

    // Avisa todos os clientes
    const { data } = await supabase.from('links').select('*');
    io.emit('topology-update', data);

    res.json({ success: true });
});


// Função Auxiliar de Log
async function logHistory(sectorId, reason) {
    try {
        await supabase.from('history').insert([{
            timestamp: new Date().toISOString(),
            sector: sectorId,
            duration: reason
        }]);
    } catch(e) { console.error("Erro histórico:", e); }
}

// INICIALIZAÇÃO
server.listen(3000, () => {
    console.log('--- SISTEMA ONLINE NA PORTA 3000 ---');
    
    // Abre o navegador automaticamente
    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
    exec(`${start} ${url}`);
});