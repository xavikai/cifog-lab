// A small, teaching-oriented C# interpreter.
// It understands a focused subset of C# (top-level statements, local variables,
// if/else, while, do/while, for, break/continue, methods (local functions with
// parameters and return), arrays and foreach, expressions and the lab API)
// and runs programs step by step so the interface can show what happens.

export const COLORS = ['None', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Black'];
export const DIRECTIONS = ['Forward', 'Back', 'Left', 'Right'];
const NUMERIC = ['int', 'float', 'double'];
const VALUE_TYPES = ['int', 'float', 'double', 'bool', 'string', 'char', 'Color', 'Direction'];
const TYPE_KEYWORDS = new Set(['int', 'float', 'double', 'bool', 'string', 'char', 'var']);
const KEYWORDS = new Set([...TYPE_KEYWORDS, 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'true', 'false',
  'using', 'return', 'void', 'new', 'null', 'foreach', 'in', 'class', 'static', 'public', 'private', 'switch', 'case',
  'default', 'const', 'char', 'long', 'object', 'namespace']);
const STATIC_CLASSES = ['Color', 'Direction', 'Math', 'Console'];

export class CSharpError extends Error {
  constructor({ kind = 'compile', code = '', message, line = 1, col = 1, hint = '', exception = '' }) {
    super(message);
    Object.assign(this, { kind, code, line, col, hint, exception });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isNum = t => NUMERIC.includes(t);
export const isArr = t => typeof t === 'string' && t.endsWith('[]');
export const elemOf = t => t.slice(0, -2);
const DEFAULTS = { int: 0, float: 0, double: 0, bool: false, char: '\0', string: null, Color: 'None', Direction: 'Forward' };
const NET_NAMES = { int: 'Int32', float: 'Single', double: 'Double', bool: 'Boolean', string: 'String', char: 'Char' };
const widest = (a, b) => NUMERIC[Math.max(NUMERIC.indexOf(a), NUMERIC.indexOf(b))];
export function implicitOK(from, to) {
  if (from === to) return true;
  return isNum(from) && isNum(to) && NUMERIC.indexOf(from) <= NUMERIC.indexOf(to);
}
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function suggest(name, options) {
  const lower = name.toLowerCase();
  const exact = options.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  let best = null, score = 3;
  for (const o of options) { const s = distance(lower, o.toLowerCase()); if (s < score) { score = s; best = o; } }
  return best;
}

export function formatFloat(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : (v > 0 ? '∞' : '-∞');
  for (let p = 1; p <= 9; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); }
  return String(v);
}
// How C# prints a value (Console.WriteLine, string concatenation)
export function formatValue(value, type) {
  if (value === undefined || value === null) return '';
  // Printing an array shows its type, not its values (a classic surprise).
  if (isArr(type)) return NET_NAMES[elemOf(type)] ? `System.${NET_NAMES[elemOf(type)]}[]` : type;
  switch (type) {
    case 'bool': return value ? 'True' : 'False';
    case 'float': return formatFloat(value);
    case 'double': return Number.isFinite(value) ? String(value) : (Number.isNaN(value) ? 'NaN' : (value > 0 ? '∞' : '-∞'));
    default: return String(value);
  }
}
// How a value would look written as C# source (used in the Memory panel and explanations)
export function literal(value, type) {
  if (value === undefined) return '?';
  if (value === null) return 'null';
  if (isArr(type)) return `{ ${value.map(v => literal(v, elemOf(type))).join(', ')} }`;
  switch (type) {
    case 'string': return JSON.stringify(value);
    case 'char': return `'${value === "'" ? "\\'" : value === '\n' ? '\\n' : value}'`;
    case 'bool': return value ? 'true' : 'false';
    case 'Color': return `Color.${value}`;
    case 'Direction': return `Direction.${value}`;
    case 'float': return formatFloat(value) + 'f';
    case 'double': { const s = formatValue(value, 'double'); return /[.eE∞N]/.test(s) ? s : s + '.0'; }
    default: return String(value);
  }
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
export function tokenize(src, baseLine = 1, baseCol = 1) {
  const tokens = [];
  let i = 0, line = baseLine, col = baseCol;
  const fail = (code, message, l, c, hint = '') => { throw new CSharpError({ code, message, line: l, col: c, hint }); };
  const adv = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  const push = (tok, l, c) => tokens.push({ ...tok, line: l, col: c, endLine: line, endCol: col });
  while (i < src.length) {
    const ch = src[i];
    if (' \t\r\n'.includes(ch)) { adv(); continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const l = line, c = col; adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= src.length) fail('CS1035', "End-of-file found, '*/' expected", l, c, 'A comment that starts with /* must end with */.');
      adv(2); continue;
    }
    const l = line, c = col;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let s = '';
      while (/[0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); }
      let real = false;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) { real = true; s += '.'; adv(); while (/[0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); } }
      let ty = real ? 'double' : 'int', raw = s;
      const suf = src[i];
      if (suf === 'f' || suf === 'F') { ty = 'float'; raw += suf; adv(); }
      else if (suf === 'd' || suf === 'D') { ty = 'double'; raw += suf; adv(); }
      else if (suf === 'm' || suf === 'M') fail('LAB', "The 'decimal' type isn't part of this lab.", l, c, 'Use int, float or double.');
      let v = Number(s.replace(/_/g, ''));
      if (ty === 'int' && v > 2147483647) fail('CS1021', 'Integral constant is too large', l, c, 'An int can store values up to 2,147,483,647.');
      if (ty === 'float') v = Math.fround(v);
      push({ t: 'num', v, ty, raw }, l, c); continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let s = ''; while (/[A-Za-z0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); }
      push({ t: KEYWORDS.has(s) ? 'kw' : 'id', v: s }, l, c); continue;
    }
    if (ch === '"' || (ch === '$' && src[i + 1] === '"')) {
      const interp = ch === '$'; if (interp) adv(); adv();
      let s = ''; const parts = [];
      for (;;) {
        if (i >= src.length || src[i] === '\n') fail('CS1010', 'Newline in constant', l, c, 'Text must end with a closing " on the same line.');
        const x = src[i];
        if (x === '"') { adv(); break; }
        if (x === '\\') {
          const map = { n: '\n', t: '\t', '"': '"', '\\': '\\', 0: '\0', r: '\r' };
          if (!(src[i + 1] in map)) fail('CS1009', 'Unrecognized escape sequence', line, col, 'Inside text, \\ starts a special character like \\n (new line). Write \\\\ for a backslash.');
          s += map[src[i + 1]]; adv(2); continue;
        }
        if (interp && x === '{') {
          if (src[i + 1] === '{') { s += '{'; adv(2); continue; }
          parts.push(s); s = ''; adv();
          const el = line, ec = col; let depth = 0, e = '';
          while (i < src.length && !(src[i] === '}' && depth === 0)) {
            if (src[i] === '\n') fail('CS1010', 'Newline in constant', l, c);
            if (src[i] === '{') depth++;
            if (src[i] === '}') depth--;
            e += src[i]; adv();
          }
          if (i >= src.length) fail('CS1010', 'Newline in constant', l, c);
          adv();
          if (!e.trim()) fail('CS1733', 'Expected expression', el, ec, 'Write a value or variable inside { }.');
          parts.push({ src: e, line: el, col: ec }); continue;
        }
        if (interp && x === '}') {
          if (src[i + 1] === '}') { s += '}'; adv(2); continue; }
          fail('CS8086', "A '}' character must be escaped (by doubling) in an interpolated string.", line, col);
        }
        s += x; adv();
      }
      if (interp) { parts.push(s); push({ t: 'istr', parts }, l, c); }
      else push({ t: 'str', v: s }, l, c);
      continue;
    }
    if (ch === "'") {
      adv();
      let v;
      if (src[i] === '\\') {
        const map = { n: '\n', t: '\t', "'": "'", '"': '"', '\\': '\\', 0: '\0' };
        if (!(src[i + 1] in map)) fail('CS1009', 'Unrecognized escape sequence', line, col);
        v = map[src[i + 1]]; adv(2);
      } else if (src[i] === "'" || src[i] === undefined || src[i] === '\n') fail('CS1011', 'Empty character literal', l, c, "Single quotes hold exactly one character, like 'a'.");
      else { v = src[i]; adv(); }
      if (src[i] !== "'") fail('CS1012', 'Too many characters in character literal', l, c, 'Single quotes hold ONE character (a char), like \'a\'. For text use double quotes: "hello".');
      adv();
      push({ t: 'chr', v }, l, c); continue;
    }
    const two = src.substr(i, 2);
    if (['++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '&&', '||', '=>'].includes(two)) { adv(2); push({ t: 'op', v: two }, l, c); continue; }
    if ('+-*/%=<>!(){};,.?:[]&|'.includes(ch)) { adv(); push({ t: 'op', v: ch }, l, c); continue; }
    fail('CS1056', `Unexpected character '${ch}'`, l, c);
  }
  tokens.push({ t: 'eof', v: '', line, col, endLine: line, endCol: col });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
const EXPECT = {
  ';': ['CS1002', '; expected', 'Every instruction in C# ends with a semicolon ;'],
  ')': ['CS1026', ') expected', 'Every ( needs a matching ).'],
  '(': ['CS1003', "Syntax error, '(' expected", ''],
  '}': ['CS1513', '} expected', 'Every { needs a matching }.'],
  '{': ['CS1514', '{ expected', ''],
  ':': ['CS1003', "Syntax error, ':' expected", ''],
  ']': ['CS1003', "Syntax error, ']' expected", 'Every [ needs a matching ].'],
};

class Parser {
  constructor(tokens) { this.toks = tokens; this.p = 0; this.depth = 0; this.inMethod = false; }
  get tok() { return this.toks[this.p]; }
  peek(n = 1) { return this.toks[Math.min(this.p + n, this.toks.length - 1)]; }
  prev() { return this.toks[this.p - 1] || this.toks[0]; }
  is(v) { const k = this.tok; return (k.t === 'op' || k.t === 'kw') && k.v === v; }
  eat(v) { return this.is(v) ? this.toks[this.p++] : null; }
  fail(code, message, at, hint = '') { throw new CSharpError({ code, message, line: at.line, col: at.col, hint }); }
  expect(v) {
    if (this.is(v)) return this.toks[this.p++];
    const [code, msg, hint] = EXPECT[v] || ['CS1003', `Syntax error, '${v}' expected`, ''];
    // Missing ; or ) are reported where the previous token ends, like Visual Studio does.
    const pv = this.prev();
    const at = (v === ';' || v === ')') && this.p > 0 ? { line: pv.endLine, col: pv.endCol } : this.tok;
    let extra = hint;
    if (v === ';' && this.tok.t !== 'eof' && this.tok.line === pv.endLine) extra = `Something unexpected was found: '${this.tok.v ?? ''}'. ${hint}`;
    this.fail(code, msg, at, extra);
  }
  node(type, props, at) { return { type, line: at.line, col: at.col, ...props }; }

  program() {
    const body = [];
    while (this.tok.t !== 'eof') {
      if (this.is('using')) { this.p++; while (!this.is(';') && this.tok.t !== 'eof') this.p++; this.expect(';'); continue; }
      if (this.is('}')) this.fail('CS1022', 'Type or namespace definition, or end-of-file expected', this.tok, 'There is an extra } here. Every } must close a { that was opened before it.');
      body.push(this.statement());
    }
    return { type: 'Program', body, line: 1, col: 1 };
  }

  isDeclStart() {
    const t = this.tok, n = this.peek();
    if (t.t === 'kw' && TYPE_KEYWORDS.has(t.v)) return true;
    if (t.t === 'id' && n.t === 'op' && n.v === '[' && this.peek(2).v === ']' && this.peek(3).t === 'id') return true;
    return t.t === 'id' && n.t === 'id';
  }
  // After a type name: optional [] makes it an array type.
  arraySuffix(type) {
    if (!this.is('[')) return type;
    const open = this.tok; this.p++;
    if (this.is(',')) this.fail('LAB', 'Arrays with several dimensions [,] are not part of this lab yet.', this.tok, 'Use a one-dimensional array: int[] heights.');
    if (!this.is(']')) this.fail('CS0270', "Array size cannot be specified in a variable declaration (try initializing with a 'new' expression)", open, `Write the size after new: ${type}[] name = new ${type}[5];`);
    this.p++;
    if (this.is('[')) this.fail('LAB', 'Arrays of arrays are not part of this lab.', this.tok);
    return type + '[]';
  }
  arrayItems() {
    const open = this.expect('{'), items = [];
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, 'The list of values that starts with { must end with }.');
      items.push(this.expression());
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return items;
  }

  isMethodStart() {
    const t = this.tok, n = this.peek(), n2 = this.peek(2);
    if (this.is('void') || this.is('static')) return true;
    const typeLike = (t.t === 'kw' && TYPE_KEYWORDS.has(t.v) && t.v !== 'var') || t.t === 'id';
    if (typeLike && n.v === '[' && n.t === 'op' && this.peek(2).v === ']') return this.peek(3).t === 'id' && this.peek(4).v === '(';
    return typeLike && n.t === 'id' && n2.t === 'op' && n2.v === '(';
  }

  methodDecl() {
    const start = this.tok;
    if (this.depth > 0 || this.inMethod) this.fail('LAB', 'In this lab, methods are written at the top level of the program, not inside { }.', start, 'Move the method below the main program, outside any { }.');
    if (this.eat('static')) { /* a static local function: allowed, same meaning here */ }
    const typeTok = this.tok;
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && (TYPE_KEYWORDS.has(typeTok.v) || typeTok.v === 'void')))) this.fail('CS1001', 'Identifier expected', typeTok, 'A method starts with the type of value it gives back (void if none), then its name: void Tower(int h)');
    if (typeTok.v === 'var') this.fail('CS0825', "The contextual keyword 'var' may only appear within a local variable declaration", typeTok, 'Write the real type the method gives back: int, string… or void.');
    this.p++;
    const returnType = typeTok.v === 'void' ? 'void' : this.arraySuffix(typeTok.v);
    const nameTok = this.tok;
    if (nameTok.t !== 'id') {
      if (nameTok.t === 'kw') this.fail('CS1041', `Identifier expected; '${nameTok.v}' is a keyword`, nameTok, `${nameTok.v} is a reserved word in C#. Choose another name for your method.`);
      this.fail('CS1001', 'Identifier expected', nameTok, 'After the type, write the name of the method: void Tower(int h)');
    }
    this.p++;
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      do {
        const pt = this.tok;
        if (!(pt.t === 'id' || (pt.t === 'kw' && TYPE_KEYWORDS.has(pt.v)))) this.fail('CS1001', 'Identifier expected', pt, 'Each parameter needs a type and a name: int h');
        if (pt.v === 'var') this.fail('CS0825', "The contextual keyword 'var' may only appear within a local variable declaration", pt, 'Parameters need a real type: int h, not var h.');
        this.p++;
        const ptype = this.arraySuffix(pt.v);
        const pn = this.tok;
        if (pn.t !== 'id') {
          if (pn.t === 'kw') this.fail('CS1041', `Identifier expected; '${pn.v}' is a keyword`, pn, `${pn.v} is a reserved word in C#. Choose another name.`);
          this.fail('CS1001', 'Identifier expected', pn, `After the type, write a name for the parameter: ${pt.v} value`);
        }
        this.p++;
        params.push({ varType: ptype, name: pn.v, line: pn.line, col: pn.col });
      } while (this.eat(','));
    }
    const close = this.expect(')');
    this.inMethod = true;
    let body;
    if (this.is('=>')) {
      const arrow = this.tok; this.p++;
      const value = this.expression();
      this.expect(';');
      const ret = returnType === 'void' ? this.node('ExprStmt', { expr: value }, value) : this.node('Return', { value }, arrow);
      body = this.node('Block', { body: [ret], endLine: arrow.line, arrow: true }, arrow);
    } else {
      if (this.is(';')) this.fail('CS1514', '{ expected', this.tok, 'A method needs a body: the instructions go between { and }.');
      body = this.block();
    }
    this.inMethod = false;
    return this.node('MethodDecl', { returnType, name: nameTok.v, params, body, nameLine: nameTok.line, nameCol: nameTok.col, headerEnd: close.line }, start);
  }

  statement() {
    const t = this.tok;
    if (this.is('{')) return this.block();
    if (this.isMethodStart()) return this.methodDecl();
    if (this.is('return')) {
      this.p++;
      const value = this.is(';') ? null : this.expression();
      this.expect(';');
      return this.node('Return', { value }, t);
    }
    if (this.is(';')) { this.p++; return this.node('Empty', {}, t); }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return this.ifStmt();
        case 'while': return this.whileStmt();
        case 'do': return this.doStmt();
        case 'for': return this.forStmt();
        case 'foreach': return this.foreachStmt();
        case 'break': case 'continue': this.p++; this.expect(';'); return this.node(t.v === 'break' ? 'Break' : 'Continue', {}, t);
        case 'else': this.fail('CS1525', "Invalid expression term 'else'", t, 'An else must come right after the } of an if block.');
        default:
          if (!TYPE_KEYWORDS.has(t.v) && !['true', 'false'].includes(t.v))
            this.fail('LAB', `'${t.v}' is valid C#, but it isn't part of this lab yet.`, t);
      }
    }
    let s;
    if (this.isDeclStart()) s = this.declaration();
    else s = this.simple();
    this.expect(';');
    return s;
  }

  block() {
    const open = this.expect('{'), body = [];
    this.depth++;
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, `The { on line ${open.line} is never closed.`);
      body.push(this.statement());
    }
    this.depth--;
    const close = this.expect('}');
    return this.node('Block', { body, endLine: close.line }, open);
  }

  declaration() {
    const typeTok = this.tok; this.p++;
    const varType = this.arraySuffix(typeTok.v);
    const decls = [];
    do {
      const n = this.tok;
      if (n.t !== 'id') {
        if (n.t === 'kw') this.fail('CS1041', `Identifier expected; '${n.v}' is a keyword`, n, `${n.v} is a reserved word in C#. Choose another name for your variable.`);
        this.fail('CS1001', 'Identifier expected', n, 'After the type, write a name for the variable: int count = 0;');
      }
      this.p++;
      let init = null;
      if (this.eat('=')) {
        if (this.is('{')) { const at = this.tok; init = this.node('ArrayInit', { items: this.arrayItems() }, at); }
        else init = this.expression();
      }
      else if (this.is('==')) this.fail('CS1002', '; expected', this.tok, 'To give a variable a value use a single = (== compares two values).');
      decls.push({ name: n.v, init, line: n.line, col: n.col });
    } while (this.eat(','));
    return this.node('VarDecl', { varType, decls }, typeTok);
  }

  simple() {
    const start = this.tok;
    if (this.is('++') || this.is('--')) { this.p++; const target = this.postfix(); return this.node('IncDec', { op: start.v, target, prefix: true }, start); }
    const e = this.expression();
    if (this.tok.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(this.tok.v)) {
      const op = this.tok.v; this.p++;
      const value = this.expression();
      return this.node('Assign', { op, target: e, value }, start);
    }
    if (this.is('++') || this.is('--')) { const op = this.tok.v; this.p++; return this.node('IncDec', { op, target: e }, start); }
    return this.node('ExprStmt', { expr: e }, start);
  }

  condition() {
    this.expect('(');
    const test = this.expression();
    if (this.is('=')) this.fail('CS0029', "'=' stores a value. To compare two values, use ==", this.tok, 'Write == to ask "is it equal?" and = to store a value.');
    this.expect(')');
    return test;
  }
  ifStmt() {
    const t = this.tok; this.p++;
    const test = this.condition();
    const cons = this.statement();
    let alt = null, elseLine = null;
    if (this.is('else')) { elseLine = this.tok.line; this.p++; alt = this.statement(); }
    return this.node('If', { test, cons, alt, elseLine }, t);
  }
  whileStmt() { const t = this.tok; this.p++; const test = this.condition(); return this.node('While', { test, body: this.statement() }, t); }
  doStmt() {
    const t = this.tok; this.p++;
    const body = this.statement();
    const w = this.tok;
    if (!this.is('while')) this.fail('CS1003', "Syntax error, 'while' expected", w);
    this.p++;
    const test = this.condition(); this.expect(';');
    return this.node('Do', { body, test, whileLine: w.line }, t);
  }
  forStmt() {
    const t = this.tok; this.p++;
    this.expect('(');
    let init = null, test = null, update = null;
    if (!this.is(';')) init = this.isDeclStart() ? this.declaration() : this.simple();
    this.expect(';');
    if (!this.is(';')) test = this.expression();
    if (this.is('=')) this.fail('CS0029', "'=' stores a value. To compare two values, use ==", this.tok);
    this.expect(';');
    if (!this.is(')')) update = this.simple();
    if (this.is(',')) this.fail('LAB', 'Several updates separated by commas are not part of this lab.', this.tok);
    this.expect(')');
    return this.node('For', { init, test, update, body: this.statement() }, t);
  }

  foreachStmt() {
    const t = this.tok; this.p++;
    this.expect('(');
    const typeTok = this.tok;
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && TYPE_KEYWORDS.has(typeTok.v)))) this.fail('CS1525', `Invalid expression term '${typeTok.v}'`, typeTok, 'foreach starts with the type and the name of the item: foreach (int h in heights)');
    this.p++;
    const varType = this.arraySuffix(typeTok.v);
    const n = this.tok;
    if (n.t !== 'id') this.fail('CS1001', 'Identifier expected', n, 'Write a name for each item: foreach (int h in heights)');
    this.p++;
    if (!this.is('in')) this.fail('CS1515', "'in' expected", this.tok, 'foreach (type name in array)');
    this.p++;
    const collection = this.expression();
    this.expect(')');
    return this.node('Foreach', { varType, name: n.v, nameLine: n.line, nameCol: n.col, collection, body: this.statement() }, t);
  }

  expression() { return this.ternary(); }
  ternary() {
    const c = this.binary(0);
    if (this.is('?')) { this.p++; const a = this.expression(); this.expect(':'); const b = this.expression(); return { type: 'Cond', test: c, a, b, line: c.line, col: c.col }; }
    return c;
  }
  binary(level) {
    const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
    if (level === LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    while (this.tok.t === 'op' && LEVELS[level].includes(this.tok.v)) {
      const op = this.tok; this.p++;
      const right = this.binary(level + 1);
      left = { type: 'Binary', op: op.v, left, right, line: left.line, col: left.col, opLine: op.line, opCol: op.col };
    }
    if (level === 1 && (this.is('&') || this.is('|'))) this.fail('LAB', `Use ${this.tok.v}${this.tok.v} for logical ${this.tok.v === '&' ? 'AND' : 'OR'}.`, this.tok);
    return left;
  }
  unary() {
    const t = this.tok;
    if (this.is('!') || this.is('-') || this.is('+')) { this.p++; return this.node('Unary', { op: t.v, arg: this.unary() }, t); }
    if (this.is('++') || this.is('--')) this.fail('LAB', `Use ${t.v} as its own instruction (i${t.v};), not inside another expression.`, t);
    if (this.is('(') && this.peek().t === 'kw' && ['int', 'float', 'double'].includes(this.peek().v) && this.peek(2).v === ')') {
      this.p++; const to = this.tok.v; this.p += 2;
      return this.node('Cast', { to, arg: this.unary() }, t);
    }
    return this.postfix();
  }
  postfix() {
    let e = this.primary();
    for (;;) {
      if (this.is('.')) {
        this.p++;
        const n = this.tok;
        if (n.t !== 'id') this.fail('CS1001', 'Identifier expected', n, 'After a dot, write the name of a property or method, like drone.Move');
        this.p++;
        e = { type: 'Member', object: e, name: n.v, line: e.line, col: e.col, nameLine: n.line, nameCol: n.col };
        continue;
      }
      if (this.is('(')) {
        this.p++;
        const args = [];
        if (!this.is(')')) { do { args.push(this.expression()); } while (this.eat(',')); }
        this.expect(')');
        e = { type: 'Call', callee: e, args, line: e.line, col: e.col };
        continue;
      }
      if (this.is('[')) {
        this.p++;
        const index = this.expression();
        this.expect(']');
        e = { type: 'Index', object: e, index, line: e.line, col: e.col };
        continue;
      }
      return e;
    }
  }
  newExpr() {
    const t = this.tok; this.p++;
    const typeTok = this.tok;
    if (typeTok.t === 'op' && typeTok.v === '[') this.fail('LAB', 'Write the type of the array after new: new int[] { … }', typeTok);
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && TYPE_KEYWORDS.has(typeTok.v) && typeTok.v !== 'var'))) this.fail('CS1526', 'A new expression requires an argument list or (), [], or {} after type', typeTok);
    this.p++;
    if (this.is('(')) this.fail('LAB', `Creating objects with new ${typeTok.v}() is part of Code Lab 02 (objects).`, this.tok, 'Here new is only used to create arrays: new int[5]');
    if (!this.is('[')) this.fail('CS1526', 'A new expression requires an argument list or (), [], or {} after type', this.tok, `To create an array: new ${typeTok.v}[5]`);
    this.p++;
    if (this.is(']')) {
      this.p++;
      if (!this.is('{')) this.fail('CS1586', 'Array creation must have array size or array initializer', this.tok, `Give a size, new ${typeTok.v}[5], or the values, new ${typeTok.v}[] { 1, 2, 3 }.`);
      return this.node('NewArray', { elem: typeTok.v, items: this.arrayItems() }, t);
    }
    if (this.is(',')) this.fail('LAB', 'Arrays with several dimensions [,] are not part of this lab yet.', this.tok);
    const size = this.expression();
    this.expect(']');
    if (this.is('{')) this.fail('LAB', 'Give either the size or the values, not both.', this.tok, `new ${typeTok.v}[] { 1, 2, 3 } works out the size by itself.`);
    return this.node('NewArray', { elem: typeTok.v, size }, t);
  }
  primary() {
    const t = this.tok;
    switch (t.t) {
      case 'num': this.p++; return this.node('Num', { value: t.v, ty: t.ty, raw: t.raw }, t);
      case 'str': this.p++; return this.node('Str', { value: t.v }, t);
      case 'chr': this.p++; return this.node('Char', { value: t.v }, t);
      case 'istr': {
        this.p++;
        const parts = t.parts.map(p => {
          if (typeof p === 'string') return p;
          const sub = new Parser(tokenize(p.src, p.line, p.col));
          const e = sub.expression();
          if (sub.tok.t !== 'eof') sub.fail('CS1026', ') expected', sub.tok);
          return e;
        });
        return this.node('Interp', { parts }, t);
      }
      case 'id': this.p++; return this.node('Ident', { name: t.v }, t);
      case 'kw':
        if (t.v === 'true' || t.v === 'false') { this.p++; return this.node('Bool', { value: t.v === 'true' }, t); }
        if (t.v === 'new') return this.newExpr();
        if (TYPE_KEYWORDS.has(t.v)) this.fail('CS1525', `Invalid expression term '${t.v}'`, t, `${t.v} is a type. To create a variable write: ${t.v} name = value;`);
        this.fail('LAB', `'${t.v}' is valid C#, but it isn't part of this lab yet.`, t);
        break;
      case 'op':
        if (t.v === '(') { this.p++; const e = this.expression(); this.expect(')'); return this.node('Paren', { expr: e }, t); }
        if (t.v === '{') this.fail('CS1525', "Invalid expression term '{'", t, 'Here, create the array with new: new int[] { 1, 2, 3 }');
        break;
      case 'eof':
        this.fail('CS1733', 'Expected expression', t, 'The program ends in the middle of an instruction.');
    }
    this.fail('CS1525', `Invalid expression term '${t.v}'`, t, 'A value, a variable or a calculation was expected here.');
  }
}

// Calculator mode: every line is one calculation, declaration or assignment.
// No semicolons needed (like C# Interactive). Used for the very first lessons.
function parseCalc(tokens) {
  const body = [], groups = new Map();
  for (const t of tokens) {
    if (t.t === 'eof') continue;
    if (!groups.has(t.line)) groups.set(t.line, []);
    groups.get(t.line).push(t);
  }
  for (const [line, toks] of groups) {
    const last = toks.at(-1);
    const p = new Parser([...toks, { t: 'eof', v: '', line, col: last.endCol, endLine: line, endCol: last.endCol }]);
    if (p.tok.t === 'kw' && !TYPE_KEYWORDS.has(p.tok.v) && !['true', 'false'].includes(p.tok.v))
      p.fail('LAB', `'${p.tok.v}' is not used in the calculator.`, p.tok, 'Here each line is just a calculation, like 2 + 3.');
    const stmt = p.isDeclStart() ? p.declaration() : p.simple();
    p.eat(';');
    if (p.tok.t !== 'eof') {
      if (/^_{2,}$/.test(p.tok.v)) p.fail('LAB', 'Fill in the blank ___', p.tok, 'Replace ___ with the missing piece. Here it goes between two values, so it is probably an operator.');
      if (p.tok.v === '=>') p.fail('LAB', "'=>' is not a comparison. Did you mean >= ?", p.tok, 'Greater than or equal is written >= : the > goes first.');
      if (stmt.type === 'VarDecl' && p.tok.t === 'id') p.fail('LAB', "A name can't contain spaces", p.tok, `Join the words and start each new word with a capital letter: ${stmt.decls.at(-1).name}${p.tok.v[0].toUpperCase()}${p.tok.v.slice(1)}`);
      if (p.is(',') && toks.some(t => t.t === 'num')) p.fail('LAB', "Decimals use a point, not a comma", p.tok, 'Write 3.5, not 3,5.');
      p.fail('LAB', `Unexpected '${p.tok.v}'`, p.tok, 'Write one calculation per line. Did you forget an operator such as + or *?');
    }
    body.push({ type: 'Calc', stmt, line, col: toks[0].col });
  }
  return { type: 'Program', body, line: 1, col: 1, calc: true };
}

// ─── Lab API (the drone, Console, Math) ──────────────────────────────────────
export const DRONE_PROPS = { X: 'int', Z: 'int', Height: 'int', Ground: 'Color' };
export const METHODS = {
  'Drone.Move': { overloads: [['Direction'], ['Direction', 'int']], returns: 'void' },
  'Drone.MoveTo': { overloads: [['int', 'int']], returns: 'void' },
  'Drone.Place': { overloads: [[], ['Color']], returns: 'void' },
  'Drone.Build': { overloads: [['int'], ['int', 'Color']], returns: 'void' },
  'Console.WriteLine': { overloads: [[], ['any']], returns: 'void' },
  'Console.Write': { overloads: [['any']], returns: 'void' },
  'Math.Abs': { overloads: [['number']], returns: 'arg' },
  'Math.Max': { overloads: [['number', 'number']], returns: 'widest' },
  'Math.Min': { overloads: [['number', 'number']], returns: 'widest' },
  'Math.Sqrt': { overloads: [['double']], returns: 'double' },
  'Math.Pow': { overloads: [['double', 'double']], returns: 'double' },
  'Math.Floor': { overloads: [['double']], returns: 'double' },
  'Math.Round': { overloads: [['double']], returns: 'double' },
};
export const STRING_METHODS = {
  ToUpper: { overloads: [[]], returns: 'string' }, ToLower: { overloads: [[]], returns: 'string' }, Trim: { overloads: [[]], returns: 'string' },
  Substring: { overloads: [['int'], ['int', 'int']], returns: 'string' },
  Contains: { overloads: [['string'], ['char']], returns: 'bool' },
  IndexOf: { overloads: [['string'], ['char']], returns: 'int' },
  Replace: { overloads: [['string', 'string'], ['char', 'char']], returns: 'string' },
  StartsWith: { overloads: [['string']], returns: 'bool' }, EndsWith: { overloads: [['string']], returns: 'bool' },
};
const methodNames = cls => Object.keys(METHODS).filter(k => k.startsWith(cls + '.')).map(k => k.split('.')[1]);

// Sub-expressions of an expression node, in evaluation order.
function kidsOf(e) {
  const out = [];
  for (const k of ['object', 'left', 'right', 'arg', 'expr', 'index', 'test', 'a', 'b', 'callee']) if (e[k] && typeof e[k] === 'object') out.push(e[k]);
  if (e.args) out.push(...e.args);
  if (e.items) out.push(...e.items);
  if (e.size) out.push(e.size);
  if (e.type === 'Interp') for (const p of e.parts) if (typeof p !== 'string') out.push(p);
  return out;
}
// Does this expression contain a call to one of the student's own methods?
export const hasUserCall = e => !!e && (!!e.userCall || !!e.hasUserCall || (e.type === 'Member' && hasUserCall(e.object)));
export const signature = m => `${m.name}(${m.params.map(p => p.varType).join(', ')})`;

// Names declared inside a statement list (used for friendlier "does not exist" hints).
function declaredNames(stmts, out = new Map()) {
  const visit = s => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'MethodDecl') return;
    if (s.type === 'VarDecl') for (const d of s.decls) if (!out.has(d.name)) out.set(d.name, d.line);
    if (s.type === 'Foreach' && !out.has(s.name)) out.set(s.name, s.nameLine);
    for (const k of ['body', 'cons', 'alt', 'init', 'update']) {
      const v = s[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && v.type) visit(v);
    }
  };
  stmts.forEach(visit);
  return out;
}
// Can execution run past the end of this statement? (for CS0161 and CS0162)
function alwaysReturns(s) {
  if (!s) return false;
  switch (s.type) {
    case 'Return': return true;
    case 'Block': return s.body.some(alwaysReturns);
    case 'If': return !!s.alt && alwaysReturns(s.cons) && alwaysReturns(s.alt);
  }
  return false;
}

// ─── Checker (what the C# compiler verifies before running) ──────────────────
class Checker {
  constructor() {
    this.errors = []; this.warnings = [];
    this.scopes = [];
    this.loops = 0;
    this.stats = { features: new Set(), declTypes: new Set(), statements: 0, methods: new Set(), numbers: [], userMethods: new Set(), calls: new Map(), returns: 0 };
    this.reportedUnassigned = new Set();
    this.userMethods = new Map();
    this.method = null;       // the method being checked (null = main program)
    this.mainNames = new Map();
    this.methodLocals = new Map(); // name → method name, for hints in the main program
  }
  error(code, message, at, hint = '') {
    if (this.errors.some(e => e.line === at.line && e.code === code && e.message === message)) return;
    this.errors.push(new CSharpError({ code, message, line: at.line, col: at.col, hint }));
  }
  lookup(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].get(name); if (v) return v; } return null; }
  allNames() { return this.scopes.flatMap(s => [...s.keys()]); }

  program(ast) {
    // Methods can be called before the line where they are written (like C# local functions).
    const decls = ast.body.filter(s => s.type === 'MethodDecl');
    this.mainNames = declaredNames(ast.body.filter(s => s.type !== 'MethodDecl'));
    for (const m of decls) {
      if (this.userMethods.has(m.name) || m.name === 'drone') {
        this.error('CS0128', `A local variable or function named '${m.name}' is already defined in this scope`, { line: m.nameLine, col: m.nameCol }, `There is already a method called ${m.name}. Give each method its own name.`);
        continue;
      }
      if (STATIC_CLASSES.includes(m.name)) { this.error('LAB', `'${m.name}' is already used by C#. Choose another name for your method.`, { line: m.nameLine, col: m.nameCol }); continue; }
      m.resolvedReturn = m.returnType === 'void' ? 'void' : this.resolveType(m.returnType, m);
      for (const p of m.params) p.resolvedType = this.resolveType(p.varType, p);
      this.userMethods.set(m.name, m);
      this.stats.userMethods.add(m.name);
      this.stats.features.add('method');
      for (const [n] of declaredNames(m.body.body)) if (!this.methodLocals.has(n)) this.methodLocals.set(n, m.name);
      for (const p of m.params) if (!this.methodLocals.has(p.name)) this.methodLocals.set(p.name, m.name);
    }
    this.scopes.push(new Map());
    let A = new Set();
    for (const s of ast.body) if (s.type !== 'MethodDecl') A = this.stmt(s, A);
    this.scopes.pop();
    for (const m of decls) if (this.userMethods.get(m.name) === m) this.methodBody(m);
    for (const m of decls) if (this.userMethods.get(m.name) === m && !this.stats.calls.has(m.name))
      this.warnings.push(new CSharpError({ code: 'CS8321', message: `The local function '${m.name}' is declared but never used`, line: m.nameLine, col: m.nameCol, hint: `Writing a method does not run it. Call it with ${m.name}(${m.params.map(p => p.name).join(', ')});` }));
  }
  methodBody(m) {
    const saved = { scopes: this.scopes, loops: this.loops };
    this.method = m; this.loops = 0;
    const params = new Map();
    let A = new Set();
    for (const p of m.params) {
      if (params.has(p.name)) { this.error('CS0100', `The parameter name '${p.name}' is a duplicate`, p, 'Each parameter needs a different name.'); continue; }
      if (p.name === 'drone') { this.error('CS0136', `A local or parameter named 'drone' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, p, 'drone is already the name of your drone.'); continue; }
      const v = { name: p.name, type: p.resolvedType, line: p.line, param: true };
      params.set(p.name, v); A.add(v);
    }
    this.scopes = [params];
    this.block(m.body, A);
    if (m.resolvedReturn && m.resolvedReturn !== 'void' && !alwaysReturns(m.body))
      this.error('CS0161', `'${signature(m)}': not all code paths return a value`, { line: m.nameLine, col: m.nameCol }, `${m.name} promises to give back a value of type ${m.resolvedReturn}, so every way through it must end with return …;`);
    this.scopes = saved.scopes; this.loops = saved.loops; this.method = null;
  }
  block(s, A) {
    this.scopes.push(new Map());
    let warned = false;
    for (let i = 0; i < s.body.length; i++) {
      const st = s.body[i];
      A = this.stmt(st, A);
      if (!warned && i < s.body.length - 1 && alwaysReturns(st) && s.body[i + 1].type !== 'MethodDecl') {
        warned = true;
        const nx = s.body[i + 1];
        this.warnings.push(new CSharpError({ code: 'CS0162', message: 'Unreachable code detected', line: nx.line, col: nx.col, hint: 'return leaves the method straight away: the lines after it never run.' }));
      }
    }
    this.scopes.pop();
    return A;
  }
  body(s, A) { return s.type === 'Block' ? this.block(s, A) : this.stmt(s, A); }

  stmt(s, A) {
    if (s.type !== 'Block' && s.type !== 'Empty' && s.type !== 'Calc') this.stats.statements++;
    switch (s.type) {
      case 'Calc':
        if (s.stmt.type === 'ExprStmt') { this.stats.statements++; this.type(s.stmt.expr, A); return A; }
        return this.stmt(s.stmt, A);
      case 'Block': return this.block(s, A);
      case 'Empty': return A;
      case 'VarDecl': return this.varDecl(s, A);
      case 'Assign': return this.assign(s, A);
      case 'IncDec': {
        const v = this.target(s.target, A, true);
        if (v && !isNum(v.type)) this.error('CS0023', `Operator '${s.op}' cannot be applied to operand of type '${v.type}'`, s);
        return A;
      }
      case 'ExprStmt': {
        const t = this.type(s.expr, A);
        if (s.expr.type !== 'Call' && t !== null) {
          const hint = s.expr.type === 'Binary' && s.expr.op === '==' ? 'Did you mean = to store a value? == only compares.' :
            s.expr.type === 'Member' && s.expr.ty === 'void' ? '' : 'An instruction must do something: call a method, assign a value or change a variable.';
          this.error('CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement', s, hint);
        }
        return A;
      }
      case 'If': {
        this.stats.features.add('if');
        if (s.alt) this.stats.features.add('else');
        this.cond(s.test, A);
        if (s.cons.type === 'Empty') this.warnings.push(new CSharpError({ code: 'CS0642', message: 'Possible mistaken empty statement', line: s.cons.line, col: s.cons.col, hint: 'The ; right after if (...) ends the if. The next lines will always run.' }));
        const a1 = this.body(s.cons, new Set(A));
        const a2 = s.alt ? this.body(s.alt, new Set(A)) : new Set(A);
        return new Set([...a1].filter(v => a2.has(v)));
      }
      case 'While': case 'Do': case 'For': return this.loop(s, A);
      case 'Foreach': return this.foreachStmt(s, A);
      case 'MethodDecl': return A;
      case 'Return': return this.returnStmt(s, A);
      case 'Break': case 'Continue':
        if (!this.loops) this.error('CS0139', `No enclosing loop out of which to break or continue`, s, `${s.type.toLowerCase()} only works inside a loop.`);
        return A;
    }
    return A;
  }

  loop(s, A) {
    const feature = { While: 'while', Do: 'while', For: 'for' }[s.type];
    this.stats.features.add(feature);
    if (this.loops) this.stats.features.add('nestedLoop');
    this.loops++;
    let out = A;
    if (s.type === 'While') { this.cond(s.test, A); this.body(s.body, new Set(A)); }
    else if (s.type === 'Do') { const a = this.body(s.body, new Set(A)); this.cond(s.test, a); out = a; }
    else {
      this.scopes.push(new Map());
      let a = new Set(A);
      if (s.init) a = this.stmt(s.init, a), this.stats.statements--;
      if (s.test) this.cond(s.test, a);
      const b = this.body(s.body, new Set(a));
      if (s.update) this.stmt(s.update, b), this.stats.statements--;
      this.scopes.pop();
    }
    this.loops--;
    return out;
  }

  returnStmt(s, A) {
    this.stats.features.add('return');
    this.stats.returns++;
    const m = this.method;
    if (!m) {
      if (s.value) this.type(s.value, A);
      this.error('LAB', 'return is used inside a method, to finish it and give back a value.', s, 'The main program simply ends after its last line.');
      return A;
    }
    const want = m.resolvedReturn;
    if (want === 'void') {
      if (s.value) { this.type(s.value, A); this.error('CS0127', `Since '${signature(m)}' returns void, a return keyword must not be followed by an object expression`, s, `${m.name} is void: it does not give anything back. Write just return; or change void to the type you want to return.`); }
      return A;
    }
    if (!s.value) { this.error('CS0126', `An object of a type convertible to '${want}' is required`, s, `${m.name} must give back a value of type ${want}: return value;`); return A; }
    const t = this.type(s.value, A);
    if (t && want) this.convertible(s.value, t, want);
    return A;
  }

  foreachStmt(s, A) {
    this.stats.features.add('foreach');
    if (this.loops) this.stats.features.add('nestedLoop');
    const ct = this.type(s.collection, A);
    let item = null;
    if (ct) {
      if (isArr(ct)) item = elemOf(ct);
      else if (ct === 'string') item = 'char';
      else this.error('CS1579', `foreach statement cannot operate on variables of type '${ct}' because '${ct}' does not contain a public instance or extension definition for 'GetEnumerator'`, s.collection, 'foreach goes through the items of an array (or the characters of a string). To repeat a number of times, use for.');
    }
    let type = s.varType === 'var' ? item : this.resolveType(s.varType, s);
    if (type && item && s.varType !== 'var' && !implicitOK(item, type)) {
      this.error('CS0030', `Cannot convert type '${item}' to '${type}'`, s, `The items are of type ${item}: foreach (${item} ${s.name} in …)`);
      type = null;
    }
    this.scopes.push(new Map());
    const existing = this.lookup(s.name);
    if (existing) this.error('CS0136', `A local or parameter named '${s.name}' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, { line: s.nameLine, col: s.nameCol }, `${s.name} already exists (line ${existing.line}). Pick a different name.`);
    const v = { name: s.name, type, line: s.nameLine, foreachVar: true };
    s.resolvedType = type; s.itemType = item;
    this.scopes.at(-1).set(s.name, v);
    this.loops++;
    this.body(s.body, new Set(A).add(v));
    this.loops--;
    this.scopes.pop();
    return A;
  }

  cond(e, A) {
    const t = this.type(e, A);
    if (t && t !== 'bool') this.error('CS0029', `Cannot implicitly convert type '${t}' to 'bool'`, e, 'A condition must be true or false, for example x > 3 or x == 0.');
  }

  resolveType(name, at) {
    if (VALUE_TYPES.includes(name)) return name;
    if (isArr(name)) { const el = this.resolveType(elemOf(name), at); if (el) this.stats.features.add('array'); return el ? el + '[]' : null; }
    const s = suggest(name, VALUE_TYPES);
    this.error('CS0246', `The type or namespace name '${name}' could not be found`, at, s ? `Did you mean ${s}? C# is case-sensitive.` : 'Available types here: int, float, double, bool, string, Color, Direction.');
    return null;
  }

  varDecl(s, A) {
    this.stats.features.add('variable');
    const declared = s.varType === 'var' ? 'var' : this.resolveType(s.varType, s);
    for (const d of s.decls) {
      let type = declared;
      if (d.init && d.init.type === 'ArrayInit') {
        if (declared === 'var') { this.error('CS0820', 'Cannot initialize an implicitly-typed variable with an array initializer', d.init, 'With var, write the type of the array: var heights = new int[] { 1, 2, 3 };'); type = null; }
        else if (declared && !isArr(declared)) { this.error('CS0622', 'Can only use array initializer expressions to assign to array types. Try using a new expression instead.', d.init, `{ … } holds several values. For an array, write the type with []: ${declared}[] ${d.name} = { … };`); type = null; }
        else if (declared) this.arrayItemsCheck(d.init, elemOf(declared), A);
      } else if (d.init) {
        const t = this.type(d.init, A);
        if (declared === 'var') {
          type = t;
          if (t === 'void') { this.error('CS0815', 'Cannot assign void to an implicitly-typed variable', d.init, 'This method does not give back a value.'); type = null; }
        } else if (type && t) this.convertible(d.init, t, type);
      } else if (declared === 'var') {
        this.error('CS0818', 'Implicitly-typed variables must be initialized', d, 'With var, C# works out the type from the value: var count = 0;');
        type = null;
      }
      const existing = this.lookup(d.name);
      if (d.name === 'drone') this.error('CS0136', `A local variable named 'drone' cannot be declared in this scope because it would give a different meaning to 'drone'`, d, 'drone is already the name of your drone.');
      else if (existing) {
        if (this.scopes.at(-1).has(d.name)) this.error('CS0128', `A local variable or function named '${d.name}' is already defined in this scope`, d, `${d.name} was created on line ${existing.line}. To change its value write ${d.name} = …; without the type.`);
        else this.error('CS0136', `A local or parameter named '${d.name}' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, d, `${d.name} already exists (line ${existing.line}). Pick a different name.`);
      }
      const v = { name: d.name, type, line: d.line };
      d.resolvedType = type;
      if (!existing) this.scopes.at(-1).set(d.name, v);
      if (type) this.stats.declTypes.add(type);
      if (d.init) A = new Set(A).add(v);
    }
    return A;
  }

  arrayItemsCheck(node, elem, A) {
    node.elemType = elem;
    this.stats.features.add('array');
    for (const it of node.items) { const t = this.type(it, A); if (t) this.convertible(it, t, elem); }
  }

  convertible(node, from, to) {
    if (from === 'void') { this.error('CS0029', `Cannot implicitly convert type 'void' to '${to}'`, node, 'This method does not give back a value.'); return false; }
    if (implicitOK(from, to)) return true;
    if (node.type === 'Num' && from === 'double' && to === 'float')
      this.error('CS0664', "Literal of type double cannot be implicitly converted to type 'float'; use an 'F' suffix to create a literal of this type", node, `Write ${node.raw}f to make it a float.`);
    else if (isNum(from) && isNum(to))
      this.error('CS0266', `Cannot implicitly convert type '${from}' to '${to}'. An explicit conversion exists (are you missing a cast?)`, node,
        to === 'int' ? `An int can't hold decimals. Use (int) to cut them off, or make the variable a ${from}.` : `A ${to} is less precise than a ${from}. Use (${to}) to convert it.`);
    else {
      let hint = '';
      if (isArr(from) && elemOf(from) === to) hint = 'An array holds many values. Pick one with [i], or count them with .Length.';
      else if (isArr(to) && elemOf(to) === from) hint = `To store several values, create an array: { 1, 2, 3 } or new ${from}[3].`;
      else if (from === 'string' && to === 'Color') hint = 'Colors are written Color.Red, not "Red".';
      else if (from === 'string' && isNum(to)) hint = 'Numbers are written without quotes: 3, not "3".';
      else if (isNum(from) && to === 'string') hint = 'Text needs quotes: "3". Or convert the number with .ToString().';
      else if (from === 'string' && to === 'bool') hint = 'Write true or false without quotes.';
      this.error('CS0029', `Cannot implicitly convert type '${from}' to '${to}'`, node, hint);
    }
    return false;
  }

  target(e, A, mustBeAssigned) {
    if (e.type === 'Index') {
      const t = this.type(e.object, A), it = this.type(e.index, A);
      if (!t) return null;
      if (t === 'string') { this.error('CS0200', "Property or indexer 'string.this[int]' cannot be assigned to -- it is read only", e, 'The characters of a string cannot be changed one by one. Build a new string instead.'); return null; }
      if (!isArr(t)) { this.error('CS0021', `Cannot apply indexing with [] to an expression of type '${t}'`, e); return null; }
      if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
      this.stats.features.add('arrayWrite');
      e.ty = elemOf(t);
      return { name: show(e), type: elemOf(t), element: true };
    }
    if (e.type === 'Member') {
      const objType = this.type(e.object, A);
      if (e.name === 'Length' && (isArr(objType) || objType === 'string')) this.error('CS0200', `Property or indexer '${isArr(objType) ? 'Array' : 'string'}.Length' cannot be assigned to -- it is read only`, e, isArr(objType) ? 'An array keeps the size it was created with. Create a new array to get a different size.' : 'The length of a string changes only when its text changes.');
      else if (objType === 'Drone' && e.name in DRONE_PROPS) this.error('CS0200', `Property or indexer 'Drone.${e.name}' cannot be assigned to -- it is read only`, e, 'Use drone.Move(...) or drone.MoveTo(x, z) to change where the drone is.');
      else this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e);
      return null;
    }
    if (e.type !== 'Ident') { this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e); return null; }
    const v = this.lookup(e.name);
    if (!v) { this.unknownName(e); return null; }
    if (v.foreachVar) { this.error('CS1656', `Cannot assign to '${e.name}' because it is a 'foreach iteration variable'`, e, 'foreach only reads the items. To change them, use a for loop and write array[i] = …;'); return null; }
    if (mustBeAssigned && !A.has(v)) this.unassigned(e, v);
    e.ty = v.type;
    return v;
  }

  assign(s, A) {
    this.stats.features.add('assign');
    const v = this.target(s.target, A, s.op !== '=');
    const t = this.type(s.value, A);
    if (!v || !v.type || !t) return A;
    if (s.op === '=') { this.convertible(s.value, t, v.type); return v.element ? A : new Set(A).add(v); }
    const r = this.binaryType(s.op[0], v.type, t, s);
    if (r && !implicitOK(r, v.type)) this.convertible(s.value, r, v.type);
    return A;
  }

  unassigned(e, v) {
    if (this.reportedUnassigned.has(v)) return;
    this.reportedUnassigned.add(v);
    this.error('CS0165', `Use of unassigned local variable '${e.name}'`, e, `${e.name} was created without a value (line ${v.line}). Give it one first: ${e.name} = …;`);
  }

  unknownName(e) {
    const name = e.name;
    if (/^_{2,}$/.test(name)) { this.error('LAB', 'Fill in the blank ___', e, 'Replace ___ with a value, a variable or a calculation.'); return; }
    let hint = '';
    if (name === 'True' || name === 'False') hint = `In C#, ${name.toLowerCase()} is written in lowercase.`;
    else if (['Move', 'MoveTo', 'Place', 'Build'].includes(name)) hint = `${name} belongs to the drone. Write drone.${name}(...).`;
    else if (name === 'WriteLine') hint = 'WriteLine belongs to the Console. Write Console.WriteLine(...).';
    else if (['Red', 'Blue', 'Green', 'Yellow', 'White', 'Orange', 'Purple', 'Black'].includes(name)) hint = `Colors are written Color.${name}.`;
    else if (DIRECTIONS.includes(name)) hint = `Directions are written Direction.${name}.`;
    else if (this.method && this.mainNames.has(name)) {
      this.error('LAB', `'${name}' belongs to the main program, not to ${this.method.name}`, e, `A method only sees its parameters and its own variables. Pass ${name} in as a parameter: ${this.method.name}(…, int ${name}).`);
      return;
    }
    else if (!this.method && this.methodLocals.has(name)) hint = `${name} only exists inside the method ${this.methodLocals.get(name)}. To get a value out of a method, use return.`;
    else if (this.method && this.methodLocals.has(name) && this.methodLocals.get(name) !== this.method.name) hint = `${name} only exists inside the method ${this.methodLocals.get(name)}. Each method has its own variables.`;
    else {
      const s = suggest(name, [...this.allNames(), ...this.userMethods.keys(), 'drone', ...STATIC_CLASSES]);
      hint = s ? `Did you mean ${s}? Names in C# are case-sensitive.` : `Create it first, for example: int ${name} = 0;`;
    }
    this.error('CS0103', `The name '${name}' does not exist in the current context`, e, hint);
  }

  staticClass(e) {
    return e.type === 'Ident' && STATIC_CLASSES.includes(e.name) && !this.lookup(e.name) ? e.name : null;
  }

  type(e, A) { const t = this.infer(e, A); e.ty = t; e.hasUserCall = !!e.userCall || kidsOf(e).some(hasUserCall); return t; }
  infer(e, A) {
    switch (e.type) {
      case 'Num': this.stats.numbers.push(e.value); return e.ty;
      case 'Str': return 'string';
      case 'Char': return 'char';
      case 'Bool': return 'bool';
      case 'Index': {
        const t = this.type(e.object, A), it = this.type(e.index, A);
        if (!t) return null;
        if (t !== 'string' && !isArr(t)) { this.error('CS0021', `Cannot apply indexing with [] to an expression of type '${t}'`, e, 'Only arrays and text (string) can be read item by item with [ ].'); return null; }
        if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
        if (isArr(t)) { this.stats.features.add('arrayIndex'); return elemOf(t); }
        this.stats.features.add('index');
        return 'char';
      }
      case 'Interp': if (e.parts.some(x => typeof x !== 'string')) this.stats.features.add('interpolation'); for (const p of e.parts) if (typeof p !== 'string') { const t = this.type(p, A); if (t === 'void') this.error('CS0029', "Cannot implicitly convert type 'void' to 'object'", p); } return 'string';
      case 'Paren': return this.type(e.expr, A);
      case 'ArrayInit': this.error('CS1525', "Invalid expression term '{'", e, 'Here, create the array with new: new int[] { 1, 2, 3 }'); return null;
      case 'NewArray': {
        const el = this.resolveType(e.elem, e);
        this.stats.features.add('newArray'); this.stats.features.add('array');
        if (e.size) {
          const st = this.type(e.size, A);
          if (st && st !== 'int') this.error('CS0029', `Cannot implicitly convert type '${st}' to 'int'`, e.size, 'The size of an array is a whole number.');
          if (e.size.type === 'Unary' && e.size.op === '-' && e.size.arg.type === 'Num') this.error('CS0248', 'Cannot create an array with a negative size', e.size);
        } else if (el) this.arrayItemsCheck(e, el, A);
        return el ? el + '[]' : null;
      }
      case 'Ident': {
        if (e.name === 'drone' && !this.lookup('drone')) return 'Drone';
        if (this.staticClass(e)) { this.error('CS0119', `'${e.name}' is a type, which is not valid in the given context`, e, e.name === 'Color' ? 'Choose one color: Color.Red' : ''); return null; }
        const v = this.lookup(e.name);
        if (!v && this.userMethods.has(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method. To run it, add brackets: ${e.name}(…)`); return null; }
        if (!v) { this.unknownName(e); return null; }
        if (!A.has(v)) this.unassigned(e, v);
        return v.type;
      }
      case 'Member': return this.member(e, A);
      case 'Call': return this.call(e, A);
      case 'Unary': {
        const t = this.type(e.arg, A);
        if (!t) return null;
        if (e.op === '!') { if (t !== 'bool') { this.error('CS0023', `Operator '!' cannot be applied to operand of type '${t}'`, e); return null; } return 'bool'; }
        if (!isNum(t)) { this.error('CS0023', `Operator '${e.op}' cannot be applied to operand of type '${t}'`, e); return null; }
        return t;
      }
      case 'Binary': {
        if (e.op === '&&' || e.op === '||') this.stats.features.add('logic');
        if (e.op === '%') this.stats.features.add('modulo');
        const l = this.type(e.left, A), r = this.type(e.right, A);
        if (!l || !r) return null;
        if ((e.op === '/' || e.op === '%') && l === 'int' && r === 'int' && e.right.type === 'Num' && e.right.value === 0) {
          this.error('CS0020', 'Division by constant zero', e.right, 'Nothing can be divided by 0.'); return 'int';
        }
        return this.binaryType(e.op, l, r, e);
      }
      case 'Cast': {
        const t = this.type(e.arg, A);
        if (t && !isNum(t)) { this.error('CS0030', `Cannot convert type '${t}' to '${e.to}'`, e); return null; }
        return e.to;
      }
      case 'Cond': {
        this.cond(e.test, A);
        const a = this.type(e.a, A), b = this.type(e.b, A);
        if (!a || !b) return null;
        if (a === b) return a;
        if (isNum(a) && isNum(b)) return widest(a, b);
        this.error('CS0173', `Type of conditional expression cannot be determined because there is no implicit conversion between '${a}' and '${b}'`, e);
        return null;
      }
    }
    return null;
  }

  binaryType(op, l, r, at) {
    const bad = () => {
      let hint = '';
      if (op === '+' && (l === 'bool' || r === 'bool')) hint = 'true and false cannot be added.';
      else if (['==', '!='].includes(op) && (l === 'string' || r === 'string')) hint = 'Compare text with text and numbers with numbers. "3" (text) is not the same as 3 (number).';
      else if (['&&', '||'].includes(op)) hint = `Both sides of ${op} must be true/false conditions, for example x > 0 ${op} x < 5.`;
      else if (isArr(l) || isArr(r)) hint = 'An array is a whole row of values. Use one item, like heights[0], or heights.Length.';
      this.error('CS0019', `Operator '${op}' cannot be applied to operands of type '${l}' and '${r}'`, at, hint);
      return null;
    };
    if (l === 'void' || r === 'void') return bad();
    switch (op) {
      case '+': if (l === 'string' || r === 'string') return 'string';
      // fall through
      case '-': case '*': case '/': case '%': return isNum(l) && isNum(r) ? widest(l, r) : bad();
      case '<': case '>': case '<=': case '>=': return isNum(l) && isNum(r) ? 'bool' : bad();
      case '==': case '!=': return (isNum(l) && isNum(r)) || l === r ? 'bool' : bad();
      case '&&': case '||': return l === 'bool' && r === 'bool' ? 'bool' : bad();
    }
    return bad();
  }

  member(e, A) {
    const cls = this.staticClass(e.object);
    if (cls === 'Color' || cls === 'Direction') {
      const list = cls === 'Color' ? COLORS : DIRECTIONS;
      if (list.includes(e.name)) return cls;
      const s = suggest(e.name, list);
      this.error('CS0117', `'${cls}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol },
        s ? `Did you mean ${cls}.${s}? C# is case-sensitive.` : `Options: ${list.map(x => `${cls}.${x}`).join(', ')}.`);
      return null;
    }
    if (cls === 'Math' && e.name === 'PI') return 'double';
    if (cls) {
      if (methodNames(cls).includes(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `Add brackets to call it: ${cls}.${e.name}(...)`); return null; }
      const s = suggest(e.name, methodNames(cls));
      this.error('CS0117', `'${cls}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}?` : '');
      return null;
    }
    const t = this.type(e.object, A);
    if (!t) return null;
    if (t === 'Drone') {
      if (e.name in DRONE_PROPS) { this.stats.methods.add(e.name); return DRONE_PROPS[e.name]; }
      if (methodNames('Drone').includes(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `Add brackets to call it: drone.${e.name}(...)`); return null; }
      const s = suggest(e.name, [...Object.keys(DRONE_PROPS), ...methodNames('Drone')]);
      this.error('CS1061', `'Drone' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : '');
      return null;
    }
    if ((t === 'string' || isArr(t)) && e.name === 'Length') return 'int';
    if (isArr(t)) {
      const s = suggest(e.name, ['Length']);
      this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : 'An array has Length (how many items it holds). Read an item with [i].');
      return null;
    }
    if (t === 'string' && e.name in STRING_METHODS) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method: add brackets, ${e.name}().`); return null; }
    const s = t === 'string' ? suggest(e.name, ['Length', ...Object.keys(STRING_METHODS)]) : null;
    this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}?` : '');
    return null;
  }

  userCall(e, m, types) {
    this.stats.calls.set(m.name, (this.stats.calls.get(m.name) || 0) + 1);
    this.stats.features.add('call');
    if (this.method) this.stats.features.add('callInMethod');
    if (this.method === m) this.stats.features.add('recursion');
    e.method = 'user'; e.decl = m; e.userCall = true;
    const ret = m.resolvedReturn ?? null;
    if (types.length !== m.params.length) {
      this.error('CS1501', `No overload for method '${m.name}' takes ${types.length} arguments`, e,
        m.params.length ? `${m.name} needs ${m.params.length} value${m.params.length === 1 ? '' : 's'}: ${m.name}(${m.params.map(p => `${p.varType} ${p.name}`).join(', ')}).` : `${m.name} has no parameters: call it with empty brackets, ${m.name}().`);
      return ret;
    }
    types.forEach((t, i) => {
      const want = m.params[i].resolvedType;
      if (!t || !want || implicitOK(t, want)) return;
      let hint = `Parameter ${m.params[i].name} of ${m.name} is of type ${want}.`;
      if (want === 'Color' && t === 'string') hint = 'Write colors as Color.Red, not "Red". ' + hint;
      else if (isNum(want) && t === 'string') hint = 'Numbers are written without quotes. ' + hint;
      else if (want === 'int' && isNum(t)) hint = 'Use (int) to convert it. ' + hint;
      this.error('CS1503', `Argument ${i + 1}: cannot convert from '${t}' to '${want}'`, e.args[i], hint);
    });
    return ret;
  }

  call(e, A) {
    const argTypes = () => e.args.map(a => this.type(a, A));
    const c = e.callee;
    if (c.type === 'Ident') {
      if (this.lookup(c.name)) { argTypes(); this.error('CS0149', 'Method name expected', c, `${c.name} is a variable, not a method.`); return null; }
      const m = this.userMethods.get(c.name);
      if (!m) {
        argTypes();
        const s = suggest(c.name, [...this.userMethods.keys()]);
        if (s) { this.error('CS0103', `The name '${c.name}' does not exist in the current context`, c, `Did you mean ${s}? Names in C# are case-sensitive.`); return null; }
        const other = suggest(c.name, [...this.allNames(), 'drone', ...STATIC_CLASSES]);
        if (['Move', 'MoveTo', 'Place', 'Build', 'WriteLine'].includes(c.name) || other) { this.unknownName(c); return null; }
        this.error('CS0103', `The name '${c.name}' does not exist in the current context`, c, `There is no method called ${c.name} yet. Declare it below the main program: void ${c.name}(…) { … }`);
        return null;
      }
      return this.userCall(e, m, argTypes());
    }
    if (c.type !== 'Member') { argTypes(); this.error('CS0149', 'Method name expected', c); return null; }
    let key, owner = this.staticClass(c.object);
    if (owner === 'Color' || owner === 'Direction') { argTypes(); this.error('CS0117', `'${owner}' does not contain a definition for '${c.name}'`, c); return null; }
    if (owner) key = `${owner}.${c.name}`;
    else {
      const t = this.type(c.object, A);
      if (!t) { argTypes(); return null; }
      if (c.name === 'ToString' && t !== 'Drone') {
        argTypes();
        if (e.args.length) { this.error('CS1501', `No overload for method 'ToString' takes ${e.args.length} arguments`, e); return null; }
        e.method = 'ToString'; return 'string';
      }
      if (t === 'string') {
        const types = argTypes();
        if (c.name === 'Length') { this.error('CS1955', "Non-invocable member 'string.Length' cannot be used like a method.", e, 'Length is a property, not a method: remove the brackets.'); return null; }
        const m = STRING_METHODS[c.name];
        if (!m) { const sg = suggest(c.name, ['Length', ...Object.keys(STRING_METHODS)]); this.error('CS1061', `'string' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, sg ? `Did you mean ${sg}? C# is case-sensitive.` : ''); return null; }
        const cands = m.overloads.filter(o => o.length === e.args.length);
        if (!cands.length) { this.error('CS1501', `No overload for method '${c.name}' takes ${e.args.length} arguments`, e, `Use ${m.overloads.map(o => `${c.name}(${o.join(', ')})`).join('  or  ')}.`); return null; }
        if (types.some(x => x === null)) return m.returns;
        if (!cands.some(o => o.every((p, i) => implicitOK(types[i], p)))) {
          const o = cands[0], i = o.findIndex((p, k) => !implicitOK(types[k], p));
          this.error('CS1503', `Argument ${i + 1}: cannot convert from '${types[i]}' to '${o[i]}'`, e.args[i], o[i] === 'string' && types[i] === 'char' ? '' : '');
          return m.returns;
        }
        e.method = 'string.' + c.name;
        this.stats.methods.add(c.name);
        return m.returns;
      }
      if (isArr(t) && c.name === 'Length') { argTypes(); this.error('CS1955', "Non-invocable member 'Array.Length' cannot be used like a method.", e, 'Length is a property, not a method: remove the brackets.'); return null; }
      if (t !== 'Drone') { argTypes(); this.error('CS1061', `'${t}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }); return null; }
      key = `Drone.${c.name}`;
      owner = 'Drone';
    }
    const m = METHODS[key];
    const types = argTypes();
    if (!m) {
      const options = owner === 'Drone' ? [...methodNames('Drone'), ...Object.keys(DRONE_PROPS)] : methodNames(owner);
      const s = suggest(c.name, options);
      const code = owner === 'Drone' ? 'CS1061' : 'CS0117';
      this.error(code, `'${owner}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : '');
      return null;
    }
    if (owner === 'Drone' && c.name in DRONE_PROPS) { this.error('CS1955', `Non-invocable member 'Drone.${c.name}' cannot be used like a method.`, e, `Remove the brackets: drone.${c.name}`); return null; }
    e.method = key;
    this.stats.methods.add(c.name);
    const candidates = m.overloads.filter(o => o.length === e.args.length);
    if (!candidates.length) {
      const sigs = m.overloads.map(o => `${key.split('.')[1]}(${o.map(x => x === 'any' ? 'value' : x === 'number' ? 'number' : x).join(', ')})`).join('  or  ');
      this.error('CS1501', `No overload for method '${c.name}' takes ${e.args.length} arguments`, e, `Use ${sigs}.`);
      return null;
    }
    if (types.some(t => t === null)) return m.returns === 'void' ? 'void' : null;
    const accepts = (p, a) => p === 'any' ? a !== 'void' : p === 'number' ? isNum(a) : implicitOK(a, p);
    const match = candidates.find(o => o.every((p, i) => accepts(p, types[i])));
    if (!match) {
      const o = candidates[0];
      const i = o.findIndex((p, k) => !accepts(p, types[k]));
      const expected = o[i] === 'number' ? 'double' : o[i] === 'any' ? 'object' : o[i];
      let hint = '';
      if (expected === 'Direction') hint = 'Directions are written Direction.Right, Direction.Left, Direction.Forward or Direction.Back.';
      else if (expected === 'Color') hint = 'Colors are written Color.Red, Color.Blue…';
      else if (expected === 'int' && isNum(types[i])) hint = 'Tile positions are whole numbers (int). Use (int) to convert.';
      this.error('CS1503', `Argument ${i + 1}: cannot convert from '${types[i]}' to '${expected}'`, e.args[i], hint);
      return m.returns === 'void' ? 'void' : null;
    }
    if (m.returns === 'arg') return types[0];
    if (m.returns === 'widest') return widest(types[0], types[1]);
    return m.returns;
  }
}

// ─── Compile ─────────────────────────────────────────────────────────────────
export function compile(src, { mode = 'program' } = {}) {
  let ast;
  try { ast = mode === 'calc' ? parseCalc(tokenize(src)) : new Parser(tokenize(src)).program(); }
  catch (err) {
    if (err instanceof CSharpError) return { ok: false, errors: [err], warnings: [], ast: null, stats: null };
    throw err;
  }
  const checker = new Checker();
  checker.program(ast);
  checker.errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { ok: checker.errors.length === 0, errors: checker.errors, warnings: checker.warnings, ast, stats: checker.stats };
}

// ─── Source display (for explanations) ───────────────────────────────────────
export function show(e, valueOf) {
  const s = x => show(x, valueOf);
  switch (e.type) {
    case 'Num': return e.raw;
    case 'Str': return JSON.stringify(e.value);
    case 'Char': return literal(e.value, 'char');
    case 'Lit': return literal(e.value, e.ty);
    case 'Index': return `${show(e.object, valueOf)}[${show(e.index, valueOf)}]`;
    case 'Bool': return String(e.value);
    case 'Interp': return '$"' + e.parts.map(p => typeof p === 'string' ? p : `{${s(p)}}`).join('') + '"';
    case 'Ident': return valueOf && e.name !== 'drone' ? valueOf(e) : e.name;
    case 'Paren': return `(${s(e.expr)})`;
    case 'Member': return valueOf && e.object.type === 'Ident' && e.object.name === 'drone' ? valueOf(e) : `${show(e.object)}.${e.name}`;
    case 'Call': return `${show(e.callee)}(${e.args.map(s).join(', ')})`;
    case 'Unary': return e.op + s(e.arg);
    case 'Binary': return `${s(e.left)} ${e.op} ${s(e.right)}`;
    case 'Cast': return `(${e.to})${s(e.arg)}`;
    case 'Cond': return `${s(e.test)} ? ${s(e.a)} : ${s(e.b)}`;
    case 'ArrayInit': return `{ ${e.items.map(s).join(', ')} }`;
    case 'NewArray': return e.size ? `new ${e.elem}[${s(e.size)}]` : `new ${e.elem}[] { ${e.items.map(s).join(', ')} }`;
  }
  return '';
}
export function showStatement(s) {
  switch (s.type) {
    case 'VarDecl': return `${s.varType} ${s.decls.map(d => d.init ? `${d.name} = ${show(d.init)}` : d.name).join(', ')}`;
    case 'Assign': return `${show(s.target)} ${s.op} ${show(s.value)}`;
    case 'IncDec': return s.prefix ? `${s.op}${show(s.target)}` : `${show(s.target)}${s.op}`;
    case 'ExprStmt': return show(s.expr);
  }
  return '';
}

// ─── Runner (executes step by step) ──────────────────────────────────────────
class Signal { constructor(kind, value) { this.kind = kind; this.value = value; } }
const BREAK = new Signal('break'), CONTINUE = new Signal('continue');
const MAX_DEPTH = 100;

export class Runner {
  constructor(ast, world, { maxSteps = 20000, calcTowers = false } = {}) {
    this.ast = ast; this.world = world; this.maxSteps = maxSteps; this.calcTowers = calcTowers;
    this.results = [];
    this.resultsByLine = new Map();
    this.scopes = [];
    this.output = [];
    this.steps = 0;
    this.line = 1;
    this.lineCounts = new Map();
    this.notes = new Map();
    this.log = [];
    this.changed = new Set();
    this.uid = 0;
    this.memo = new Map();   // values of the student's own method calls, for the expression being evaluated
    this.depth = 0;          // how many method calls are running (0 = main program)
    this.frames = [];        // call stack: { name, text, callLine }
  }

  // Generator: yields one event per visible step.
  *run() {
    // Scopes are only removed on normal exit, so after a runtime error the
    // Memory panel still shows the variables at the moment of the error.
    this.pushScope('Program', 1, 'program');
    for (const s of this.ast.body) {
      if (s.type === 'MethodDecl') continue;
      const sig = yield* this.exec(s);
      if (sig) break;
    }
    this.finished = true;
  }
  runToEnd() { for (const _ of this.run()); return this; }

  pushScope(label, line, kind) { const sc = { id: ++this.uid, label, line, kind, vars: new Map(), iteration: 0 }; this.scopes.push(sc); return sc; }
  popScope() { this.scopes.pop(); }
  // A method only sees its own frame: the search stops at the scope where the method call started.
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].vars.get(name); if (v) return v;
      if (this.scopes[i].kind === 'method') break;
    }
    throw new Error('Unknown variable ' + name);
  }

  tick(line, count = true) {
    this.line = line;
    if (++this.steps > this.maxSteps) throw new CSharpError({
      kind: 'runtime', exception: 'TimeoutException', message: `The program ran more than ${this.maxSteps.toLocaleString('en')} steps and was stopped.`, line,
      hint: 'Is there a loop whose condition never becomes false? Check that the loop variable changes on every turn.'
    });
    if (count) this.lineCounts.set(line, (this.lineCounts.get(line) || 0) + 1);
    this.changed = new Set();
    this.access = null; // the array item read or written in this step
  }
  note(line, text, summary = text) {
    this.notes.set(line, text);
    this.log.push({ line, text: summary, step: this.steps });
    if (this.log.length > 200) this.log.shift();
  }
  at(s, count = true) { this.tick(s.line, count); return { kind: 'line', line: s.line, depth: this.depth }; }

  // Runs the student's own method calls inside an expression (step by step),
  // storing their results so the normal evaluation can use them.
  *pre(e) {
    if (!e || !hasUserCall(e)) return;
    if (e.type === 'Call' && e.method === 'user') {
      for (const a of e.args) yield* this.pre(a);
      const args = e.args.map(a => this.eval(a));
      this.memo.set(e, yield* this.invoke(e, args));
      return;
    }
    if (e.type === 'Binary' && (e.op === '&&' || e.op === '||')) {
      yield* this.pre(e.left);
      const l = this.eval(e.left);
      if (e.op === '&&' ? l : !l) yield* this.pre(e.right);
      return;
    }
    if (e.type === 'Cond') {
      yield* this.pre(e.test);
      yield* this.pre(this.eval(e.test) ? e.a : e.b);
      return;
    }
    for (const k of kidsOf(e)) yield* this.pre(k);
  }
  *preStmt(s) {
    switch (s.type) {
      case 'VarDecl': for (const d of s.decls) if (d.init) yield* this.pre(d.init); return;
      case 'Assign': yield* this.pre(s.target); yield* this.pre(s.value); return;
      case 'IncDec': yield* this.pre(s.target); return;
      case 'ExprStmt': yield* this.pre(s.expr); return;
      case 'Return': if (s.value) yield* this.pre(s.value); return;
    }
  }

  *invoke(call, args) {
    const m = call.decl, callLine = this.line;
    const text = `${m.name}(${args.map((a, i) => literal(a, m.params[i].resolvedType)).join(', ')})`;
    if (this.depth >= MAX_DEPTH) throw this.runtimeError('StackOverflowException', 'Stack overflow: too many method calls inside each other.', `${m.name} keeps calling itself and never stops. A method that calls itself needs a case where it returns without calling again.`);
    const scope = this.pushScope(text, m.line, 'method');
    scope.method = m.name; scope.callLine = callLine; scope.returnType = m.resolvedReturn;
    this.frames.push({ name: m.name, text, callLine, scope });
    this.depth++;
    m.params.forEach((p, i) => {
      const v = { name: p.name, type: p.resolvedType, value: undefined, assigned: false, line: p.line, id: ++this.uid, param: true };
      scope.vars.set(p.name, v);
      this.set(v, args[i]);
    });
    this.tick(m.line);
    const paramText = m.params.map((p, i) => `${p.name} = ${literal(scope.vars.get(p.name).value, p.resolvedType)}`).join(', ');
    this.note(m.line, `called ${text}${paramText ? ` · ${paramText}` : ''}`, `line ${callLine} calls ${text}${paramText ? `: ${paramText}` : ''}`);
    yield { kind: 'call', line: m.line, depth: this.depth, method: m.name, text, callLine };
    let value, sig;
    for (const st of m.body.body) { sig = yield* this.exec(st); if (sig) break; }
    if (sig && sig.kind === 'return') value = sig.value;
    this.depth--;
    this.frames.pop();
    this.popScope();
    this.line = callLine;
    this.tick(callLine, false);
    const shown = m.resolvedReturn === 'void' ? `${text} finished` : `${text} gave back ${literal(value, m.resolvedReturn)}`;
    this.note(callLine, shown, `back on line ${callLine}: ${shown}`);
    yield { kind: 'return', line: callLine, depth: this.depth, method: m.name, text, value, type: m.resolvedReturn };
    return value;
  }

  runtimeError(exception, message, hint = '') {
    return new CSharpError({ kind: 'runtime', exception, message, line: this.line, hint });
  }

  *exec(s, label) {
    switch (s.type) {
      case 'Block': {
        this.pushScope(label || `{ } block`, s.line, 'block');
        for (const st of s.body) { const sig = yield* this.exec(st); if (sig) { this.popScope(); return sig; } }
        this.popScope();
        return;
      }
      case 'Empty': return;
      case 'Calc': {
        yield this.at(s);
        this.calcLine(s);
        return;
      }
      case 'VarDecl': case 'Assign': case 'IncDec': case 'ExprStmt':
        yield this.at(s);
        yield* this.preStmt(s);
        this.line = s.line;
        this.simple(s);
        return;
      case 'MethodDecl': return;
      case 'Return': {
        yield this.at(s);
        yield* this.preStmt(s);
        this.line = s.line;
        const m = this.frames.at(-1);
        const type = s.value ? (m?.scope.returnType || s.value.ty) : null;
        const value = s.value ? this.convert(this.eval(s.value), type) : undefined;
        this.note(s.line, s.value ? `return ${literal(value, type)}` : 'return → leave the method', s.value ? `${show(s.value)} is ${literal(value, type)}: give it back to line ${m?.callLine}` : 'return: leave the method');
        return new Signal('return', value);
      }
      case 'If': {
        yield* this.pre(s.test);
        const v = this.cond(s.test, s.line);
        yield this.condEvent(s, s.test, v, v ? 'true → run the if block' : s.alt ? 'false → run the else part' : 'false → skip the if block');
        if (v) return yield* this.exec(s.cons, `if (line ${s.line})`);
        if (s.alt) return yield* this.exec(s.alt, `else (line ${s.elseLine})`);
        return;
      }
      case 'While': {
        let n = 0;
        for (;;) {
          yield* this.pre(s.test);
          const v = this.cond(s.test, s.line);
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          const sig = yield* this.exec(s.body, `while · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') return sig;
        }
        return;
      }
      case 'Do': {
        let n = 0;
        for (;;) {
          n++;
          const sig = yield* this.exec(s.body, `do · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') return sig;
          yield* this.pre(s.test);
          const v = this.cond(s.test, s.whileLine);
          yield this.condEvent({ line: s.whileLine }, s.test, v, v ? 'true → repeat' : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
        }
        return;
      }
      case 'For': {
        this.pushScope(`for (line ${s.line})`, s.line, 'for');
        if (s.init) { yield { ...this.at(s, false), phase: 'init' }; yield* this.preStmt(s.init); this.simple(s.init, s.line); }
        let n = 0;
        for (;;) {
          if (s.test) yield* this.pre(s.test);
          const v = s.test ? this.cond(s.test, s.line) : true;
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          this.scopes.at(-1).iteration = n;
          const sig = yield* this.exec(s.body, `for · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') { this.popScope(); return sig; }
          if (s.update) { yield { ...this.at(s, false), phase: 'update' }; yield* this.preStmt(s.update); this.simple(s.update, s.line); }
        }
        this.popScope();
        return;
      }
      case 'Foreach': {
        yield* this.pre(s.collection);
        this.line = s.line;
        const coll = this.eval(s.collection);
        if (coll == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(s.collection)} has no value yet (null).`);
        const isText = typeof coll === 'string';
        const items = isText ? [...coll] : coll;
        const scope = this.pushScope(`foreach (line ${s.line})`, s.line, 'for');
        const v = { name: s.name, type: s.resolvedType, value: undefined, assigned: false, line: s.nameLine, id: ++this.uid, readOnly: true };
        let n = 0;
        for (;;) {
          const has = n < items.length;
          if (has) { if (!scope.vars.has(s.name)) scope.vars.set(s.name, v); this.set(v, items[n]); }
          yield this.foreachEvent(s, has, n, items, isText);
          if (!has) break;
          n++;
          scope.iteration = n;
          const sig = yield* this.exec(s.body, `foreach · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') { this.popScope(); return sig; }
        }
        this.popScope();
        return;
      }
      case 'Break': yield this.at(s); this.note(s.line, 'break → leave the loop'); return BREAK;
      case 'Continue': yield this.at(s); this.note(s.line, 'continue → next turn'); return CONTINUE;
    }
  }

  calcLine(s) {
    const st = s.stmt;
    let entry;
    this.lastText = null;
    if (st.type === 'ExprStmt') {
      const e = st.expr, value = this.eval(e), type = e.ty;
      const text = type === 'void' ? '' : literal(value, type);
      entry = { line: s.line, value, type, text, expression: true };
      if (type === 'bool' && !['Bool'].includes(e.type)) entry.steps = this.reduceSteps(e);
      if (e.type === 'Call' && type === 'void') this.note(s.line, this.lastCallNote || show(e));
      else this.note(s.line, `${show(e)} → ${text}`, `${show(e)} is ${text}`);
      if (this.calcTowers && type === 'int') {
        if (value >= 0 && this.world.height() + value <= this.world.maxHeight) this.world.build(value);
        else entry.noTower = true;
      }
    } else {
      this.simple(st);
      const name = st.type === 'VarDecl' ? st.decls.at(-1).name : st.target.name;
      const v = this.lookup(name);
      entry = { line: s.line, value: v.value, type: v.type, text: `${name} = ${literal(v.value, v.type)}`, expression: false };
    }
    const top = st.type === 'ExprStmt' ? st.expr : null;
    const showsSource = top && (top.type === 'Index' || (top.type === 'Member' && top.name === 'Length') || ['string.Substring', 'string.IndexOf'].includes(top.method));
    entry.textView = showsSource && this.lastText ? this.lastText : entry.type === 'string' ? { text: entry.value } : entry.type === 'char' ? { text: entry.value, from: 0, to: 1 } : null;
    this.results.push(entry);
    this.resultsByLine.set(s.line, entry);
  }

  // How an expression is worked out, step by step:
  // age >= 18 && member → 16 >= 18 && true → false && true → false
  reduceSteps(e) {
    const orig = n => n._o || n;
    const LEAVES = ['Num', 'Str', 'Bool', 'Char', 'Lit'];
    const KEYS = ['left', 'right', 'arg', 'expr', 'object', 'index'];
    const isLit = n => LEAVES.includes(n.type);
    const isStatic = n => n.type === 'Member' && n.object.type === 'Ident' && ['Color', 'Direction', 'Math'].includes(n.object.name);
    const done = n => isLit(n) || isStatic(n);
    const L = n => ({ type: 'Lit', value: this.eval(orig(n)), ty: orig(n).ty });
    const map = (n, f) => { const c = { ...n, _o: orig(n) }; for (const k of KEYS) if (n[k]) c[k] = f(n[k]); if (n.args) c.args = n.args.map(f); return c; };
    // heights[i] → heights[2] → 7: the array name stays, its position is worked out first.
    const namedItem = n => n.type === 'Index' && n.object.type === 'Ident' && isArr(n.object.ty);
    const kids = n => namedItem(n) ? [n.index] : [...KEYS.filter(k => n[k]).map(k => n[k]), ...(n.args || [])];
    const subst = n => done(n) ? n
      : (n.type === 'Ident' || (n.type === 'Member' && n.object.type === 'Ident' && (n.object.name === 'drone' || n.name === 'Length'))) ? L(n)
      : namedItem(n) ? { ...n, _o: orig(n), index: subst(n.index) } : map(n, subst);
    const collapse = n => done(n) ? n : kids(n).every(done) ? (n.type === 'Paren' ? n.expr : L(n)) : namedItem(n) ? { ...n, index: collapse(n.index) } : map(n, collapse);
    const steps = [show(e)];
    const push = x => { if (steps.at(-1) !== x) steps.push(x); };
    let cur = subst(e);
    push(show(cur));
    for (let i = 0; i < 16 && !isLit(cur); i++) { cur = collapse(cur); push(show(cur)); }
    return steps;
  }

  cond(test, line) { this.line = line; return this.eval(test); }
  condEvent(s, test, value, outcome) {
    this.tick(s.line);
    let text = 'true';
    if (test) {
      const steps = this.reduceSteps(test);
      if (steps.at(-1) !== String(value)) steps.push(String(value));
      text = steps.join('  →  ');
    }
    this.note(s.line, `${value ? '✓' : '✗'} ${test ? show(test, e => literal(this.eval(e), e.ty)) : 'true'} is ${value}`, `${test ? show(test) : 'true'} is ${value}: ${outcome.split('→ ')[1] || outcome}`);
    return { kind: 'cond', line: s.line, value, text, outcome, depth: this.depth };
  }

  foreachEvent(s, has, n, items, isText) {
    this.tick(s.line);
    const src = show(s.collection);
    let text, outcome;
    if (has) {
      if (!isText) this.access = { arr: items, i: n, write: false };
      const lit = literal(items[n], s.itemType);
      text = `${src}[${n}]  →  ${lit}`;
      outcome = `next item → loop turn ${n + 1}`;
      this.note(s.line, `${s.name} = ${lit} (item ${n} of ${src})`, `${s.name} = ${src}[${n}] = ${lit}`);
    } else {
      text = `${src}.Length  →  ${items.length}`;
      outcome = `no more items → the loop ends after ${n} turn${n === 1 ? '' : 's'}`;
      this.note(s.line, `no more items in ${src}`, `${src} has no more items: the loop ends`);
    }
    return { kind: 'cond', line: s.line, value: has, text, outcome, depth: this.depth };
  }

  convert(v, type) {
    if (type === 'float') return Math.fround(v);
    if (type === 'int') return v | 0;
    return v;
  }
  set(variable, value) {
    variable.value = this.convert(value, variable.type);
    variable.assigned = true;
    variable.version = (variable.version || 0) + 1;
    this.changed.add(variable);
  }

  simple(s, line = s.line) {
    this.line = line;
    switch (s.type) {
      case 'VarDecl': {
        const parts = [];
        for (const d of s.decls) {
          const v = { name: d.name, type: d.resolvedType, value: undefined, assigned: false, line: d.line, id: ++this.uid };
          this.scopes.at(-1).vars.set(d.name, v);
          if (d.init) { this.set(v, this.eval(d.init)); parts.push(`${d.name} = ${literal(v.value, v.type)}`); }
          else { this.changed.add(v); parts.push(`${d.name} (no value yet)`); }
        }
        this.note(line, parts.join(', '), `new ${s.varType === 'var' ? s.decls[0].resolvedType : s.varType} ${parts.join(', ')}`);
        return;
      }
      case 'Assign': {
        if (s.target.type === 'Index') return this.assignElement(s, line);
        const v = this.lookup(s.target.name);
        const r = this.eval(s.value);
        if (s.op === '=') { this.set(v, r); this.note(line, `${v.name} = ${literal(v.value, v.type)}`); return; }
        const before = v.value;
        const result = this.arith(s.op[0], before, r, v.type === 'string' ? 'string' : widest(v.type, s.value.ty), v.type, s.value.ty);
        this.set(v, result);
        this.note(line, `${v.name} ${s.op} ${literal(r, s.value.ty)} → ${literal(v.value, v.type)}`, `${v.name} was ${literal(before, v.type)}, now ${literal(v.value, v.type)}`);
        return;
      }
      case 'IncDec': {
        if (s.target.type === 'Index') return this.assignElement(s, line);
        const v = this.lookup(s.target.name);
        const before = v.value;
        this.set(v, v.type === 'int' ? (before + (s.op === '++' ? 1 : -1)) | 0 : before + (s.op === '++' ? 1 : -1));
        this.note(line, `${v.name}${s.op} → ${literal(v.value, v.type)}`, `${v.name} went from ${literal(before, v.type)} to ${literal(v.value, v.type)}`);
        return;
      }
      case 'ExprStmt': {
        const e = s.expr;
        if (e.type === 'Call' && e.method === 'user') return; // the call already explained itself
        const result = this.eval(e, true);
        this.note(line, result || showStatement(s));
        return;
      }
    }
  }

  element(indexNode) {
    const arr = this.eval(indexNode.object), i = this.eval(indexNode.index);
    const name = show(indexNode.object);
    if (arr == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${name} has no value yet (null).`);
    if (i < 0 || i >= arr.length) throw this.runtimeError('IndexOutOfRangeException', 'Index was outside the bounds of the array.',
      arr.length ? `${name} has ${arr.length} item${arr.length === 1 ? '' : 's'}: positions 0 to ${arr.length - 1}. You asked for position ${i}.` : `${name} is empty: it has no positions at all.`);
    return { arr, i, name };
  }
  assignElement(s, line) {
    const { arr, i, name } = this.element(s.target);
    const type = s.target.ty, before = arr[i];
    let value;
    if (s.type === 'IncDec') value = before + (s.op === '++' ? 1 : -1);
    else {
      const r = this.eval(s.value);
      value = s.op === '=' ? r : this.arith(s.op[0], before, r, type === 'string' ? 'string' : widest(type, s.value.ty), type, s.value.ty);
    }
    arr[i] = this.convert(value, type);
    this.access = { arr, i, write: true };
    for (const sc of this.scopes) for (const v of sc.vars.values()) if (v.value === arr) this.changed.add(v);
    const now = literal(arr[i], type);
    this.note(line, `${name}[${i}] = ${now}`, s.op === '=' ? `${name}[${i}] is now ${now}` : `${name}[${i}] was ${literal(before, type)}, now ${now}`);
  }

  arith(op, l, r, type, lt, rt) {
    switch (op) {
      case '+': if (type === 'string') return formatValue(l, lt) + formatValue(r, rt); break;
    }
    if (type === 'int' && (op === '/' || op === '%') && r === 0)
      throw this.runtimeError('DivideByZeroException', 'Attempted to divide by zero.', 'Whole numbers (int) cannot be divided by 0. Check the value of the divisor before dividing.');
    let v;
    switch (op) {
      case '+': v = l + r; break;
      case '-': v = l - r; break;
      case '*': v = type === 'int' ? Math.imul(l, r) : l * r; break;
      case '/': v = type === 'int' ? Math.trunc(l / r) : l / r; break;
      case '%': v = l % r; break;
    }
    if (type === 'int') return v | 0;
    if (type === 'float') return Math.fround(v);
    return v;
  }

  eval(e, statement = false) {
    switch (e.type) {
      case 'Num': return e.value;
      case 'Str': return e.value;
      case 'Char': return e.value;
      case 'ArrayInit': return e.items.map(x => this.convert(this.eval(x), e.elemType));
      case 'NewArray': {
        if (e.items) return e.items.map(x => this.convert(this.eval(x), e.elemType));
        const n = this.eval(e.size);
        if (n < 0) throw this.runtimeError('OverflowException', 'Arithmetic operation resulted in an overflow.', `An array cannot have a negative size (${n}).`);
        if (n > 1000) throw this.runtimeError('LabException', 'Arrays in this lab can hold up to 1,000 items.', 'Use a smaller size.');
        return Array(n).fill(DEFAULTS[e.elem] ?? null);
      }
      case 'Index': {
        if (isArr(e.object.ty)) {
          const { arr, i } = this.element(e);
          this.access = { arr, i, write: false };
          return arr[i];
        }
        const text = this.eval(e.object), i = this.eval(e.index);
        if (text == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.object)} has no value yet (null).`);
        if (i < 0 || i >= text.length) throw this.runtimeError('IndexOutOfRangeException', 'Index was outside the bounds of the array.', `"${text}" has ${text.length} characters: positions 0 to ${text.length - 1}. You asked for position ${i}.`);
        this.lastText = { text, from: i, to: i + 1 };
        return text[i];
      }
      case 'Bool': return e.value;
      case 'Interp': return e.parts.map(p => typeof p === 'string' ? p : formatValue(this.eval(p), p.ty)).join('');
      case 'Paren': return this.eval(e.expr);
      case 'Ident': {
        if (e.ty === 'Drone') return this.world;
        return this.lookup(e.name).value;
      }
      case 'Member': {
        if (e.ty === 'Color' && e.object.type === 'Ident' && e.object.name === 'Color') return e.name;
        if (e.ty === 'Direction' && e.object.type === 'Ident' && e.object.name === 'Direction') return e.name;
        if (e.object.type === 'Ident' && e.object.name === 'Math' && e.name === 'PI') return Math.PI;
        const o = this.eval(e.object);
        if (o === this.world) {
          switch (e.name) {
            case 'X': return this.world.drone.x;
            case 'Z': return this.world.drone.z;
            case 'Height': return this.world.height();
            case 'Ground': return this.world.groundColor();
          }
        }
        if (e.name === 'Length') {
          if (o == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.object)} has no value yet (null), so it has no Length.`);
          if (typeof o === 'string') this.lastText = { text: o, from: 0, to: o.length, count: true };
          return o.length;
        }
        return undefined;
      }
      case 'Call':
        if (e.method === 'user') {
          if (!this.memo.has(e)) throw new Error('Method call evaluated before it ran');
          const v = this.memo.get(e);
          return statement ? (e.decl.resolvedReturn === 'void' ? `called ${show(e)}` : `${show(e)} → ${literal(v, e.decl.resolvedReturn)}`) : v;
        }
        return this.callMethod(e, statement);
      case 'Unary': {
        const v = this.eval(e.arg);
        if (e.op === '!') return !v;
        if (e.op === '-') return e.ty === 'int' ? (-v | 0) : e.ty === 'float' ? Math.fround(-v) : -v;
        return v;
      }
      case 'Binary': {
        if (e.op === '&&') return this.eval(e.left) && this.eval(e.right);
        if (e.op === '||') return this.eval(e.left) || this.eval(e.right);
        const l = this.eval(e.left), r = this.eval(e.right);
        switch (e.op) {
          case '==': return l === r;
          case '!=': return l !== r;
          case '<': return l < r;
          case '>': return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
        }
        return this.arith(e.op, l, r, e.ty, e.left.ty, e.right.ty);
      }
      case 'Cast': {
        const v = this.eval(e.arg);
        if (e.to === 'int') return Number.isFinite(v) ? Math.trunc(v) | 0 : -2147483648;
        if (e.to === 'float') return Math.fround(v);
        return v;
      }
      case 'Cond': return this.eval(e.test) ? this.eval(e.a) : this.eval(e.b);
    }
  }

  callMethod(e, statement) {
    const args = e.args.map(a => this.eval(a));
    if (e.method && (e.method.startsWith('string.') || e.method === 'ToString') && this.eval(e.callee.object) == null)
      throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.callee.object)} has no value yet (null).`);
    const w = this.world;
    const wrap = fn => {
      try { return fn(); }
      catch (err) { if (err && err.exception) throw this.runtimeError(err.exception, err.message, err.hint); throw err; }
    };
    switch (e.method) {
      case 'Drone.Move': return wrap(() => w.move(args[0], args.length > 1 ? args[1] : 1));
      case 'Drone.MoveTo': return wrap(() => w.moveTo(args[0], args[1]));
      case 'Drone.Place': return wrap(() => w.place(args.length ? args[0] : 'White'));
      case 'Drone.Build': return wrap(() => w.build(args[0], args.length > 1 ? args[1] : 'White'));
      case 'Console.WriteLine': case 'Console.Write': {
        const text = args.length ? formatValue(args[0], e.args[0].ty) : '';
        if (e.method === 'Console.Write' && this.output.length && !this.output.at(-1).done) this.output.at(-1).text += text;
        else this.output.push({ text, line: this.line, done: e.method === 'Console.WriteLine' });
        if (e.method === 'Console.WriteLine' && this.output.length) this.output.at(-1).done = true;
        return statement ? `printed "${text}"` : undefined;
      }
      case 'ToString': return formatValue(this.eval(e.callee.object), e.callee.object.ty);
      case 'string.ToUpper': return this.eval(e.callee.object).toUpperCase();
      case 'string.ToLower': return this.eval(e.callee.object).toLowerCase();
      case 'string.Trim': return this.eval(e.callee.object).trim();
      case 'string.Contains': return this.eval(e.callee.object).includes(args[0]);
      case 'string.StartsWith': return this.eval(e.callee.object).startsWith(args[0]);
      case 'string.EndsWith': return this.eval(e.callee.object).endsWith(args[0]);
      case 'string.Replace': return this.eval(e.callee.object).split(args[0]).join(args[1]);
      case 'string.IndexOf': {
        const text = this.eval(e.callee.object), i = text.indexOf(args[0]);
        this.lastText = i >= 0 ? { text, from: i, to: i + String(args[0]).length } : { text };
        return i;
      }
      case 'string.Substring': {
        const text = this.eval(e.callee.object), a = args[0], n = args.length > 1 ? args[1] : text.length - a;
        if (a < 0 || a > text.length) throw this.runtimeError('ArgumentOutOfRangeException', 'startIndex cannot be larger than length of string.', `"${text}" has ${text.length} characters. The start must be between 0 and ${text.length}.`);
        if (n < 0 || a + n > text.length) throw this.runtimeError('ArgumentOutOfRangeException', 'Index and length must refer to a location within the string.', `From position ${a}, only ${text.length - a} character${text.length - a === 1 ? ' is' : 's are'} left, but you asked for ${n}.`);
        this.lastText = { text, from: a, to: a + n };
        return text.substr(a, n);
      }
      case 'Math.Abs': return e.ty === 'int' ? Math.abs(args[0]) | 0 : Math.abs(args[0]);
      case 'Math.Max': return Math.max(args[0], args[1]);
      case 'Math.Min': return Math.min(args[0], args[1]);
      case 'Math.Sqrt': return Math.sqrt(args[0]);
      case 'Math.Pow': return Math.pow(args[0], args[1]);
      case 'Math.Floor': return Math.floor(args[0]);
      case 'Math.Round': { const x = args[0], f = Math.floor(x), d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); }
    }
    return undefined;
  }
}
