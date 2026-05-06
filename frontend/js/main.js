import { SceneManager } from './scene.js';
import { Avatar } from './avatar.js?v=arms_v105';
import { Wardrobe } from './clothes.js?v=denim_fit_v91';

const API_URL = 'http://localhost:4000';
const SUPPORTED_CLOTH_TYPES = new Set(['dress4', 'dress3', 'tshirt', 'denim_mom_jean']);
const DEFAULT_CLOTHES = [
    { id: 'v4', name: 'Vestido flores', type: 'dress4', modelPath: 'assets/Vestido4.glb', color: 0xff88aa, gender: 'female' },
    { id: 'v3', name: 'Vestido transparencias', type: 'dress3', modelPath: 'assets/Vestido3.glb', color: 0x88ccff, gender: 'female' },
    { id: 't1', name: 'T-Shirt', type: 'tshirt', modelPath: 'assets/t-shirt.glb', color: 0xeeeeee, gender: 'male' },
    { id: 'j1', name: 'Denim Mom Jean', type: 'denim_mom_jean', modelPath: 'assets/denim_mom_jean.glb', color: 0x3a5f8a, gender: 'male' }
];

class App {
    constructor() {
        this.sceneManager = new SceneManager('canvas-container');
        this.avatar = new Avatar();
        this.wardrobe = new Wardrobe(this.sceneManager.scene);

        // Put avatar in scene
        this.sceneManager.addToScene(this.avatar.mesh);

        this.initEventListeners();
        this.fetchClothes();

        this.setupSkinTones();
        this.setupPhotoUpload();
        this.setupClothColorPicker();

        // Aplicar límites de altura según género inicial
        const initialGender = document.getElementById('studio-gender')?.value || 'female';
        this._applyHeightLimits(initialGender);
    }

    _applyHeightLimits(gender) {
        const slider = document.getElementById('studio-height');
        const chestSlider = document.getElementById('studio-chest');
        const waistSlider = document.getElementById('studio-waist');
        if (!slider) return;
        if (gender === 'female') {
            slider.min = 140;
            slider.max = 200;
        } else {
            slider.min = 140;
            slider.max = 220;
            if (chestSlider) {
                chestSlider.min = 80;
                chestSlider.max = 130;
            }
        }
        // Si el valor actual supera el nuevo máximo, ajustarlo
        if (parseInt(slider.value) > parseInt(slider.max)) {
            slider.value = slider.max;
            const valDisplay = document.getElementById('studio-heightVal');
            if (valDisplay) valDisplay.textContent = slider.max;
        }
        if (gender === 'male' && chestSlider && parseInt(chestSlider.value) < parseInt(chestSlider.min)) {
            chestSlider.value = chestSlider.min;
            const valDisplay = document.getElementById('studio-chestVal');
            if (valDisplay) valDisplay.textContent = chestSlider.min;
        }
        if (waistSlider) {
            waistSlider.min = 72;
            if (parseInt(waistSlider.value) < 72) {
                waistSlider.value = 72;
                const valDisplay = document.getElementById('studio-waistVal');
                if (valDisplay) valDisplay.textContent = '72';
            }
        }
    }

    getDefaultMeasurements(gender) {
        return gender === 'male'
            ? { height: 175, chest: 88, waist: 76, hips: 88 }
            : { height: 175, chest: 92, waist: 74, hips: 98 };
    }

    applyStudioMeasurements(measurements) {
        const fields = {
            chest: 'studio-chest',
            waist: 'studio-waist',
            hips: 'studio-hips',
            height: 'studio-height'
        };

        Object.entries(fields).forEach(([key, id]) => {
            const input = document.getElementById(id);
            const valDisplay = document.getElementById(id + 'Val');
            const value = measurements[key];
            if (input && value !== undefined) input.value = value;
            if (valDisplay && value !== undefined) valDisplay.textContent = value;
        });
    }

    initEventListeners() {
        // --- View Transitions Eliminadas ---
        // (El usuario aterriza directamente en Studio)
        this.setupStudioTabs();

        // --- Studio Sliders ---
        ['studio-chest', 'studio-waist', 'studio-hips', 'studio-height'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const valDisplay = document.getElementById(id + 'Val');
                    if (valDisplay) valDisplay.textContent = e.target.value;
                    this.updateAvatarFromStudio();
                });
            }
        });

        // --- Cambiar el género recarga el avatar y la lista de ropa
        document.getElementById('studio-gender').addEventListener('change', () => {
            const gender = document.getElementById('studio-gender').value;
            this._applyHeightLimits(gender);
            this.applyStudioMeasurements(this.getDefaultMeasurements(gender));
            this.updateAvatarFromStudio();
            if (this._lastLoadedClothes) {
                this.renderClothesList(this._lastLoadedClothes);
            }
        });

        // --- Canvas Controls ---
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) btnReset.addEventListener('click', () => this.sceneManager.resetCamera());

        const btnZoomIn = document.getElementById('btn-zoom-in');
        if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.sceneManager.zoomIn());

        const btnZoomOut = document.getElementById('btn-zoom-out');
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.sceneManager.zoomOut());

        const btnRotate = document.getElementById('btn-rotate');
        if (btnRotate) {
            btnRotate.addEventListener('click', () => {
                const isRotating = this.sceneManager.toggleRotation();
                const icon = btnRotate.querySelector('i');
                if (isRotating) {
                    btnRotate.style.backgroundColor = '#e1effe';
                    icon.style.color = '#1a56db';
                } else {
                    btnRotate.style.backgroundColor = '';
                    icon.style.color = '';
                }
            });
        }

        // --- Save / Reset Profile ---
        document.getElementById('saveUserBtn').addEventListener('click', () => this.saveUser());
        
        const resetBtn = document.getElementById('resetProfileBtn');
        if(resetBtn) {
            resetBtn.addEventListener('click', () => {
                const gender = document.getElementById('studio-gender').value;
                this.applyStudioMeasurements(this.getDefaultMeasurements(gender));
                this.updateAvatarFromStudio();
            });
        }

        // --- Avatar ready event ---
        window.addEventListener('avatar-loaded', () => {
            console.log("⚡ ¡Avatar listo! Poniendo medidas...");
            // Only update if we are in studio or have synced
            if (document.getElementById('studioView').classList.contains('active')) {
                this.updateAvatarFromStudio();
            }
        });
    }

    setupStudioTabs() {
        const tabAvatar = document.getElementById('tabAvatar');
        const tabWardrobe = document.getElementById('tabWardrobe');
        const openWardrobeBtn = document.getElementById('openWardrobeBtn');
        const backToAvatarBtn = document.getElementById('backToAvatarBtn');

        if (tabAvatar) tabAvatar.addEventListener('click', () => this.setStudioPanel('avatar'));
        if (tabWardrobe) {
            tabWardrobe.addEventListener('click', () => {
                if (!tabWardrobe.disabled) this.setStudioPanel('wardrobe');
            });
        }
        if (openWardrobeBtn) {
            openWardrobeBtn.addEventListener('click', () => {
                this.updateAvatarFromStudio();
                this.setStudioPanel('wardrobe', true);
                if (this._lastLoadedClothes) this.renderClothesList(this._lastLoadedClothes);
            });
        }
        if (backToAvatarBtn) backToAvatarBtn.addEventListener('click', () => {
            this.wardrobe.removeAll(this.avatar);
            this.setStudioPanel('avatar');
        });

        this.setStudioPanel('avatar');
    }

    setStudioPanel(panel, unlockWardrobe = false) {
        const isWardrobe = panel === 'wardrobe';
        const panels = document.querySelectorAll('[data-studio-panel]');
        const footers = document.querySelectorAll('[data-studio-footer]');
        const tabs = document.querySelectorAll('[data-studio-tab]');
        const tabWardrobe = document.getElementById('tabWardrobe');
        const title = document.getElementById('propertiesTitle');
        const description = document.getElementById('propertiesDescription');

        if (unlockWardrobe && tabWardrobe) tabWardrobe.disabled = false;
        if (isWardrobe && tabWardrobe?.disabled) return;

        panels.forEach(el => {
            const active = el.dataset.studioPanel === panel;
            el.hidden = !active;
            el.classList.toggle('active', active);
        });
        footers.forEach(el => {
            const active = el.dataset.studioFooter === panel;
            el.hidden = !active;
            el.classList.toggle('active', active);
        });
        tabs.forEach(el => el.classList.toggle('active', el.dataset.studioTab === panel));

        if (title && description) {
            title.textContent = isWardrobe ? 'Vestidor' : 'Medidas Corporales';
            description.textContent = isWardrobe
                ? 'Elige prendas para probarlas sobre tu avatar'
                : 'Ajuste preciso de las dimensiones del avatar';
        }

        this.updateMeasureSummary();
    }
    
    // --- Métodos de Setup a Studio obsoletos eliminados ---

    setupClothListener() { } // obsolete but spacing safe
    
    // --- Cloth Active event para refrescar medidas y aplicar efecto corset ---
    static _clothListenerAdded = false;

    getAvatarChestValue(displayChest, gender) {
        if (gender !== 'male') return displayChest;
        return Math.round(100 + (displayChest - 80) * 0.6);
    }

    updateAvatarFromStudio() {
        if (!App._clothListenerAdded) {
            window.addEventListener('cloth-active', () => {
                if (document.getElementById('studioView').classList.contains('active')) {
                    this.updateAvatarFromStudio();
                }
            });
            App._clothListenerAdded = true;
        }
        const data = {
            height: parseInt(document.getElementById('studio-height').value),
            chest: parseInt(document.getElementById('studio-chest').value),
            waist: parseInt(document.getElementById('studio-waist').value),
            hips: parseInt(document.getElementById('studio-hips').value),
            gender: document.getElementById('studio-gender').value
        };
        this.updateMeasureSummary(data);
        const avatarData = {
            ...data,
            chest: this.getAvatarChestValue(data.chest, data.gender)
        };
        // INTERCEPTOR PARA VESTIDOS (Corset virtual)
        if (this.wardrobe && this.wardrobe.activeClothType) {
            const t = this.wardrobe.activeClothType.toLowerCase();
            if (t === 'dress3' || t === 'dress4') {
                avatarData.chest = t === 'dress4'
                    ? Math.min(avatarData.chest, 87)
                    : Math.min(avatarData.chest, 92);
                avatarData.waist = t === 'dress4'
                    ? Math.min(avatarData.waist, 58)
                    : Math.min(avatarData.waist, 64);
            }
        }
        this.avatar.updateMeasurements(avatarData);
        if (this.wardrobe) this.wardrobe.updateClothes(this.avatar);
    }

    updateMeasureSummary(data = null) {
        const current = data || {
            height: parseInt(document.getElementById('studio-height')?.value),
            chest: parseInt(document.getElementById('studio-chest')?.value),
            waist: parseInt(document.getElementById('studio-waist')?.value),
            hips: parseInt(document.getElementById('studio-hips')?.value),
            gender: document.getElementById('studio-gender')?.value
        };

        const labels = { female: 'Femenino', male: 'Masculino' };
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el && value !== undefined && !Number.isNaN(value)) el.textContent = value;
        };

        setText('summaryGender', labels[current.gender] || current.gender || 'Avatar');
        setText('summaryHeight', current.height);
        setText('summaryChest', current.chest);
        setText('summaryWaist', current.waist);
        setText('summaryHips', current.hips);
    }
    
    setupSkinTones() {
        const buttons    = document.querySelectorAll('.skin-btn');
        const eyedropper = document.getElementById('skinEyedropper');

        const applySkin = (colorHex) => {
            if (this.avatar && typeof this.avatar.setSkinColor === 'function') {
                this.avatar.setSkinColor(colorHex);
            }
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applySkin(parseInt(btn.dataset.color, 16));
            });
        });

        // Cuentagotas con EyeDropper API (Chrome/Edge 95+): sin popup, cursor directo
        if (eyedropper) {
            if ('EyeDropper' in window) {
                eyedropper.addEventListener('click', async () => {
                    try {
                        const result = await new window.EyeDropper().open();
                        // result.sRGBHex → "#rrggbb"
                        const colorHex = parseInt(result.sRGBHex.replace('#', ''), 16);
                        buttons.forEach(b => b.classList.remove('active'));
                        applySkin(colorHex);
                    } catch {
                        // Usuario canceló con Escape
                    }
                });
            } else {
                // Fallback para Firefox/Safari: sustituir el botón por un input[type=color]
                const fallback = document.createElement('input');
                fallback.type  = 'color';
                fallback.value = '#fad6b1';
                fallback.title = 'Color personalizado';
                fallback.style.cssText = 'width:28px;height:28px;border-radius:50%;border:2px solid #ccc;padding:1px;cursor:pointer;background:none;flex-shrink:0;';
                fallback.addEventListener('input', (e) => {
                    buttons.forEach(b => b.classList.remove('active'));
                    applySkin(parseInt(e.target.value.replace('#', ''), 16));
                });
                eyedropper.replaceWith(fallback);
            }
        }
    }

    // Detecta el tono de piel desde la foto y lo aplica automáticamente
    setupPhotoUpload() {
        const btn              = document.getElementById('photoUploadBtn');
        const fileInput        = document.getElementById('photoFileInput');
        const previewContainer = document.getElementById('photoPreviewContainer');
        const preview          = document.getElementById('photoPreview');
        const status           = document.getElementById('photoAnalysisStatus');

        if (!btn || !fileInput) return;

        btn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target.result;
                preview.src = dataUrl;
                previewContainer.style.display = 'block';
                status.textContent = 'Detectando tono de piel...';
                fileInput.value = '';

                const skinTone = await this._detectSkinTone(dataUrl);
                if (skinTone) {
                    // Marcar el botón de paleta más cercano
                    const skinBtns = document.querySelectorAll('.skin-btn');
                    skinBtns.forEach(b => b.classList.remove('active'));
                    const match = [...skinBtns].find(b => b.dataset.color === skinTone);
                    if (match) match.classList.add('active');

                    const colorHex = parseInt(skinTone, 16);
                    if (this.avatar && typeof this.avatar.setSkinColor === 'function') {
                        this.avatar.setSkinColor(colorHex);
                    }
                    // Sincronizar el cuentagotas
                    const picker = document.getElementById('skinColorPicker');
                    if (picker) picker.value = '#' + colorHex.toString(16).padStart(6, '0');

                    status.textContent = 'Tono de piel aplicado. Ajústalo con el selector si lo prefieres.';
                } else {
                    status.textContent = 'No se detectó tono de piel claro en la imagen.';
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Analiza la zona central de la foto y devuelve el tono de piel más cercano de la paleta
    async _detectSkinTone(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale  = Math.min(1, 300 / img.width);
                canvas.width  = Math.round(img.width  * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const w = canvas.width, h = canvas.height;
                // Zona de la cara: franja central superior
                const skinData = ctx.getImageData(
                    Math.round(w * 0.25), Math.round(h * 0.10),
                    Math.round(w * 0.50), Math.round(h * 0.45)
                );
                resolve(this._matchSkinTone(skinData.data));
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    // Mapea píxeles de piel al tono más cercano de la paleta
    _matchSkinTone(data) {
        const SKIN_PALETTE = [
            { color: '0xfad6b1', r: 0xfa, g: 0xd6, b: 0xb1 },
            { color: '0xe1b894', r: 0xe1, g: 0xb8, b: 0x94 },
            { color: '0xc68e65', r: 0xc6, g: 0x8e, b: 0x65 },
            { color: '0x9a6548', r: 0x9a, g: 0x65, b: 0x48 },
            { color: '0x683c26', r: 0x68, g: 0x3c, b: 0x26 },
            { color: '0x3b1c0d', r: 0x3b, g: 0x1c, b: 0x0d },
        ];
        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > 60 && g > 30 && b > 10 && r > g && r > b &&
                (r - Math.min(g, b)) > 10 && (r + g + b) / 3 > 40) {
                totalR += r; totalG += g; totalB += b; count++;
            }
        }
        if (count === 0) return null;
        const avgR = totalR / count, avgG = totalG / count, avgB = totalB / count;
        let closest = SKIN_PALETTE[0], minDist = Infinity;
        for (const tone of SKIN_PALETTE) {
            const d = Math.sqrt((avgR - tone.r) ** 2 + (avgG - tone.g) ** 2 + (avgB - tone.b) ** 2);
            if (d < minDist) { minDist = d; closest = tone; }
        }
        return closest.color;
    }

    // Picker de color de la prenda activa
    setupClothColorPicker() {
        const section   = document.getElementById('clothColorSection');
        const picker    = document.getElementById('clothColorPicker');
        const label     = document.getElementById('activeClothLabel');

        if (!picker || !section) return;

        const picker2 = document.getElementById('clothColorPicker2');
        const label2  = document.getElementById('activeClothLabel2');
        const row2    = document.getElementById('clothColorRow2');

        const getClothDisplayName = (type, fallback = '') => {
            const names = {
                dress3: 'Vestido transparencias',
                dress4: 'Vestido flores',
                tshirt: 'Camiseta',
                denim_mom_jean: 'Mom Jean'
            };
            return names[type] || fallback || 'Color de prenda';
        };

        const refreshColorUI = () => {
            const outfit = this.wardrobe?.currentOutfit || {};
            const hasTshirt = !!outfit['tshirt'];
            const hasJean   = !!outfit['denim_mom_jean'];
            const hasAny    = Object.keys(outfit).length > 0;

            if (!hasAny) {
                section.style.display = 'none';
                if (row2) row2.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            if (hasTshirt && hasJean) {
                label.textContent  = 'Camiseta';
                if (label2) label2.textContent = 'Mom Jean';
                if (row2) row2.style.display = 'flex';
            } else {
                const activeType = this.wardrobe.activeClothType;
                label.textContent = getClothDisplayName(activeType);
                if (row2) row2.style.display = 'none';
            }
        };

        picker.addEventListener('input', (e) => {
            const colorHex = parseInt(e.target.value.replace('#', ''), 16);
            const outfit = this.wardrobe?.currentOutfit || {};
            if (outfit['tshirt'] && outfit['denim_mom_jean']) {
                this.wardrobe.setClothColor('tshirt', colorHex);
            } else {
                this.wardrobe.setActiveClothColor(colorHex);
            }
        });

        if (picker2) {
            picker2.addEventListener('input', (e) => {
                const colorHex = parseInt(e.target.value.replace('#', ''), 16);
                this.wardrobe.setClothColor('denim_mom_jean', colorHex);
            });
        }

        // Mostrar/ocultar y actualizar cuando cambia la prenda activa
        window.addEventListener('cloth-active', (e) => {
            refreshColorUI();
            if (e.detail) {
                const initColor = e.detail.color || 0xffffff;
                picker.value = '#' + initColor.toString(16).padStart(6, '0');
                if (label && !(this.wardrobe?.currentOutfit?.tshirt && this.wardrobe?.currentOutfit?.denim_mom_jean)) {
                    label.textContent = getClothDisplayName(e.detail.type, e.detail.name);
                }
            } else if (!Object.keys(this.wardrobe?.currentOutfit || {}).length) {
                label.textContent = 'Color de prenda';
            }
        });
    }

    // Aquí mando mis datos al servidor para guardarlos
    async saveUser() {
        const nameInput = document.getElementById('studio-name');
        const name   = nameInput?.value.trim() || 'Guest';
        const gender = document.getElementById('studio-gender')?.value;
        const height = parseInt(document.getElementById('studio-height')?.value);
        const chest  = parseInt(document.getElementById('studio-chest')?.value);
        const waist  = parseInt(document.getElementById('studio-waist')?.value);
        const hips   = parseInt(document.getElementById('studio-hips')?.value);

        // Validación en el frontend antes de llamar al servidor
        const missing = [];
        if (!name)              missing.push('nombre');
        if (!gender)            missing.push('género');
        if (!height || isNaN(height)) missing.push('estatura');
        if (!chest  || isNaN(chest))  missing.push('pecho');
        if (!waist  || isNaN(waist))  missing.push('cintura');
        if (!hips   || isNaN(hips))   missing.push('caderas');

        if (missing.length > 0) {
            window.showToast(`Faltan datos: ${missing.join(', ')}`, true);
            return;
        }

        const user = {
            name,
            gender,
            height,
            measures: { chest, waist, hips }
        };

        try {
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
            const result = await res.json();
            if (res.ok) window.showToast(`¡Perfil guardado! ID: ${result.id}`);
            else window.showToast(`Error: ${result.error}`, true);
        } catch (err) {
            console.error(err);
            window.showToast("No he podido conectar con el servidor.", true);
        }
    }

    getLocalClothes() {
        return DEFAULT_CLOTHES.map(cloth => ({ ...cloth }));
    }

    // Traigo toda la ropa que hay disponible
    async fetchClothes() {
        try {
            const res = await fetch(`${API_URL}/clothes`);
            const clothes = res.ok ? await res.json() : [];
            this.renderClothesList(Array.isArray(clothes) && clothes.length ? clothes : this.getLocalClothes());
        } catch (err) {
            console.warn("No he podido traer la ropa de la API, así que uso la local.");
            this.renderClothesList(this.getLocalClothes());
        }
    }

    // Aquí pinto la lista de ropita en el menú
    renderClothesList(clothes) {
        clothes = Array.isArray(clothes)
            ? clothes.filter(c => c && SUPPORTED_CLOTH_TYPES.has(c.type))
            : [];

        // Lista de ropa por defecto (Fallbacks si falla la base de datos)
        const defaultClothes = this.getLocalClothes();
            // id: único, name: texto en menú, type: clave para clothes.js, modelPath: ruta al GLB, color: color base (hex), gender: filtro
        defaultClothes.forEach(def => {
            if (!clothes.find(c => c.type === def.type)) clothes.push(def);
        });

        clothes.forEach(c => {
            if (!c.gender) {
                c.gender = c.type === 'dress3' || c.type === 'dress4' ? 'female' : 'male';
            }
        });

        this._lastLoadedClothes = clothes;

        const container = document.getElementById('clothesList');
        if (!container) return;
        container.innerHTML = '';

        const currentGender = this.avatar ? this.avatar.currentGender : 'female';
        const filteredClothes = clothes.filter(c => c.gender === currentGender || c.gender === 'unisex');

        if (filteredClothes.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No hay ropa para este género.</p>';
            return;
        }

        filteredClothes.forEach(cloth => {
            const btn = document.createElement('button');
            btn.className = 'cloth-item';
            btn.textContent = cloth.name;
            btn.addEventListener('click', () => { this.wardrobe.loadCloth(cloth, this.avatar); });
            container.appendChild(btn);
        });
    }
}

window.showToast = (msg, isError = false, persist = false) => {
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.backgroundColor = isError ? 'rgba(255, 60, 60, 0.9)' : 'rgba(0,0,0,0.8)';
        if (window.toastTimeout) clearTimeout(window.toastTimeout);
        if (!persist) {
            window.toastTimeout = setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 300);
            }, 3000);
        }
    }
    console.log(msg);
};

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
