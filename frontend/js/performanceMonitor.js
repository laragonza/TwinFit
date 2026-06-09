const DEFAULT_CAPTURE_MS = 60000;

const formatMs = (value) => `${Math.round(value)} ms`;
const formatMb = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;

class ClientPerformanceMonitor {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        let storedPerfFlag = false;
        try {
            storedPerfFlag = localStorage.getItem('twinfitPerf') === '1';
        } catch {
            storedPerfFlag = false;
        }
        this.enabled = params.get('perf') === '1' || storedPerfFlag;

        this.renderer = null;
        this.gpuInfo = null;
        this.scenarioRunner = null;
        this.sessionStartedAt = new Date().toISOString();
        this.resetAll();

        if (this.enabled) {
            this.setupLongTaskObserver();
            window.addEventListener('DOMContentLoaded', () => {
                this.createPanel();
                this.updatePanel();
                this.startCapture(DEFAULT_CAPTURE_MS, { resetAssets: false });
            });
        }
    }

    resetAll() {
        this.frames = [];
        this.assets = [];
        this.operations = [];
        this.longTasks = [];
        this.activeLoads = new Map();
        this.capture = {
            active: false,
            start: 0,
            durationMs: DEFAULT_CAPTURE_MS,
            end: 0,
        };
        this.latestFps = 0;
        this.lastFrameTime = 0;
        this.lastPanelUpdate = 0;
        this.scenarioStatus = 'Preparado';
    }

    setupLongTaskObserver() {
        if (!('PerformanceObserver' in window)) return;

        try {
            this.longTaskObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    const item = {
                        startTime: Math.round(entry.startTime),
                        durationMs: Math.round(entry.duration),
                    };
                    this.longTasks.push(item);
                });
            });
            this.longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch {
            this.longTaskObserver = null;
        }
    }

    attachRenderer(renderer) {
        if (!this.enabled) return;
        this.renderer = renderer;
        this.gpuInfo = this.detectGpuInfo(renderer);
    }

    setScenarioRunner(runner) {
        this.scenarioRunner = runner;
    }

    detectGpuInfo(renderer) {
        try {
            const gl = renderer.getContext();
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return null;
            return {
                vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
            };
        } catch {
            return null;
        }
    }

    recordFrame(now = performance.now(), renderDurationMs = null) {
        if (!this.enabled) return;

        if (this.lastFrameTime > 0) {
            const frameMs = now - this.lastFrameTime;
            this.latestFps = frameMs > 0 ? 1000 / frameMs : 0;

            if (this.capture.active) {
                this.frames.push({
                    t: Math.round(now - this.capture.start),
                    frameMs: Number(frameMs.toFixed(2)),
                    fps: Number(this.latestFps.toFixed(2)),
                    renderMs: renderDurationMs === null ? null : Number(renderDurationMs.toFixed(2)),
                });
            }
        }

        this.lastFrameTime = now;

        if (this.capture.active && now >= this.capture.end) {
            this.stopCapture();
        }

        if (now - this.lastPanelUpdate > 500) {
            this.lastPanelUpdate = now;
            this.updatePanel();
        }
    }

    startCapture(durationMs = DEFAULT_CAPTURE_MS, options = {}) {
        if (!this.enabled) return;

        if (options.resetAssets) this.assets = [];
        this.frames = [];
        this.operations = [];
        this.longTasks = [];
        this.capture = {
            active: true,
            start: performance.now(),
            durationMs,
            end: performance.now() + durationMs,
        };
        this.scenarioStatus = `Capturando ${Math.round(durationMs / 1000)} s`;
        this.updatePanel();
    }

    stopCapture() {
        this.capture.active = false;
        this.scenarioStatus = 'Captura finalizada';
        this.updatePanel();
    }

    startAssetLoad(meta) {
        if (!this.enabled) return null;

        const id = `${meta.category || 'asset'}-${meta.type || meta.name || 'glb'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        this.activeLoads.set(id, {
            id,
            meta,
            startedAt: performance.now(),
            loadedBytes: 0,
            totalBytes: 0,
        });
        this.updatePanel();
        return id;
    }

    recordAssetProgress(id, progressEvent) {
        if (!this.enabled || !id || !this.activeLoads.has(id)) return;

        const load = this.activeLoads.get(id);
        load.loadedBytes = progressEvent.loaded || load.loadedBytes || 0;
        load.totalBytes = progressEvent.total || load.totalBytes || 0;
    }

    endAssetLoad(id, result = {}) {
        if (!this.enabled || !id || !this.activeLoads.has(id)) return;

        const load = this.activeLoads.get(id);
        this.activeLoads.delete(id);

        const durationMs = performance.now() - load.startedAt;
        const entry = {
            id,
            category: load.meta.category || 'asset',
            type: load.meta.type || null,
            name: load.meta.name || load.meta.type || load.meta.url,
            url: load.meta.url,
            status: result.status || 'ok',
            durationMs: Number(durationMs.toFixed(2)),
            loadedBytes: load.loadedBytes || result.loadedBytes || null,
            totalBytes: load.totalBytes || result.totalBytes || null,
            meshes: null,
            vertices: null,
            triangles: null,
        };

        if (result.object) {
            Object.assign(entry, this.collectObjectStats(result.object));
        }

        this.assets.push(entry);
        window.dispatchEvent(new CustomEvent('perf-asset-loaded', { detail: entry }));
        this.updatePanel();
    }

    collectObjectStats(object) {
        const geometries = new Set();
        let meshes = 0;
        let skinnedMeshes = 0;
        let vertices = 0;
        let triangles = 0;

        object.traverse((node) => {
            if (!(node.isMesh || node.isSkinnedMesh) || !node.geometry) return;
            meshes++;
            if (node.isSkinnedMesh) skinnedMeshes++;

            const geometry = node.geometry;
            if (geometries.has(geometry.uuid)) return;
            geometries.add(geometry.uuid);

            const position = geometry.attributes?.position;
            if (position) vertices += position.count;
            if (geometry.index) triangles += geometry.index.count / 3;
            else if (position) triangles += position.count / 3;
        });

        return {
            meshes,
            skinnedMeshes,
            vertices: Math.round(vertices),
            triangles: Math.round(triangles),
        };
    }

    startOperation(name) {
        if (!this.enabled) return () => {};

        const startedAt = performance.now();
        return () => {
            const durationMs = performance.now() - startedAt;
            this.operations.push({
                name,
                durationMs: Number(durationMs.toFixed(2)),
                t: Math.round(performance.now() - this.capture.start),
            });
        };
    }

    markScenarioStep(label) {
        if (!this.enabled) return;
        this.operations.push({
            name: `scenario:${label}`,
            durationMs: 0,
            t: Math.round(performance.now() - this.capture.start),
        });
        this.scenarioStatus = label;
        this.updatePanel();
    }

    async runScenario() {
        if (!this.enabled || !this.scenarioRunner) return;

        this.resetAll();
        this.createPanel();
        this.startCapture(DEFAULT_CAPTURE_MS, { resetAssets: true });
        this.scenarioStatus = 'Ejecutando recorrido';
        this.updatePanel();

        try {
            await this.scenarioRunner();
            this.scenarioStatus = 'Recorrido finalizado';
        } catch (error) {
            console.error('Error en recorrido de rendimiento:', error);
            this.scenarioStatus = 'Error en recorrido';
        } finally {
            this.updatePanel();
        }
    }

    getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || null,
            deviceMemoryGb: navigator.deviceMemory || null,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
            },
            webgl: this.gpuInfo,
            webWorkersAvailable: typeof Worker !== 'undefined',
            webWorkersUsedByTwinFit: false,
        };
    }

    getMemoryInfo() {
        const jsHeap = performance.memory
            ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            }
            : null;

        const rendererInfo = this.renderer?.info
            ? {
                geometries: this.renderer.info.memory.geometries,
                textures: this.renderer.info.memory.textures,
                calls: this.renderer.info.render.calls,
                triangles: this.renderer.info.render.triangles,
                points: this.renderer.info.render.points,
                lines: this.renderer.info.render.lines,
                programs: this.renderer.info.programs?.length ?? null,
            }
            : null;

        return { jsHeap, rendererInfo };
    }

    percentile(values, p) {
        if (!values.length) return null;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return sorted[index];
    }

    summarizeFrames() {
        if (!this.frames.length) {
            return {
                samples: 0,
                avgFps: null,
                minFps: null,
                p95FrameMs: null,
                maxFrameMs: null,
                framesOver50Ms: 0,
                avgRenderMs: null,
            };
        }

        const fps = this.frames.map((frame) => frame.fps).filter(Number.isFinite);
        const frameMs = this.frames.map((frame) => frame.frameMs).filter(Number.isFinite);
        const renderMs = this.frames.map((frame) => frame.renderMs).filter(Number.isFinite);

        return {
            samples: this.frames.length,
            avgFps: Number((fps.reduce((sum, value) => sum + value, 0) / fps.length).toFixed(2)),
            minFps: Number(Math.min(...fps).toFixed(2)),
            p95FrameMs: Number(this.percentile(frameMs, 95).toFixed(2)),
            maxFrameMs: Number(Math.max(...frameMs).toFixed(2)),
            framesOver50Ms: frameMs.filter((value) => value > 50).length,
            avgRenderMs: renderMs.length
                ? Number((renderMs.reduce((sum, value) => sum + value, 0) / renderMs.length).toFixed(2))
                : null,
        };
    }

    summarizeLongTasks() {
        const durations = this.longTasks.map((task) => task.durationMs);
        return {
            count: this.longTasks.length,
            totalMs: durations.reduce((sum, value) => sum + value, 0),
            maxMs: durations.length ? Math.max(...durations) : 0,
        };
    }

    summarizeOperations() {
        const groups = new Map();
        this.operations
            .filter((operation) => operation.durationMs > 0)
            .forEach((operation) => {
                const group = groups.get(operation.name) || [];
                group.push(operation.durationMs);
                groups.set(operation.name, group);
            });

        return [...groups.entries()].map(([name, values]) => ({
            name,
            count: values.length,
            avgMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
            maxMs: Number(Math.max(...values).toFixed(2)),
        }));
    }

    getSummary() {
        return {
            sessionStartedAt: this.sessionStartedAt,
            capturedAt: new Date().toISOString(),
            capture: {
                durationMs: this.capture.durationMs,
                active: this.capture.active,
            },
            device: this.getDeviceInfo(),
            frames: this.summarizeFrames(),
            longTasks: this.summarizeLongTasks(),
            operations: this.summarizeOperations(),
            assets: this.assets,
            memory: this.getMemoryInfo(),
            notes: [
                'La memoria GPU directa no esta expuesta por los navegadores; se usa renderer.info de Three.js como proxy.',
                'performance.memory solo esta disponible en navegadores Chromium.',
                'TwinFit no usa Web Workers en el prototipo actual; el hilo principal se evalua mediante Long Task API y tiempos de operacion.',
            ],
        };
    }

    summaryText() {
        const summary = this.getSummary();
        const heap = summary.memory.jsHeap;
        const renderer = summary.memory.rendererInfo;
        const assetRows = summary.assets
            .map((asset) => `${asset.name}: ${formatMs(asset.durationMs)} (${asset.triangles ?? '-'} triangulos)`)
            .join('\n');

        return [
            `Dispositivo: ${summary.device.platform || 'n/d'} | CPU threads: ${summary.device.hardwareConcurrency || 'n/d'} | RAM declarada: ${summary.device.deviceMemoryGb || 'n/d'} GB`,
            `Viewport: ${summary.device.viewport.width}x${summary.device.viewport.height} DPR ${summary.device.viewport.devicePixelRatio}`,
            `FPS medio: ${summary.frames.avgFps ?? 'n/d'} | FPS minimo: ${summary.frames.minFps ?? 'n/d'} | p95 frame: ${summary.frames.p95FrameMs ?? 'n/d'} ms`,
            `Long tasks: ${summary.longTasks.count} | total: ${summary.longTasks.totalMs} ms | max: ${summary.longTasks.maxMs} ms`,
            `JS heap usado: ${heap ? formatMb(heap.usedJSHeapSize) : 'no disponible'}`,
            `Three.js memoria: ${renderer ? `${renderer.geometries} geometrias, ${renderer.textures} texturas, ${renderer.triangles} triangulos renderizados` : 'no disponible'}`,
            `GLB:\n${assetRows || 'Sin cargas registradas'}`,
        ].join('\n');
    }

    downloadJson() {
        const blob = new Blob([JSON.stringify(this.getSummary(), null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `twinfit-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async copySummary() {
        const text = this.summaryText();
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            this.scenarioStatus = 'Resumen copiado';
            this.updatePanel();
        } else {
            console.log(text);
        }
    }

    createPanel() {
        if (!this.enabled || document.getElementById('perfPanel')) return;

        const panel = document.createElement('section');
        panel.id = 'perfPanel';
        panel.innerHTML = `
            <div class="perf-panel-header">
                <strong>Rendimiento</strong>
                <span id="perfStatus">Preparado</span>
            </div>
            <div class="perf-grid">
                <div><span>FPS medio</span><strong id="perfAvgFps">-</strong></div>
                <div><span>FPS min</span><strong id="perfMinFps">-</strong></div>
                <div><span>p95 frame</span><strong id="perfP95">-</strong></div>
                <div><span>Long tasks</span><strong id="perfLongTasks">-</strong></div>
            </div>
            <div class="perf-meta" id="perfMeta"></div>
            <div class="perf-actions">
                <button type="button" id="perfScenarioBtn">Recorrido</button>
                <button type="button" id="perfCaptureBtn">60 s</button>
                <button type="button" id="perfExportBtn">JSON</button>
                <button type="button" id="perfCopyBtn">Resumen</button>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#perfScenarioBtn')?.addEventListener('click', () => this.runScenario());
        panel.querySelector('#perfCaptureBtn')?.addEventListener('click', () => {
            this.startCapture(DEFAULT_CAPTURE_MS, { resetAssets: false });
        });
        panel.querySelector('#perfExportBtn')?.addEventListener('click', () => this.downloadJson());
        panel.querySelector('#perfCopyBtn')?.addEventListener('click', () => this.copySummary());
    }

    updatePanel() {
        if (!this.enabled) return;
        const panel = document.getElementById('perfPanel');
        if (!panel) return;

        const summary = this.getSummary();
        const setText = (id, value) => {
            const el = panel.querySelector(`#${id}`);
            if (el) el.textContent = value;
        };

        setText('perfStatus', this.capture.active ? this.scenarioStatus : this.scenarioStatus);
        setText('perfAvgFps', summary.frames.avgFps ?? '-');
        setText('perfMinFps', summary.frames.minFps ?? '-');
        setText('perfP95', summary.frames.p95FrameMs ? `${summary.frames.p95FrameMs} ms` : '-');
        setText('perfLongTasks', summary.longTasks.count);

        const heap = summary.memory.jsHeap;
        const renderer = summary.memory.rendererInfo;
        const remaining = this.capture.active
            ? Math.max(0, Math.ceil((this.capture.end - performance.now()) / 1000))
            : 0;
        setText(
            'perfMeta',
            [
                this.capture.active ? `quedan ${remaining}s` : 'captura parada',
                `${summary.assets.length} GLB`,
                heap ? `heap ${formatMb(heap.usedJSHeapSize)}` : 'heap n/d',
                renderer ? `${renderer.geometries} geo / ${renderer.textures} tex` : 'render n/d',
            ].join(' | ')
        );
    }
}

export const performanceMonitor = new ClientPerformanceMonitor();
