// src/components/codeModels/lgThinqWasher.ts
// A detailed front-loading washing machine built in code with three.js: brushed-steel body with a real round opening, glass door
// in a dark ring, a drum that turns, a control panel with a knob, a display and the programs, adjustable feet.
// Ported from the file "lg-thinq-3d-exporter" (src/App.tsx): the same shapes and numbers, without the scene, the lights and the floor
// (the kitchen has its own). Three changes only: the panel texture is 2048 x 512 instead of 4096 x 1024 (phone memory), the colour
// textures are tagged sRGB, and the drum is reachable through userData so the scene can animate it.
//
// The model lives in its own units (the machine is 1.54 x 1.94 x 1.44); the library fits it into the size of the catalog piece.
import * as THREE from 'three';

function generateControlPanelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048; // half of the original 4096 x 1024: a phone keeps 4 MB of texture instead of 16
  canvas.height = 512;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  ctx.scale(0.5, 0.5); // the drawing below keeps the original 4096 x 1024 coordinates

  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  bgGrad.addColorStop(0, "#e2e8f0");
  bgGrad.addColorStop(0.4, "#cbd5e1");
  bgGrad.addColorStop(0.8, "#94a3b8");
  bgGrad.addColorStop(1, "#64748b");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 4096, 1024);

  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  for (let i = 0; i < 1024; i += 2.5) {
    ctx.fillRect(0, i, 4096, 1.2);
  }

  ctx.fillStyle = "#a50034";
  ctx.beginPath();
  ctx.arc(240, 200, 65, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 54px Arial";
  ctx.fillText("L", 215, 218);
  ctx.fillText("G", 245, 218);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 72px sans-serif";
  ctx.fillText("ThinQ", 340, 222);

  ctx.fillStyle = "#334155";
  ctx.font = "bold 44px sans-serif";
  ctx.fillText("Inverter Direct Drive 15 / 8kg", 120, 420);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.strokeRect(120, 460, 90, 60);
  ctx.strokeRect(230, 460, 90, 60);
  ctx.strokeRect(340, 460, 90, 60);

  ctx.font = "600 42px sans-serif";
  ctx.fillStyle = "#0f172a";
  const leftPrograms = ["Cotton", "Stain Care", "Baby Care", "Hygiene", "Allergy Care", "Tub Clean"];
  leftPrograms.forEach((program, i) => {
    ctx.fillText(program, 1420, 160 + i * 85);
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(1380, 145 + i * 85, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
  });

  const rightPrograms = ["Delicates", "Sportswear", "Duvet", "Speed Wash", "Rinse + Spin", "Download Cycle"];
  rightPrograms.forEach((program, i) => {
    ctx.fillText(program, 2320, 160 + i * 85);
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(2680, 145 + i * 85, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
  });

  ctx.fillStyle = "#020205";
  ctx.fillRect(2880, 80, 1100, 560);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 6;
  ctx.strokeRect(2880, 80, 1100, 560);

  ctx.fillStyle = "#ff2222";
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 25;
  ctx.font = "bold 160px Monospace";
  ctx.fillText("18:59", 3320, 260);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("TurboWash", 3700, 160);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "36px sans-serif";
  const touchKeys = ["Add Item", "Wash", "Rinse", "Spin", "Temp.", "Extra Dry"];
  touchKeys.forEach((key, i) => ctx.fillText(key, 2930 + i * 175, 560));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


function generateWarrantySticker() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 640;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 640);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 492, 620);
  ctx.fillStyle = "#000";
  ctx.font = "bold 44px sans-serif";
  ctx.fillText("Direct Drive", 120, 90);
  ctx.font = "bold 220px sans-serif";
  ctx.fillText("10", 80, 320);
  ctx.fillStyle = "#a50034";
  ctx.fillRect(320, 160, 150, 160);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("YEAR", 340, 230);
  ctx.fillText("WARRANTY", 324, 290);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


function generateDrumPattern() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "#0f172a";

  for (let x = 0; x < 1024; x += 32) {
    for (let y = 0; y < 1024; y += 32) {
      ctx.beginPath();
      ctx.arc(x + (y % 64 === 0 ? 16 : 0), y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 4);
  return texture;
}


/** The washing machine as a group: front towards +z, centred on its own origin. `userData.drum` is the drum to turn. */
export function buildLgThinqWasher(): THREE.Group {
  const anisotropy = 8;
  const panelTexture = generateControlPanelTexture();
  const stickerTexture = generateWarrantySticker();
  const drumTexture = generateDrumPattern();
  panelTexture.anisotropy = anisotropy;
  stickerTexture.anisotropy = anisotropy;
  drumTexture.anisotropy = anisotropy;

    const brushedSteelMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.38,
      roughness: 0.42,
    });
    const darkGlossMaterial = new THREE.MeshStandardMaterial({ color: 0x090a0f, metalness: 0.92, roughness: 0.06 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xcfe6ff,
      metalness: 0,
      roughness: 0.04,
      transmission: 0,
      transparent: true,
      opacity: 0.22,
      ior: 1.46,
      reflectivity: 0.6,
      clearcoat: 1,
      clearcoatRoughness: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
    });






    const chromeDrumMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.97,
      roughness: 0.1,
      bumpMap: drumTexture,
      bumpScale: 0.025,
    });

    const washingMachine = new THREE.Group();
    washingMachine.name = "LG_ThinQ_Washing_Machine";

    const width = 1.54;
    const height = 1.94;
    const depth = 1.44;
    const radius = 0.035;
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-width / 2 + radius, -height / 2);
    bodyShape.lineTo(width / 2 - radius, -height / 2);
    bodyShape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
    bodyShape.lineTo(width / 2, height / 2 - radius);
    bodyShape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
    bodyShape.lineTo(-width / 2 + radius, height / 2);
    bodyShape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
    bodyShape.lineTo(-width / 2, -height / 2 + radius);
    bodyShape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);

    // Real circular opening for the door so the frame is not visually glued to the body.
    const doorCutout = new THREE.Path();
    doorCutout.absellipse(0, -0.15, 0.57, 0.57, 0, Math.PI * 2, true);
    bodyShape.holes.push(doorCutout);

    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 8,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
    });
    bodyGeo.center();
    const mainBody = new THREE.Mesh(bodyGeo, brushedSteelMaterial);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    washingMachine.add(mainBody);

    const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture, metalness: 0.65, roughness: 0.28 });
    const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.44), panelMat);
    panelMesh.position.set(0, 0.73, 0.74);
    washingMachine.add(panelMesh);

    const drawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.02), darkGlossMaterial);
    drawerHandle.position.set(-0.48, 0.66, 0.75);
    washingMachine.add(drawerHandle);

    const knobGroup = new THREE.Group();
    const knobBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.078, 64),
      new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.9, roughness: 0.12 })
    );
    knobBase.rotation.x = Math.PI / 2;

    const knobFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.102, 0.108, 0.082, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8edf4,
        metalness: 1,
        roughness: 0.16,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
      })
    );
    knobFace.rotation.x = Math.PI / 2;
    knobFace.position.z = 0.004;

    const knobRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.114, 0.0055, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0xaab6c4, metalness: 1, roughness: 0.2 })
    );
    knobRing.position.z = 0.044;

    const knobPointer = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.055, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.4, roughness: 0.25 })
    );
    knobPointer.position.set(0, 0.074, 0.046);
    knobPointer.rotation.z = -0.22;

    knobGroup.add(knobBase, knobFace, knobRing, knobPointer);
    knobGroup.position.set(-0.02, 0.72, 0.77);
    washingMachine.add(knobGroup);

    const stickerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.19),
      new THREE.MeshBasicMaterial({ map: stickerTexture })
    );
    stickerMesh.position.set(0.65, 0.52, 0.741);
    washingMachine.add(stickerMesh);

    const drumGroup = new THREE.Group();
    const drumCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.68, 64, 1, true), chromeDrumMaterial);
    drumCylinder.rotation.x = Math.PI / 2;
    drumGroup.add(drumCylinder);

    const drumBack = new THREE.Mesh(new THREE.CircleGeometry(0.57, 64), chromeDrumMaterial);
    drumBack.position.z = -0.34;
    drumGroup.add(drumBack);

    for (let i = 0; i < 3; i += 1) {
      const angle = (i * Math.PI * 2) / 3;
      const baffle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.52), chromeDrumMaterial);
      baffle.position.set(Math.cos(angle) * 0.46, Math.sin(angle) * 0.46, -0.05);
      baffle.rotation.z = angle;
      drumGroup.add(baffle);
    }
    drumGroup.position.set(0, -0.15, 0.4);
    washingMachine.add(drumGroup);

    const doorGroup = new THREE.Group();
    const doorOuterFrame = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.065, 32, 64), darkGlossMaterial);
    doorGroup.add(doorOuterFrame);

    const doorInnerChrome = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.014, 16, 64), brushedSteelMaterial);
    doorGroup.add(doorInnerChrome);

    // Glass highlight streaks for a realistic glossy look.
    const highlightArc = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.47, 48, 1, Math.PI * 0.55, Math.PI * 0.35),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
    );
    highlightArc.position.z = 0.009;
    highlightArc.renderOrder = 3;
    doorGroup.add(highlightArc);

    const highlightArcSmall = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.36, 48, 1, Math.PI * 0.6, Math.PI * 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
    );
    highlightArcSmall.position.z = 0.009;
    highlightArcSmall.renderOrder = 3;
    doorGroup.add(highlightArcSmall);

    const outerGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.015, 64), glassMaterial);
    outerGlass.rotation.x = Math.PI / 2;
    outerGlass.position.z = 0;
    outerGlass.renderOrder = 2;
    doorGroup.add(outerGlass);

    const innerGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.22),
      glassMaterial
    );
    innerGlass.rotation.x = -Math.PI / 2;
    innerGlass.position.z = -0.04;
    innerGlass.renderOrder = 2;
    doorGroup.add(innerGlass);

    doorGroup.position.set(0, -0.15, 0.74);
    washingMachine.add(doorGroup);

    const filterDoor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.01), brushedSteelMaterial);
    filterDoor.position.set(-0.46, -0.78, 0.741);
    washingMachine.add(filterDoor);

    // Adjustable rounded front feet.
    const buildAdjustableFoot = () => {
      const foot = new THREE.Group();

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.07, 28),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.95, roughness: 0.25 })
      );
      stem.position.y = 0.02;

      const lockNut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.016, 6),
        new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.32 })
      );
      lockNut.position.y = -0.012;
      lockNut.rotation.y = Math.PI / 6;

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.052, 0.028, 42),
        new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.2, roughness: 0.72 })
      );
      pad.position.y = -0.038;

      foot.add(stem, lockNut, pad);
      return foot;
    };

    const leftFoot = buildAdjustableFoot();
    leftFoot.position.set(-0.56, -0.955, 0.62);
    washingMachine.add(leftFoot);

    const rightFoot = buildAdjustableFoot();
    rightFoot.position.set(0.56, -0.955, 0.62);
    washingMachine.add(rightFoot);


  washingMachine.userData.drum = drumGroup;
  return washingMachine;
}

/** Turns the drum slowly (the original ran at 0.003 rad per frame at 60 fps). */
export function animateLgThinqWasher(root: THREE.Object3D, dt: number): void {
  const drum = root.userData.drum as THREE.Object3D | undefined;
  if (drum) drum.rotation.z += 0.18 * dt;
}
