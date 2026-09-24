# Material Lab — teaching notes

The interface uses English so students can transfer the terminology to Blender 5.2.

## 1. Texture and material

Begin with Plain, change Base Color, then compare it to Brick. A material combines surface properties; texture images can supply values at different positions on that surface.

## 2. Roughness

Set up the Roughness experiment. Keep Metallic at 1 and change Roughness between 0.04 and 0.95. Compare a sharp reflection to a broad reflection. Roughness does not create bumps or change the silhouette.

## 3. Normal maps

Set up the Normal experiment. Disconnect the Normal input on Principled BSDF. Reconnect Normal Map's Normal output to it. Increase or decrease Strength. The joints change in the lighting, while the mesh silhouette remains the same.

## 4. Repeating textures

Set up Tiling. Increase both Scale X and Scale Y to 4. All three maps share Mapping and remain aligned. Disconnect one Image Texture's Vector input to demonstrate a mismatch in scale. Reset afterward.

The brick image also contains recognizable dark patches: seamless edges do not guarantee that repetition is invisible.

Trace the purple wires: **Texture Coordinate: UV → Mapping: Vector → Image Texture: Vector**. UV chooses the coordinates; Mapping transforms them; each image samples them. Location offsets the pattern, Rotation Z turns it, and Scale X/Y changes repetition. The initial Mapping type is Point. Texture uses the inverse transform, so increasing its scale makes the visible pattern larger.

Compare UV and Generated on a cube. UV uses the face layouts; Generated uses the object's bounding box. Because the images use Flat projection, Generated can stretch across side faces. UV is two-dimensional (Z = 0), so Scale Z and Location Z alone do not change a flat image. The XYZ controls are available for three-dimensional coordinate inputs and rotations. Reset the scene to restore UV.

## 5. Images created with AI

Choose Concrete. Only Base Color is connected. This reinforces that a generated image is not automatically a complete PBR material. A student can open their own texture image in the color node and connect it.

## Boundaries

This first lab concentrates on the texture/material relationship, map effects and tiling. Trim sheets and unique UV layouts remain brief concepts in the presentation rather than separate editing modes.

The application uses no accounts, analytics, persistent browser storage, remote image uploads or backend services. Work is intentionally temporary and resets on reload. Students should use the published GitHub Pages URL, not the teacher's localhost preview.
