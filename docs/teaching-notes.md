# Material Lab — teaching notes

The interface uses English so students can transfer the terminology to Blender: node, socket and option names such as Principled BSDF, Base Color, Roughness, Color Space, Non-Color, Invert Color, Bump, Displacement, Transmission, Coat and Emission. The explanations can be switched to Catalan or Spanish.

The lab has five stages. Each step loads a material and checks what the student changes. **Show a solution**, **Reset this step** and **Ctrl Z / Ctrl Shift Z** are always available. Work is kept per step in the browser (localStorage).

## Stages and checks

| Step | Material | Check |
|---|---|---|
| n1 Sharp and blurry reflections | Plain gold-coloured metal | Roughness has been ≤ 0.1 and ≥ 0.8 during the step |
| n2 Detail without geometry | Brick, normal map not connected | Normal image → Normal Map → BSDF Normal, Non-Color, Strength > 0 |
| n3 Repeat the texture | Brick on a plane, the Roughness image takes the UVs directly | Scale X = Scale Y ≥ 3 and all three images fed by Mapping |
| m1 Gold | Grey dielectric | Metallic ≥ 0.95, warm yellow Base Color (hue 30–55°, bright), Roughness ≤ 0.35 |
| m2 Red plastic | Red metal | Metallic ≤ 0.05, saturated red, Roughness 0.15–0.6 |
| m3 Half metal? | Metallic 0.5 | Metallic ≤ 0.02 or ≥ 0.98 |
| m4 Whiter than white | Pure white paint | brightest channel 200–240, neutral, not metal |
| c1 Colour or data? | Brick with every Color Space wrong | Base Color sRGB, Roughness and Normal Non-Color |
| c2 Painted metal | Painted steel, metallic mask not connected | mask → Metallic (not inverted), Non-Color |
| c3 Gloss is not roughness | Same steel with a gloss image in Roughness | Roughness fed through Invert Color |
| r1 Bump from a height map | Tiles on a cube | height → Bump → BSDF Normal, Non-Color |
| r2 Real displacement | Tiles on a plane | height → Displacement → Material Output Displacement |
| r3 Enough vertices | Same, plane with 1 × 1 faces | Subdivisions ≥ 64 × 64 |
| b1 Emission | Dark ball | Emission Strength ≥ 1 with a visible colour |
| b2 Glass | White dielectric, IOR 1.1, overcast HDRI | Transmission ≥ 0.95, Roughness ≤ 0.1, IOR 1.4–1.6, not metal |
| b3 Car paint | Red paint | Coat ≥ 0.9, coat Roughness ≤ 0.1, base Roughness ≥ 0.3 |
| b4 A cut-out leaf | Leaf colour on a quad | alpha mask → BSDF Alpha, Non-Color |

## How the preview differs from Blender

- The preview is Three.js's physical material (MeshPhysicalMaterial) with AgX tone mapping, not Cycles or Eevee.
- **Worlds**: Room (a small studio environment with two lights) and the three procedural HDRIs of the Lighting Lab (Studio, Sunset, Overcast), shown blurred in the background.
- **Color Space**: an sRGB image is decoded to linear before it is used; a Non-Color image is used as it is. This is what makes the wrong settings of c1 visible.
- **Invert Color** is done on the image (1 − value) with Fac fixed at 1.
- **Bump**: the height image goes to the renderer's bump map; Strength scales it. Distance and Invert are not shown. A Bump and a Normal Map cannot be chained here (the renderer uses one or the other).
- **Displacement** is done on the CPU like a Displace modifier: each vertex moves along its normal by (height − Midlevel) × Scale and the normals are recomputed, so shading, silhouette and shadows change. It samples the mesh UVs directly (Mapping is not applied to displacement). This behaves like the material setting “Displacement Only” / “Displacement and Bump” with enough geometry.
- **Subdivisions** under the preview set the plane (and cube) to 2ⁿ × 2ⁿ faces, like a Subdivision Surface modifier in Simple mode. The sphere always has enough vertices.
- **Alpha**: a connected alpha image cuts at 0.5 (alpha clip); an Alpha value below 1 without a texture blends.
- **Emission** does not light other objects in the preview.
- **Transmission** uses the renderer's screen-space refraction, with a fixed thickness on the sphere and cube.

## Texture sets

- Brick: Brick Wall 001 from Poly Haven (colour, roughness, OpenGL normal), CC0.
- Painted steel, gloss version, tiles and leaf are drawn by `labs/materials/textures.js` in the browser: scratches mask, satin paint roughness about 0.5 and polished steel about 0.18 (inverted for the gloss image), a height map with bevelled tiles, a leaf colour and a supersampled alpha outline.

## Teaching points worth stopping on

- **n1 and m1–m4** are the core of PBR: two numbers (Metallic, Roughness) and a believable Base Color. Ask students to describe real objects with them before touching the lab.
- **m2**: turn the ball to see the Fresnel edges. The highlight is white on the plastic and red on the metal.
- **c1**: switch one Color Space back and forth. The Base Color gets washed out as Non-Color; the normal map breaks as sRGB.
- **c2–c3**: link to the Baking Lab's Painter stage and to game engines (Unity's smoothness is gloss). A metallic mask is the reason in-between values exist.
- **r1–r3**: compare bump and displacement at a grazing angle, then drop the subdivisions to show why displacement needs dense geometry.
- **b2**: change the IOR to 1.33 and 2.42 to compare water and diamond. Metallic must stay at 0.
- **b4**: open the alpha image to show that the shape of a leaf is only a texture on four vertices.

## Node editor controls

The controls match Blender: drag output → input to connect, drag a connected input away to move or remove a link, Ctrl + right-drag to cut links, mouse wheel to zoom, middle mouse (or background drag) to pan, Home to see all nodes. Values are Blender-style slider bars. Click-output-then-click-input also works on touch screens. Principled BSDF panels (Transmission, Coat, Emission) open and close with their headers.

## Material Lab scope and accuracy

This is a teaching simulation, not Blender running in a browser. It cannot load `.blend` files or evaluate arbitrary Blender graphs.

Texture Coordinate includes Generated, Normal, UV, Object, Camera, Window and Reflection. Mapping includes Point, Texture, Vector and Normal modes, with Vector, Location, Rotation and Scale in XYZ. All seven coordinate outputs can feed Mapping or an Image Texture directly. Mapping's Location, Rotation and Scale sockets can receive coordinates; connected fields hide their manual values. Rotation fields display degrees; linked rotation vectors represent radians.

The Image Texture nodes use Flat projection and Repeat extension: X and Y of the transformed vector sample the image. UV has Z = 0, so Scale Z or Location Z alone does not change a flat image. Object uses the preview mesh. The preview uses its own Y-up object axes.

For scalar maps the browser renderer samples a single channel; the lab's roughness, metallic, height and alpha images are grayscale. Arbitrary coloured-image-to-value conversions may differ from Blender.
