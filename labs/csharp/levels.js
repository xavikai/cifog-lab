// Levels and challenges for the C# Code Lab.
// Each challenge builds a target in an 8 × 8 voxel world.
// setup(rand) returns { start, columns, ground, target }. Randomized challenges
// are verified on several extra seeds so hard-coded answers don't pass.

const SIZE = 8;
function fill(fn) {
  const t = {};
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    const c = fn(x, z);
    if (c && c.length) t[`${x},${z}`] = c;
  }
  return t;
}
const repeat = (color, n) => Array(n).fill(color);

export const API = [
  { level: 1, code: 'drone.Move(Direction.Right);', text: 'Moves one tile. Directions: <code>Right</code>, <code>Left</code>, <code>Forward</code>, <code>Back</code>.' },
  { level: 1, code: 'drone.Place(Color.Red);', text: 'Places a block on top of the column under the drone. Colors: White, Red, Orange, Yellow, Green, Blue, Purple, Black.' },
  { level: 2, code: 'int distance = 3;', text: 'Creates a variable: a named box with a type and a value. Types: <code>int</code> 3 · <code>double</code> 2.5 · <code>float</code> 2.5f · <code>bool</code> true · <code>string</code> "text" · <code>Color</code>.' },
  { level: 2, code: 'drone.Move(Direction.Right, distance);', text: 'Moves several tiles at once.' },
  { level: 2, code: 'Console.WriteLine("x = " + x);', text: 'Prints text or a value in the Console. Useful to check what a variable holds.' },
  { level: 3, code: 'for (int i = 0; i < 5; i++)\n{\n    \n}', text: 'Repeats the block. <code>i = 0</code> start · <code>i &lt; 5</code> keep going while true · <code>i++</code> add 1 after each turn.' },
  { level: 3, code: 'drone.MoveTo(x, z);', text: 'Flies straight to a tile. X goes right, Z goes forward.' },
  { level: 3, code: 'while (drone.Height < 6)\n{\n    \n}', text: 'Repeats while the condition is true. Use it when you don\'t know how many turns you need.' },
  { level: 3, code: 'drone.Height', text: 'How many blocks are in the column under the drone (int). Also <code>drone.X</code> and <code>drone.Z</code>.' },
  { level: 4, code: 'if (x == 0)\n{\n    \n}\nelse\n{\n    \n}', text: 'Runs one block or the other depending on the condition.' },
  { level: 4, code: 'x % 2 == 0', text: 'Compare with <code>==</code> <code>!=</code> <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code>. <code>%</code> is the remainder of a division. Combine with <code>&amp;&amp;</code> (and), <code>||</code> (or), <code>!</code> (not).' },
  { level: 4, code: 'drone.Ground', text: 'The color painted on the floor under the drone. <code>Color.None</code> if the tile is empty.' },
];

export const LEVELS = [
  {
    id: 1, name: 'Instructions', concept: 'Sequence',
    intro: 'A program is a list of instructions. The computer runs them in order, top to bottom, one at a time.',
    challenges: [
      {
        id: '1-1', title: 'First block',
        goal: 'Place a red block on the ghost tile at (3, 0).',
        brief: '<p>The drone starts at <b>(0, 0)</b>. Each <code>drone.Move(Direction.Right);</code> moves it <b>one</b> tile. Press <b>Run</b> to see what the program does now, then add the lines it is missing.</p>',
        hint: 'You need three Move lines before Place. Copy a line with Ctrl+C and paste it with Ctrl+V.',
        starter: `// Press Run ▶ to see what this program does.
// Then add lines so the red block lands on the ghost tile.
drone.Move(Direction.Right);
drone.Place(Color.Red);
`,
        solution: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Place(Color.Red);`,
        setup: () => ({ target: { '3,0': ['Red'] } }),
      },
      {
        id: '1-2', title: 'Order matters',
        goal: 'Build a tower at (2, 2): Blue at the bottom, White in the middle, Red on top.',
        brief: '<p>Blocks stack in the order you place them. The program is almost right, but the computer does <b>exactly</b> what you write, in the order you write it. Use <b>Step</b> to follow it one line at a time.</p>',
        hint: 'Reorder the three Place lines. The first block placed ends up at the bottom.',
        starter: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Move(Direction.Forward);
drone.Place(Color.Red);
drone.Place(Color.White);
drone.Place(Color.Blue);
`,
        solution: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Move(Direction.Forward);
drone.Place(Color.Blue);
drone.Place(Color.White);
drone.Place(Color.Red);`,
        setup: () => ({ target: { '2,2': ['Blue', 'White', 'Red'] } }),
      },
      {
        id: '1-3', title: 'Read the errors',
        goal: 'Fix the program so it places green blocks at (1, 0) and (2, 0).',
        brief: '<p>This program has <b>three mistakes</b>. Before running anything, the <b>compiler</b> checks the whole program. If it finds a mistake, nothing runs. Press Run and read the Console: it tells you the line and what is wrong.</p>',
        hint: 'Look for a missing ; and remember that C# is case-sensitive: Place is not place.',
        starter: `// This program has 3 mistakes. Press Run and read the Console.
drone.Move(Direction.Right)
drone.place(Color.Green);
drone.Move(Direction.Right);
drone.Place(Color.green);
`,
        solution: `drone.Move(Direction.Right);
drone.Place(Color.Green);
drone.Move(Direction.Right);
drone.Place(Color.Green);`,
        setup: () => ({ target: { '1,0': ['Green'], '2,0': ['Green'] } }),
      },
    ],
  },
  {
    id: 2, name: 'Variables', concept: 'Store values',
    intro: 'A variable is a named box that stores a value. Every variable has a type that says what it can hold.',
    challenges: [
      {
        id: '2-1', title: 'Store a value',
        goal: 'Place blue blocks at (3, 0) and (6, 0).',
        brief: '<p><code>int distance = 2;</code> creates a box called <b>distance</b> that holds the whole number 2. Every line that uses <code>distance</code> reads what is in the box. Change the value <b>once</b> and both moves change. Watch the <b>Memory</b> panel.</p>',
        hint: 'Change only the number in the first line.',
        starter: `int distance = 2;

drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
`,
        solution: `int distance = 3;

drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);`,
        requires: [{ feature: 'variable', label: 'Use a variable' }],
        setup: () => ({ target: { '3,0': ['Blue'], '6,0': ['Blue'] } }),
      },
      {
        id: '2-2', title: 'Whole numbers',
        goal: 'Yellow at the start (0, 0), Orange in the middle (3, 0), Yellow at the end (6, 0) of a 7-tile wall.',
        brief: '<p>Variables can be calculated from other variables. But careful: an <code>int</code> only holds <b>whole numbers</b>. What is <code>7 / 2</code> in C#? Run the program and check <code>middle</code> in the Memory panel.</p><p>Finish the program using <code>width</code> and <code>middle</code> to reach the last tile.</p>',
        hint: 'The last tile is at width - 1. The drone is already at middle, so it has to move (width - 1) - middle more tiles.',
        starter: `int width = 7;
int middle = width / 2;     // What value does middle get?
Console.WriteLine("middle = " + middle);

drone.Place(Color.Yellow);                // start of the wall
drone.Move(Direction.Right, middle);
drone.Place(Color.Orange);                // middle
// Move to the last tile of the wall and place Yellow.
`,
        solution: `int width = 7;
int middle = width / 2;
Console.WriteLine("middle = " + middle);
drone.Place(Color.Yellow);
drone.Move(Direction.Right, middle);
drone.Place(Color.Orange);
drone.Move(Direction.Right, width - 1 - middle);
drone.Place(Color.Yellow);`,
        requires: [{ feature: 'variable', label: 'Use variables' }],
        setup: () => ({ target: { '0,0': ['Yellow'], '3,0': ['Orange'], '6,0': ['Yellow'] } }),
      },
      {
        id: '2-3', title: 'Types',
        goal: 'Build two towers, Green · Green · Red, at (1, 1) and (4, 1).',
        brief: '<p>Every variable has a <b>type</b>: <code>int</code>, <code>double</code>, <code>bool</code>, <code>string</code>… and here also <code>Color</code>. The compiler refuses to put a value of the wrong type in a box. Fix the error, then build the second tower using the same variables.</p>',
        hint: 'Colors are written Color.Red, not "Red" (that is a string). Then move 3 tiles right and repeat the three Place lines.',
        starter: `Color wall = Color.Green;
Color roof = "Red";
string label = "Tower A";

Console.WriteLine("Building " + label);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);

// Build the same tower at (4, 1) and print "Building Tower B".
`,
        solution: `Color wall = Color.Green;
Color roof = Color.Red;
string label = "Tower A";
Console.WriteLine("Building " + label);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);
label = "Tower B";
Console.WriteLine("Building " + label);
drone.Move(Direction.Right, 3);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);`,
        requires: [{ declType: 'Color', label: 'Store a color in a Color variable' }],
        setup: () => ({ target: { '1,1': ['Green', 'Green', 'Red'], '4,1': ['Green', 'Green', 'Red'] } }),
      },
    ],
  },
  {
    id: 3, name: 'Loops', concept: 'Repeat',
    intro: 'A loop repeats a block of code. The loop variable changes on every turn, so each turn can do something slightly different.',
    challenges: [
      {
        id: '3-1', title: 'The wall',
        goal: 'Build a wall of 7 blue blocks from (0, 0) to (6, 0).',
        brief: '<p>Without a loop you would need 14 lines. <code>for (int i = 0; i &lt; 3; i++)</code> has three parts: <b>start</b> <code>i = 0</code>, <b>condition</b> <code>i &lt; 3</code> (checked before every turn) and <b>step</b> <code>i++</code> (after every turn). Watch <code>i</code> in Memory and the <b>×</b> counters next to the line numbers.</p>',
        hint: 'Change only the number in the condition.',
        starter: `for (int i = 0; i < 3; i++)
{
    drone.Place(Color.Blue);
    drone.Move(Direction.Right);
}
`,
        solution: `for (int i = 0; i < 7; i++)
{
    drone.Place(Color.Blue);
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'for', label: 'Use a for loop' }, { maxStatements: 3, label: 'At most 3 instructions' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x < 7 ? ['Blue'] : null) }),
      },
      {
        id: '3-2', title: 'Use the counter',
        goal: 'Place purple blocks on every other tile: (0, 0), (2, 0), (4, 0), (6, 0).',
        brief: '<p><code>drone.MoveTo(x, z)</code> flies straight to a tile. The loop variable <code>i</code> is a normal <code>int</code>: you can use it in calculations. Which calculation turns 0, 1, 2, 3 into 0, 2, 4, 6?</p>',
        hint: 'Multiply: i * 2.',
        starter: `for (int i = 0; i < 4; i++)
{
    drone.MoveTo(i, 0);
    drone.Place(Color.Purple);
}
`,
        solution: `for (int i = 0; i < 4; i++)
{
    drone.MoveTo(i * 2, 0);
    drone.Place(Color.Purple);
}`,
        requires: [{ feature: 'for', label: 'Use a for loop' }, { maxStatements: 3, label: 'At most 3 instructions' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x % 2 === 0 ? ['Purple'] : null) }),
      },
      {
        id: '3-3', title: 'Stairs',
        goal: 'Build orange stairs: 1 block at (1, 0), 2 at (2, 0)… up to 5 at (5, 0).',
        brief: '<p>A loop can go <b>inside</b> another loop. The inner loop runs completely on every turn of the outer loop. Look at the <b>for scopes</b> in Memory: the inner <code>h</code> is created and destroyed on every turn.</p>',
        hint: 'Inside the outer loop add: for (int h = 0; h < x; h++) { drone.Place(Color.Orange); }',
        starter: `for (int x = 1; x <= 5; x++)
{
    drone.MoveTo(x, 0);
    // Add an inner loop here that places x blocks.
    drone.Place(Color.Orange);
}
`,
        solution: `for (int x = 1; x <= 5; x++)
{
    drone.MoveTo(x, 0);
    for (int h = 0; h < x; h++)
    {
        drone.Place(Color.Orange);
    }
}`,
        requires: [{ feature: 'nestedLoop', label: 'Use a loop inside a loop' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x >= 1 && x <= 5 ? repeat('Orange', x) : null) }),
      },
      {
        id: '3-4', title: 'The floor',
        goal: 'Cover a 6 × 6 floor with green blocks, from (0, 0) to (5, 5).',
        brief: '<p>Two nested loops visit every tile of a grid: one for <code>x</code>, one for <code>z</code>. This is how many 3D tools place instances on a grid.</p>',
        hint: 'for x from 0 to 5 → for z from 0 to 5 → MoveTo(x, z) and Place.',
        starter: `// Cover a 6 × 6 floor with Green blocks.
// Tip: one loop for x, and one loop for z inside it.
`,
        solution: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        drone.Place(Color.Green);
    }
}`,
        requires: [{ feature: 'nestedLoop', label: 'Use a loop inside a loop' }, { maxStatements: 4, label: 'At most 4 instructions' }],
        setup: () => ({ target: fill((x, z) => x < 6 && z < 6 ? ['Green'] : null) }),
      },
      {
        id: '3-5', title: 'Fill it up',
        goal: 'Make every column in the first row exactly 6 blocks tall, filling with Blue.',
        brief: '<p>The starting heights <b>change every time you press Run</b>, so you can\'t know how many blocks each column needs. A <code>while</code> loop repeats <b>as long as</b> its condition is true: <code>while (drone.Height &lt; 6)</code>.</p>',
        hint: 'Inside the for loop, after MoveTo: while (drone.Height < 6) { drone.Place(Color.Blue); }',
        randomized: true,
        starter: `// The white columns change height every run.
for (int x = 0; x < 8; x++)
{
    drone.MoveTo(x, 0);
    // Keep placing Blue while the column is lower than 6.
}
`,
        solution: `for (int x = 0; x < 8; x++)
{
    drone.MoveTo(x, 0);
    while (drone.Height < 6)
    {
        drone.Place(Color.Blue);
    }
}`,
        requires: [{ feature: 'while', label: 'Use a while loop' }],
        setup: rand => {
          const columns = {}, target = {};
          for (let x = 0; x < SIZE; x++) {
            const h = Math.floor(rand() * 6);
            if (h) columns[`${x},0`] = repeat('White', h);
            target[`${x},0`] = [...repeat('White', h), ...repeat('Blue', 6 - h)];
          }
          return { columns, target };
        },
      },
    ],
  },
  {
    id: 4, name: 'Conditions', concept: 'Decide',
    intro: 'An if statement lets the program decide. The condition is evaluated to true or false, and only one path runs.',
    challenges: [
      {
        id: '4-1', title: 'Checkerboard',
        goal: 'Cover 6 × 6 tiles: Red where (x + z) is even, White where it is odd.',
        brief: '<p><code>%</code> gives the <b>remainder</b> of a division: <code>7 % 2</code> is 1, <code>8 % 2</code> is 0. So <code>(x + z) % 2 == 0</code> is true on every other tile. Use <b>Step</b> and read how each condition is evaluated.</p>',
        hint: 'if ((x + z) % 2 == 0) { place Red } else { place White }',
        starter: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        drone.Place(Color.Red);
    }
}
`,
        solution: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        if ((x + z) % 2 == 0)
        {
            drone.Place(Color.Red);
        }
        else
        {
            drone.Place(Color.White);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'else', label: 'Use else' }],
        setup: () => ({ target: fill((x, z) => x < 6 && z < 6 ? [(x + z) % 2 === 0 ? 'Red' : 'White'] : null) }),
      },
      {
        id: '4-2', title: 'The frame',
        goal: 'Build only the border of a 7 × 7 square in Purple.',
        brief: '<p><code>||</code> means <b>or</b>: the condition is true if either side is true. <code>&amp;&amp;</code> means <b>and</b>: both sides must be true. A tile is on the border if x is 0, <b>or</b> x is 6, <b>or</b> z is 0, <b>or</b> z is 6.</p>',
        hint: 'if (x == 0 || x == 6 || z == 0 || z == 6)',
        starter: `for (int x = 0; x < 7; x++)
{
    for (int z = 0; z < 7; z++)
    {
        if (x == 0)
        {
            drone.MoveTo(x, z);
            drone.Place(Color.Purple);
        }
    }
}
`,
        solution: `for (int x = 0; x < 7; x++)
{
    for (int z = 0; z < 7; z++)
    {
        if (x == 0 || x == 6 || z == 0 || z == 6)
        {
            drone.MoveTo(x, z);
            drone.Place(Color.Purple);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'logic', label: 'Combine conditions with || or &&' }],
        setup: () => ({ target: fill((x, z) => x < 7 && z < 7 && (x === 0 || x === 6 || z === 0 || z === 6) ? ['Purple'] : null) }),
      },
      {
        id: '4-3', title: 'Read the floor',
        goal: 'Red tile → 2 Red blocks · Blue tile → 1 Blue block · empty tile → nothing.',
        brief: '<p>The painted floor <b>changes every run</b>. <code>drone.Ground</code> tells you the color of the tile under the drone. Chain decisions with <code>else if</code>. Your program is also tested on other floors, so it has to work for any pattern.</p>',
        hint: 'else if (drone.Ground == Color.Blue) { drone.Place(Color.Blue); }  and place Red twice in the first branch.',
        randomized: true,
        starter: `for (int x = 0; x < 8; x++)
{
    for (int z = 0; z < 8; z++)
    {
        drone.MoveTo(x, z);
        if (drone.Ground == Color.Red)
        {
            drone.Place(Color.Red);
        }
    }
}
`,
        solution: `for (int x = 0; x < 8; x++)
{
    for (int z = 0; z < 8; z++)
    {
        drone.MoveTo(x, z);
        if (drone.Ground == Color.Red)
        {
            drone.Place(Color.Red);
            drone.Place(Color.Red);
        }
        else if (drone.Ground == Color.Blue)
        {
            drone.Place(Color.Blue);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'else', label: 'Use else if' }],
        setup: rand => {
          const ground = {}, target = {};
          for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
            const r = rand();
            if (r < 0.14) { ground[`${x},${z}`] = 'Red'; target[`${x},${z}`] = ['Red', 'Red']; }
            else if (r < 0.28) { ground[`${x},${z}`] = 'Blue'; target[`${x},${z}`] = ['Blue']; }
          }
          return { ground, target };
        },
      },
    ],
  },
  {
    id: 5, name: 'Free build', concept: 'Sandbox',
    intro: 'No goal: experiment with everything you have learned.',
    challenges: [
      {
        id: 'free', title: 'Sandbox', sandbox: true,
        goal: 'No target. Build whatever you like.',
        brief: '<p>Try changing the numbers in this pyramid, or write your own program. Can you build a staircase that turns? A tower with alternating colors?</p>',
        hint: 'Each layer starts one tile further in and ends one tile earlier.',
        starter: `// A pyramid: each level is a smaller square on top of the last one.
for (int level = 0; level < 4; level++)
{
    for (int x = level; x < 7 - level; x++)
    {
        for (int z = level; z < 7 - level; z++)
        {
            drone.MoveTo(x, z);
            drone.Place(level % 2 == 0 ? Color.Yellow : Color.Orange);
        }
    }
}
`,
        solution: '',
        setup: () => ({ target: {} }),
      },
    ],
  },
];

export const CHALLENGES = LEVELS.flatMap(level => level.challenges.map(c => ({ ...c, level })));

export function checkRequirements(challenge, stats) {
  return (challenge.requires || []).map(r => {
    let ok = true;
    if (r.feature) ok = stats.features.has(r.feature);
    if (r.maxStatements) ok = stats.statements <= r.maxStatements;
    if (r.declType) ok = stats.declTypes.has(r.declType);
    return { ...r, ok };
  });
}
