import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Avatar {
    constructor() {
        this.mesh = new THREE.Group();
        this.loader = new GLTFLoader();
        this.model = null; // Escena cargada del GLB
        this.currentGender = 'female';
        this.initModel(this.currentGender);
    }

    // Aquí cargo el modelo 3D según si elijo chico o chica
    initModel(gender) {
        // Limpio todo lo que hubiera antes para no amontonar
        for (let i = this.mesh.children.length - 1; i >= 0; i--) {
            this.mesh.remove(this.mesh.children[i]);
        }
        this.model = null;

        const avatarAssetVersion = 'avatar_asset_v2';
        const modelPath = gender === 'male'
            ? `assets/avatar_male.glb?v=${avatarAssetVersion}`
            : `assets/avatar_female.glb?v=${avatarAssetVersion}`;

        console.log(`🔄 Cargando avatar: ${modelPath}`);
        if (window.showToast) window.showToast(`🔄 Cargando avatar...`, false, true);

        this.loader.load(
            modelPath,
            (gltf) => {
                console.log(`✅ Avatar (${gender}) cargado.`);
                if (window.showToast) window.showToast(`✅ Avatar cargado!`);
                this.model = gltf.scene;

                // Actualizo todo para que las piezas encajen bien
                this.model.updateMatrixWorld(true);

                // Calculo el tamaño real del modelo
                const finalBox = new THREE.Box3().setFromObject(this.model);

                this.model.traverse((o) => {
                    if (o.isSkinnedMesh || o.isMesh) {
                        o.frustumCulled = false;
                        o.castShadow = true;
                        o.receiveShadow = true;

                        if (o.material) {
                            o.material.visible = true;
                            o.material.opacity = 1;
                            o.material.side = THREE.DoubleSide;
                            if (o.material.name === 'default' || !o.material.map) {
                                o.material = new THREE.MeshStandardMaterial({
                                    color: 0xccaa88,
                                    roughness: 0.7,
                                    side: THREE.DoubleSide
                                });
                            }
                        }
                    }
                });

                // Miro cuánto mide para ajustarlo a una altura real
                const size = finalBox.getSize(new THREE.Vector3());
                if (size.y > 0.001) {
                    const targetHeight = 170; // Lo escalo a 170cm
                    const scaleFactor = targetHeight / size.y;
                    this.model.scale.set(scaleFactor, scaleFactor, scaleFactor);
                    console.log(`📏 Escalado a ${targetHeight}cm`);
                }

                this.mesh.add(this.model);
                this.model.updateMatrixWorld(true);

                const scaledBox = new THREE.Box3().setFromObject(this.model);
                const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

                // Lo centro para que no flote por ahí
                this.model.position.sub(scaledCenter).add(new THREE.Vector3(0, 100, 0));

                // Coloco los brazos en una posición natural "A-pose" para que la ropa quede bien
                // El hombre usa solo rotación Z para abrir los brazos lateralmente (eje natural Mixamo)
                const isMale = gender === 'male';
                this.model.traverse((o) => {
                    if (!o.isBone) return;
                    const n = o.name;

                    if (/LeftArm/i.test(n) && !/ForeArm/i.test(n) && !/Hand/i.test(n)) {
                        if (isMale) o.rotation.set(0, 0, -0.65);
                        else o.rotation.set(1.15, 1.15, -0.05);
                    }
                    if (/LeftForeArm/i.test(n)) o.rotation.set(0, 0, 0);

                    if (/RightArm/i.test(n) && !/ForeArm/i.test(n) && !/Hand/i.test(n)) {
                        if (isMale) o.rotation.set(0, 0, 0.65);
                        else o.rotation.set(1.15, -1.15, 0.05);
                    }
                    if (/RightForeArm/i.test(n)) o.rotation.set(0, 0, 0);
                });
                this.model.updateMatrixWorld(true);

                // (Asistente de huesos eliminado para limpiar la vista)
                // ---

                // Busco el esqueleto para poder pegarle la ropa después
                let skin = null;
                this.model.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
                if (skin) {
                    this.skeleton = skin.skeleton;
                    console.log("Esqueleto encontrado.");
                }

                console.log(`🎉 Avatar ${gender} listo!`);
                window.dispatchEvent(new CustomEvent('avatar-loaded'));
            },
            (xhr) => {
                if (xhr.total > 0) {
                    const pct = Math.round(xhr.loaded / xhr.total * 100);
                    console.log(`📥 Cargando: ${pct}%`);
                    if (pct % 25 === 0 && window.showToast) window.showToast(`📥 Cargando: ${pct}%`);
                }
            },
            (error) => {
                console.error(`❌ Error cargando avatar:`, error);
                if (window.showToast) window.showToast(`❌ Error cargando avatar`, true);
                this.createPlaceholder();
            }
        );
    }

    // Si falla el avatar real, pongo un cubo rojo para que no se vea vacío
    createPlaceholder() {
        const geo = new THREE.BoxGeometry(50, 150, 50);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const dummy = new THREE.Mesh(geo, mat);
        dummy.position.y = 75;
        this.mesh.add(dummy);
    }
    
    // Cambia el color de la piel del avatar
    setSkinColor(colorHex) {
        if (!this.model) return;
        this.model.traverse((o) => {
            if ((o.isSkinnedMesh || o.isMesh) && o.material) {
                if (o.material.name === 'default' || !o.material.map) {
                    if (o.material.color) {
                        o.material.color.setHex(colorHex);
                    }
                }
            }
        });
    }

    // Oculta la piel en la banda Y [lowerY, upperY] usando clipping planes.
    // Así el hueco de la cintura del vestido no muestra piel sin necesitar geometría extra.
    _activeBodyClipPlanes() {
        if (this._pantsClipPlanes) return this._pantsClipPlanes;
        if (this._clip1 && this._clip2) return [this._clip1, this._clip2];
        return [];
    }

    _applyBodyClipPlanes() {
        if (!this.model) return;

        const planes = this._activeBodyClipPlanes();
        this.model.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;

            if (Array.isArray(o.material)) {
                o.material = o.material.map((mat) => {
                    if (!mat || mat._bodyClipCloned) return mat;
                    const clone = mat.clone();
                    clone._bodyClipCloned = true;
                    return clone;
                });
            } else if (!o.material._bodyClipCloned) {
                o.material = o.material.clone();
                o.material._bodyClipCloned = true;
            }

            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach((mat) => {
                if (!mat) return;
                mat.clippingPlanes = planes;
                mat.clipIntersection = planes.length > 0;
                mat.needsUpdate = true;
            });
        });
    }

    clipMidriff(lowerY, upperY) {
        if (!this.model) return;

        // Reutilizamos los planes si ya existen; solo actualizamos la constante
        if (!this._clip1) {
            this._clip1 = new THREE.Plane(new THREE.Vector3(0, -1, 0), lowerY);
            this._clip2 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -upperY);
        } else {
            this._clip1.constant = lowerY;
            this._clip2.constant = -upperY;
        }

        this._applyBodyClipPlanes();
        /*
            if ((o.isMesh || o.isSkinnedMesh) && o.material) {
                // Clonamos el material una sola vez para no modificar el original
                if (!o.material._midriffCloned) {
                    o.material = o.material.clone();
                    o.material._midriffCloned = true;
                }
                o.material.clippingPlanes  = [this._clip1, this._clip2];
                o.material.clipIntersection = true; // oculta donde se cumplen AMBOS planos → la banda
            }
        });
    }

        */
    }

    // Recorta solo la zona central cubierta por pantalones: piernas/cadera.
    clipPantsArea(lowerY, upperY, halfWidth, centerX = 0) {
        if (upperY <= lowerY) return;

        const half = Math.max(8, halfWidth);
        if (!this._pantsClipPlanes) {
            this._pantsClipPlanes = [
                new THREE.Plane(new THREE.Vector3(0, -1, 0), lowerY),
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -upperY),
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), centerX - half),
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -(centerX + half))
            ];
        } else {
            this._pantsClipPlanes[0].constant = lowerY;
            this._pantsClipPlanes[1].constant = -upperY;
            this._pantsClipPlanes[2].constant = centerX - half;
            this._pantsClipPlanes[3].constant = -(centerX + half);
        }

        this._applyBodyClipPlanes();
    }

    clearPantsClip() {
        this._pantsClipPlanes = null;
        this._applyBodyClipPlanes();
    }

    // Quita el clipping de cintura y vuelve a mostrar toda la piel
    clearMidriffClip() {
        this._clip1 = null;
        this._clip2 = null;
        this._applyBodyClipPlanes();
    }

    // Actualiza solo las constantes (sin recorrer materiales) cuando cambian las medidas
    updateMidriffClip(lowerY, upperY) {
        if (this._clip1 && this._clip2) {
            this._clip1.constant = lowerY;
            this._clip2.constant = -upperY;
            this._applyBodyClipPlanes();
        } else {
            // Si el modelo se recargó (cambio de género), reaplicamos completo
            this.clipMidriff(lowerY, upperY);
        }
    }

    // Alias mantenido por compatibilidad con el código existente en clothes.js
    setBodyVisibility(partName, visible) {
        if (partName !== 'torso') return;
        if (!visible) {
            // Los límites por defecto; se refinan enseguida desde updateClothes
            const lo = 15 + 170 * 0.55;
            const hi = 15 + 170 * 0.72;
            this.clipMidriff(lo, hi);
        } else {
            this.clearMidriffClip();
        }
    }

    // Aquí es donde ocurre la magia de cambiar el cuerpo según las medidas
    updateMeasurements(data) {
        if (data.gender && data.gender !== this.currentGender) {
            this.currentGender = data.gender;
            this.initModel(data.gender);
            return;
        }

        if (!this.model) return;

        // Escalo la altura total
        const baseHeight = 170;
        const scaleY = data.height / baseHeight;
        this.mesh.scale.setComponent(1, scaleY);

        const bases = this.currentGender === 'male'
            ? { chest: 100, waist: 85, hips: 93 }
            : { chest: 90, waist: 70, hips: 100 };

        // Estos son los multiplicadores. Si es > 1, se ensancha; si es < 1, se estrecha.
        const hipsTarget = (data.hips / bases.hips);
        const waistTarget = (data.waist / bases.waist);
        const chestTarget = (data.chest / bases.chest);
        const visualChestTarget = this.currentGender === 'male'
            ? Math.max(1, chestTarget)
            : chestTarget;

        this.targets = {
            chest: visualChestTarget,
            waist: waistTarget,
            hips: hipsTarget,
            gender: this.currentGender,
            heightScale: scaleY
        };

        // Si el modelo tiene "Morph Targets" (formas predefinidas), los uso para que el cambio sea más "pro"
        this.model.traverse((o) => {
            if (o.isMesh && o.morphTargetInfluences && o.morphTargetDictionary) {
                const setMorph = (name, val) => {
                    for (let key in o.morphTargetDictionary) {
                        if (key.toLowerCase().includes(name.toLowerCase())) {
                            const idx = o.morphTargetDictionary[key];
                            // Aquí juego con la influencia para que se note el cambio de volumen
                            let influence = (val - 1) * 2;
                            if (influence < 0) influence = 0;
                            o.morphTargetInfluences[idx] = influence;
                        }
                    }
                };
                setMorph('chest', visualChestTarget);
                setMorph('breast', visualChestTarget);
                setMorph('waist', waistTarget);
                setMorph('hips', hipsTarget);
                setMorph('glute', hipsTarget);
            }
        });

        // Reseteo los huesos para empezar a escalarlos de cero y que no se acumulen errores
        const allBones = [];
        this.model.traverse(o => { if (o.isBone) allBones.push(o); });
        allBones.forEach(b => b && b.scale.set(1, 1, 1));

        // Lógica para el cuerpo de CHICA
        if (this.currentGender === 'female') {
            console.log('🚺 Ajustando cuerpo de chica...');

            let hips = allBones.find(b => /mixamorig:Hips/i.test(b.name)) || allBones.find(b => /hips/i.test(b.name));
            let spineChain = [];
            let neck = null;
            let shoulders = [];

            if (hips) {
                const traverseSpine = (bone) => {
                    for (let child of bone.children) {
                        if (!child.isBone) continue;
                        const n = child.name.toLowerCase();
                        if (n.includes('spine') || n.includes('torso') || n.includes('abdomen')) {
                            spineChain.push(child);
                            traverseSpine(child);
                            return;
                        } else if (n.includes('neck') || n.includes('head')) {
                            neck = child;
                            return;
                        }
                    }
                };
                traverseSpine(hips);
            }

            if (spineChain.length > 0) {
                const lastSpine = spineChain[spineChain.length - 1];
                for (let child of lastSpine.children) {
                    const n = child.name.toLowerCase();
                    if (n.includes('shoulder') || n.includes('clavicle')) shoulders.push(child);
                }
            }

            let waistBone = null;
            let chestBone = null;

            if (spineChain.length >= 3) {
                chestBone = spineChain[spineChain.length - 2];
                waistBone = spineChain[spineChain.length - 3];
            } else if (spineChain.length === 2) {
                chestBone = spineChain[1];
                waistBone = spineChain[0];
            } else if (spineChain.length === 1) {
                waistBone = spineChain[0];
                chestBone = spineChain[0];
            }

            // El modelo femenino no trae morph targets de cadera, así que la cadera
            // debe salir del rig. La columna se compensa con waistRatio.
            if (hips) hips.scale.set(hipsTarget, 1, hipsTarget);

            if (waistBone) {
                const waistRatio = waistTarget / (hipsTarget || 1);
                waistBone.scale.set(waistRatio, 1, waistRatio);
                const waistIdx = spineChain.indexOf(waistBone);
                if (waistIdx !== -1 && waistIdx + 1 < spineChain.length) {
                    const nextBone = spineChain[waistIdx + 1];
                    // Vuelvo a aplicar el truco para que la cintura no afecte al pecho de antes
                    const invWaist = 1 / waistTarget;
                    nextBone.scale.multiply(new THREE.Vector3(invWaist, 1, invWaist));
                }
            }

            if (chestBone) {
                chestBone.scale.multiply(new THREE.Vector3(visualChestTarget, 1, visualChestTarget));
                const invChest = 1 / visualChestTarget;
                // Ajusto el cuello y hombros para que no queden deformes con el pecho nuevo
                if (neck) neck.scale.multiply(new THREE.Vector3(invChest, 1, invChest));
                shoulders.forEach(sh => sh.scale.set(visualChestTarget, invChest, 1));
            }

        } else {
            // Lógica para el cuerpo de CHICO
            console.log('🚹 Ajustando cuerpo de chico...');

            let hips = null;
            let chestBone = null;
            let waistBone = null;
            let neck = null;
            let shoulders = [];

            const armBones = allBones.filter(b =>
                ((/arm/i.test(b.name) || /braco/i.test(b.name)) &&
                    !/fore/i.test(b.name) && !/ante/i.test(b.name) &&
                    !/hand/i.test(b.name) && !/twist/i.test(b.name) && !/col/i.test(b.name)) ||
                (/humerus/i.test(b.name))
            );
            const armThicknessBones = allBones.filter(b =>
                (/arm/i.test(b.name) || /braco/i.test(b.name) || /fore/i.test(b.name) ||
                    /antebraco/i.test(b.name) || /humerus/i.test(b.name)) &&
                !/hand/i.test(b.name) && !/wrist/i.test(b.name) && !/mao/i.test(b.name) &&
                !/twist/i.test(b.name) && !/col/i.test(b.name)
            );
            const legRoots = allBones.filter(b =>
                (/upleg/i.test(b.name) || /thigh/i.test(b.name) || /coxa/i.test(b.name)) &&
                !/twist/i.test(b.name)
            );
            shoulders = allBones.filter(b => /shoulder/i.test(b.name) || /clavicle/i.test(b.name) || /collar/i.test(b.name) || /ombro/i.test(b.name));
            if (shoulders.length > 0) {
                if (shoulders[0].parent && shoulders[0].parent.isBone) {
                    chestBone = shoulders[0].parent;
                }
            } else if (armBones.length > 0 && armBones[0].parent) {
                chestBone = armBones[0].parent;
            }
            if (legRoots.length > 0 && legRoots[0].parent) hips = legRoots[0].parent;
            if (!hips) hips = allBones.find(b => /mixamorig:Hips/i.test(b.name) || /pelvis/i.test(b.name) || /hips/i.test(b.name) || /root/i.test(b.name));

            if (hips && chestBone) {
                let curr = chestBone;
                const spineChain = [];
                while (curr && curr.parent && curr.parent !== hips && curr !== hips) {
                    curr = curr.parent;
                    if (curr.isBone) spineChain.push(curr);
                }
                if (spineChain.length > 0) waistBone = spineChain[spineChain.length - 1];
            }
            if (chestBone) neck = chestBone.children.find(c => /neck/i.test(c.name) || /head/i.test(c.name));

            const hands = allBones.filter(b =>
                (/hand/i.test(b.name) || /wrist/i.test(b.name) || /mano/i.test(b.name)) &&
                !/thumb/i.test(b.name) && !/ex/i.test(b.name) && !/finger/i.test(b.name)
            );
            const feet = allBones.filter(b =>
                (/foot/i.test(b.name) || /ankle/i.test(b.name) || /pe[LR]_/i.test(b.name)) &&
                !/toe/i.test(b.name)
            );

            // Engancho manos y pies mejor para que no salgan volando al estirar el cuerpo
            hands.forEach(hand => {
                const side = hand.name.match(/[LR]/) ? hand.name.match(/[LR]/)[0] : '';
                if (side) {
                    const forearm = allBones.find(b => (/fore/i.test(b.name) || /antebraco/i.test(b.name)) && b.name.includes(side) && !/twist/i.test(b.name));
                    if (forearm && hand.parent !== forearm) forearm.attach(hand);
                }
            });

            feet.forEach(foot => {
                const side = foot.name.match(/[LR]/) ? foot.name.match(/[LR]/)[0] : '';
                if (side) {
                    const shin = allBones.find(b => (/shin/i.test(b.name) || /perna/i.test(b.name)) && b.name.includes(side) && !/twist/i.test(b.name));
                    if (shin && foot.parent !== shin) shin.attach(foot);
                }
            });

            // Aplico las escalas al chico (mismo plan: ensanchar sin alargar)
            // Amortiguamos el efecto visual de caderas para el hombre (0.45 = 45% del cambio)
            const hipsBodyScale = 1 + (hipsTarget - 1) * 0.45;
            if (hips) hips.scale.set(hipsBodyScale, 1, hipsBodyScale);

            const abdomenDepthScale = 1.08;
            if (waistBone) {
                const ratio = waistTarget / hipsBodyScale;
                waistBone.scale.set(ratio, 1, ratio * abdomenDepthScale);
            }
            // Pecho independiente de cintura: el torso superior escala desde spine2.
            if (chestBone) {
                const parentScale = waistBone ? waistTarget : hipsBodyScale;
                const ratio = visualChestTarget / parentScale;
                const depthRatio = waistBone ? ratio / abdomenDepthScale : ratio;
                chestBone.scale.set(ratio, 1, depthRatio);
            }
            if (neck && chestBone) {
                const invChest = 1 / (visualChestTarget || 1);
                neck.scale.set(invChest, 1, invChest);
            }
            if (chestBone && shoulders.length > 0) {
                const invChest = 1 / (visualChestTarget || 1);
                shoulders.forEach(shoulder => shoulder.scale.set(invChest, 1, invChest));
            }
            if (chestBone && armThicknessBones.length > 0) {
                // El pecho crece desde el torso; los brazos mantienen su grosor propio.
                armThicknessBones.forEach(arm => arm.scale.set(1, 1, 1));
            }
            if (legRoots.length > 0) {
                legRoots.forEach(l => {
                    // Scale local 1: las piernas ya heredan hipsBodyScale del hueso padre.
                    // Antes se ponía hipsTarget aquí → efecto hipsTarget² (doble escalado).
                    l.scale.set(1, 1, 1);
                    // Abro las piernas lo justo para que no atraviesen el pantalón
                    if (l.name.toLowerCase().includes('left')) l.rotation.z = 0.35;
                    if (l.name.toLowerCase().includes('right')) l.rotation.z = -0.35;
                });
            }
            feet.forEach(f => f.scale.set(1, 1, 1));
            hands.forEach(h => h.scale.set(1, 1, 1));
        }

        this.model.updateMatrixWorld(true);
    }
}
