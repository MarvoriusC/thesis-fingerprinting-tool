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

// --- STATISCHE ATTRIBUTE (S) ---
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

// --- DYNAMISCHE ATTRIBUTE (D) ---
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

async function getWasmBenchmark() {
    try {
        const t0 = performance.now(); const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        await WebAssembly.compile(wasmCode); return parseFloat((performance.now() - t0).toFixed(2));
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

// --- VOLATILE ATTRIBUTE (V) ---
async function getBattery() {
    if ('getBattery' in navigator) {
        try {
            const b = await navigator.getBattery(); return `${Math.round(b.level * 100)}% (${b.charging ? 'charging' : 'discharging'})`;
        } catch(e) { return "blocked"; }
    }
    return "api_removed";
}

// --- DATEN-AGGREGATION ---
async function gatherAllData(runType) {
    const device = document.getElementById('metaDevice').value;
    const session = document.getElementById('metaSession').value;
    const browser = document.getElementById('metaBrowser').value;
    const scenario = document.getElementById('metaScenario').value;

    const webgl = await getWebGLStatic();
    
    let baseData = {
        metadata: { 
            device_id: device,
            session_nr: session,
            browser_mode: browser,
            scenario: scenario,
            test_type: runType,
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent
        },
        static_attributes_S: {
            "1_webgl_vendor": webgl.vendor,
            "1_webgl_renderer": webgl.renderer,
            "1_webgl_ext_hash": webgl.extensions_hash,
            "2_os_platform": navigator.platform || "unknown",
            "3_hardware_concurrency": navigator.hardwareConcurrency || "blocked",
            "4_audio_hash": await getAudioFingerprintHash(),
            "5_canvas_hash": await getCanvasFingerprintHash(),
            "6_fonts_hash": await getFontsHash(),
            "7_max_touch_points": navigator.maxTouchPoints || 0,
            "8_color_depth": window.screen ? window.screen.colorDepth : "blocked",
            "9_storage_quota_bytes": await getStorageQuota()
        },
        volatile_attributes_V: {
            "10_viewport_width": window.innerWidth,
            "10_viewport_height": window.innerHeight,
            "11_battery_status": await getBattery(),
            "12_page_zoom_level": window.devicePixelRatio || 1
        }
    };
    return baseData;
}

// --- BUTTON LOGIK ---

document.getElementById('startBtn').addEventListener('click', async () => {
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Führe 1x Run aus... (Bitte warten)"; statusBox.className = "status-box warning";
    
    // Basis-Daten holen (S und V)
    let baseData = await gatherAllData("single_run");
    
    // JSON in exakt der richtigen Reihenfolge zusammenbauen!
    currentData = {
        metadata: baseData.metadata,
        static_attributes_S: baseData.static_attributes_S,
        dynamic_attributes_D: {
            "13_webgl_rendering_speed_ms": getWebGLSpeed(),
            "14_js_execution_benchmark_ms": getJsBenchmark(),
            "15_wasm_compile_benchmark_ms": await getWasmBenchmark(),
            "16_math_floating_point_ms": getMathBenchmark() // <-- HIER EINGEFÜGT
        },
        volatile_attributes_V: baseData.volatile_attributes_V
    };

    finishRun(statusBox);
});

document.getElementById('benchmarkBtn').addEventListener('click', async () => {
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Führe 100 Benchmarks durch... (Browser nicht minimieren!)"; statusBox.className = "status-box warning";

    let baseData = await gatherAllData("100x_benchmark");
    
    // Neues Array für die Mathe-Daten hinzugefügt
    let webglData = [], jsData = [], wasmData = [], mathData = []; 
    
    for (let i = 0; i < 100; i++) {
        webglData.push(getWebGLSpeed());
        jsData.push(getJsBenchmark());
        wasmData.push(await getWasmBenchmark());
        mathData.push(getMathBenchmark()); // <-- HIER WIRD 100x GEZÄHLT
        
        // UI Thread atmen lassen
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 5)); 
    }

    // JSON in exakt der richtigen Reihenfolge zusammenbauen!
    currentData = {
        metadata: baseData.metadata,
        static_attributes_S: baseData.static_attributes_S,
        dynamic_attributes_D: {
            "13_webgl_rendering_speed_ms": { std_dev: calculateStats(webglData).std_dev, mean: calculateStats(webglData).mean, raw_data_100_runs: webglData },
            "14_js_execution_benchmark_ms": { std_dev: calculateStats(jsData).std_dev, mean: calculateStats(jsData).mean, raw_data_100_runs: jsData },
            "15_wasm_compile_benchmark_ms": { std_dev: calculateStats(wasmData).std_dev, mean: calculateStats(wasmData).mean, raw_data_100_runs: wasmData },
            "16_math_floating_point_ms": { std_dev: calculateStats(mathData).std_dev, mean: calculateStats(mathData).mean, raw_data_100_runs: mathData } // <-- HIER IM JSON EINGEFÜGT
        },
        volatile_attributes_V: baseData.volatile_attributes_V
    };

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
    const device = document.getElementById('metaDevice').value;
    const session = document.getElementById('metaSession').value;
    const browser = document.getElementById('metaBrowser').value;
    const scenario = document.getElementById('metaScenario').value;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    const link = document.createElement('a'); link.href = dataStr;
    link.download = `Thesis_${device}_${browser}_${scenario}_${session}.json`; 
    link.click();
});