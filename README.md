# CIFOG Lab

A home for small interactive activities that support CIFOG classroom presentations. The entry page lists the available labs. Each activity lives in its own folder so the collection can grow without changing existing links.

- Live collection: https://xavikai.github.io/cifog-lab/
- Material Lab: https://xavikai.github.io/cifog-lab/labs/materials/
- UV Unwrap Lab: https://xavikai.github.io/cifog-lab/labs/uv-unwrapping/
- Code Lab (C#): https://xavikai.github.io/cifog-lab/labs/csharp/

## Available labs

**Material Lab** (`labs/materials/`) is an interactive editor in English based on a focused subset of Blender 5.2 nodes. Students can connect Texture Coordinate, Mapping, Image Texture, Normal Map, Principled BSDF and Material Output; adjust materials; switch preview shapes; and try short guided experiments on roughness, normal maps and repeating textures.

**UV Unwrap Lab** (`labs/uv-unwrapping/`) copies Blender's UV Editing workspace: a UV Editor and a 3D Viewport side by side, an Edit Mode header with Edge/Face Select, Select and UV menus, and a status bar that shows the available keys. Students select edges (Shift to add), then Mark Seam through the U menu, Ctrl+E, the right-click menu or the header buttons, and Unwrap. Live Unwrap (on by default) updates the map immediately; turned off, the map is marked out of date until students run Unwrap, as in Blender. Hovering an edge highlights it in both views, and a seam appears twice in the UV map. Face Select + Mark Seam cuts around the selected faces. Tab switches Object/Edit Mode (the UV Editor only shows UVs in Edit Mode). A "Quick Seam" tool is a clearly labelled lab shortcut that toggles a seam with one click. The 3D faces sample a texture painted from the UV map with a UV-space checker, so stretch and uneven density are visible on the model. Unfold works for the cube and the chair: every face hinges about its shared edge and lands exactly on its UV position. Object Mode has a Transform panel, S to scale and Ctrl+A › Scale to apply; an unapplied non-uniform scale reproduces Blender's unwrap warning and a stretched checker until the scale is applied and the object unwrapped again. Closed loops and overlaps are explained rather than silently shown.

**Code Lab** (`labs/csharp/`) teaches programming fundamentals in C#. Students program a drone that builds voxel sculptures on an 8 × 8 grid and compare the result with a ghost target. A small interpreter written for the lab runs a subset of C# step by step: the next line is highlighted, conditions are shown as they are evaluated (`i < 7 → 3 < 7 → true`), a Memory panel shows each variable with its type and scope, gutter counters show how many times each line ran, and inline notes show what each line did. Before running, a checker reports compiler errors with real C# codes and messages (CS1002, CS0029, CS0103…) plus a plain-English hint. Runtime errors (leaving the grid, dividing by zero, endless loops) stop the program at the line that caused them. There are 36 challenges in 8 levels. The course starts without any statements or method calls: a **Calculator** mode (like C# Interactive: one calculation per line, no semicolons, each result shown next to its line with its type, and optionally built as a tower) introduces operators, precedence, integer division, `%` and value types; **Names** covers case-sensitivity, valid identifiers and camelCase/PascalCase with Classify challenges judged by the real checker, plus first variables. Then come first instructions (`;`, `Console.WriteLine`, method calls), the drone, variables and types, loops (for, nested, while), conditions (if/else, %, &&, ||) and a sandbox. Challenges come in seven types, following how beginners learn best (read before write, PRIMM): **Observe** (read-only, follow with Step), **Predict** (choose an answer before running; the answer is checked against what really happens), **Order** (Parsons problems: drag the shuffled lines into order, with distractors; braces indent automatically), **Fix** (compiler and logic errors), **Complete** (fill the `___` gaps), **Classify** (choose a category for each item; the compiler or a naming rule decides) and **Create**. Some challenges check the Console output instead of, or as well as, the shape. `drone.Build(n)` turns numbers into towers (with height labels) and the drone shows the last Console line in a speech bubble. Two challenges randomize the starting world and are verified on other worlds, so hard-coded answers fail. Progress and code are saved in the browser. Shortcuts follow Visual Studio: F5 Run/Continue, F10 Step, Shift+F5 Stop; click a line number for a breakpoint.

The Blender labs follow Blender conventions where it helps transfer: Material Lab links are made by dragging from an output to an input (compatible inputs light up), removed or moved by dragging a connected input away, and cut with Ctrl + right-drag; the mouse wheel zooms, the middle button pans and Home fits all nodes; values use Blender-style slider bars.

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

The tests cover material graph connections, Mapping transformations, valid or conflicting cube nets, that unfolded faces land exactly on their UV positions, and the Code Lab interpreter (C# semantics, compiler errors, every challenge solution and randomized verification).

## Structure

- `index.html`, `home.css`: collection home page.
- `labs/materials/`: Material Lab interface, preview, graph and texture assets.
- `labs/uv-unwrapping/`: UV Unwrap Lab, cube net solver and 3D folding animation.
- `labs/csharp/`: Code Lab. `interpreter.js` (tokenizer, parser, type checker and step runner), `world.js` (voxel world and target comparison), `levels.js` (challenges and toolbox), `render.js` (isometric canvas view), `app.js` (interface).
- `vendor/`: pinned Three.js 0.180.0 modules and MIT license shared by labs.
- `docs/teaching-notes.md`: lesson sequence and teaching notes for Material Lab.
- `docs/csharp-teaching-notes.md`: level sequence and teaching notes for Code Lab.
- `server.mjs`: local preview server only.

The `.nojekyll` file allows GitHub Pages to serve the static files directly. There is no build step, CDN dependency, analytics, account requirement or backend. Images that students open in Material Lab stay in their browser.

## Material Lab scope and accuracy

This is a teaching simulation, not Blender running in a browser. It uses Three.js's physical material renderer, so results may differ from Blender's render engines. It cannot load `.blend` files or evaluate arbitrary Blender graphs. The interface uses English to match Blender.

Texture Coordinate includes Generated, Normal, UV, Object, Camera, Window and Reflection. Mapping includes Point, Texture, Vector and Normal modes, with Vector, Location, Rotation and Scale in XYZ. All seven coordinate outputs can feed Mapping or an Image Texture directly. Mapping's Location, Rotation and Scale sockets can receive coordinates; connected fields hide their manual values. Rotation fields display degrees; linked rotation vectors represent radians.

The Image Texture nodes use Flat projection and Repeat extension: X and Y of the transformed vector sample the image. UV has Z = 0, so Scale Z or Location Z alone does not change a flat image. Rotation X/Y can still change the result. Object uses the preview mesh; Blender object selection and instancing are outside this lab. The preview uses its own Y-up object axes.

Connected maps replace the corresponding manual material controls. The normal image passes through Normal Map before the shader; it changes shading rather than geometry. Disconnecting an Image Texture's Vector input uses the mesh's UVs. Disconnecting Texture Coordinate from Mapping exposes its manual Vector XYZ.

For scalar maps the browser renderer samples its standard roughness and metalness channels. Bundled roughness maps are grayscale. Arbitrary colored-image-to-value conversions may differ from Blender.

## Code Lab scope

Code Lab runs in the browser without a .NET runtime. Supported: top-level statements; `int`, `float`, `double`, `bool`, `string`, `var` and the lab types `Color` and `Direction`; arithmetic with C# integer division and `float`/`double` printing; string concatenation and `$"…{x}"` interpolation; `if`/`else`, `while`, `do`/`while`, `for`, `break`, `continue`, the conditional operator; casts between numeric types; `Console.WriteLine`/`Write`, `Math.Abs/Max/Min/Sqrt/Pow/Floor/Round`, `.ToString()` and `string.Length`. The checker enforces types, scopes, definite assignment and method overloads before running. Methods, arrays, classes and `foreach` are planned for later levels and currently show a "not part of this lab yet" message. The `drone` object exists only in the lab; everything else is standard C#.

## Assets and sources

- Brick Wall 001, Poly Haven, CC0: https://polyhaven.com/a/brick_wall_001
- Concrete base color generated with OpenAI ImageGen for the accompanying lesson. It is a starting image, not a complete PBR material.
- Three.js 0.180.0, MIT: https://threejs.org/ (license in `vendor/LICENSE-three.txt`).
- Blender node reference: https://docs.blender.org/manual/en/5.2/render/shader_nodes/shader/principled.html

The project is not affiliated with the Blender Foundation. CIFOG identifies the classroom context supplied by the teacher.

The UV lesson follows the [Blender 5.2 manual on seams](https://docs.blender.org/manual/en/5.2/modeling/meshes/uv/unwrapping/seams.html). It deliberately models a rigid paper cube. Blender's unwrap operator can handle more complex meshes and may distort or pack islands differently.
