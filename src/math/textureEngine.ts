// src/math/textureEngine.ts

import * as THREE from 'three';
import { InjectedWoodMaterial } from '../types/flatma';
import { resolveConventionTexture } from '../data/textureCatalog';

export interface PBRMaterialConfig {
  color: string;
  roughness: number;
  metalness: number;
  map?: THREE.Texture;
}

/**
 * 🌲 High-Performance Parametric PBR Texture & Finish Loader Engine
 * Implements the 7 core schema finishes from the MDF Surface Finishes Architecture.
 * Loads textures only from the local workshop folder (/public/textures); a missing file keeps the flat colour.
 */
export class TextureEngine {
  private static loader = new THREE.TextureLoader();
  // One network request per file; resolves to null when the file is missing / cannot be decoded.
  private static baseTextures = new Map<string, Promise<THREE.Texture | null>>();

  /**
   * 📐 Translates the MDF Surface Schema text directly into strict real-time PBR physical physics constants
   */
  private static evaluateSchemaFinishes(type: string): { roughness: number; metalness: number } {
    const t = type.toLowerCase();
    
    // 1. 【 Smooth Finishes 】- High Gloss (Mirror-like)
    if (t.includes('high gloss') || t.includes('mirror') || t.includes('acrylic gloss')) {
      return { roughness: 0.05, metalness: 0.1 };
    }
    // 2. 【 Smooth Finishes 】- Super Matt / Ultra Matt (Anti-fingerprint velvet)
    if (t.includes('super matt') || t.includes('ultra matt') || t.includes('velvet')) {
      return { roughness: 0.25, metalness: 0.0 };
    }
    // 3. 【 Smooth Finishes 】- Metallic (Car paint shimmer)
    if (t.includes('metallic') || t.includes('shimmer')) {
      return { roughness: 0.35, metalness: 0.6 };
    }
    // 4. 【 Smooth Finishes 】- Semi-Gloss / Satin (Eggshell fallback)
    if (t.includes('satin') || t.includes('semi-gloss')) {
      return { roughness: 0.45, metalness: 0.05 };
    }
    
    // 5. 【 Textured Finishes 】- Fabric / Textile / Linen Effect
    if (t.includes('fabric') || t.includes('textile') || t.includes('linen')) {
      return { roughness: 0.85, metalness: 0.0 };
    }
    // 6. 【 Textured Finishes 】- Material Imitation (Concrete / Stone / Marble textures)
    if (t.includes('marble') || t.includes('granite') || t.includes('concrete') || t.includes('stone')) {
      return { roughness: 0.15, metalness: 0.02 }; // Polished natural stone properties
    }
    // 7. 【 Textured Finishes 】- Embossed Wood Grain (Feels like real timber pores)
    if (t.includes('wood grain') || t.includes('textured') || t.includes('timber')) {
      return { roughness: 0.65, metalness: 0.0 };
    }

    // Default fallback structural balance (Standard Matt Melamine)
    return { roughness: 0.5, metalness: 0.0 };
  }

  /**
   * 🏎️ One load per file (cached promise). A missing/corrupt file resolves to null: in three.js a texture that
   * never receives an image renders the panel solid BLACK forever, and the old remote "fallback" was never used.
   */
  private static loadBaseTexture(urlPath: string): Promise<THREE.Texture | null> {
    let pending = this.baseTextures.get(urlPath);
    if (!pending) {
      pending = new Promise<THREE.Texture | null>((resolve) => {
        this.loader.load(urlPath, (texture: THREE.Texture) => resolve(texture), undefined, () => resolve(null));
      });
      this.baseTextures.set(urlPath, pending);
    }
    return pending;
  }

  /**
   * Attaches the texture to the material only once it has really loaded.
   * Each panel gets its own clone (own repeat / rotation) that shares the same image data, so rotating one
   * panel's grain can no longer rotate every other panel that uses the same file.
   */
  public static applyTextureAsync(
    material: THREE.MeshStandardMaterial,
    urlPath: string,
    widthMm: number,
    heightMm: number,
    rotateGrain: boolean
  ): void {
    this.loadBaseTexture(urlPath).then((base) => {
      if (!base) return; // file missing: keep the flat colour
      const texture = base.clone();
      texture.needsUpdate = true; // a clone starts at version 0, so it must be flagged for GPU upload
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(widthMm / 1000, heightMm / 1000);
      if (rotateGrain) {
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI / 2; // precise π/2 radial shift
      } else {
        texture.rotation = 0;
      }
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  /**
   * 🎨 Compile PBR Material: Creates a high-fidelity Three.js MeshStandardMaterial for production caissons
   */
  public static compileProceduralMaterial(
    material: InjectedWoodMaterial | undefined,
    widthMm: number,
    heightMm: number,
    isXRayMode: boolean,
    fallbackColor: string,
    grainDirection: 'vertical' | 'horizontal' = 'vertical'
  ): THREE.MeshStandardMaterial {

    if (isXRayMode) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(fallbackColor),
        transparent: true,
        opacity: 0.3,
        roughness: 0.5,
        metalness: 0.0
      });
    }

    const baseConfig: PBRMaterialConfig = {
      color: fallbackColor,
      roughness: 0.5,
      metalness: 0.0
    };

    let texturePath: string | null = null;
    let rotateGrain = false;

    if (material) {
      // 1. Process and compile the exact structural finish metrics from the schema
      const properties = this.evaluateSchemaFinishes(material.type);
      baseConfig.roughness = properties.roughness;
      baseConfig.metalness = properties.metalness;
      baseConfig.color = "#FFFFFF"; // Pure neutralization allows texture mapping images to pop naturally

      // 2. Resolve the texture file from the brand (strict filename convention: no spaces / brackets / hyphens)
      const isWood = material.type.toLowerCase().includes('wood') || material.type.toLowerCase().includes('timber');
      const cleanBrand = material.brand.toLowerCase().replace(/[^a-z0-9]/g, '');
      const prefix = isWood ? 'wood_' : 'stone_';

      // Only files that really exist in /public/textures are requested (.webp, .jpg and .jpeg are all tried),
      // so a missing texture costs no 404 and leaves the flat colour instead of a black panel.
      texturePath = resolveConventionTexture(prefix, cleanBrand);

      // 3. JABR MATRIX ROTATION: horizontal grain = 90 degrees
      rotateGrain = isWood && grainDirection === 'horizontal';
    }

    const compiledMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseConfig.color),
      roughness: baseConfig.roughness,
      metalness: baseConfig.metalness,
      envMapIntensity: 1.0
    });

    if (texturePath) {
      this.applyTextureAsync(compiledMaterial, texturePath, widthMm, heightMm, rotateGrain);
    }

    return compiledMaterial;
  }
}
