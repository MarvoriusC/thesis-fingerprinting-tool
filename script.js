let currentData = null;

// --- HILFSFUNKTIONEN ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function calculateStats(arr) {
    const validArr = arr.filter(val => val !== -1);
    if (validArr.length === 0) return { mean: 0, std_dev: 0 };
    const n = validArr.length;
    const mean = validArr.reduce((a, b) => a + b, 0) / n;
    const variance = validArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return {
        mean: parseFloat(mean.toFixed(2)),
        std_dev: parseFloat(Math.sqrt(variance).toFixed(2))
    };
}

// =====================================================================
//  MESSFUNKTIONEN  -  UNVERAENDERT (validierte, belegbare Verfahren).
//  Bitte NICHT anfassen: jede Aenderung hier macht die Hashes
//  inkompatibel zu bereits erhobenen Daten.
// =====================================================================

// Canvas: angelehnt an Mowery & Shacham (2012) / fingerprintjs2
async function getCanvasFingerprintHash() {
    try {
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
        canvas.width = 200; canvas.height = 50; ctx.textBaseline = "top"; ctx.font = "14px 'Arial'"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20); ctx.fillStyle = "#069"; ctx.fillText("CreepJS Clone", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("CreepJS Clone", 4, 17);
        ctx.beginPath(); ctx.moveTo(20, 20); ctx.bezierCurveTo(20, 100, 200, 100, 200, 20); ctx.stroke();
        ctx.beginPath(); ctx.arc(50, 50, 50, 0, Math.PI * 2, true); ctx.arc(50, 50, 25, 0, Math.PI * 2, true);
        ctx.fillStyle = "rgb(255, 0, 255)"; ctx.fill("evenodd");
        return await sha256(canvas.toDataURL());
    } catch (e) { return "blocked"; }
}

// Audio: OfflineAudioContext + DynamicsCompressor (Englehardt & Narayanan 2016)
async function getAudioFingerprintHash() {
    try {
        const context = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const oscillator = context.createOscillator(); oscillator.type = "triangle"; oscillator.frequency.setValueAtTime(10000, context.currentTime);
        const compressor = context.createDynamicsCompressor(); compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime); compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime); compressor.release.setValueAtTime(0.25, context.currentTime);
        oscillator.connect(compressor); compressor.connect(context.destination); oscillator.start(0);
        const renderedBuffer = await context.startRendering(); const data = renderedBuffer.getChannelData(0);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
        return await sha256(sum.toString());
    } catch (e) { return "blocked"; }
}

// WebGL Vendor/Renderer/Extensions (Cao et al. 2017; Laperdrix et al. 2016)
async function getWebGLStatic() {
    try {
        const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { vendor: "blocked", renderer: "blocked", extensions_hash: "blocked" };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info'); const exts = gl.getSupportedExtensions() || [];
        return {
            vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "blocked",
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "blocked",
            extensions_hash: await sha256(exts.join(','))
        };
    } catch (e) { return { vendor: "error", renderer: "error", extensions_hash: "error" }; }
}

// Fonts via FingerprintJS v3 (CDN). "fpjs_not_loaded" = Drittanbieter-Skript
// wurde blockiert (z. B. uBlock Origin in Helium/Mullvad) -> selbst ein Befund.
async function getFontsHash() {
    try {
        if (!window.FingerprintJS) return "fpjs_not_loaded";
        const fp = await FingerprintJS.load(); const result = await fp.get();
        if (result.components.fonts && result.components.fonts.value) return await sha256(result.components.fonts.value.join(','));
        return "blocked";
    } catch (e) { return "error"; }
}

async function getStorageQuota() {
    try {
        if (!navigator.storage || !navigator.storage.estimate) return "N/A";
        const est = await navigator.storage.estimate(); return est.quota || 0;
    } catch (e) { return 0; }
}

// --- BENCHMARKS (deterministisch begrenzte Verteilungen) ---
// JS- & Math-Benchmark: Mowery, Bogenreif, Yilek & Shacham (2011)
function getJsBenchmark() {
    try {
        const t0 = performance.now(); let sum = 0; for (let i = 0; i < 1000000; i++) sum += Math.sqrt(i);
        return parseFloat((performance.now() - t0).toFixed(2));
    } catch(e) { return -1; }
}

function getMathBenchmark() {
    try {
        const t0 = performance.now();
        let val = 0;
        for (let i = 0; i < 500000; i++) { val += Math.sin(i) * Math.cos(i) + Math.tan(i); }
        return parseFloat((performance.now() - t0).toFixed(2));
    } catch(e) { return -1; }
}

function getWebGLSpeed() {
    try {
        const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl'); if (!gl) return -1;
        const t0 = performance.now(); gl.clearColor(0.1, 0.2, 0.3, 1.0); gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return parseFloat((performance.now() - t0).toFixed(2));
    } catch(e) { return -1; }
}

async function getBattery() {
    if ('getBattery' in navigator) {
        try {
            const b = await navigator.getBattery(); return `${Math.round(b.level * 100)}% (${b.charging ? 'charging' : 'discharging'})`;
        } catch(e) { return "blocked"; }
    }
    return "api_removed";
}

// =====================================================================
//  AGGREGATION  -  neutrale Struktur. Keine S/D/V-Einteilung mehr in der
//  Rohdatei: die Klassifikation ist ein Auswertungs-ERGEBNIS und wird
//  spaeter (Jupyter/Python) aus der Varianz ueber die Sessions berechnet.
//  Gruppierung erfolgt nur nach Mess-STRUKTUR:
//    - attributes : Einzel-Momentaufnahme (einmal pro Run gemessen)
//    - benchmarks : 100x-Verteilung (mean / std_dev / Rohwerte)
// =====================================================================

function buildMetadata(runType) {
    return {
        device_id: document.getElementById('metaDevice').value,
        session_nr: document.getElementById('metaSession').value,
        browser_mode: document.getElementById('metaBrowser').value,
        scenario: document.getElementById('metaScenario').value,
        test_type: runType,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
    };
}

async function gatherSnapshotAttributes() {
    const webgl = await getWebGLStatic();
    return {
        // Hardware / Plattform
        webgl_vendor: webgl.vendor,
        webgl_renderer: webgl.renderer,
        webgl_extensions_hash: webgl.extensions_hash,
        os_platform: navigator.platform || "unknown",
        hardware_concurrency: navigator.hardwareConcurrency || "blocked",
        max_touch_points: navigator.maxTouchPoints || 0,
        color_depth: window.screen ? window.screen.colorDepth : "blocked",
        storage_quota_bytes: await getStorageQuota(),
        // Hash-Attribute
        audio_hash: await getAudioFingerprintHash(),
        canvas_hash: await getCanvasFingerprintHash(),
        fonts_hash: await getFontsHash(),
        // Zustands-/Konfigurationsabhaengig
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        battery_status: await getBattery(),
        device_pixel_ratio: window.devicePixelRatio || 1,   // frueher: page_zoom_level
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone_offset_mins: new Date().getTimezoneOffset()
    };
}

// --- BUTTON LOGIK ---

document.getElementById('startBtn').addEventListener('click', async () => {
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Fuehre Einzel-Messung aus... (Bitte warten)"; statusBox.className = "status-box warning";

    const metadata = buildMetadata("single_run");
    const attributes = await gatherSnapshotAttributes();

    currentData = { metadata, attributes };

    finishRun(statusBox);
});

document.getElementById('benchmarkBtn').addEventListener('click', async () => {
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Fuehre 100 Benchmarks durch... (Browser nicht minimieren!)"; statusBox.className = "status-box warning";

    const metadata = buildMetadata("100x_benchmark");
    const attributes = await gatherSnapshotAttributes();   // einmalige Momentaufnahme

    let webglData = [], jsData = [], mathData = [];
    for (let i = 0; i < 100; i++) {
        webglData.push(getWebGLSpeed());
        jsData.push(getJsBenchmark());
        mathData.push(getMathBenchmark());
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 5)); // UI-Thread atmen lassen
    }

    const wStats = calculateStats(webglData);
    const jStats = calculateStats(jsData);
    const mStats = calculateStats(mathData);

    const benchmarks = {
        webgl_rendering_speed_ms: { mean: wStats.mean,  std_dev: wStats.std_dev,  raw_data_100_runs: webglData },
        js_execution_benchmark_ms: { mean: jStats.mean,  std_dev: jStats.std_dev,  raw_data_100_runs: jsData },
        math_floating_point_ms:    { mean: mStats.mean,  std_dev: mStats.std_dev,  raw_data_100_runs: mathData }
    };

    currentData = { metadata, attributes, benchmarks };

    finishRun(statusBox);
});

function finishRun(statusBox) {
    statusBox.innerText = "Datenerfassung erfolgreich abgeschlossen!";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
    document.getElementById('jsonOutput').innerText = JSON.stringify(currentData, null, 2);
    document.getElementById('resultContainer').style.display = "block";
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    const m = currentData.metadata;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    const link = document.createElement('a'); link.href = dataStr;
    link.download = `Thesis_${m.device_id}_${m.browser_mode}_${m.scenario}_${m.session_nr}.json`;
    link.click();
});
