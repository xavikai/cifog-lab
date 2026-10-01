# Geometry Nodes · guia docent (Blender 5.x)

Quatre labs breus i consecutius. A cada pas, l’alumne afegeix nodes, connecta sockets i comprova el resultat en una vista 3D. «Mostra una solució» carrega un graf possible que es pot continuar editant. Els noms dels nodes es mantenen en anglès perquè coincideixin amb Blender.

## GN 01 · El flux de la geometria

**Idea:** el modificador Geometry Nodes rep una geometria i el graf decideix què surt. Un socket rodó porta un valor; el de Geometry transporta la geometria completa.

**Ordre per explicar-ho:**

1. `Group Input → Group Output`: connectar el cub d’entrada i desconnectar-lo per veure què passa.
2. `Transform Geometry`: situar-lo entre els dos nodes i pujar `Translation Z`.
3. `Cube → Transform Geometry → Join Geometry → Group Output`: fer un tauler i quatre potes. Mostrar també `UV Sphere` i `Grid` com a altres primitives.
4. Exposar `Size` del tauler a `Group Input`; canviar la mida al panell del modificador.

**Exemple de classe:** una taula senzilla construïda exclusivament amb cinc cubs i transformacions. Fer que un alumne canviï l’amplada sense entrar al graf.

## GN 02 · Camps i atributs

**Idea:** un socket de camp (rombe) no conté un únic número: descriu com calcular-ne un per a cada punt en el context que l’avalua. El `Spreadsheet` deixa veure `Index`, `Position` i `Normal` per vèrtex.

**Ordre per explicar-ho:**

1. `Grid → Group Output`; obrir `Spreadsheet` i comparar punts veïns.
2. `Index → Math (Sine) → Math (Multiply) → Combine XYZ (Z) → Set Position (Offset)`: primera onada i efecte de l’amplitud.
3. `Position → Separate XYZ (X) → Math (Sine) → Math (Multiply)`; `Normal → Vector Math (Multiply)`; connectar el vector a `Set Position (Offset)`.
4. Exposar l’amplitud del segon `Math (Multiply)` al modificador i guardar el terreny.

**Exemple de classe:** un terreny ondulat sobre un `Grid`. Demanar que localitzin al `Spreadsheet` dos vèrtexs amb diferent altura i que expliquin per què el mateix graf dona valors diferents.

## GN 03 · Instàncies i scatter

**Idea:** primer es calculen posicions, després s’hi col·loquen instàncies. `Density`, `Seed` i els camps controlen quantitat, distribució i variació.

**Ordre per explicar-ho:**

1. Terreny del GN 02 → `Distribute Points on Faces`; canviar `Density` i `Seed` per separat.
2. `Collection Info (Rocks)` i els punts → `Instance on Points`.
3. Un `Random Value → Scale` de `Instance on Points`; un segon `Random Value → Combine XYZ (Z) → Euler to Rotation → Rotation`. Comparar dues llavors i els rangs mínim/màxim.
4. `Position → Separate XYZ (Z) → Math (Greater Than) → Selection` de la distribució; exposar `Density`. Inserir breument `Realize Instances`, observar que les instàncies passen a geometria i retirar-lo quan ja no cal.

**Exemple de classe:** pedres de mides i orientacions diferents només a una zona del terreny. Cal preparar una col·lecció `Rocks` amb pedres quan es reprodueix el graf a Blender. Si l’alumne no ha completat el GN 02 en aquell navegador, el lab proporciona un terreny de mostra.

## GN 04 · Corbes i projecte final

**Idea:** una corba defineix un recorregut; es pot convertir en una malla contínua o en punts on posar objectes.

**Ordre per explicar-ho:**

1. `Curve Line + Curve Circle → Curve to Mesh`: fer un passamà i variar-ne el radi.
2. `Curve Line → Resample Curve → Curve to Points`: repartir uniformement les posicions dels pals; mirar-les al `Spreadsheet`.
3. `Cube + Curve to Points → Instance on Points`; unir aquesta branca amb el passamà mitjançant `Join Geometry`.
4. Exposar `Curve Line (End)`, `Resample Curve (Count)` i `Curve Circle (Radius)` al modificador.

**Exemple de classe:** una tanca o barana que canvia de llargada, nombre de pals i gruix del passamà sense reconstruir els nodes.

## Abast del simulador

L’editor dels labs deixa crear i moure nodes, connectar i desconnectar sockets compatibles, editar valors, exposar-los al modificador, desfer/refés i consultar la vista 3D i el `Spreadsheet`. Interpreta un conjunt didàctic dels nodes utilitzats; l’acabament, les transformacions complexes i la gestió real de col·leccions es fan després a Blender.

**Referències oficials:** [Geometry Nodes a Blender 5.0](https://docs.blender.org/manual/en/5.0/modeling/geometry_nodes/), [Fields](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/fields.html), [Instance on Points](https://docs.blender.org/manual/en/5.0/modeling/geometry_nodes/instances/instance_on_points.html).
