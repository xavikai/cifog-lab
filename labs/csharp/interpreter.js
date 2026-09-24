// A small, teaching-oriented C# interpreter.
// It understands a focused subset of C# (top-level statements, local variables,
// if/else, while, do/while, for, break/continue, expressions and the lab API)
// and runs programs step by step so the interface can show what happens.

export const COLORS = ['None', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Black'];
export const DIRECTIONS = ['Forward', 'Back', 'Left', 'Right'];
const NUMERIC = ['int', 'float', 'double'];
const VALUE_TYPES = ['int', 'float', 'double', 'bool', 'string', 'Color', 'Direction'];
const TYPE_KEYWORDS = new Set(['int', 'float', 'double', 'bool', 'string', 'var']);
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
  if (value === undefined) return '';
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
  switch (type) {
    case 'string': return JSON.stringify(value);
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
    if (ch === "'") fail('LAB', 'Use double quotes for text.', l, c, "In C#, 'a' is a single character (char). For text write \"hello\".");
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
};

class Parser {
  constructor(tokens) { this.toks = tokens; this.p = 0; }
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
    return t.t === 'id' && n.t === 'id';
  }

  statement() {
    const t = this.tok;
    if (this.is('{')) return this.block();
    if (this.is(';')) { this.p++; return this.node('Empty', {}, t); }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return this.ifStmt();
        case 'while': return this.whileStmt();
        case 'do': return this.doStmt();
        case 'for': return this.forStmt();
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
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, `The { on line ${open.line} is never closed.`);
      body.push(this.statement());
    }
    const close = this.expect('}');
    return this.node('Block', { body, endLine: close.line }, open);
  }

  declaration() {
    const typeTok = this.tok; this.p++;
    const decls = [];
    do {
      const n = this.tok;
      if (n.t !== 'id') {
        if (n.t === 'kw') this.fail('CS1041', `Identifier expected; '${n.v}' is a keyword`, n, `${n.v} is a reserved word in C#. Choose another name for your variable.`);
        this.fail('CS1001', 'Identifier expected', n, 'After the type, write a name for the variable: int count = 0;');
      }
      this.p++;
      let init = null;
      if (this.eat('=')) init = this.expression();
      else if (this.is('==')) this.fail('CS1002', '; expected', this.tok, 'To give a variable a value use a single = (== compares two values).');
      decls.push({ name: n.v, init, line: n.line, col: n.col });
    } while (this.eat(','));
    return this.node('VarDecl', { varType: typeTok.v, decls }, typeTok);
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
      if (this.is('[')) this.fail('LAB', 'Arrays and indexers arrive in a later level.', this.tok);
      return e;
    }
  }
  primary() {
    const t = this.tok;
    switch (t.t) {
      case 'num': this.p++; return this.node('Num', { value: t.v, ty: t.ty, raw: t.raw }, t);
      case 'str': this.p++; return this.node('Str', { value: t.v }, t);
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
        if (TYPE_KEYWORDS.has(t.v)) this.fail('CS1525', `Invalid expression term '${t.v}'`, t, `${t.v} is a type. To create a variable write: ${t.v} name = value;`);
        this.fail('LAB', `'${t.v}' is valid C#, but it isn't part of this lab yet.`, t);
        break;
      case 'op':
        if (t.v === '(') { this.p++; const e = this.expression(); this.expect(')'); return this.node('Paren', { expr: e }, t); }
        break;
      case 'eof':
        this.fail('CS1733', 'Expected expression', t, 'The program ends in the middle of an instruction.');
    }
    this.fail('CS1525', `Invalid expression term '${t.v}'`, t, 'A value, a variable or a calculation was expected here.');
  }
}

// ─── Lab API (the drone, Console, Math) ──────────────────────────────────────
export const DRONE_PROPS = { X: 'int', Z: 'int', Height: 'int', Ground: 'Color' };
export const METHODS = {
  'Drone.Move': { overloads: [['Direction'], ['Direction', 'int']], returns: 'void' },
  'Drone.MoveTo': { overloads: [['int', 'int']], returns: 'void' },
  'Drone.Place': { overloads: [[], ['Color']], returns: 'void' },
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
const methodNames = cls => Object.keys(METHODS).filter(k => k.startsWith(cls + '.')).map(k => k.split('.')[1]);

// ─── Checker (what the C# compiler verifies before running) ──────────────────
class Checker {
  constructor() {
    this.errors = []; this.warnings = [];
    this.scopes = [];
    this.loops = 0;
    this.stats = { features: new Set(), declTypes: new Set(), statements: 0, methods: new Set() };
    this.reportedUnassigned = new Set();
  }
  error(code, message, at, hint = '') {
    if (this.errors.some(e => e.line === at.line && e.code === code && e.message === message)) return;
    this.errors.push(new CSharpError({ code, message, line: at.line, col: at.col, hint }));
  }
  lookup(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].get(name); if (v) return v; } return null; }
  allNames() { return this.scopes.flatMap(s => [...s.keys()]); }

  program(ast) {
    this.scopes.push(new Map());
    let A = new Set();
    for (const s of ast.body) A = this.stmt(s, A);
    this.scopes.pop();
  }
  block(s, A) {
    this.scopes.push(new Map());
    for (const st of s.body) A = this.stmt(st, A);
    this.scopes.pop();
    return A;
  }
  body(s, A) { return s.type === 'Block' ? this.block(s, A) : this.stmt(s, A); }

  stmt(s, A) {
    if (s.type !== 'Block' && s.type !== 'Empty') this.stats.statements++;
    switch (s.type) {
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

  cond(e, A) {
    const t = this.type(e, A);
    if (t && t !== 'bool') this.error('CS0029', `Cannot implicitly convert type '${t}' to 'bool'`, e, 'A condition must be true or false, for example x > 3 or x == 0.');
  }

  resolveType(name, at) {
    if (VALUE_TYPES.includes(name)) return name;
    const s = suggest(name, VALUE_TYPES);
    this.error('CS0246', `The type or namespace name '${name}' could not be found`, at, s ? `Did you mean ${s}? C# is case-sensitive.` : 'Available types here: int, float, double, bool, string, Color, Direction.');
    return null;
  }

  varDecl(s, A) {
    this.stats.features.add('variable');
    const declared = s.varType === 'var' ? 'var' : this.resolveType(s.varType, s);
    for (const d of s.decls) {
      let type = declared;
      if (d.init) {
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
      if (from === 'string' && to === 'Color') hint = 'Colors are written Color.Red, not "Red".';
      else if (from === 'string' && isNum(to)) hint = 'Numbers are written without quotes: 3, not "3".';
      else if (isNum(from) && to === 'string') hint = 'Text needs quotes: "3". Or convert the number with .ToString().';
      else if (from === 'string' && to === 'bool') hint = 'Write true or false without quotes.';
      this.error('CS0029', `Cannot implicitly convert type '${from}' to '${to}'`, node, hint);
    }
    return false;
  }

  target(e, A, mustBeAssigned) {
    if (e.type === 'Member') {
      const objType = this.type(e.object, A);
      if (objType === 'Drone' && e.name in DRONE_PROPS) this.error('CS0200', `Property or indexer 'Drone.${e.name}' cannot be assigned to -- it is read only`, e, 'Use drone.Move(...) or drone.MoveTo(x, z) to change where the drone is.');
      else this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e);
      return null;
    }
    if (e.type !== 'Ident') { this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e); return null; }
    const v = this.lookup(e.name);
    if (!v) { this.unknownName(e); return null; }
    if (mustBeAssigned && !A.has(v)) this.unassigned(e, v);
    e.ty = v.type;
    return v;
  }

  assign(s, A) {
    this.stats.features.add('assign');
    const v = this.target(s.target, A, s.op !== '=');
    const t = this.type(s.value, A);
    if (!v || !v.type || !t) return A;
    if (s.op === '=') { this.convertible(s.value, t, v.type); return new Set(A).add(v); }
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
    let hint = '';
    if (name === 'True' || name === 'False') hint = `In C#, ${name.toLowerCase()} is written in lowercase.`;
    else if (['Move', 'MoveTo', 'Place'].includes(name)) hint = `${name} belongs to the drone. Write drone.${name}(...).`;
    else if (['Red', 'Blue', 'Green', 'Yellow', 'White', 'Orange', 'Purple', 'Black'].includes(name)) hint = `Colors are written Color.${name}.`;
    else if (DIRECTIONS.includes(name)) hint = `Directions are written Direction.${name}.`;
    else {
      const s = suggest(name, [...this.allNames(), 'drone', ...STATIC_CLASSES]);
      hint = s ? `Did you mean ${s}? Names in C# are case-sensitive.` : `Create it first, for example: int ${name} = 0;`;
    }
    this.error('CS0103', `The name '${name}' does not exist in the current context`, e, hint);
  }

  staticClass(e) {
    return e.type === 'Ident' && STATIC_CLASSES.includes(e.name) && !this.lookup(e.name) ? e.name : null;
  }

  type(e, A) { const t = this.infer(e, A); e.ty = t; return t; }
  infer(e, A) {
    switch (e.type) {
      case 'Num': return e.ty;
      case 'Str': return 'string';
      case 'Bool': return 'bool';
      case 'Interp': for (const p of e.parts) if (typeof p !== 'string') { const t = this.type(p, A); if (t === 'void') this.error('CS0029', "Cannot implicitly convert type 'void' to 'object'", p); } return 'string';
      case 'Paren': return this.type(e.expr, A);
      case 'Ident': {
        if (e.name === 'drone' && !this.lookup('drone')) return 'Drone';
        if (this.staticClass(e)) { this.error('CS0119', `'${e.name}' is a type, which is not valid in the given context`, e, e.name === 'Color' ? 'Choose one color: Color.Red' : ''); return null; }
        const v = this.lookup(e.name);
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
    if (t === 'string' && e.name === 'Length') return 'int';
    const s = t === 'string' ? suggest(e.name, ['Length']) : null;
    this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}?` : '');
    return null;
  }

  call(e, A) {
    const argTypes = () => e.args.map(a => this.type(a, A));
    const c = e.callee;
    if (c.type === 'Ident') {
      argTypes();
      if (this.lookup(c.name)) { this.error('CS0149', 'Method name expected', c, `${c.name} is a variable, not a method.`); return null; }
      this.unknownName(c); return null;
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
export function compile(src) {
  let ast;
  try { ast = new Parser(tokenize(src)).program(); }
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
class Signal { constructor(kind) { this.kind = kind; } }
const BREAK = new Signal('break'), CONTINUE = new Signal('continue');

export class Runner {
  constructor(ast, world, { maxSteps = 20000 } = {}) {
    this.ast = ast; this.world = world; this.maxSteps = maxSteps;
    this.scopes = [];
    this.output = [];
    this.steps = 0;
    this.line = 1;
    this.lineCounts = new Map();
    this.notes = new Map();
    this.log = [];
    this.changed = new Set();
    this.uid = 0;
  }

  // Generator: yields one event per visible step.
  *run() {
    // Scopes are only removed on normal exit, so after a runtime error the
    // Memory panel still shows the variables at the moment of the error.
    this.pushScope('Program', 1, 'program');
    for (const s of this.ast.body) {
      const sig = yield* this.exec(s);
      if (sig) break;
    }
    this.finished = true;
  }
  runToEnd() { for (const _ of this.run()); return this; }

  pushScope(label, line, kind) { this.scopes.push({ id: ++this.uid, label, line, kind, vars: new Map(), iteration: 0 }); }
  popScope() { this.scopes.pop(); }
  lookup(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].vars.get(name); if (v) return v; } throw new Error('Unknown variable ' + name); }

  tick(line, count = true) {
    this.line = line;
    if (++this.steps > this.maxSteps) throw new CSharpError({
      kind: 'runtime', exception: 'TimeoutException', message: `The program ran more than ${this.maxSteps.toLocaleString('en')} steps and was stopped.`, line,
      hint: 'Is there a loop whose condition never becomes false? Check that the loop variable changes on every turn.'
    });
    if (count) this.lineCounts.set(line, (this.lineCounts.get(line) || 0) + 1);
    this.changed = new Set();
  }
  note(line, text, summary = text) {
    this.notes.set(line, text);
    this.log.push({ line, text: summary, step: this.steps });
    if (this.log.length > 200) this.log.shift();
  }
  at(s, count = true) { this.tick(s.line, count); return { kind: 'line', line: s.line }; }

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
      case 'VarDecl': case 'Assign': case 'IncDec': case 'ExprStmt':
        yield this.at(s);
        this.simple(s);
        return;
      case 'If': {
        const v = this.cond(s.test, s.line);
        yield this.condEvent(s, s.test, v, v ? 'true → run the if block' : s.alt ? 'false → run the else part' : 'false → skip the if block');
        if (v) return yield* this.exec(s.cons, `if (line ${s.line})`);
        if (s.alt) return yield* this.exec(s.alt, `else (line ${s.elseLine})`);
        return;
      }
      case 'While': {
        let n = 0;
        for (;;) {
          const v = this.cond(s.test, s.line);
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          const sig = yield* this.exec(s.body, `while · turn ${n}`);
          if (sig === BREAK) break;
        }
        return;
      }
      case 'Do': {
        let n = 0;
        for (;;) {
          n++;
          const sig = yield* this.exec(s.body, `do · turn ${n}`);
          if (sig === BREAK) break;
          const v = this.cond(s.test, s.whileLine);
          yield this.condEvent({ line: s.whileLine }, s.test, v, v ? 'true → repeat' : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
        }
        return;
      }
      case 'For': {
        this.pushScope(`for (line ${s.line})`, s.line, 'for');
        if (s.init) { yield { ...this.at(s, false), phase: 'init' }; this.simple(s.init, s.line); }
        let n = 0;
        for (;;) {
          const v = s.test ? this.cond(s.test, s.line) : true;
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          this.scopes.at(-1).iteration = n;
          const sig = yield* this.exec(s.body, `for · turn ${n}`);
          if (sig === BREAK) break;
          if (s.update) { yield { ...this.at(s, false), phase: 'update' }; this.simple(s.update, s.line); }
        }
        this.popScope();
        return;
      }
      case 'Break': yield this.at(s); this.note(s.line, 'break → leave the loop'); return BREAK;
      case 'Continue': yield this.at(s); this.note(s.line, 'continue → next turn'); return CONTINUE;
    }
  }

  cond(test, line) { this.line = line; return this.eval(test); }
  condEvent(s, test, value, outcome) {
    this.tick(s.line);
    let text = 'true';
    if (test) {
      const src = show(test);
      const sub = show(test, e => literal(this.eval(e), e.ty));
      text = sub !== src ? `${src}  →  ${sub}  →  ${value}` : `${src}  →  ${value}`;
    }
    this.note(s.line, `${value ? '✓' : '✗'} ${test ? show(test, e => literal(this.eval(e), e.ty)) : 'true'} is ${value}`, `${test ? show(test) : 'true'} is ${value}: ${outcome.split('→ ')[1] || outcome}`);
    return { kind: 'cond', line: s.line, value, text, outcome };
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
        const v = this.lookup(s.target.name);
        const before = v.value;
        this.set(v, v.type === 'int' ? (before + (s.op === '++' ? 1 : -1)) | 0 : before + (s.op === '++' ? 1 : -1));
        this.note(line, `${v.name}${s.op} → ${literal(v.value, v.type)}`, `${v.name} went from ${literal(before, v.type)} to ${literal(v.value, v.type)}`);
        return;
      }
      case 'ExprStmt': {
        const e = s.expr;
        const result = this.eval(e, true);
        this.note(line, result || showStatement(s));
        return;
      }
    }
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
        if (e.name === 'Length') return o.length;
        return undefined;
      }
      case 'Call': return this.callMethod(e, statement);
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
    const w = this.world;
    const wrap = fn => {
      try { return fn(); }
      catch (err) { if (err && err.exception) throw this.runtimeError(err.exception, err.message, err.hint); throw err; }
    };
    switch (e.method) {
      case 'Drone.Move': return wrap(() => w.move(args[0], args.length > 1 ? args[1] : 1));
      case 'Drone.MoveTo': return wrap(() => w.moveTo(args[0], args[1]));
      case 'Drone.Place': return wrap(() => w.place(args.length ? args[0] : 'White'));
      case 'Console.WriteLine': case 'Console.Write': {
        const text = args.length ? formatValue(args[0], e.args[0].ty) : '';
        if (e.method === 'Console.Write' && this.output.length && !this.output.at(-1).done) this.output.at(-1).text += text;
        else this.output.push({ text, line: this.line, done: e.method === 'Console.WriteLine' });
        if (e.method === 'Console.WriteLine' && this.output.length) this.output.at(-1).done = true;
        return statement ? `printed "${text}"` : undefined;
      }
      case 'ToString': return formatValue(this.eval(e.callee.object), e.callee.object.ty);
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
