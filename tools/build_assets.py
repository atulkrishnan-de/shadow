"""
SHADOW — top-down quarter asset build.

    ~/tools/blender/blender --background --factory-startup --python tools/build_assets.py

Emits assets/parts.glb: named meshes for a floor-plane facility (X-Z play,
Y up). Character is a single silhouette readable from above — hard hat,
wide shoulders, backpack.

Game axes: x = width, y = height, z = depth (Blender Z-up mapped via export_yup).
"""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "parts.glb")

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def boxbm(w, h, d):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    return bm

def bevel(bm, amount, segments=2):
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                    offset=amount, segments=segments, profile=0.5,
                    affect='EDGES', clamp_overlap=True)

def part(name, w, h, d, bev=0.015, segs=2, build=None):
    bm = boxbm(w, h, d)
    if build: build(bm)
    if bev: bevel(bm, bev, segs)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    cur = (max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
    ctr = Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
    s = Vector((w/cur[0] if cur[0] else 1, d/cur[1] if cur[1] else 1, h/cur[2] if cur[2] else 1))
    for v in bm.verts:
        v.co = Vector(((v.co.x-ctr.x)*s.x, (v.co.y-ctr.y)*s.y, (v.co.z-ctr.z)*s.z))
    ob = mesh_from_bm(name, bm)
    for p in ob.data.polygons: p.use_smooth = False
    return ob

def add_cyl(bm, r, length, axis='y', x=0, y=0, z=0, segs=12):
    sub = bmesh.new()
    bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r, depth=length)
    if axis == 'x':
        bmesh.ops.rotate(sub, verts=sub.verts, cent=(0,0,0),
                         matrix=__import__('mathutils').Matrix.Rotation(math.pi/2, 3, 'Y'))
    elif axis == 'z':
        bmesh.ops.rotate(sub, verts=sub.verts, cent=(0,0,0),
                         matrix=__import__('mathutils').Matrix.Rotation(math.pi/2, 3, 'X'))
    bmesh.ops.translate(sub, vec=Vector((x, z, y)), verts=sub.verts)
    me = bpy.data.meshes.new("tmp"); sub.to_mesh(me); sub.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)

def character():
    """Wide-shouldered worker silhouette — readable from quarter / top-down."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((0.54, 0.40, 0.90)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, 0.45)), verts=bm.verts)
    add_cyl(bm, 0.36, 0.07, 'y', 0, 0.88, 0, 14)
    sub = boxbm(0.30, 0.18, 0.34)
    me = bpy.data.meshes.new("pack"); sub.to_mesh(me); sub.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)
    bevel(bm, 0.025, 2)
    ob = mesh_from_bm("character", bm)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def props():
    part("floor_tile", 2.0, 0.12, 2.0, bev=0.008, segs=1)
    part("wall_low", 2.0, 1.35, 0.28, bev=0.01, segs=1)
    part("wall_corner", 0.28, 1.35, 0.28, bev=0.01)
    part("crate", 1.4, 1.4, 1.4, bev=0.04, segs=2)
    part("stairs", 2.0, 0.5, 1.0, bev=0.012, segs=1)
    part("plate_pad", 2.4, 0.1, 2.4, bev=0.02, segs=2)
    part("button_head", 0.55, 0.35, 0.55, bev=0.04, segs=2)
    part("door_panel", 0.35, 2.5, 2.8, bev=0.02, segs=2)
    part("press_head", 2.8, 1.8, 2.8, bev=0.04, segs=2)
    part("lamp_post", 0.18, 2.4, 0.18, bev=0.012)
    part("lamp_head", 0.9, 0.14, 0.5, bev=0.015)
    part("lamp_housing", 2.4, 0.18, 1.0, bev=0.015)
    part("desk", 1.8, 0.75, 0.9, bev=0.015)
    part("monitor", 0.55, 0.42, 0.12, bev=0.01)
    part("toolbox", 0.85, 0.45, 0.55, bev=0.02)
    part("backpack", 0.5, 0.55, 0.35, bev=0.04, segs=3)
    part("photo_frame", 0.5, 0.38, 0.04, bev=0.006)
    part("photo", 0.42, 0.28, 0.02, bev=0.004)
    part("emitter", 0.35, 0.5, 0.35, bev=0.02)

def kit():
    part("kit_pipe", 1.0, 0.28, 0.28, bev=0.01)
    part("kit_valve", 0.7, 0.5, 0.7, bev=0.015, segs=2)
    part("kit_vent", 1.2, 0.08, 1.2, bev=0.01)
    part("kit_rail", 1.0, 0.8, 0.08, bev=0.008)
    part("kit_cable", 1.0, 0.06, 0.06, bev=0.004)
    part("kit_panel", 2.0, 0.06, 2.0, bev=0.008)
    part("kit_grate", 1.0, 0.12, 1.0, bev=0.008)

def keepsakes():
    part("item_watch", 0.12, 0.04, 0.14, bev=0.004, segs=1)
    part("item_photo", 0.22, 0.16, 0.012, bev=0.003)
    part("item_key", 0.14, 0.03, 0.06, bev=0.003)
    part("item_letter", 0.2, 0.14, 0.012, bev=0.003)
    part("item_drawing", 0.22, 0.26, 0.01, bev=0.003)

def main():
    reset()
    character()
    props(); kit(); keepsakes()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', export_apply=True,
        export_yup=True, export_normals=True, export_materials='NONE',
    )
    n = len([o for o in bpy.context.scene.objects if o.type == 'MESH'])
    print(f"BUILT {n} top-down parts -> {OUT} ({os.path.getsize(OUT)} bytes)")

main()
