let currentData = null;

// --- HILFSFUNKTIONEN ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- SPEZIFISCHE API-TESTS (Battery & Brave) ---
async function checkBatteryStatus() {
    // Prüfen, ob die API überhaupt existiert (fehlt in Firefox/Tor/Mullvad komplett)
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            return {
                supported: true,
                level: battery.level,
                charging: battery.charging
            };
        } catch (e) {
            return { supported: true, error: "Blocked by Browser Security" };
        }
    } else {
        return { supported: false, error: "API removed (Typical for Firefox-based Browsers)" };
    }
}

async function detectBrave() {
    // Brave injiziert ein spezielles Objekt in den Navigator
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
        try {
            const isBrave = await navigator.brave.isBrave();
            return isBrave; // Gibt true zurück
        } catch (e) {
            return "Detection Error";
        }
    }
    return false; // Ist kein Brave
}

// --- AKTIVE FINGERPRINTING FUNKTIONEN (Wie zuvor) ---
async function getWebGLFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { error: "blocked_or_unsupported" };

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "blocked";
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "blocked";

        gl.clearColor(0.1, 0.2, 0.3, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        const hash = await sha256(vendor + renderer + pixels.join(''));
        return { vendor, renderer, hash };
    } catch (e) { return { error: "blocked_by_browser" }; }
}

async function getCanvasHash() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 240; canvas.height = 60;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069"; ctx.fillText("Thesis <canvas> test", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("Thesis <canvas> test", 4, 17);
        return await sha256(canvas.toDataURL());
    } catch (e) { return "blocked_by_browser"; }
}

async function getAudioHash() {
    try {
        const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);
        const compressor = audioCtx.createDynamicsCompressor();
        
        oscillator.connect(compressor);
        compressor.connect(audioCtx.destination);
        oscillator.start(0);
        
        const renderedBuffer = await audioCtx.startRendering();
        const data = renderedBuffer.getChannelData(0);
        
        let sum = 0;
        for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(data[i]);
        }
        return await sha256(sum.toString());
    } catch (e) { return "blocked_by_browser"; }
}

// --- HAUPT-LOGIK ---
document.getElementById('startBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return alert("Bitte User-ID eingeben!");

    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = "Führe fokussierte Messungen durch...";
    statusBox.className = "status-box warning";
    document.getElementById('downloadBtn').style.display = "none";

    // 1. Eigene Tests ausführen
    const webglData = await getWebGLFingerprint();
    const canvasHash = await getCanvasHash();
    const audioHash = await getAudioHash();
    const batteryData = await checkBatteryStatus();
    const isBraveBrowser = await detectBrave();
    
    // 2. FPJS laden und FILTERN
    let fpjsFiltered = {};
    let fpjsVisitorId = "blocked_or_failed";
    
    try {
        if (typeof FingerprintJS !== 'undefined') {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            fpjsVisitorId = result.visitorId;
            
            // HIER FILTERN WIR DIE WICHTIGEN ATTRIBUTE HERAUS
            const c = result.components;
            fpjsFiltered = {
                fonts_hash: c.fonts ? c.fonts.value : "blocked",
                plugins: c.plugins ? c.plugins.value : "blocked",
                touch_support: c.touchSupport ? c.touchSupport.value : "blocked",
                color_gamut: c.colorGamut ? c.colorGamut.value : "blocked",
                math_random_hash: c.math ? c.math.value : "blocked" // Manche Browser spoofen Math.random()
            };
        } else {
            fpjsFiltered = "Library blocked by Browser/Shields";
        }
    } catch (e) {
        fpjsFiltered = "Error executing FPJS: " + e.message;
    }

    // 3. JSON strukturiert zusammenbauen
    currentData = {
        metadata: {
            user_id: userId,
            timestamp: new Date().toISOString(),
            fpjs_visitor_id: fpjsVisitorId
        },
        passive_navigator_proxies: {
            user_agent: navigator.userAgent,
            platform: navigator.platform,
            language_primary: navigator.language,
            hardware_concurrency: navigator.hardwareConcurrency || "blocked",
            device_memory_gb: navigator.deviceMemory || "blocked",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        specific_api_tests: {
            brave_detected: isBraveBrowser,
            battery_status: batteryData
        },
        active_fingerprints: {
            canvas_hash: canvasHash,
            webgl_report_hash: webglData.hash || "blocked",
            webgl_renderer: webglData.renderer || "blocked",
            audio_context_hash: audioHash,
            screen_resolution: {
                monitor: `${window.screen.width}x${window.screen.height}`,
                viewport: `${window.innerWidth}x${window.innerHeight}`
            }
        },
        filtered_fpjs_attributes: fpjsFiltered
    };

    statusBox.innerText = "Fertig! Die Daten sind nun wissenschaftlich optimiert.";
    statusBox.className = "status-box success";
    document.getElementById('downloadBtn').style.display = "block";
});

// Download-Logik
document.getElementById('downloadBtn').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `FP_${currentData.metadata.user_id}.json`;
    link.click();
});