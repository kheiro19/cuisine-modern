# blender_render.py — rebuilds a cuisine render scene (src/math/renderScene.ts) in Blender and renders it with Cycles.
# Usage: blender -b --python blender_render.py -- scene.json OUTDIR fast|final [TEXTURES_DIR]
# Coordinates: the scene is millimetres in the app's frame (x along the back wall, y up, z towards the viewer).
# Blender is z-up: (x, y, z)_app -> (x, -z, y)_blender, and an app rotY becomes a Blender rotZ of the same angle.
import bpy, json, math, os, sys

argv = sys.argv[sys.argv.index('--') + 1:]
scene_path, outdir = argv[0], argv[1]
quality = argv[2] if len(argv) > 2 else 'fast'
textures_dir = argv[3] if len(argv) > 3 else ''

with open(scene_path, encoding='utf-8') as fh:
    scene = json.load(fh)
os.makedirs(outdir, exist_ok=True)

# ---- clean slate
bpy.ops.wm.read_factory_settings(use_empty=True)
world = bpy.data.worlds.new('World')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.87, 0.9, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
bpy.context.scene.world = world

def hex_rgba(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (r ** 2.2, g ** 2.2, b ** 2.2, 1)  # hex is sRGB; Principled wants linear

_tex_cache = {}
def find_texture(box):
    """The app's convention first (explicit pick wins), then wood_<brand>/stone_<brand> in the textures folder."""
    if not textures_dir:
        return None
    rel = box.get('texturePath')
    candidates = []
    if rel:
        candidates.append(os.path.join(textures_dir, os.path.basename(rel)))
        candidates.append(os.path.join(textures_dir, rel))
    sheet = box.get('sheet')
    if sheet:
        is_wood = 'wood' in sheet['type'].lower() or 'timber' in sheet['type'].lower()
        stem = ('wood_' if is_wood else 'stone_') + ''.join(c for c in sheet['brand'].lower() if c.isalnum())
        candidates += [os.path.join(textures_dir, stem + ext) for ext in ('.webp', '.jpg', '.jpeg', '.png')]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None

def material_for(box):
    key = (box.get('texturePath') or '') + '|' + (box.get('sheet', {}).get('brand', '') if box.get('sheet') else '') + '|' + box.get('role', '')
    if key in _tex_cache:
        return _tex_cache[key]
    mat = bpy.data.materials.new('m_' + key.replace('/', '_')[:40])
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(box.get('color', '#B9BEC6'))
    role = box.get('role')
    bsdf.inputs['Roughness'].default_value = 0.25 if role == 'countertop' else 0.45 if role in ('front', 'carcase') else 0.6
    bsdf.inputs['Metallic'].default_value = 0.35 if role == 'appliance' else 0.0
    tex_path = find_texture(box)
    if tex_path:
        try:
            img = bpy.data.images.load(tex_path)
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = img
            uv = mat.node_tree.nodes.new('ShaderNodeTexCoord')
            mat.node_tree.links.new(uv.outputs['Object'], tex.inputs['Vector'])
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        except Exception as exc:  # a broken file must not kill the render: flat colour stays
            print('texture skipped:', tex_path, exc)
    _tex_cache[key] = mat
    return mat

def to_blender(mm):
    x, y, z = (v / 1000 for v in mm)
    return (x, -z, y)

for box in scene['boxes']:
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = box['id'][:60]
    sx, sy, sz = (v / 1000 for v in box['sizeMm'])
    obj.dimensions = (sx, sz, sy)  # app (w,h,d) -> blender (x, y=depth, z=height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = to_blender(box['centerMm'])
    if box.get('rotYDeg'):
        obj.rotation_euler = (0, 0, math.radians(box['rotYDeg']))
    obj.data.materials.append(material_for(box))

# ---- light: a soft ceiling area light + a window-like area light from the viewer side
def area(name, location, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = energy, 'RECTANGLE', size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj

room = scene['room']
cx, cz = room['widthMm'] / 2000, room['depthMm'] / 2000
sun = area('Ceiling', (cx, -cz, room['heightMm'] / 1000 - 0.05), 450, 3.0)
sun.rotation_euler = (0, 0, 0)
win = area('Window', (cx, -room['depthMm'] / 1000 - 1.5, room['heightMm'] / 1800), 650, 4.0)
win.rotation_euler = (math.radians(90), 0, 0)
# Fill from the opposite side: corner heroes view the side arm from there, and a single window leaves it in shade.
fill = area('Fill', (cx, room['depthMm'] / 1000 + 1.5, room['heightMm'] / 1800), 380, 4.0)
fill.rotation_euler = (math.radians(-90), 0, 0)

# ---- render settings
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.view_settings.view_transform = 'AgX'
try:
    scn.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass  # older/newer Blender names its looks differently; AgX alone is fine
prefs = bpy.context.preferences.addons['cycles'].preferences
gpu_on = False
for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL'):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type in (kind, 'CPU')
            scn.cycles.device = 'GPU'
            gpu_on = True
            break
    except Exception as exc:
        print('device kind', kind, 'unavailable:', exc)
if not gpu_on:
    scn.cycles.device = 'CPU'
# Denoising is a build-time option (Debian builds may lack OpenImageDenoise): ask, never insist.
try:
    scn.cycles.denoiser = 'OPENIMAGEDENOISE'
    scn.cycles.use_denoising = True
except Exception as exc:
    print('denoising unavailable, rendering without:', exc)
    scn.cycles.use_denoising = False

if quality == 'final':
    scn.render.resolution_x, scn.render.resolution_y = 3840, 2160
    scn.cycles.samples = 256
    cameras = scene['cameras']
else:
    scn.render.resolution_x, scn.render.resolution_y = 1280, 720
    scn.cycles.samples = 48
    cameras = scene['cameras'][:1]
scn.render.film_transparent = False

cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 32  # interiors read better a little wide; per-camera lensMm overrides in the loop
cam_obj = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam_obj)
scn.camera = cam_obj

def look_at(obj, target_bl):
    direction = tuple(t - o for t, o in zip(target_bl, obj.location))
    obj.rotation_euler = bpy.context.scene.camera.matrix_world.to_quaternion() if False else obj.rotation_euler
    # point -Z of the camera towards the target, Y up
    import mathutils
    quat = mathutils.Vector(direction).to_track_quat('-Z', 'Y')
    obj.rotation_euler = quat.to_euler()

rendered = []
for cam in cameras:
    cam_data.lens = cam.get('lensMm', 32)
    cam_obj.location = to_blender(cam['positionMm'])
    look_at(cam_obj, to_blender(cam['targetMm']))
    path = os.path.join(outdir, cam['name'] + '.png')
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    rendered.append(path)
    print('RENDERED', path)

print(json.dumps({'rendered': rendered}))
