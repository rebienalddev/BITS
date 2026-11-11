    const STORAGE_KEY = 'bits_photobooth_captured_queue';
    let queueItems = [];
    let currentFilter = 'pending';

    function queueApiUrl(path) {
        const origin = (window.location.port === '3000')
            ? window.location.origin
            : 'http://' + window.location.hostname + ':3000';
        return origin + path;
    }

    async function findServerQueue() {
        try {
            const res = await fetch(queueApiUrl('/api/queue'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.queue && Array.isArray(data.queue)) return data.queue;
            throw new Error('Malformed queue response');
        } catch (e) {
            return null;
        }
    }

    async function pushLocalItemToServer(item) {
        try {
            const res = await fetch(queueApiUrl('/api/queue'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: item.imageBase64,
                    timestamp: item.createdAt,
                    clientTicket: item.ticketNumber
                })
            });
            if (!res.ok) return false;
            const data = await res.json();
            const saved = (data && data.item) ? data.item : null;

            if (saved) {
                item.id = saved.id;
                item.createdAt = saved.createdAt || item.createdAt;
                item.status = saved.status || item.status;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async function syncServerList(serverQueue) {

        let localQueue = [];
        try { localQueue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) {}

        const unsynced = localQueue.filter(i => !i.synced && i.imageBase64);
        const uploadedNow = [];
        for (const item of unsynced) {
            if (await pushLocalItemToServer(item)) {
                item.synced = true;
                uploadedNow.push(item);
            }
        }

        const stillUnsynced = unsynced.filter(i => !i.synced);

        const reconciled = serverQueue.map(serverItem => {
            const localMatch = localQueue.find(
                i => i.synced && i.id === serverItem.id &&
                     i.updatedAt && i.updatedAt > (serverItem.updatedAt || '')
            );
            return localMatch
                ? { ...serverItem, status: localMatch.status, updatedAt: localMatch.updatedAt }
                : serverItem;
        });

        queueItems = [...reconciled, ...uploadedNow, ...stillUnsynced];

        await deleteDuplicates();
        dedupeVisible();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(
            [...localQueue.filter(i => i.synced).map(i => ({ ...i })),
             ...stillUnsynced.map(i => ({ ...i, synced: false }))]
        ));
    }

    async function deleteDuplicates() {
        const seen = new Set();
        for (const item of queueItems) {
            if (seen.has(item.imageBase64)) {
                try {
                    await fetch(`${queueApiUrl('/api/queue')}/${item.id}`, { method: 'DELETE' });
                } catch (e) {}
                item._removed = true;
            } else {
                seen.add(item.imageBase64);
            }
        }
        queueItems = queueItems.filter(i => !i._removed);
    }

    function dedupeVisible() {
        const seen = new Set();
        queueItems = queueItems.filter(i => {
            if (!i.imageBase64 || seen.has(i.imageBase64)) return false;
            seen.add(i.imageBase64);
            return true;
        });
    }

    let syncInFlight = false;

    async function loadQueue() {
        if (syncInFlight) return;
        syncInFlight = true;
        try {
            const serverQueue = await findServerQueue();
            if (serverQueue) {
                await syncServerList(serverQueue);
                renderUI();
                return;
            }

            const raw = localStorage.getItem(STORAGE_KEY);
            queueItems = raw ? JSON.parse(raw) : [];
            dedupeVisible();
            renderUI();
        } finally {
            syncInFlight = false;
        }
    }

    function updateLocalItemStatus(id, newStatus) {
        try {
            const localQueue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            const match = localQueue.find(i => i.id === id);
            if (match) {
                match.status = newStatus;
                match.updatedAt = new Date().toISOString();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(localQueue));
            }
        } catch (e) {}
    }

    async function setItemStatus(id, newStatus) {
        const item = queueItems.find(q => q.id === id);
        if (item) {
            item.status = newStatus;
            item.updatedAt = new Date().toISOString();
        }
        updateLocalItemStatus(id, newStatus);
        renderUI();

        try {
            await fetch(`${queueApiUrl('/api/queue')}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
        } catch (err) {}
    }

    function renderUI() {

        const sorted = [...queueItems].sort((a, b) => {
            const tA = new Date(a.createdAt || 0).getTime();
            const tB = new Date(b.createdAt || 0).getTime();
            if (tA !== tB) return tA - tB;
            return (a.id || 0) - (b.id || 0);
        });

        const pendingList = sorted.filter(i => (i.status || 'pending') === 'pending');
        const printedList = sorted.filter(i => i.status === 'printed');
        const discardedList = sorted.filter(i => i.status === 'discarded');

        document.getElementById('stat-pending').textContent = pendingList.length;
        document.getElementById('stat-printed').textContent = printedList.length;
        document.getElementById('stat-discarded').textContent = discardedList.length;
        document.getElementById('stat-total').textContent = sorted.length;

        let visible = sorted;
        if (currentFilter === 'pending') visible = pendingList;
        else if (currentFilter === 'printed') visible = printedList;
        else if (currentFilter === 'discarded') visible = discardedList;

        const grid = document.getElementById('queue-grid');
        grid.innerHTML = '';

        if (visible.length === 0) {
            grid.innerHTML = `
                <div class="empty-placeholder">
                    <h3>No Photostrips In This List</h3>
                    <p>New photos captured at the photobooth will automatically appear here in FIFO order.</p>
                </div>
            `;
            return;
        }

        visible.forEach((item, index) => {
            const status = item.status || 'pending';
            const isPriority = status === 'pending' && item.id === pendingList[0]?.id;
            const timeStr = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

            const card = document.createElement('div');
            card.className = `item-card ${isPriority ? 'is-priority' : ''} ${selectMode ? 'selectable' : ''} ${selectedA4Ids.has(item.id) ? 'selected' : ''}`;

            card.innerHTML = `
                ${selectMode ? `<div class="select-check">&#10003;</div>` : ''}
                <div class="card-head">
                    <div style="display: flex; align-items: center;">
                        <span class="ticket-id">#${String(item.id).padStart(3, '0')}</span>
                        <span class="queue-pos-badge">#${index + 1}</span>
                    </div>
                    <span class="status-pill pill-${status}">${status}</span>
                </div>

                <div class="card-media" onclick="showModal('${item.imageBase64}')">
                    <img src="${item.imageBase64}" alt="Photostrip #${item.id}">
                </div>

                <div class="card-info">
                    <span>Captured: ${timeStr}</span>
                    <span>${isPriority ? 'First In Line' : 'Queue Item'}</span>
                </div>

                <div class="card-foot">
                    ${status === 'pending' ? `
                        <button class="action-btn btn-mark-printed" onclick="setItemStatus(${item.id}, 'printed')">Printed</button>
                        <button class="action-btn btn-mark-discard" onclick="setItemStatus(${item.id}, 'discarded')">Discarded</button>
                        <button class="action-btn btn-download" onclick="printItem('${item.imageBase64}')">Print</button>
                    ` : `
                        <button class="action-btn btn-undo" onclick="setItemStatus(${item.id}, 'pending')">Return to Pending</button>
                        <button class="action-btn btn-download" onclick="printItem('${item.imageBase64}')">Print</button>
                    `}
                </div>
            `;

            card.onclick = (e) => {
                if (selectMode && e.target.closest('button') === null) toggleA4Select(item.id);
            };

            grid.appendChild(card);
        });
        updateA4ActionBar();
    }

    let selectMode = false;
    const selectedA4Ids = new Set();
    const A4_MAX_SELECT = 4;

    function toggleA4Select(id) {
        if (selectedA4Ids.has(id)) {
            selectedA4Ids.delete(id);
        } else {
            if (selectedA4Ids.size >= A4_MAX_SELECT) return;
            selectedA4Ids.add(id);
        }
        renderUI();
    }

    function updateA4ActionBar() {
        const bar = document.getElementById('a4-action-bar');
        const count = document.getElementById('a4-count');
        if (!bar || !count) return;
        if (!selectMode) { bar.classList.remove('open'); return; }
        bar.classList.add('open');
        count.textContent = `${selectedA4Ids.size}/${A4_MAX_SELECT} selected`;
        document.getElementById('btn-print-a4').disabled = selectedA4Ids.size !== A4_MAX_SELECT;
        document.getElementById('btn-print-a4').style.opacity = selectedA4Ids.size === A4_MAX_SELECT ? '1' : '0.5';
    }

    function extractSingleStrip(dataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const ratio = img.naturalWidth / img.naturalHeight;

                if (ratio < 0.45) {
                    resolve(dataUrl);
                    return;
                }
                const c = document.createElement('canvas');
                c.width = Math.floor(img.naturalWidth / 2);
                c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    function loadSizedImage(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    async function buildA4SheetCanvas(stripsSrc) {
        const DPI = 300;
        const MM = DPI / 25.4;
        const pageW = Math.round(210 * MM);
        const pageH = Math.round(297 * MM);
        const pad = Math.round(5 * MM);
        const gap = Math.round(5 * MM);
        const cellW = Math.round((pageW - pad * 2 - gap) / 2);
        const cellH = Math.round((pageH - pad * 2 - gap) / 2);

        const sheet = document.createElement('canvas');
        sheet.width = pageW;
        sheet.height = pageH;
        const sc = sheet.getContext('2d');
        sc.fillStyle = '#ffffff';
        sc.fillRect(0, 0, pageW, pageH);

        const cells = [
            [pad, pad],
            [pad + cellW + gap, pad],
            [pad, pad + cellH + gap],
            [pad + cellW + gap, pad + cellH + gap],
        ];

        for (let i = 0; i < stripsSrc.length && i < 4; i++) {
            const img = await loadSizedImage(stripsSrc[i]);
            if (!img) continue;

            const cellRatio = cellW / cellH;
            const imgRatio = img.naturalWidth / img.naturalHeight;
            let w, h;
            if (imgRatio > cellRatio) {
                w = cellW;
                h = Math.round(cellW / imgRatio);
            } else {
                h = cellH;
                w = Math.round(cellH * imgRatio);
            }
            const [cx, cy] = cells[i];

            const ox = cx + Math.round((cellW - w) / 2);
            const oy = cy;
            sc.drawImage(img, ox, oy, w, h);
        }
        return sheet;
    }

    async function printA4Selected() {
        if (selectedA4Ids.size !== A4_MAX_SELECT) {
            alert(`Select exactly ${A4_MAX_SELECT} photostrips to compile onto one A4 sheet.`);
            return;
        }

        const ids = [...selectedA4Ids];
        const picked = queueItems
            .filter(i => ids.includes(i.id))
            .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        const sheetCanvas = await buildA4SheetCanvas(picked.map(i => i.imageBase64).slice(0, 4));
        const sheetDataUrl = sheetCanvas.toDataURL('image/png');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print the A4 sheet.');
            return;
        }
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>A4 Photostrip Sheet</title>
                <style>
                    @page {
                        size: 210mm 297mm;
                        margin: 0;
                    }
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                        background: #fff;
                    }
                    img.sheet {

                        width: 100%;
                        height: 100%;
                        display: block;
                        object-fit: contain;
                    }
                </style>
            </head>
            <body>
                <img class="sheet" src="${sheetDataUrl}" onload="window.focus(); window.print(); window.close();" />
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    document.getElementById('btn-select-a4').addEventListener('click', () => {
        selectMode = !selectMode;
        const btn = document.getElementById('btn-select-a4');
        if (selectMode) {
            btn.classList.add('btn-a4-mode');
            document.getElementById('select-hint').style.display = 'block';
        } else {
            selectedA4Ids.clear();
            btn.classList.remove('btn-a4-mode');
            document.getElementById('select-hint').style.display = 'none';
        }
        renderUI();
    });

    document.getElementById('btn-a4-clear').addEventListener('click', () => {
        selectedA4Ids.clear();
        renderUI();
    });

    document.getElementById('btn-print-a4').addEventListener('click', printA4Selected);

    function showModal(src) {
        document.getElementById('modal-preview-img').src = src;
        document.getElementById('preview-modal').classList.add('open');
    }

    function printItem(dataUrl) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print the photostrip.');
            return;
        }
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Photostrip</title>
                <style>
                    @page {
                        margin: 0;
                        size: auto;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: #fff;
                    }
                    img {
                        max-width: 100vw;
                        max-height: 100vh;
                        object-fit: contain;
                        display: block;
                    }
                </style>
            </head>
            <body>
                <img src="${dataUrl}" onload="window.focus(); window.print(); window.close();" />
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('preview-modal').classList.remove('open');
    });

    document.getElementById('preview-modal').addEventListener('click', (e) => {
        if (e.target.id === 'preview-modal') {
            document.getElementById('preview-modal').classList.remove('open');
        }
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderUI();
        });
    });

    document.getElementById('btn-sync').addEventListener('click', async () => {
        const btn = document.getElementById('btn-sync');
        btn.textContent = 'Syncing...';
        await loadQueue();
        btn.textContent = 'Synced ✓';
        setTimeout(() => { btn.textContent = 'Sync Queue'; }, 1200);
    });
    window.addEventListener('storage', loadQueue);

    loadQueue();
    setInterval(loadQueue, 1000);