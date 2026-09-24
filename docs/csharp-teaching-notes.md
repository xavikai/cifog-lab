# Code Lab (C#) — teaching notes

The interface uses English so students meet the same keywords, types and compiler messages they will see in Visual Studio and Unity. The drone's world uses Unity's axes: X right, Z forward, Y up.

## How to use it in class

- Start each concept with **Step (F10)**, not Run. Ask students to predict what the next line will do before pressing Step.
- Point at three places while stepping: the highlighted line (what runs next), **Memory** (what the computer remembers) and the **Execution** panel (how a condition was evaluated).
- After a run, read the **×** counters next to the line numbers: how many times did the loop body run? How many times was the condition checked? (One more than the body.)
- Errors are part of the lesson. The compiler checks everything before running: a program with an error does nothing at all. Runtime errors happen while running and stop at a specific line.

## Challenge types

The sequence follows how beginners learn: read and predict before writing (PRIMM: Predict, Run, Investigate, Modify, Make).

- **Observe ◉** — read-only. Follow it with Step; nothing to write.
- **Predict ?** — choose an answer, then run. A wrong prediction still completes the challenge: the surprise is the lesson. Ask students to explain the difference out loud.
- **Order ⇅** (Parsons problems) — the correct lines are given, shuffled, with one or two traps. Students practise logic without fighting syntax.
- **Fix !** — compiler errors and logic errors (the program runs but does the wrong thing).
- **Complete _** — fill in the `___` gaps of a worked example.
- **Classify ≡** — choose a category for each item (valid name? works or error?). The compiler, or a naming rule, decides.
- **Create ■** — write the program.

## Level 0 · Calculator (no statements yet)

Each line is a single calculation, without `;` or method calls, like C# Interactive. The result appears next to the line with its type; in some challenges the drone builds it as a tower. This keeps the very first contact free of syntax.

1. **The calculator** (observe) — one line at a time, top to bottom; comments.
2. **Which goes first?** (predict) — `2 + 3 * 4` is 14.
3. **Make 12** (create) — only the numbers 3 and 4 are allowed; several answers work.
4. **Fill the gaps** (complete).
5. **Whole numbers** (predict) — `7 / 2` is 3; try `7.0 / 2`.
6. **What is left over** (predict) — `17 % 5` is 2.
7. **Kinds of values** (predict) — int, double, string, bool; `"3" + 4` is `"34"`.

## Level 1 · Names

1. **Capital letters matter** (classify) — `true`/`True`, double quotes, decimal point, `Math`/`math`. The real checker decides.
2. **Valid names** (classify) — digits first, spaces, `-`, reserved words (`class` is invalid, `Class` is valid).
3. **Name styles** (classify) — camelCase for variables, PascalCase for methods and types.
4. **A box with a name** (predict) — `age + 1` calculates, `age = age + 1` stores.
5. **Fix the names** (fix) — spaces in names, `Int`, `playerscore` vs `playerScore`.

## Level 2 · First instructions

Now `;` and method calls appear: `Console.WriteLine("Hello!");` — who (`Console`), what (`WriteLine`), with what (the value in brackets). Then a Parsons problem and the broken calculator (`"2 + 3 = " + 2 + 3`).

## Level 3 · The drone (sequence)

1. **First block** — programs run top to bottom, one instruction at a time. Each `Move` is one tile.
2. **Order matters** — the starter stacks the tower upside down. The computer does exactly what is written.
3. **Read the errors** — three mistakes: a missing `;`, `place` vs `Place`, `green` vs `Green`. Syntax errors appear one at a time; after fixing the `;`, the checker lists the other two together. C# is case-sensitive.

## Level 4 · Variables

- **A box, not an equation** (predict) — `x = x + 1` stores, it is not an equation.
- **A copy, not a link** (predict) — `int b = a;` copies the value; changing `a` later does not change `b`. One of the most common beginner misconceptions.
- **Swap two boxes** (order) — the temp-variable swap, with two trap lines.

1. **Store a value** — change `distance` once and both moves change. Watch the variable box in Memory.
2. **Whole numbers** — `7 / 2` is `3` for `int`. The Console prints `middle = 3`. Discuss `7 / 2.0`, `double` and `(int)` casts. The end tile is `width - 1` (counting from 0).
3. **Types** — `Color roof = "Red";` fails with CS0029: a string is not a Color. Reuse the variables for the second tower and reassign `label` (no type the second time, or CS0128 appears).

## Level 5 · Loops

- **Count the turns** (predict) — `i <= 4` from 0 runs five times (off-by-one).
- **Loop inside a loop** (order, before The floor) — braces are lines too; indentation appears automatically.

1. **The wall** — the three parts of `for`. Try `i < 9`: the drone leaves the grid on line 4 (runtime error) and the Memory panel shows `i` at the moment of the error.
2. **Use the counter** — `MoveTo(i * 2, 0)`: the loop variable is a normal int.
3. **Stairs** — nested loops. In Memory, the inner `h` is created and destroyed on every turn of the outer loop (scope).
4. **The floor** — two nested loops cover a grid: the pattern behind instancing, tiling and procedural placement.
5. **Fill it up** — the starting heights are random. `while (drone.Height < 6)` repeats an unknown number of times. The program is verified on three other random worlds.

## Level 6 · Conditions

- **Which path?** (predict) — an `if / else if / else` chain runs only the first true branch; `&&` needs both sides.

1. **Checkerboard** — `%` and `if/else`. Step through a few tiles and read `(1 + 2) % 2 == 0 → false`.
2. **The frame** — `||` combines conditions. Ask what `&&` would build instead (only the corners? nothing?).
3. **Read the floor** — the floor is random; students must read `drone.Ground` and chain `else if`. Hard-coded positions fail the extra worlds.

## Free build

A sandbox with a pyramid made from three nested loops and the conditional operator. Good for open-ended tasks: a spiral staircase, a hollow tower, a gradient of colors.

## Next levels (planned)

Methods with parameters and `return` (call stack visible), arrays and `foreach` (heightmaps), classes and objects, and a bridge to Unity with `Update()`, `Vector3` and a `MonoBehaviour`-like structure.
