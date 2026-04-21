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

// --- STATISCHE ATTRIBUTE (S) - UPDATED MIT CREEP_EXTRACTOR LOGIK ---

async function getCanvasFingerprintHash() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200; canvas.height = 50;
        // Text-Test mit verschiedenen Stilen
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069"; ctx.fillText("CreepJS Clone", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("CreepJS Clone", 4, 17);
        // Komplexe Pfade (Bézier-Kurven)
        ctx.beginPath(); ctx.moveTo(20, 20);
        ctx.bezierCurveTo(20, 100, 200, 100, 200, 20); ctx.stroke();
        // Winding Rule Test
        ctx.beginPath(); ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
        ctx.arc(50, 50, 25, 0, Math.PI * 2, true);
        ctx.fillStyle = "rgb(255, 0, 255)"; ctx.fill("evenodd");
        return await sha256(canvas.toDataURL());
    } catch (e) { return "blocked"; }
}

async function getAudioFingerprintHash() {
    try {
        const context = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(10000, context.currentTime);
        // DynamicsCompressor zwingt den Audio-Chip zu komplexen Berechnungen
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);
        oscillator.connect(compressor); compressor.connect(context.destination);
        oscillator.start(0);
        const renderedBuffer = await context.startRendering();
        const data = renderedBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { sum += Math.abs(data[i]); }
        return await sha256(sum.toString());
    } catch (e) { return "blocked"; }
}

async function getWebGLStatic() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { vendor: "blocked", renderer: "blocked", extensions: "blocked" };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const exts = gl.getSupportedExtensions() || [];
        return {
            vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "blocked",
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "blocked",
            extensions_hash: await sha256(exts.join(','))
        };
    } catch (e) { return { vendor: "error", renderer: "error" }; }
}

// --- DYNAMISCHE ATTRIBUTE (D) - UNVERÄNDERT ---
function getJsBenchmark() {
    try {
        const t0 = performance.now();
        let sum = 0; for (let i = 0; i < 1000000; i++) sum += Math.sqrt(i);
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
        gl.clearColor(0.1, 0.2, 0.3, 1.0); gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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

// --- HAUPT-LOGIK ---
document.getElementById('startBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return alert("Bitte User-ID eingeben!");

    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Analysiere Attribute...";
    statusBox.className = "status-box warning";

    const webgl = await getWebGLStatic();
    const canvas = await getCanvasFingerprintHash();
    const audio = await getAudioFingerprintHash();
    const battery = await getBattery();
    
    currentData = {
        metadata: { 
            user_id: userId, 
            timestamp: new Date().toISOString(), 
            test_type: "single_run",
            user_agent: navigator.userAgent // NEU: Als reines Metadatum hinzugefügt
        },
        static_attributes_S: {
            "1_webgl_vendor": webgl.vendor,
            "1_webgl_renderer": webgl.renderer,
            "1_webgl_ext_hash": webgl.extensions_hash,
            "2_os_platform": navigator.platform || "unknown",
            "3_hardware_concurrency": navigator.hardwareConcurrency || "blocked",
            "4_audio_hash": audio,
            "5_canvas_hash": canvas,
            "6_max_touch_points": navigator.maxTouchPoints || 0,
            "7_color_depth": window.screen ? window.screen.colorDepth : "blocked"
        },
        dynamic_attributes_D: {
            "8_webgl_rendering_speed_ms": getWebGLSpeed(),
            "9_js_execution_benchmark_ms": getJsBenchmark(),
            "10_wasm_compile_benchmark_ms": await getWasmBenchmark()
        },
        volatile_attributes_V: {
            "11_viewport_width": window.innerWidth,
            "11_viewport_height": window.innerHeight,
            "12_battery_status": battery,
            "13_page_zoom_level": window.devicePixelRatio || 1
        }
    };

    statusBox.innerText = "Fertig!";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
    document.getElementById('jsonOutput').innerText = JSON.stringify(currentData, null, 2);
    document.getElementById('resultContainer').style.display = "block";
});

// 100x Benchmark Button Logik (Analog zur vorherigen Version)
document.getElementById('benchmarkBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return alert("Bitte User-ID eingeben!");
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Führe 100 Benchmarks durch...";
    statusBox.className = "status-box warning";

    let webglData = [], jsData = [], wasmData = [];
    for (let i = 0; i < 100; i++) {
        webglData.push(getWebGLSpeed());
        jsData.push(getJsBenchmark());
        wasmData.push(await getWasmBenchmark());
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 5));
    }

    currentData = {
        metadata: { 
            user_id: userId + "_100x_Benchmark", 
            timestamp: new Date().toISOString(), 
            test_type: "100x_benchmark",
            user_agent: navigator.userAgent 
        },
        dynamic_attributes_D: {
            "9_webgl_rendering_speed_ms": { std_dev: calculateStats(webglData).std_dev, mean: calculateStats(webglData).mean, raw_data_100_runs: webglData },
            "10_js_execution_benchmark_ms": { std_dev: calculateStats(jsData).std_dev, mean: calculateStats(jsData).mean, raw_data_100_runs: jsData },
            "11_wasm_compile_benchmark_ms": { std_dev: calculateStats(wasmData).std_dev, mean: calculateStats(wasmData).mean, raw_data_100_runs: wasmData }
        }
    };

    statusBox.innerText = "Benchmark abgeschlossen!";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
    document.getElementById('jsonOutput').innerText = JSON.stringify(currentData, null, 2);
    document.getElementById('resultContainer').style.display = "block";
});

document.getElementById('downloadBtn').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    const link = document.createElement('a'); link.href = dataStr;
    link.download = `Thesis_${currentData.metadata.user_id}.json`; link.click();
});