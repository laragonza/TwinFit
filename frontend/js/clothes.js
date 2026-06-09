import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { performanceMonitor } from './performanceMonitor.js';

// Dejo separados los vestidos porque se tratan como una misma familia.
const DRESS_TYPES = new Set(['dress3', 'dress4']);
// Lista cerrada de las prendas que forman parte del vestidor final.
const SUPPORTED_CLOTH_TYPES = new Set(['dress3', 'dress4', 'tshirt', 'denim_mom_jean']);

export class Wardrobe {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        // Aqui guardo lo que lleva puesto el avatar en cada momento.
        this.currentOutfit = {};
        this.activeClothType = null;
    }

    // La camiseta daba problemas en hombros y mangas, asi que aqui retoco sus vertices.
    widenTshirtSleeves(model, largeAmount = 0, smallAmount = 0, giantAmount = 0) {
        const sleeveThickness = Math.max(1.42, 1.75 - largeAmount * 0.8);
        const sleeveHeight = Math.max(1.03, 1.08 - largeAmount * 0.12);

        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            const position = geometry.attributes.position;

            if (!geometry.userData.tshirtSleeveBase) {
                // Guardo la forma original para que el ajuste no se acumule cada vez.
                geometry.computeBoundingBox();
                const box = geometry.boundingBox;
                geometry.userData.tshirtSleeveBase = Float32Array.from(position.array);
                geometry.userData.tshirtSleeveBounds = {
                    centerX: (box.min.x + box.max.x) * 0.5,
                    centerY: (box.min.y + box.max.y) * 0.5,
                    centerZ: (box.min.z + box.max.z) * 0.5,
                    halfWidth: Math.max((box.max.x - box.min.x) * 0.5, 0.001),
                    minZ: box.min.z,
                    height: Math.max(box.max.z - box.min.z, 0.001)
                };
            }

            const base = geometry.userData.tshirtSleeveBase;
            const bounds = geometry.userData.tshirtSleeveBounds;

            for (let i = 0; i < position.count; i++) {
                const offset = i * 3;
                const x = base[offset];
                const y = base[offset + 1];
                const z = base[offset + 2];
                const sideDistance = x - bounds.centerX;
                const sideAmount = Math.abs(sideDistance) / bounds.halfWidth;
                const sideMask = THREE.MathUtils.smoothstep(sideAmount, 0.58, 0.9);
                const upperMask = THREE.MathUtils.smoothstep((z - bounds.minZ) / bounds.height, 0.22, 0.7);
                const sleeveMask = sideMask * upperMask;
                const upperBodyMask = (1 - THREE.MathUtils.smoothstep(sideAmount, 0.5, 0.9)) * upperMask * smallAmount;
                const giantUpperMask = THREE.MathUtils.smoothstep((z - bounds.minZ) / bounds.height, 0.62, 0.92) * giantAmount;
                const giantCenterMask = (1 - THREE.MathUtils.smoothstep(sideAmount, 0.18, 0.52)) * giantUpperMask;
                const giantShoulderMask = (1 - THREE.MathUtils.smoothstep(sideAmount, 0.58, 0.86)) * giantUpperMask;

                const thicknessScale = 1 + (sleeveThickness - 1) * sleeveMask;
                const heightScale = 1 + (sleeveHeight - 1) * sleeveMask;
                const bodyWidthScale = 1 - 0.08 * upperMask * smallAmount - 0.045 * giantShoulderMask;
                const bodyThicknessScale = thicknessScale + 0.1 * upperBodyMask + 0.12 * giantCenterMask;
                const bodyHeightScale = heightScale + 0.05 * upperBodyMask + 0.035 * giantCenterMask;

                position.setXYZ(
                    i,
                    bounds.centerX + (x - bounds.centerX) * bodyWidthScale,
                    bounds.centerY + (y - bounds.centerY) * bodyThicknessScale,
                    bounds.centerZ + (z - bounds.centerZ) * bodyHeightScale
                );
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    // Recorto la parte baja de la camiseta cuando se combina con el pantalon.
    setTshirtPantsClip(model, lowerY, upperY, halfWidth, centerX = 0) {
        if (!model || upperY <= lowerY) return;

        const half = Math.max(14, halfWidth);
        if (!model.userData.tshirtPantsClipPlanes) {
            model.userData.tshirtPantsClipPlanes = [
                new THREE.Plane(new THREE.Vector3(0, -1, 0), lowerY),
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -upperY),
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), centerX - half),
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -(centerX + half))
            ];
        } else {
            model.userData.tshirtPantsClipPlanes[0].constant = lowerY;
            model.userData.tshirtPantsClipPlanes[1].constant = -upperY;
            model.userData.tshirtPantsClipPlanes[2].constant = centerX - half;
            model.userData.tshirtPantsClipPlanes[3].constant = -(centerX + half);
        }

        const planes = model.userData.tshirtPantsClipPlanes;
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;

            if (Array.isArray(o.material)) {
                o.material = o.material.map((mat) => {
                    if (!mat || mat._tshirtPantsClipCloned) return mat;
                    const clone = mat.clone();
                    clone._tshirtPantsClipCloned = true;
                    return clone;
                });
            } else if (!o.material._tshirtPantsClipCloned) {
                o.material = o.material.clone();
                o.material._tshirtPantsClipCloned = true;
            }

            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach((mat) => {
                if (!mat) return;
                mat.clippingPlanes = planes;
                mat.clipIntersection = true;
                mat.needsUpdate = true;
            });
        });
    }

    // Cuando se quita el pantalon, la camiseta vuelve a verse completa.
    clearTshirtPantsClip(model) {
        if (!model) return;
        model.userData.tshirtPantsClipPlanes = null;

        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach((mat) => {
                if (!mat) return;
                mat.clippingPlanes = null;
                mat.clipIntersection = false;
                mat.needsUpdate = true;
            });
        });
    }

    // Ajusta la pernera del denim y rellena suavemente el interior del muslo.
    taperDenimMomJeanLegs(model) {
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const height = Math.max(box.max.y - box.min.y, 0.001);
            const kneeY = box.min.y + height * 0.43;
            const ankleY = box.min.y + height * 0.08;
            const thighPeakY = box.min.y + height * 0.58;
            const thighTopY = box.min.y + height * 0.74;
            const crotchLowY = box.min.y + height * 0.56;
            const crotchPeakY = box.min.y + height * 0.72;
            const crotchTopY = box.min.y + height * 0.86;
            const crotchHalfWidth = Math.max((box.max.x - box.min.x) * 0.2, 0.001);
            const centerZ = (box.min.z + box.max.z) * 0.5;
            const frontDepth = Math.max(box.max.z - centerZ, 0.001);

            let leftSum = 0;
            let leftCount = 0;
            let rightSum = 0;
            let rightCount = 0;

            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i);
                if (y > kneeY) continue;

                const x = position.getX(i);
                if (x < 0) {
                    leftSum += x;
                    leftCount++;
                } else {
                    rightSum += x;
                    rightCount++;
                }
            }

            const leftCenterX = leftCount ? leftSum / leftCount : box.min.x * 0.5;
            const rightCenterX = rightCount ? rightSum / rightCount : box.max.x * 0.5;

            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i);
                if (y > kneeY) continue;

                const x = position.getX(i);
                const z = position.getZ(i);
                const legCenterX = x < 0 ? leftCenterX : rightCenterX;
                const lowerMask = THREE.MathUtils.smoothstep((kneeY - y) / Math.max(kneeY - ankleY, 0.001), 0, 1);
                const xScale = 1 + 0.12 * lowerMask;
                const zScale = 1 + 0.1 * lowerMask;
                const inwardShift = (x < 0 ? 1 : -1) * 4.3 * lowerMask;
                const downFromKnee = (kneeY - y) / Math.max(kneeY - ankleY, 0.001);
                const innerMask = x < 0
                    ? THREE.MathUtils.smoothstep((x - legCenterX) / Math.max(Math.abs(legCenterX), 0.001), 0.04, 0.55)
                    : THREE.MathUtils.smoothstep((legCenterX - x) / Math.max(Math.abs(legCenterX), 0.001), 0.04, 0.55);
                const rightLegBoost = x >= 0 ? 1.14 : 1;
                const rightKneeMask = x >= 0
                    ? THREE.MathUtils.smoothstep(downFromKnee, 0.02, 0.22) * (1 - THREE.MathUtils.smoothstep(downFromKnee, 0.42, 0.68))
                    : 0;
                const rightKneeInnerExpand = -0.5 * rightKneeMask * innerMask;
                const innerExpand = (x < 0 ? 1 : -1) * 1.2 * rightLegBoost * lowerMask * innerMask;
                const frontMask = THREE.MathUtils.smoothstep((z - centerZ) / frontDepth, 0.08, 0.85);
                const frontExpand = 9.2 * rightLegBoost * lowerMask * frontMask;
                const rightKneeFrontExpand = 2.0 * rightKneeMask * frontMask;
                const rightCuffLift = x >= 0
                    ? 3.6 * THREE.MathUtils.smoothstep(downFromKnee, 0.68, 1.0)
                    : 0;
                const rightCuffOpen = x >= 0
                    ? 0.18 * THREE.MathUtils.smoothstep(downFromKnee, 0.7, 1.0)
                    : 0;

                position.setXYZ(
                    i,
                    legCenterX + (x - legCenterX) * (xScale + rightCuffOpen) + inwardShift + innerExpand + rightKneeInnerExpand,
                    y + rightCuffLift,
                    centerZ + (z - centerZ) * zScale + frontExpand + rightKneeFrontExpand
                );
            }

            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i);
                if (y <= kneeY || y >= thighTopY) continue;

                const x = position.getX(i);
                if (Math.abs(x) < 0.001) continue;

                const thighRise = THREE.MathUtils.smoothstep((y - kneeY) / Math.max(thighPeakY - kneeY, 0.001), 0, 1);
                const thighFall = 1 - THREE.MathUtils.smoothstep((y - thighPeakY) / Math.max(thighTopY - thighPeakY, 0.001), 0, 1);
                const legCenterX = x < 0 ? leftCenterX : rightCenterX;
                const legWidthRef = Math.max(Math.abs(legCenterX), 0.001);
                const innerThighMask = x < 0
                    ? THREE.MathUtils.smoothstep((x - legCenterX) / legWidthRef, 0.08, 0.48)
                    : THREE.MathUtils.smoothstep((legCenterX - x) / legWidthRef, 0.08, 0.48);
                const rightLegBoost = x >= 0 ? 1.08 : 1;
                const innerThighExpand = (x < 0 ? 1 : -1) * 0.7 * rightLegBoost * thighRise * thighFall * innerThighMask;

                position.setX(i, x + innerThighExpand);
            }

            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i);
                if (y <= crotchLowY || y >= crotchTopY) continue;

                const x = position.getX(i);
                const z = position.getZ(i);
                const crotchRise = THREE.MathUtils.smoothstep((y - crotchLowY) / Math.max(crotchPeakY - crotchLowY, 0.001), 0, 1);
                const crotchFall = 1 - THREE.MathUtils.smoothstep((y - crotchPeakY) / Math.max(crotchTopY - crotchPeakY, 0.001), 0, 1);
                const centerMask = 1 - THREE.MathUtils.smoothstep(Math.abs(x) / crotchHalfWidth, 0.55, 1.0);
                const frontMask = THREE.MathUtils.smoothstep((z - centerZ) / frontDepth, 0.04, 0.74);
                const crotchMask = crotchRise * crotchFall * centerMask * frontMask;

                if (crotchMask <= 0) continue;

                position.setXYZ(
                    i,
                    x * (1 - 0.22 * crotchMask),
                    y,
                    z + 2.2 * crotchMask
                );
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    // Enderezo la parte interior de las piernas para que no queden huecos raros.
    straightenDenimInnerLegs(model) {
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const height = Math.max(box.max.y - box.min.y, 0.001);
            const width = Math.max(box.max.x - box.min.x, 0.001);
            const lowerY = box.min.y + height * 0.13;
            const upperY = box.min.y + height * 0.68;
            const blendHeight = height * 0.08;
            const targetGap = Math.max(width * 0.07, 3.0);
            const innerBand = Math.max(width * 0.28, targetGap + 1.0);

            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                if (Math.abs(x) > innerBand || y < lowerY || y > upperY) continue;

                const lowerMask = THREE.MathUtils.smoothstep((y - lowerY) / blendHeight, 0, 1);
                const upperMask = 1 - THREE.MathUtils.smoothstep((y - (upperY - blendHeight)) / blendHeight, 0, 1);
                const yMask = lowerMask * upperMask;
                const innerMask = 1 - THREE.MathUtils.smoothstep(
                    (Math.abs(x) - targetGap) / Math.max(innerBand - targetGap, 0.001),
                    0,
                    1
                );
                const mask = yMask * innerMask;
                if (mask <= 0) continue;

                const targetX = x < 0 ? -targetGap : targetGap;
                position.setX(i, THREE.MathUtils.lerp(x, targetX, mask * 0.88));
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    // Aplano el frontal del pantalon, sobre todo para que no sobresalga en la cintura.
    flattenPantsAbdomen(model, amount = 0.9) {
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const height = Math.max(box.max.y - box.min.y, 0.001);
            const width = Math.max(box.max.x - box.min.x, 0.001);
            const centerZ = (box.min.z + box.max.z) * 0.5;
            const frontDepth = Math.max(box.max.z - centerZ, 0.001);
            const abdomenLowY = box.min.y + height * 0.58;
            const abdomenPeakY = box.min.y + height * 0.76;
            const abdomenTopY = box.min.y + height * 0.98;
            const flatFrontZ = centerZ + frontDepth * 0.48;

            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                const z = position.getZ(i);
                if (y < abdomenLowY || y > abdomenTopY || z <= centerZ) continue;

                const riseMask = THREE.MathUtils.smoothstep(
                    (y - abdomenLowY) / Math.max(abdomenPeakY - abdomenLowY, 0.001),
                    0,
                    1
                );
                const topMask = 1 - THREE.MathUtils.smoothstep(
                    (y - abdomenTopY) / Math.max(height * 0.08, 0.001),
                    0,
                    1
                );
                const xMask = 1 - THREE.MathUtils.smoothstep(
                    Math.abs(x) / Math.max(width * 0.44, 0.001),
                    0.72,
                    1.0
                );
                const frontMask = THREE.MathUtils.smoothstep(
                    (z - centerZ) / frontDepth,
                    0.08,
                    0.95
                );
                const mask = riseMask * topMask * xMask * frontMask * amount;
                if (mask <= 0) continue;

                position.setZ(i, THREE.MathUtils.lerp(z, flatFrontZ, Math.min(mask, 0.5)));
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    // Ajuste fino de la cinturilla: la idea es que no se meta ni se abombe demasiado.
    flattenPantsWaistband(model, amount = 1.0) {
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const height = Math.max(box.max.y - box.min.y, 0.001);
            const width = Math.max(box.max.x - box.min.x, 0.001);
            const centerZ = (box.min.z + box.max.z) * 0.5;
            const frontDepth = Math.max(box.max.z - centerZ, 0.001);
            const waistLowY = box.min.y + height * 0.78;
            const waistTopY = box.max.y;
            const flatFrontZ = centerZ + frontDepth * 0.78;

            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                const z = position.getZ(i);
                if (y < waistLowY || y > waistTopY || z <= centerZ) continue;

                const yMask = THREE.MathUtils.smoothstep(
                    (y - waistLowY) / Math.max(waistTopY - waistLowY, 0.001),
                    0,
                    1
                );
                const xMask = 1 - THREE.MathUtils.smoothstep(
                    Math.abs(x) / Math.max(width * 0.48, 0.001),
                    0.82,
                    1.0
                );
                const frontMask = THREE.MathUtils.smoothstep(
                    (z - centerZ) / frontDepth,
                    0.02,
                    0.82
                );
                const mask = Math.min(0.99, yMask * xMask * frontMask * amount);
                if (mask <= 0) continue;

                position.setZ(i, THREE.MathUtils.lerp(z, flatFrontZ, mask));
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    // Bajo y recoloco un poco la cintura para que el vaquero se apoye mejor en el cuerpo.
    settlePantsWaist(model, amount = 1.0) {
        model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;

            const geometry = o.geometry;
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const height = Math.max(box.max.y - box.min.y, 0.001);
            const width = Math.max(box.max.x - box.min.x, 0.001);
            const centerX = (box.min.x + box.max.x) * 0.5;
            const centerZ = (box.min.z + box.max.z) * 0.5;
            const frontDepth = Math.max(box.max.z - centerZ, 0.001);
            const backDepth = Math.max(centerZ - box.min.z, 0.001);
            const waistLowY = box.min.y + height * 0.82;
            const rimLowY = box.min.y + height * 0.91;
            const targetFrontZ = centerZ + frontDepth * 1.02;
            const targetBackZ = centerZ - backDepth * 1.28;
            const rimDrop = height * 0.014 * amount;

            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                const z = position.getZ(i);
                if (y < waistLowY) continue;

                const yMask = THREE.MathUtils.smoothstep(
                    (y - waistLowY) / Math.max(box.max.y - waistLowY, 0.001),
                    0,
                    1
                );
                const rimMask = THREE.MathUtils.smoothstep(
                    (y - rimLowY) / Math.max(box.max.y - rimLowY, 0.001),
                    0,
                    1
                );
                const sideAmount = Math.abs(x - centerX) / Math.max(width * 0.5, 0.001);
                const sideMask = THREE.MathUtils.smoothstep(sideAmount, 0.68, 1.0);
                const depthRef = z >= centerZ ? frontDepth : backDepth;
                const depthAmount = Math.abs(z - centerZ) / Math.max(depthRef, 0.001);
                const depthMask = THREE.MathUtils.smoothstep(depthAmount, 0.18, 1.0);
                const targetZ = z >= centerZ ? targetFrontZ : targetBackZ;
                const zMask = Math.min(0.5, yMask * depthMask * amount * 0.74);
                const xScale = 1 + 0.17 * yMask * sideMask * amount;

                position.setXYZ(
                    i,
                    centerX + (x - centerX) * xScale,
                    y - rimDrop * rimMask,
                    THREE.MathUtils.lerp(z, targetZ, zMask)
                );
            }

            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        });
    }

    loadCloth(clothData, avatar) {
        if (!avatar || !avatar.model) {
            console.error(`No puedo cargar ${clothData.type}: el avatar no estÃ¡ listo.`);
            return;
        }

        if (!SUPPORTED_CLOTH_TYPES.has(clothData.type)) {
            console.warn(`Prenda no soportada: ${clothData.type}`);
            if (window.showToast) window.showToast(`Prenda no soportada: ${clothData.name || clothData.type}`, true);
            return;
        }

        // Si la prenda viene de la base de datos sin ruta, uso la ruta local correcta.
        const localModelPaths = {
            dress3: 'assets/Vestido3.glb',
            dress4: 'assets/Vestido4.glb',
            denim_mom_jean: 'assets/denim_mom_jean.glb',
            tshirt: 'assets/t-shirt.glb'
        };
        const fallbackModelPath = localModelPaths[clothData.type];
        clothData = {
            ...clothData,
            modelPath: clothData.modelPath || fallbackModelPath
        };

        console.log(`Cargando: ${clothData.type}...`);
        if (window.showToast) window.showToast(`Cargando: ${clothData.name || clothData.type}...`);

        // Compruebo si esta pieza exacta ya estÃ¡ puesta
        if (this.currentOutfit[clothData.type]) {
            const old = this.currentOutfit[clothData.type];
            if (old.parent) old.parent.remove(old);
            delete this.currentOutfit[clothData.type];


            if (this.activeClothType === clothData.type) {
                this.activeClothType = null;
                window.dispatchEvent(new CustomEvent('cloth-active', { detail: null }));
            }

            // Quitamos el clipping de cintura al desvestir
            const isDressType = DRESS_TYPES.has(clothData.type);
            if (isDressType && avatar.clearMidriffClip) {
                avatar.clearMidriffClip();
            }
            if (clothData.type === 'denim_mom_jean' && avatar.clearPantsClip) {
                avatar.clearPantsClip();
                if (this.currentOutfit.tshirt) this.clearTshirtPantsClip(this.currentOutfit.tshirt);
            }

            console.log(`Prenda quitada: ${clothData.type}`);
            if (window.showToast) window.showToast(`Quitada: ${clothData.name || clothData.type}`);

            // Salimos para no volver a cargarla (Toggle OFF)
            return;
        }

        // Si la prenda nueva es un vestido, bloquear si ya hay otro vestido puesto
        const isNewDress = DRESS_TYPES.has(clothData.type);
        if (isNewDress) {
            for (const type of Object.keys(this.currentOutfit)) {
                if (DRESS_TYPES.has(type)) {
                    if (window.showToast) window.showToast('Quítate el vestido actual antes de ponerte otro.', true);
                    return;
                }
            }
        }

        const perfLoadId = performanceMonitor.startAssetLoad({
            category: 'cloth',
            type: clothData.type,
            name: clothData.name || clothData.type,
            url: clothData.modelPath,
        });

        this.loader.load(
            clothData.modelPath,
            (gltf) => {
                try {
                    const model = gltf.scene;
                    performanceMonitor.endAssetLoad(perfLoadId, {
                        status: 'ok',
                        object: model,
                    });
                    console.log(`Cloth callback: type=${clothData.type}, hasModel=${!!model}`);

                    // Enganchamos la ropa al "esqueleto" del avatar para que se mueva con Ã©l
                    let reboundCount = 0;
                    if (avatar.skeleton) {
                        const avatarBoneMap = new Map();
                        avatar.skeleton.bones.forEach(b => avatarBoneMap.set(b.name, b));

                        model.traverse((o) => {
                            // A la camiseta y al denim los ajustamos a mano.
                            if (o.isSkinnedMesh && clothData.type !== 'tshirt' && clothData.type !== 'denim_mom_jean') {
                                const newBones = [];
                                let missingCount = 0;
                                o.skeleton.bones.forEach((clothBone) => {
                                    const avatarBone = avatarBoneMap.get(clothBone.name);
                                    if (avatarBone) {
                                        newBones.push(avatarBone);
                                    } else {
                                        missingCount++;
                                        newBones.push(clothBone);
                                    }
                                });

                                if (missingCount > o.skeleton.bones.length * 0.5) return;

                                o.bind(new THREE.Skeleton(newBones, o.skeleton.boneInverses), o.bindMatrix);
                                o.frustumCulled = false;
                                reboundCount++;
                            }
                        });
                    }

                    model.position.set(0, 0, 0);

                    // Dejo todos los modelos con sombras y material visible por las dos caras.
                    // Configuro las sombras y el material por defecto
                    model.traverse((o) => {
                        if (o.isMesh || o.isSkinnedMesh) {
                            o.castShadow = true;
                            o.receiveShadow = true;
                            o.frustumCulled = false;
                            if (!o.material) {
                                o.material = new THREE.MeshStandardMaterial({
                                    color: 0xffffff,
                                    side: THREE.DoubleSide,
                                    roughness: 0.8,
                                    metalness: 0.1
                                });
                            }
                            const materials = Array.isArray(o.material) ? o.material : [o.material];
                            materials.forEach((mat) => {
                                if (!mat) return;
                                if (clothData.color && mat.color) mat.color.setHex(clothData.color);
                                mat.side = THREE.DoubleSide;
                                mat.needsUpdate = true;
                            });
                        }
                    });

                    let isStatic = false;

                    // Si la ropa es estÃ¡tica (como los vestidos o la camiseta), la ajusto a mano.
                    // No se requiere avatar.skeleton: las prendas estÃ¡ticas se posicionan en escena
                    // directamente y no dependen del esqueleto para su colocaciÃ³n.
                    if (reboundCount === 0) {
                        this.scene.add(model);

                        // --- GUÃA DE AJUSTE (x, y, z) ---
                        // rotation.set(x, y, z): Giro (y=Math.PI es 180Âº)
                        // scale.set(x, y, z): TamaÃ±o (x:Ancho, y:Alto, z:Grosor)
                        // position.set(x, y, z): Lugar (x:Izq/Der, y:Altura, z:Frente/Fondo)
                        // --------------------------------

                        if (clothData.type === 'tshirt') {
                            // --- LA CAMISETA DEL CHICO ---
                            model.traverse((o) => {
                                if (o.isMesh || o.isSkinnedMesh) o.geometry.center();
                            });
                            this.widenTshirtSleeves(model);
                            model.rotation.set(0, Math.PI, 0);
                            // Ajustado a las proporciones base perfectas recomendadas (Pecho 120, Cintura 90, Caderas 105)
                            // Eje X mas estrecho para que la camiseta no quede tan ancha en el hombre.
                            model.scale.set(1.26, 0.88, 1.24);
                            model.position.set(0, 135.0, -1.2);
                        } else if (clothData.type === 'denim_mom_jean') {
                            // --- DENIM MOM JEAN (Hombre) ---
                            model.traverse((o) => {
                                if (o.isMesh || o.isSkinnedMesh) o.geometry.center();
                            });
                            this.taperDenimMomJeanLegs(model);
                            this.straightenDenimInnerLegs(model);
                            this.flattenPantsAbdomen(model, 1.7);
                            this.flattenPantsWaistband(model, 1.45);
                            this.settlePantsWaist(model, 1.15);
                            model.rotation.set(0, 0, 0);
                            // Escala y posiciÃ³n para que quede holgado y no clipee
                            model.scale.set(1.12, 1.02, 1.16);
                            model.position.set(0, 88.2, 0.2);
                        } else if (clothData.type === 'dress3') {
                            // --- VESTIDO TRANSPARENCIAS (Mujer) ---
                            model.rotation.set(0, 0, 0);
                            model.scale.set(1080, 980, 1380);  // Escala masiva (mm)
                            model.position.set(0, 10.9, 3.2);  // Cerca del suelo, origen pies
                        } else if (clothData.type === 'dress4') {
                            // --- VESTIDO FLORES (Mujer) ---
                            model.rotation.set(0, 0, 0);
                            model.scale.set(1160, 980, 1300);
                            model.position.set(0, 10.9, 1.5);
                        }

                        // Guardo escala y posicion inicial para recalcular desde una base limpia.
                        model.userData.baseScale = model.scale.clone();
                        model.userData.basePosition = model.position.clone();
                        isStatic = true;
                    } else {
                        avatar.model.add(model);
                        model.scale.set(1 / avatar.model.scale.x, 1 / avatar.model.scale.y, 1 / avatar.model.scale.z);
                        model.position.set(0, 0, 0);
                    }

                    model.userData.isStatic = isStatic;

                    model.name = `Cloth_${clothData.type}`;
                    this.currentOutfit[clothData.type] = model;
                    this.activeClothType = clothData.type;

                    // Asegurar que el cuerpo del avatar sea siempre completamente visible primero
                    if (avatar.clearMidriffClip) avatar.clearMidriffClip();

                    this.updateClothes(avatar);
                    // Notificar al UI que hay una prenda activa
                    window.dispatchEvent(new CustomEvent('cloth-active', {
                        detail: { type: clothData.type, name: clothData.name, color: clothData.color }
                    }));
                    console.log(`${clothData.type} listo.`);
                    if (window.showToast) window.showToast(`${clothData.name || clothData.type} listo!`);
                } catch (e) {
                    console.error(`en callback de ${clothData.type}:`, e);
                }
            },
            (xhr) => {
                performanceMonitor.recordAssetProgress(perfLoadId, xhr);
            },
            (error) => {
                console.warn(`âš ï¸ Error cargando ${clothData.modelPath}:`, error);
                performanceMonitor.endAssetLoad(perfLoadId, { status: 'error' });
                if (fallbackModelPath && clothData.modelPath !== fallbackModelPath) {
                    this.loadCloth({ ...clothData, modelPath: fallbackModelPath }, avatar);
                    return;
                }
                if (window.showToast) window.showToast(`No he podido cargar ${clothData.name || clothData.type}.`, true);
                this.createProxyCloth(clothData, avatar);
            }
        );
    }

    // Quita toda la ropa del avatar de una vez
    removeAll(avatar) {
        Object.keys(this.currentOutfit).forEach(type => {
            const cloth = this.currentOutfit[type];
            if (cloth && cloth.parent) cloth.parent.remove(cloth);
        });
        this.currentOutfit = {};
        this.activeClothType = null;
        if (avatar && avatar.clearMidriffClip) avatar.clearMidriffClip();
        if (avatar && avatar.clearPantsClip) avatar.clearPantsClip();
        window.dispatchEvent(new CustomEvent('cloth-active', { detail: null }));
    }

    // Cambia el color de la prenda actualmente seleccionada
    setActiveClothColor(colorHex) {
        if (!this.activeClothType || !this.currentOutfit[this.activeClothType]) return;
        this.currentOutfit[this.activeClothType].traverse((o) => {
            if (o.isMesh && o.material) {
                o.material = o.material.clone();
                o.material.color.setHex(colorHex);
            }
        });
    }

    // Cambia el color de una prenda concreta por tipo
    setClothColor(type, colorHex) {
        const cloth = this.currentOutfit[type];
        if (!cloth) return;
        cloth.traverse((o) => {
            if (o.isMesh && o.material) {
                o.material = o.material.clone();
                o.material.color.setHex(colorHex);
            }
        });
    }

    // Cambia el color de todas las prendas puestas a la vez
    setAllClothesColor(colorHex) {
        Object.values(this.currentOutfit).forEach(cloth => {
            cloth.traverse((o) => {
                if (o.isMesh && o.material) {
                    o.material = o.material.clone();
                    o.material.color.setHex(colorHex);
                }
            });
        });
    }

    // Por si falla la carga, pongo un cubo rojo para saber quÃ© pasa
    createProxyCloth(clothData, avatar) {
        const geometry = new THREE.BoxGeometry(30, 40, 20);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const proxy = new THREE.Mesh(geometry, material);
        proxy.name = `Proxy_${clothData.type}`;

        if (avatar && avatar.model) avatar.model.add(proxy);
        else this.scene.add(proxy);

        proxy.position.set(0, 100, 0);
        this.currentOutfit[clothData.type] = proxy;
    }

    // AquÃ­ hago que la ropa se ensanche o estire segÃºn el cuerpo
    updateClothes(avatar) {
        if (!avatar || !avatar.targets) return;
        const t = avatar.targets;

        // Primero convierto los targets del avatar en medidas aproximadas.
        const gender = (t.gender === 'male') ? 'male' : 'female';

        // bases: medidas de referencia anatÃ³mica para normalizar los targets
        const bases = gender === 'male'
            ? { chest: 100, waist: 85, hips: 93 }
            : { chest: 90, waist: 70, hips: 100 };

        // cal: valores de los sliders con los que se calibrÃ³ visualmente la ropa (prendas normales)
        const cal = gender === 'male'
            ? { hips: 93, waist: 85, chest: 100, height: 175 }
            : { hips: 100, waist: 70, chest: 90, height: 175 };

        // calDress: medidas exactas con las que el vestido femenino queda perfecto.
        // El usuario no sabe que el vestido escala desde este punto de referencia.
        const calDress = { hips: 96, waist: 73, chest: 99, height: 175 };

        // calDress4: medidas con las que el vestido flores queda perfecto (calibrado visual independiente)
        const calDress4 = { hips: 107, waist: 64, chest: 94, height: 175 };

        // calTshirt: medidas exactas con las que la camiseta masculina queda perfecta.
        const calTshirt = { hips: 105, waist: 90, chest: 120, height: 175 };

        const c = t.chest || 1.0;
        const w = t.waist || 1.0;
        const h = t.hips || 1.0;
        const hs = t.heightScale || 1.0;

        // Medidas reales en cm (1 unidad de escena â‰ˆ 1 cm)
        const hips_cm = h * bases.hips;
        const waist_cm = w * bases.waist;
        const chest_cm = c * bases.chest;
        const height_cm = hs * 170;

        // Y (alto): proporcional a la altura real del avatar
        const scaleY = height_cm / cal.height;

        // Ratios para prendas normales (camiseta, pantalÃ³nâ€¦)
        const ratioHips = hips_cm / cal.hips;
        const ratioWaist = waist_cm / cal.waist;

        // Ratios para prendas estÃ¡ticas con medidas perfectas definidas (vestidos, camiseta)
        const dressRatioHips = hips_cm / calDress.hips;
        const dressRatioChest = chest_cm / calDress.chest;

        // Ratios específicos del vestido flores (calibrado a chest=94, waist=64, hips=107)
        const dress4RatioHips = hips_cm / calDress4.hips;
        const dress4RatioChest = chest_cm / calDress4.chest;

        const tshirtRatioWaist = Math.max(0.1, waist_cm / calTshirt.waist);
        const tshirtRatioChest = Math.max(0.1, chest_cm / calTshirt.chest);
        // Hacemos que la camiseta escale de forma dinámica con las caderas para evitar clipping
        const tshirtRatioHips = Math.max(0.1, hips_cm / calTshirt.hips);

        // A partir de aqui cada prenda se adapta de forma distinta.

        // Escalas generales: usamos el mÃ¡ximo de los ratios para que la prenda siempre cubra el avatar
        Object.keys(this.currentOutfit).forEach(type => {
            const cloth = this.currentOutfit[type];
            if (!cloth) return;

            if (cloth.userData && cloth.userData.isStatic) {
                const baseScale = cloth.userData.baseScale;
                const basePos = cloth.userData.basePosition;

                if (baseScale && basePos) {
                    // Los vestidos cubren todo el cuerpo â†’ las caderas mandan en X;
                    // profundidad Z mezcla caderas y pecho para que encaje la silueta entera
                    const isDress = DRESS_TYPES.has(type);

                    // Vestidos: en las medidas perfectas (86/68/93) los ratios son 1.0
                    // â†’ el vestido se queda exactamente en su escala base.
                    // Al cambiar medidas, escala proporcionalmente desde ese punto.
                    const isTshirt = type === 'tshirt';
                    const isDenimMomJean = type === 'denim_mom_jean';
                    const tshirtRawScale = Math.max(tshirtRatioChest, tshirtRatioWaist, tshirtRatioHips);
                    const tshirtSmallAmount = Math.max(0, 1.0 - tshirtRawScale);
                    const tshirtCoverageAmount = Math.min(0.28, Math.max(0, 1.14 - tshirtRawScale));
                    const tshirtGiantAmount = Math.min(0.55, Math.max(0, tshirtRawScale - 1.22));
                    const tshirtScaleX = Math.max(0.9, tshirtRawScale);
                    const tshirtScaleZ = Math.max(1.03, tshirtRawScale);
                    const denimRatio = Math.max(ratioHips, ratioWaist);
                    const denimScaleX = denimRatio <= 1
                        ? Math.max(1.0, 1 + (1 - denimRatio) * 0.12)
                        : Math.min(1.12, 1 + (denimRatio - 1) * 0.38);
                    const denimScaleZ = denimRatio <= 1
                        ? 1.0
                        : Math.min(1.24, 1 + (denimRatio - 1) * 0.62);
                    const isDress4 = type === 'dress4';
                    const isDress3 = type === 'dress3';
                    // dress3: amortiguamos X al 38% para que a tallas grandes no se dispare el ancho
                    const dress3ScaleX = 1 + (dressRatioHips - 1) * 0.38;
                    // dress4: no baja de 1.0 en X para que no quede estrecho en tallas pequeñas
                    const dress4ScaleX = Math.max(1.0, dress4RatioHips);
                    const clothScaleX = isDress3 ? dress3ScaleX : isDress4 ? dress4ScaleX : (isTshirt ? tshirtScaleX : denimScaleX);
                    const dress4ScaleZ = Math.max(dress4RatioChest, 1 + (dress4RatioHips - 1) * 0.55);
                    const clothScaleZ = isDress4 ? dress4ScaleZ : isDress ? dressRatioChest : (isTshirt ? tshirtScaleZ : denimScaleZ);
                    const minScaleX = isTshirt ? 0.9 : (isDenimMomJean ? 1.0 : 0.5);
                    const minScaleY = isTshirt ? 1.0 : 0.7;
                    const minScaleZ = isTshirt ? 1.0 : (isDenimMomJean ? 1.0 : 0.5);

                    // No escalo todo igual: ancho, alto y profundidad necesitan limites propios.
                    cloth.scale.set(
                        baseScale.x * Math.max(minScaleX, clothScaleX),
                        baseScale.y * Math.max(minScaleY, scaleY),
                        baseScale.z * Math.max(minScaleZ, clothScaleZ)
                    );

                    if (isTshirt) {
                        this.widenTshirtSleeves(cloth, Math.max(0, tshirtScaleX - 1.0), tshirtCoverageAmount, tshirtGiantAmount);
                    }

                    const denimLargeAmount = isDenimMomJean ? Math.max(0, denimRatio - 1.0) : 0;
                    const denimSmallAmount = isDenimMomJean ? Math.max(0, 1.0 - denimRatio) : 0;
                    // Tambien muevo un poco la prenda para que no quede bien solo de frente.
                    const posY = isDenimMomJean
                        ? basePos.y * scaleY - Math.min(1.6, denimLargeAmount * 2.4)
                        : isTshirt
                            ? basePos.y * scaleY + Math.min(2.6, tshirtCoverageAmount * 9.0) + Math.min(1.4, tshirtGiantAmount * 2.2)
                            : basePos.y * scaleY;
                    let posZ;
                    if (isDress4) {
                        posZ = basePos.z + Math.max(0, dress4RatioChest - 1.0) * 4.0 + Math.max(0, dress4RatioHips - 1.0) * 2.5;
                    } else if (isDress) {
                        posZ = basePos.z
                            + (dressRatioChest - 1.0) * 4.0;
                    } else if (isTshirt) {
                        const largeTshirtOffset = Math.max(0, tshirtScaleX - 1.0) * 4.8;
                        const coverageBackOffset = tshirtCoverageAmount * 1.2;
                        posZ = basePos.z + (tshirtRatioChest - 1.0) * 1.2 - largeTshirtOffset - coverageBackOffset;
                    } else if (isDenimMomJean) {
                        posZ = basePos.z
                            + Math.min(0.35, denimSmallAmount * 1.2)
                            - Math.min(0.2, denimLargeAmount * 0.35);
                    }

                    cloth.position.set(basePos.x, posY, posZ);
                }
            } else {
                // Si la ropa estÃ¡ "pegada" al esqueleto, sincronizo los movimientos
                cloth.traverse((o) => {
                    if (o.isMesh && o.morphTargetInfluences && o.morphTargetDictionary) {
                        for (const targetName in t) {
                            const dictKeys = Object.keys(o.morphTargetDictionary);
                            const actualKey = dictKeys.find(k => k.toLowerCase() === targetName.toLowerCase());
                            if (actualKey !== undefined) {
                                const idx = o.morphTargetDictionary[actualKey];
                                o.morphTargetInfluences[idx] = t[targetName];
                            }
                        }
                    }
                });
            }
        });

        const isDressTypeActive = Object.keys(this.currentOutfit).some(t => DRESS_TYPES.has(t));

        if (avatar.clearMidriffClip && !isDressTypeActive) {
            avatar.clearMidriffClip();
        }

        const pantsClip = this.currentOutfit.denim_mom_jean || null;
        const tshirtClip = this.currentOutfit.tshirt || null;
        if (!isDressTypeActive && pantsClip && avatar.clipPantsArea) {
            // Oculto la parte del cuerpo que queda debajo del vaquero para evitar superposiciones.
            pantsClip.updateMatrixWorld(true);
            const clipBox = new THREE.Box3().setFromObject(pantsClip);
            const validBox = Number.isFinite(clipBox.min.x)
                && Number.isFinite(clipBox.min.y)
                && Number.isFinite(clipBox.max.x)
                && Number.isFinite(clipBox.max.y);

            if (validBox) {
                const lowerPadding = 21.0;
                const upperPadding = 9.0;
                const lowerY = clipBox.min.y + lowerPadding;
                const upperY = clipBox.max.y - upperPadding;
                const halfWidth = Math.max(Math.abs(clipBox.min.x), Math.abs(clipBox.max.x))
                    * 0.96;
                avatar.clipPantsArea(lowerY, upperY, Math.max(24, halfWidth));

                if (tshirtClip) {
                    const tshirtUpperY = clipBox.max.y - 2.5;
                    const tshirtLowerY = Math.max(clipBox.min.y, tshirtUpperY - 30.0);
                    const tshirtHalfWidth = Math.max(18, halfWidth * 0.9);
                    this.setTshirtPantsClip(tshirtClip, tshirtLowerY, tshirtUpperY, tshirtHalfWidth);
                }
            }
        } else if (avatar.clearPantsClip) {
            avatar.clearPantsClip();
        }

        if ((!pantsClip || isDressTypeActive) && tshirtClip) {
            this.clearTshirtPantsClip(tshirtClip);
        }
    }
}
