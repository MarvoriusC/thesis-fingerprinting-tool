let currentData = null;

// --- HILFSFUNKTIONEN ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// NEU: Statistik-Hilfsfunktion für die 100 Durchläufe
function calculateStats(arr) {
    // Filtere geblockte Werte (-1) heraus
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
async function getCanvasHash() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 240; canvas.height = 60;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069"; ctx.fillText("Thesis Canvas", 2, 15);
        return await sha256(canvas.toDataURL());
    } catch (e) { return "blocked"; }
}

async function getAudioHash() {
    try {
        const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'triangle'; oscillator.frequency.value = 10000;
        const compressor = audioCtx.createDynamicsCompressor();
        oscillator.connect(compressor); compressor.connect(audioCtx.destination);
        oscillator.start(0);
        const buffer = await audioCtx.startRendering();
        let sum = 0; for (let i = 4500; i < 5000; i++) sum += Math.abs(buffer.getChannelData(0)[i]);
        return await sha256(sum.toString());
    } catch (e) { return "blocked"; }
}

async function getWebGLStatic() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (!gl) return { vendor: "blocked", renderer: "blocked" };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "blocked",
            renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "blocked"
        };
    } catch (e) { return { vendor: "error", renderer: "error" }; }
}

// --- DYNAMISCHE ATTRIBUTE (D) ---
function getJsBenchmark() {
    try {
        const t0 = performance.now();
        let sum = 0;
        for (let i = 0; i < 1000000; i++) sum += Math.sqrt(i);
        const t1 = performance.now();
        return parseFloat((t1 - t0).toFixed(2));
    } catch(e) { return -1; }
}

async function getWasmBenchmark() {
    try {
        const t0 = performance.now();
        const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        await WebAssembly.compile(wasmCode);
        const t1 = performance.now();
        return parseFloat((t1 - t0).toFixed(2));
    } catch(e) { return -1; }
}

function getWebGLSpeed() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (!gl) return -1;
        const t0 = performance.now();
        gl.clearColor(0.1, 0.2, 0.3, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const t1 = performance.now();
        return parseFloat((t1 - t0).toFixed(2));
    } catch(e) { return -1; }
}

// --- VOLATILE ATTRIBUTE (V) ---
async function getBattery() {
    if ('getBattery' in navigator) {
        try {
            const b = await navigator.getBattery();
            return `${Math.round(b.level * 100)}% (${b.charging ? 'charging' : 'discharging'})`;
        } catch(e) { return "blocked"; }
    }
    return "api_removed";
}

// --- HAUPT-LOGIK: EINZELTEST (Wie bisher) ---
document.getElementById('startBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return alert("Bitte User-ID eingeben!");

    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Analysiere 14 Attribute (S, D, V)...";
    statusBox.className = "status-box warning";
    document.getElementById('downloadBtn').style.display = "none";
    document.getElementById('resultContainer').style.display = "none";

    const webglStatic = await getWebGLStatic();
    const canvasHash = await getCanvasHash();
    const audioHash = await getAudioHash();
    const batteryStatus = await getBattery();
    
    let fpjsFonts = "blocked";
    try {
        if (typeof FingerprintJS !== 'undefined') {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            fpjsFonts = result.components.fonts ? result.components.fonts.value : "blocked";
        }
    } catch (e) { fpjsFonts = "error"; }

    currentData = {
        metadata: { user_id: userId, timestamp: new Date().toISOString(), test_type: "single_run" },
        static_attributes_S: {
            "1_webgl_vendor": webglStatic.vendor,
            "1_webgl_renderer": webglStatic.renderer,
            "2_os_platform": navigator.platform || "unknown",
            "3_hardware_concurrency": navigator.hardwareConcurrency || "blocked",
            "4_audio_hash": audioHash,
            "5_canvas_hash": canvasHash,
            "6_fonts_hash": fpjsFonts,
            "7_max_touch_points": navigator.maxTouchPoints || 0,
            "8_color_depth": window.screen ? window.screen.colorDepth : "blocked"
        },
        dynamic_attributes_D: {
            "9_webgl_rendering_speed_ms": getWebGLSpeed(),
            "10_js_execution_benchmark_ms": getJsBenchmark(),
            "11_wasm_compile_benchmark_ms": await getWasmBenchmark()
        },
        volatile_attributes_V: {
            "12_viewport_width": window.innerWidth,
            "12_viewport_height": window.innerHeight,
            "13_battery_status": batteryStatus,
            "14_page_zoom_level": window.devicePixelRatio || 1
        }
    };

    statusBox.innerText = "Fertig! 14 Attribute erfolgreich erfasst.";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
    document.getElementById('jsonOutput').innerText = JSON.stringify(currentData, null, 2);
    document.getElementById('resultContainer').style.display = "block";
});

// --- NEU: 100-FACHER BENCHMARK FÜR DYNAMISCHE ATTRIBUTE ---
document.getElementById('benchmarkBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return alert("Bitte User-ID eingeben!");

    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Führe 100 Benchmarks durch (bitte warten)...";
    statusBox.className = "status-box warning";
    document.getElementById('downloadBtn').style.display = "none";
    document.getElementById('resultContainer').style.display = "none";

    const iterations = 100;
    let webglData = [];
    let jsData = [];
    let wasmData = [];

    // 100-fache Schleife
    for (let i = 0; i < iterations; i++) {
        webglData.push(getWebGLSpeed());
        jsData.push(getJsBenchmark());
        wasmData.push(await getWasmBenchmark());
        
        // Kurze Pause alle 10 Iterationen, damit der Browser (oder die VM) nicht einfriert
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 5));
    }

    // Statistik berechnen
    const webglStats = calculateStats(webglData);
    const jsStats = calculateStats(jsData);
    const wasmStats = calculateStats(wasmData);

    // JSON formatieren (nur Metadaten und dynamische Arrays)
    currentData = {
        metadata: {
            user_id: userId + "_100x_Benchmark",
            timestamp: new Date().toISOString(),
            test_type: "100x_benchmark"
        },
        dynamic_attributes_D: {
            "9_webgl_rendering_speed_ms": {
                std_dev: webglStats.std_dev,
                mean: webglStats.mean,
                raw_data_100_runs: webglData
            },
            "10_js_execution_benchmark_ms": {
                std_dev: jsStats.std_dev,
                mean: jsStats.mean,
                raw_data_100_runs: jsData
            },
            "11_wasm_compile_benchmark_ms": {
                std_dev: wasmStats.std_dev,
                mean: wasmStats.mean,
                raw_data_100_runs: wasmData
            }
        }
    };

    statusBox.innerText = "Fertig! 100 Durchläufe abgeschlossen und Standardabweichung berechnet.";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
    document.getElementById('jsonOutput').innerText = JSON.stringify(currentData, null, 2);
    document.getElementById('resultContainer').style.display = "block";
});

// Download-Logik
document.getElementById('downloadBtn').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `Thesis_${currentData.metadata.user_id}.json`;
    link.click();
});