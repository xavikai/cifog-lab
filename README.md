# CIFOG Lab

A home for small interactive activities that support CIFOG classroom presentations. The entry page lists the available labs. Each activity lives in its own folder so the collection can grow without changing existing links.

- Live collection: https://xavikai.github.io/cifog-lab/
- Material Lab: https://xavikai.github.io/cifog-lab/labs/materials/
- UV Unwrap Lab: https://xavikai.github.io/cifog-lab/labs/uv-unwrapping/

## Available lab

**Material Lab** (`labs/materials/`) is an interactive editor in English based on a focused subset of Blender 5.2 nodes. Students can connect Texture Coordinate, Mapping, Image Texture, Normal Map, Principled BSDF and Material Output; adjust materials; switch preview shapes; and try short guided experiments on roughness, normal maps and repeating textures.

**UV Unwrap Lab** (`labs/uv-unwrapping/`) uses a paper cube to show how seams open a 3D surface into one or more 2D UV islands. Students can select matching faces in both views, mark or clear any of the twelve cube edges, choose starting layouts, and animate the same six faces between the cube and their flat arrangement. U and V are shown as coordinates across a square image area. A closed loop or overlapping layout is explained rather than silently presented as a valid net.

Open a lab from the home page. To add another lab later, create a new `labs/<name>/` folder with its own `index.html` and add its card to the root `index.html`. The root page, existing lab and shared `vendor/` library can then remain in place.

## Local preview

The published site is static. Node.js is needed only for a local preview:

```sh
npm start
```

Visit `http://127.0.0.1:5197/`. The local server resolves folder URLs to their `index.html` files. All site links and assets use relative URLs and also work beneath the GitHub Pages project path.

```sh
npm test
```

The tests cover material graph connections, Mapping transformations and valid or conflicting cube nets.

## Structure

- `index.html`, `home.css`: collection home page.
- `labs/materials/`: Material Lab interface, preview, graph and texture assets.
- `labs/uv-unwrapping/`: UV Unwrap Lab, cube net solver and 3D folding animation.
- `vendor/`: pinned Three.js 0.180.0 modules and MIT license shared by labs.
- `docs/teaching-notes.md`: lesson sequence and teaching notes for Material Lab.
- `server.mjs`: local preview server only.

The `.nojekyll` file allows GitHub Pages to serve the static files directly. There is no build step, CDN dependency, analytics, account requirement or backend. Images that students open in Material Lab stay in their browser.

## Material Lab scope and accuracy

This is a teaching simulation, not Blender running in a browser. It uses Three.js's physical material renderer, so results may differ from Blender's render engines. It cannot load `.blend` files or evaluate arbitrary Blender graphs. The interface uses English to match Blender.

Texture Coordinate includes Generated, Normal, UV, Object, Camera, Window and Reflection. Mapping includes Point, Texture, Vector and Normal modes, with Vector, Location, Rotation and Scale in XYZ. All seven coordinate outputs can feed Mapping or an Image Texture directly. Mapping's Location, Rotation and Scale sockets can receive coordinates; connected fields hide their manual values. Rotation fields display degrees; linked rotation vectors represent radians.

The Image Texture nodes use Flat projection and Repeat extension: X and Y of the transformed vector sample the image. UV has Z = 0, so Scale Z or Location Z alone does not change a flat image. Rotation X/Y can still change the result. Object uses the preview mesh; Blender object selection and instancing are outside this lab. The preview uses its own Y-up object axes.

Connected maps replace the corresponding manual material controls. The normal image passes through Normal Map before the shader; it changes shading rather than geometry. Disconnecting an Image Texture's Vector input uses the mesh's UVs. Disconnecting Texture Coordinate from Mapping exposes its manual Vector XYZ.

For scalar maps the browser renderer samples its standard roughness and metalness channels. Bundled roughness maps are grayscale. Arbitrary colored-image-to-value conversions may differ from Blender.

## Assets and sources

- Brick Wall 001, Poly Haven, CC0: https://polyhaven.com/a/brick_wall_001
- Concrete base color generated with OpenAI ImageGen for the accompanying lesson. It is a starting image, not a complete PBR material.
- Three.js 0.180.0, MIT: https://threejs.org/ (license in `vendor/LICENSE-three.txt`).
- Blender node reference: https://docs.blender.org/manual/en/5.2/render/shader_nodes/shader/principled.html

The project is not affiliated with the Blender Foundation. CIFOG identifies the classroom context supplied by the teacher.

The UV lesson follows the [Blender 5.2 manual on seams](https://docs.blender.org/manual/en/5.2/modeling/meshes/uv/unwrapping/seams.html). It deliberately models a rigid paper cube. Blender's unwrap operator can handle more complex meshes and may distort or pack islands differently.
