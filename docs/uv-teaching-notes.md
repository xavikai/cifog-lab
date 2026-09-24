# UV Unwrap Lab — teaching notes

The lab uses English face and tool names to match Blender 5.2. A rigid paper cube is the first example: each colored square in the 2D view is exactly one square on the 3D cube. The test checker helps students see that the picture follows a surface rather than filling the air around it.

1. Click **Front** in the UV layout. Its yellow border appears on the front of the 3D cube. Repeat with another face. Explain that U and V locate the same surface on an image; the four corners of that face each get 2D coordinates.
2. Point to the red lines on the cube. They are cuts (seams). Blue lines are hinges. Use **Unfold the cube** and watch the faces remain connected along the blue hinges. The 2D map shows where those faces lie in the image square.
3. Fold back. Choose **Two islands**, then **Six islands**. The object still looks like a cube, but its surface now has more pieces in the image. A cut changes the layout, not the mesh's shape.
4. Choose **No cuts**. The closed cube cannot become this simple flat paper net. Mark edges from the list until the loop opens. If a layout overlaps, move a cut. Return to **One island** to finish.

In Blender, this corresponds conceptually to **Edit Mode → select edges → Mark Seam → Unwrap**, then inspecting the UV Editor. The [Blender 5.2 manual](https://docs.blender.org/manual/en/5.2/modeling/meshes/uv/unwrapping/seams.html) explains that seams guide the unwrap and that the UV map is discontinuous at seams. The lab uses a paper cube, so it treats rigid overlap or a connected loop as an invalid net; Blender can unwrap more complex surfaces by allowing distortion and different packing.
