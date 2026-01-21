let scene, camera, renderer, labelRenderer, controls;
let cables = [];
let interactables = []; 
let networkData = [];
let pulsingRings = [];    // Anéis dos prédios
let activeBoxRings = [];  // [NOVO] Anéis das caixas vencidas
let floorMesh = null; 

const socket = io();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let INTERSECTED;

// === MODO DE DESENHO ===
let isDrawing = false;
let drawStartSector = null;
let drawPoints = [];
let drawingMarkers = []; 

window.SETORES = [
    { id: "PORTARIA", name: "Portaria", pos: { x: 21, z: 55 }, size: [3, 3, 3] },
    { id: "BALANCA", name: "Balança", pos: { x: 12, z: 51 }, size: [4, 3, 4] },
    { id: "PCTS", name: "PCTS", pos: { x: 7, z: 38 }, size: [3.2, 3, 4] },
    { id: "COI", name: "COI", pos: { x: 10, z: -11 }, size: [6, 4, 4] },
    { id: "CCM", name: "CCM", pos: { x: -22.7, z: -27 }, size: [3, 2, 2] },
    { id: "OBEYA", name: "OBEYA", pos: { x: 20, z: -20 }, size: [6, 4, 7] },
    { id: "OLD", name: "OLD", pos: { x: 36, z: -2 }, size: [2, 4, 7] },
    { id: "ADM", name: "ADM", pos: { x: 38, z: 24 }, size: [3, 4, 5] },
    { id: "REFEITORIO", name: "Refeitório", pos: { x: 39, z: 31.8 }, size: [2.7, 3, 4] }
];
const SETORES = window.SETORES;

let activeLinks = []; 
let finalSectorStatus = {}; 

function init() {
    const container = document.getElementById('canvas-3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.FogExp2(0x111111, 0.002);
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    
    camera.position.set(0, 80, 60);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Globais do HTML (R128)
    labelRenderer = new THREE.CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none'; 
    container.appendChild(labelRenderer.domElement);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    scene.add(sun);

    createEnvironment();
    renderStructures();
    
    fetch('/links').then(r=>r.json()).then(data => {
        window.update3DCables(data);
    }).catch(e => console.log("Sem links iniciais"));

    // Listeners do Socket
    socket.on('update', (data) => {
        updateVisuals(data); 
        if(window.updateRealTimeList) window.updateRealTimeList(data);
    });

    socket.on('topology-update', (linksData) => {
        window.update3DCables(linksData);
        if(document.getElementById('topology-panel') && document.getElementById('topology-panel').classList.contains('open')) {
            if(window.loadLinksData) window.loadLinksData(); 
        }
    });

    socket.on('maintenance-update', () => {
        if(window.loadMaintenanceData) window.loadMaintenanceData();
    });

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    renderer.domElement.addEventListener('pointerdown', onDocumentMouseDown, false);
    setupSearch();

    animate();
}

window.update3DCables = function(dbLinks) {
    activeLinks = dbLinks.map(l => ({ 
        id: l.id,
        from: l.from_sector, 
        to: l.to_sector,
        waypoints: l.waypoints 
    }));
    renderCables();
}

window.refreshBoxColors = function() {
    renderCables();
};

function createEnvironment() {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('./img/3.png', 
        function(texture) {
            const planeMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), planeMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.1; 
            floor.receiveShadow = true;
            floorMesh = floor; 
            scene.add(floor);
        },
        undefined,
        function(err) {
            const planeMat = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), planeMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.1;
            floorMesh = floor;
            scene.add(floor);
        }
    );
}

function renderStructures() {
    const geoNormal = new THREE.BoxGeometry(1, 1, 1);
    
    SETORES.forEach(s => {
        const mat = new THREE.MeshPhysicalMaterial({ 
            color: 0x1e293b, 
            transparent: true, opacity: 0.7, 
            roughness: 0.2, metalness: 0.6, clearcoat: 1.0
        });

        const mesh = new THREE.Mesh(geoNormal, mat);
        if(s.type === 'L') mesh.scale.set(8, 4, 4);
        else mesh.scale.set(s.size[0], s.size[1], s.size[2]);
        
        mesh.position.set(s.pos.x, mesh.scale.y / 2, s.pos.z);
        mesh.userData = { id: s.id, name: s.name, type: 'building' };
        
        scene.add(mesh);
        interactables.push(mesh);

        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(mesh.scale.x, mesh.scale.y, mesh.scale.z));
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
        line.position.copy(mesh.position);
        scene.add(line);
        mesh.userData.lineObj = line; 

        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.5, 32), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(s.pos.x, 0.2, s.pos.z);
        ring.visible = false;
        ring.userData = { id: s.id }; 
        scene.add(ring);
        pulsingRings.push(ring); 

        const containerDiv = document.createElement('div');
        containerDiv.style.display = 'flex';
        containerDiv.style.alignItems = 'center';
        containerDiv.style.gap = '8px'; 
        containerDiv.style.pointerEvents = 'none'; 
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label-tag';
        labelDiv.textContent = s.name;
        
        const warnDiv = document.createElement('div');
        warnDiv.className = 'warning-badge';
        warnDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i>'; 
        warnDiv.style.display = 'none'; 
        warnDiv.style.fontSize = '18px'; 

        containerDiv.appendChild(labelDiv);
        containerDiv.appendChild(warnDiv);

        const labelObj = new THREE.CSS2DObject(containerDiv);
        labelObj.position.set(0, (mesh.scale.y/2) + 1.5, 0); 
        mesh.add(labelObj);
        mesh.userData.warningIconDom = warnDiv;
    });

    const tankGeo = new THREE.CylinderGeometry(2.5, 2.5, 3.5, 40);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    for(let i=0; i<5; i++) {
        const t = i / 3;
        const posX = -21 + (-5 - -21) * t;
        const posZ = 6 + (24 - 6) * t;
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(posX, 1.75, posZ);
        const edges = new THREE.EdgesGeometry(tankGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
        tank.add(line);
        scene.add(tank);
    }
}

function renderCables() {
    cables.forEach(obj => scene.remove(obj));
    cables = [];
    activeBoxRings = []; // Limpa lista de anéis de caixas para recriar

    activeLinks.forEach(link => {
        const s1 = SETORES.find(s => s.id === link.from);
        const s2 = SETORES.find(s => s.id === link.to);
        if (s1 && s2) {
            drawCable(s1.pos, s2.pos, link.from, link.to, link.waypoints, link.id);
        }
    });
    
    updateVisuals(networkData);
}

function drawCable(p1, p2, idFrom, idTo, waypoints, linkIdDB) {
    const points = [];
    points.push(new THREE.Vector3(p1.x, 0.5, p1.z));

    if(waypoints && waypoints.length > 0) {
        waypoints.forEach(wp => {
            points.push(new THREE.Vector3(wp.x, 0.5, wp.z));
        });
    } else {
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;
        points.push(new THREE.Vector3(midX, 5, midZ));
    }

    points.push(new THREE.Vector3(p2.x, 0.5, p2.z));

    const path = new THREE.CurvePath();
    if (waypoints && waypoints.length > 0) {
        for (let i = 0; i < points.length - 1; i++) {
            path.add(new THREE.LineCurve3(points[i], points[i+1]));
        }
    } else {
        path.add(new THREE.CatmullRomCurve3(points));
    }

    const geo = new THREE.TubeGeometry(path, 64, 0.1, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    const tube = new THREE.Mesh(geo, mat);
    tube.userData = { isCable: true, from: idFrom, to: idTo };
    scene.add(tube);
    cables.push(tube);

    if (waypoints && waypoints.length > 0) {
        const boxGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        
        waypoints.forEach((wp, index) => {
            let status = 'UNKNOWN';
            if(window.getBoxStatus) {
                status = window.getBoxStatus(linkIdDB, index);
            }

            let boxColor = 0xfacc15; 
            if (status === 'EXPIRED') boxColor = 0xff0000; 
            if (status === 'OK') boxColor = 0x22c55e; 

            const boxMat = new THREE.MeshStandardMaterial({ 
                color: boxColor, 
                roughness: 0.5, metalness: 0.8 
            });

            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(wp.x, 0.5, wp.z);
            
            const edges = new THREE.EdgesGeometry(boxGeo);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
            box.add(line);
            
            box.userData = { 
                isBox: true, 
                linkId: linkIdDB, 
                index: index,
                fromName: idFrom,
                toName: idTo
            }; 
            
            // [NOVO] Se estiver VENCIDO, cria anel piscante
            if (status === 'EXPIRED') {
                const ringGeo = new THREE.RingGeometry(0.8, 1.2, 32);
                const ringMat = new THREE.MeshBasicMaterial({ 
                    color: 0xff0000, 
                    transparent: true, 
                    opacity: 0.8, 
                    side: THREE.DoubleSide 
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(0, -0.2, 0); 
                box.add(ring);
                activeBoxRings.push(ring); // Adiciona na lista de animação
            }

            scene.add(box);
            cables.push(box);
        });
    }

    const packetGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4); 
    const packetMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const packet = new THREE.Mesh(packetGeo, packetMat);
    scene.add(packet);
    packet.userData = { curve: path, progress: 0, speed: 0.004 }; 
    cables.push(packet);
}

function updateVisuals(serverData) {
    if(!serverData) return;
    const lu = document.getElementById('last-update');
    if(lu) lu.innerText = "Atualizado: " + new Date().toLocaleTimeString();
    
    networkData = serverData;
    let globalStatus = 'OK'; 
    const statusMap = {}; 

    SETORES.forEach(s => {
        const net = serverData.find(d => d.id === s.id);
        const currentStatus = net ? (net.status || 'OK') : 'OK';
        statusMap[s.id] = { status: currentStatus };
        if(currentStatus === 'CRITICAL') globalStatus = 'CRITICAL';
        else if(currentStatus === 'WARNING' && globalStatus !== 'CRITICAL') globalStatus = 'WARNING';
    });

    finalSectorStatus = statusMap;

    interactables.forEach(mesh => {
        if(mesh.userData.type === 'building') {
            const info = statusMap[mesh.userData.id] || { status: 'OK' };
            const qh = pulsingRings.find(r => r.userData.id === mesh.userData.id);
            const warnDom = mesh.userData.warningIconDom;

            if(INTERSECTED !== mesh) mesh.material.color.setHex(0x1e293b);
            if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0x38bdf8);
            if(qh) qh.visible = false;
            if(warnDom) warnDom.style.display = 'none';

            if (info.status === 'CRITICAL') {
                mesh.material.color.setHex(0xff0000); 
                if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0xff0000);
                if(qh) { qh.material.color.setHex(0xff0000); qh.visible = true; }
            } 
            else if (info.status === 'WARNING') {
                mesh.material.color.setHex(0xffaa00);
                if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0xfacc15);
                if(qh) { qh.material.color.setHex(0xffff00); qh.visible = true; }
                if(warnDom) warnDom.style.display = 'block';
            }
        }
    });

    cables.forEach(obj => {
        if (obj.userData.isCable && !obj.userData.isBox) {
            if(obj.geometry.type === 'TubeGeometry') {
                const fs = statusMap[obj.userData.from]?.status;
                const ts = statusMap[obj.userData.to]?.status;
                if (fs === 'CRITICAL' || ts === 'CRITICAL') obj.material.color.setHex(0xff0000);
                else obj.material.color.setHex(0x0ea5e9);
            }
        }
    });

    const statusDot = document.getElementById('status-dot');
    const globalText = document.getElementById('global-text');
    if(statusDot && globalText) {
        if(globalStatus === 'CRITICAL') {
            statusDot.className = "dot danger";
            statusDot.style.background = ""; 
            statusDot.style.boxShadow = "";
            globalText.innerText = "FALHA CRÍTICA";
            globalText.style.color = "#fb7185";
        } else if (globalStatus === 'WARNING') {
            statusDot.className = "dot"; 
            statusDot.style.background = "#facc15"; 
            statusDot.style.boxShadow = "0 0 10px #facc15";
            globalText.innerText = "ALERTA / ATENÇÃO";
            globalText.style.color = "#facc15";
        } else {
            statusDot.className = "dot active";
            statusDot.style.background = ""; 
            statusDot.style.boxShadow = "";
            globalText.innerText = "OPERACIONAL";
            globalText.style.color = "#2dd4bf";
        }
    }
}

window.startCableDrawing = function() {
    isDrawing = true;
    drawStartSector = null;
    drawPoints = [];
    document.body.style.cursor = 'crosshair';
    alert("MODO DESENHO:\n1. Clique na ORIGEM (Prédio)\n2. Clique no CHÃO para criar Caixas de Passagem\n3. Clique no DESTINO (Prédio) para finalizar");
};

function clearDrawingMarkers() {
    drawingMarkers.forEach(m => scene.remove(m));
    drawingMarkers = [];
}

function onDocumentMouseDown(event) {
    if (!isDrawing) {
        raycaster.setFromCamera(mouse, camera);
        const hitsCables = raycaster.intersectObjects(cables);
        
        if (hitsCables.length > 0) {
            const target = hitsCables[0].object;
            if (target.userData && target.userData.isBox) {
                if (window.openBoxPanel) {
                    window.openBoxPanel(
                        target.userData.linkId, 
                        target.userData.index,
                        target.userData.fromName,
                        target.userData.toName
                    );
                }
                return; 
            }
        }

        const hitsInteract = raycaster.intersectObjects(interactables);
        if(hitsInteract.length > 0) {
            INTERSECTED = hitsInteract[0].object;
            const panel = document.getElementById('sector-info');
            if(panel) panel.classList.remove('hidden');
            const nameEl = document.getElementById('sector-name');
            if(nameEl) nameEl.innerText = INTERSECTED.userData.name;
            
            const net = networkData.find(n => n.id === INTERSECTED.userData.id);
            const msg = document.getElementById('sector-status-msg');
            const ipEl = document.getElementById('sector-ip');
            
            if(net) {
                if(ipEl) ipEl.innerText = "Switch IP: " + (net.ip || 'Não Configurado');
                let detailsHTML = '';
                if(net.status === 'CRITICAL') detailsHTML += `<div style="margin-bottom:8px; color:#fb7185; font-weight:bold;">❌ Switch: OFFLINE</div>`;
                else detailsHTML += `<div style="margin-bottom:8px; color:#2dd4bf; font-weight:bold;">✅ Switch: ONLINE</div>`;
                
                if(net.devices && net.devices.length > 0) {
                    detailsHTML += `<div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:5px; margin-top:5px;"><small style="color:#94a3b8">Equipamentos:</small>`;
                    net.devices.forEach(dev => {
                        const icon = dev.online ? '✅' : '🔴';
                        const color = dev.online ? '#cbd5e1' : '#fb7185';
                        detailsHTML += `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:3px; color:${color}"><span>${icon} ${dev.name}</span><span style="opacity:0.7">${dev.ip}</span></div>`;
                    });
                    detailsHTML += `</div>`;
                } else detailsHTML += `<div style="font-size:10px; color:#64748b; margin-top:5px;">Nenhum equipamento extra.</div>`;
                if(msg) msg.innerHTML = detailsHTML;
            } else {
                if(ipEl) ipEl.innerText = "Sem dados";
                if(msg) msg.innerText = "Aguardando...";
            }
        }
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const hitsBuildings = raycaster.intersectObjects(interactables);
    const hitsFloor = floorMesh ? raycaster.intersectObject(floorMesh) : [];

    if (hitsBuildings.length > 0) {
        const sector = hitsBuildings[0].object.userData;
        
        if (!drawStartSector) {
            drawStartSector = sector;
            console.log("Origem definida:", sector.name);
            
            const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({color: 0x00ff00}));
            m.position.copy(hitsBuildings[0].object.position);
            scene.add(m);
            drawingMarkers.push(m);
            
        } else {
            const endSector = sector;
            if (endSector.id === drawStartSector.id) return; 

            console.log("Destino definido:", endSector.name);
            
            if(window.saveCustomLink) {
                window.saveCustomLink(drawStartSector.id, endSector.id, drawPoints);
            }
            
            isDrawing = false;
            document.body.style.cursor = 'default';
            clearDrawingMarkers();
        }
        return;
    }

    if (drawStartSector && hitsFloor.length > 0) {
        const p = hitsFloor[0].point;
        drawPoints.push({ x: p.x, z: p.z });
        
        const boxGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const boxMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 }); 
        const m = new THREE.Mesh(boxGeo, boxMat);
        m.position.set(p.x, 0.5, p.z);
        scene.add(m);
        drawingMarkers.push(m);
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if(e.key==='Enter'){
                const v = e.target.value.toUpperCase();
                const t = SETORES.find(s=>s.id===v || s.name.toUpperCase().includes(v));
                if(t) {
                    gsap.to(controls.target, {duration:1, x:t.pos.x, y:0, z:t.pos.z});
                    gsap.to(camera.position, {duration:1, x:t.pos.x, y:30, z:t.pos.z+30});
                }
            }
        });
    }
}

function onDocumentMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left)/r.width)*2-1;
    mouse.y = -((e.clientY - r.top)/r.height)*2+1;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.003; 
    
    // Anima anéis dos prédios
    pulsingRings.forEach(ring => {
        if(ring.visible) {
            const scale = 1 + (Math.sin(time) * 0.3 + 0.3);
            ring.scale.set(scale, scale, 1);
            ring.material.opacity = 0.8 - (Math.sin(time) * 0.4 + 0.4);
        }
    });

    // [NOVO] Anima anéis das caixas vencidas
    activeBoxRings.forEach(ring => {
        const scale = 1 + (Math.sin(time * 2) * 0.3 + 0.3); // Mais rápido
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = 0.8 - (Math.sin(time * 2) * 0.4 + 0.4);
    });

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactables);
    const statusMap = finalSectorStatus || {};
    
    if(hits.length>0) {
        if(INTERSECTED!=hits[0].object) {
            if(INTERSECTED && INTERSECTED.userData.type==='building') {
                const s = statusMap[INTERSECTED.userData.id]?.status;
                if(s==='CRITICAL') INTERSECTED.material.color.setHex(0xff0000);
                else if(s==='WARNING') INTERSECTED.material.color.setHex(0xffaa00);
                else INTERSECTED.material.color.setHex(0x1e293b);
            }
            INTERSECTED = hits[0].object;
            if(INTERSECTED.userData.type==='building') {
                const s = statusMap[INTERSECTED.userData.id]?.status;
                if(s==='CRITICAL') INTERSECTED.material.color.setHex(0xff4444);
                else if(s==='WARNING') INTERSECTED.material.color.setHex(0xffcc00);
                else INTERSECTED.material.color.setHex(0x38bdf8);
            }
            document.body.style.cursor = isDrawing ? 'crosshair' : 'pointer';
        }
    } else {
        if(INTERSECTED && INTERSECTED.userData.type==='building') {
            const s = statusMap[INTERSECTED.userData.id]?.status;
            if(s==='CRITICAL') INTERSECTED.material.color.setHex(0xff0000);
            else if(s==='WARNING') INTERSECTED.material.color.setHex(0xffaa00);
            else INTERSECTED.material.color.setHex(0x1e293b);
        }
        INTERSECTED = null;
        
        const hitsCables = raycaster.intersectObjects(cables);
        const onBox = hitsCables.some(h => h.object.userData && h.object.userData.isBox);
        
        if (onBox) document.body.style.cursor = 'pointer';
        else document.body.style.cursor = isDrawing ? 'crosshair' : 'default';
    }

    cables.forEach(o => {
        if(o.userData.curve) {
            o.userData.progress += o.userData.speed;
            if(o.userData.progress>1) o.userData.progress=0;
            o.position.copy(o.userData.curve.getPoint(o.userData.progress));
        }
    });
    
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}
init();