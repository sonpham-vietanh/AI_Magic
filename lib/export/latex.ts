// Phân tích LaTeX (phần thường gặp trong toán phổ thông) thành cây, rồi:
//  - mathToUnicode: chuỗi Unicode đọc được (x², √, ∈, ≤) cho PowerPoint, Gamma, NotebookLM và dự phòng Word.
//  - lib/export/mathDocx.ts dựng công thức Word thật (OMML) từ cùng cây này.
// Hàm thuần, không phụ thuộc trình duyệt.
import { splitMath } from '@/lib/text/math';

export type MNode =
  | { t: 'run'; text: string; plain?: boolean }
  | { t: 'frac'; num: MNode[]; den: MNode[] }
  | { t: 'sqrt'; body: MNode[]; deg?: MNode[] }
  | { t: 'sup'; base: MNode[]; sup: MNode[] }
  | { t: 'sub'; base: MNode[]; sub: MNode[] }
  | { t: 'subsup'; base: MNode[]; sub: MNode[]; sup: MNode[] }
  | { t: 'delim'; open: string; close: string; body: MNode[] }
  | { t: 'accent'; kind: 'vec' | 'bar' | 'hat' | 'tilde' | 'dot' | 'under'; body: MNode[] }
  | { t: 'nary'; op: '∑' | '∏' | '∫' | '∬' | '∮'; sub?: MNode[]; sup?: MNode[]; body: MNode[] }
  | { t: 'env'; name: string; rows: MNode[][][] }
  | { t: 'br' };

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', nsubseteq: '⊈',
  cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  ll: '≪', gg: '≫', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  implies: '⟹', iff: '⟺', mapsto: '↦', uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', rightleftharpoons: '⇌',
  angle: '∠', measuredangle: '∡', perp: '⊥', parallel: '∥', triangle: '△', square: '□', degree: '°', prime: '′',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱', therefore: '∴', because: '∵', mid: '∣', nmid: '∤',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩', lbrace: '{', rbrace: '}', vert: '|', Vert: '‖',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', oplus: '⊕', otimes: '⊗',
  backslash: '\\', textdegree: '°', euro: '€', pounds: '£', dollar: '$', percent: '%',
};

const BLACKBOARD: Record<string, string> = {
  R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼',
};

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'lcm', 'ker', 'deg', 'arg', 'mod', 'Pr', 'cot', 'tg', 'cotg',
]);

const NARY: Record<string, '∑' | '∏' | '∫' | '∬' | '∮'> = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮' };

const ACCENT: Record<string, 'vec' | 'bar' | 'hat' | 'tilde' | 'dot' | 'under'> = {
  vec: 'vec', overrightarrow: 'vec', overleftrightarrow: 'vec', overline: 'bar', bar: 'bar',
  hat: 'hat', widehat: 'hat', tilde: 'tilde', widetilde: 'tilde', dot: 'dot', underline: 'under',
};

const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace', 'space']);
const STYLE_CMDS = new Set(['mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathscr', 'boldsymbol', 'bm', 'textit', 'textbf', 'textrm', 'mathnormal', 'displaystyle', 'textstyle', 'scriptstyle']);
const TEXT_CMDS = new Set(['text', 'textnormal', 'operatorname', 'mbox', 'mathrm', 'textrm', 'textsf', 'textbf', 'textit', 'mathbf']);
const MATRIX_ENVS = new Set(['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 'smallmatrix']);

class Parser {
  i = 0;
  constructor(private s: string) {}

  eof() {
    return this.i >= this.s.length;
  }

  private skipWs() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  /** Đọc dãy nút cho tới khi gặp `}` (không tiêu thụ), `\right`, `&`, `\\` hoặc `\end` ở cấp hiện tại. */
  parseSeq(stop: 'brace' | 'right' | 'cell' | 'top'): MNode[] {
    const out: MNode[] = [];
    while (!this.eof()) {
      this.skipWs();
      if (this.eof()) break;
      const c = this.s[this.i];
      if (c === '}') {
        if (stop === 'top') {
          this.i++; // dấu } lẻ: bỏ qua
          continue;
        }
        break;
      }
      if (stop === 'cell' || stop === 'right') {
        if (c === '&') break;
        if (c === '\\' && this.s[this.i + 1] === '\\') break;
        if (this.s.startsWith('\\end', this.i)) break;
      }
      if (stop === 'right' && this.s.startsWith('\\right', this.i)) break;
      const atom = this.parseAtom();
      if (!atom) continue;
      this.attachScripts(out, atom);
    }
    return mergeRuns(out);
  }

  private attachScripts(out: MNode[], atom: MNode[]) {
    let sub: MNode[] | undefined;
    let sup: MNode[] | undefined;
    for (;;) {
      this.skipWs();
      const c = this.s[this.i];
      if (c === '^') {
        this.i++;
        sup = this.parseArg();
      } else if (c === '_') {
        this.i++;
        sub = this.parseArg();
      } else if (c === "'") {
        this.i++;
        atom = [...atom, { t: 'run', text: '′' }];
      } else break;
    }
    // Toán tử lớn (∑, ∫, lim...) giữ cận riêng.
    const last = atom[atom.length - 1];
    if (last && last.t === 'nary' && (sub || sup)) {
      out.push(...atom.slice(0, -1), { ...last, sub: sub ?? last.sub, sup: sup ?? last.sup });
      return;
    }
    if (sub && sup) out.push({ t: 'subsup', base: atom, sub, sup });
    else if (sup) out.push({ t: 'sup', base: atom, sup });
    else if (sub) out.push({ t: 'sub', base: atom, sub });
    else out.push(...atom);
  }

  /** Đối số: một cặp {...}, một lệnh, hoặc một ký tự. */
  parseArg(): MNode[] {
    this.skipWs();
    if (this.eof()) return [];
    if (this.s[this.i] === '{') {
      this.i++;
      const body = this.parseSeq('brace');
      if (this.s[this.i] === '}') this.i++;
      return body;
    }
    if (this.s[this.i] === '\\') {
      const a = this.parseAtom();
      return a ?? [];
    }
    const ch = this.s[this.i++];
    return [{ t: 'run', text: ch }];
  }

  /** Đối số dạng chữ thô (cho \text{...}). */
  private rawBraceArg(): string {
    this.skipWs();
    if (this.s[this.i] !== '{') return this.s[this.i] ? this.s[this.i++] : '';
    let depth = 0;
    const start = this.i + 1;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '\\') {
        this.i++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const raw = this.s.slice(start, this.i);
          this.i++;
          return raw;
        }
      }
    }
    return this.s.slice(start);
  }

  private optBracket(): MNode[] | undefined {
    this.skipWs();
    if (this.s[this.i] !== '[') return undefined;
    const close = this.s.indexOf(']', this.i);
    if (close < 0) return undefined;
    const inner = this.s.slice(this.i + 1, close);
    this.i = close + 1;
    return new Parser(inner).parseSeq('top');
  }

  private readDelim(): string {
    this.skipWs();
    if (this.eof()) return '';
    const c = this.s[this.i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(this.s.slice(this.i));
      if (m) {
        this.i += m[0].length;
        const n = m[1];
        if (n === '{' || n === 'lbrace') return '{';
        if (n === '}' || n === 'rbrace') return '}';
        if (n === '|' || n === 'Vert') return '‖';
        if (n === 'langle') return '⟨';
        if (n === 'rangle') return '⟩';
        if (n === 'lfloor') return '⌊';
        if (n === 'rfloor') return '⌋';
        if (n === 'lceil') return '⌈';
        if (n === 'rceil') return '⌉';
        if (n === 'vert') return '|';
        return '';
      }
    }
    this.i++;
    return c === '.' ? '' : c;
  }

  private parseEnvBody(name: string): MNode[][][] {
    const rows: MNode[][][] = [];
    let row: MNode[][] = [];
    for (;;) {
      const cell = this.parseSeq('cell');
      row.push(cell);
      this.skipWs();
      if (this.eof()) break;
      if (this.s[this.i] === '&') {
        this.i++;
        continue;
      }
      if (this.s[this.i] === '\\' && this.s[this.i + 1] === '\\') {
        this.i += 2;
        rows.push(row);
        row = [];
        continue;
      }
      if (this.s.startsWith('\\end', this.i)) {
        this.i += 4;
        this.rawBraceArg();
        break;
      }
      this.i++;
    }
    if (row.length > 1 || row[0]?.length) rows.push(row);
    void name;
    return rows;
  }

  private parseAtom(): MNode[] | null {
    const c = this.s[this.i];
    if (c === '{') return this.parseArg();
    if (c === '\\') return this.parseCommand();
    this.i++;
    if (/[0-9]/.test(c)) {
      let n = c;
      while (this.i < this.s.length && /[0-9.,]/.test(this.s[this.i]) && (this.s[this.i] !== ',' && this.s[this.i] !== '.' ? true : /[0-9]/.test(this.s[this.i + 1] ?? ''))) {
        n += this.s[this.i++];
      }
      return [{ t: 'run', text: n }];
    }
    if (c === '~') return [{ t: 'run', text: ' ', plain: true }];
    if (c === '-') return [{ t: 'run', text: '−' }];
    return [{ t: 'run', text: c }];
  }

  private parseCommand(): MNode[] | null {
    const m = /^\\([A-Za-z]+\*?|[\s\S])/.exec(this.s.slice(this.i));
    if (!m) {
      this.i++;
      return null;
    }
    this.i += m[0].length;
    const name = m[1].replace(/\*$/, '');

    if (SPACES.has(name)) return [{ t: 'run', text: name === 'quad' || name === 'qquad' ? '  ' : ' ', plain: true }];
    if (name === '\\') return [{ t: 'br' }];
    if (['{', '}', '%', '$', '_', '&', '#'].includes(name)) return [{ t: 'run', text: name }];
    if (name === '|') return [{ t: 'run', text: '‖' }];
    if (name === '|') return [{ t: 'run', text: '‖' }];

    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const num = this.parseArg();
      const den = this.parseArg();
      return [{ t: 'frac', num, den }];
    }
    if (name === 'binom' || name === 'dbinom') {
      const n = this.parseArg();
      const k = this.parseArg();
      return [{ t: 'subsup', base: [{ t: 'run', text: 'C' }], sub: n, sup: k }];
    }
    if (name === 'sqrt') {
      const deg = this.optBracket();
      const body = this.parseArg();
      return [{ t: 'sqrt', body, deg }];
    }
    if (name === 'left') {
      const open = this.readDelim();
      const body = this.parseSeq('right');
      let close = '';
      if (this.s.startsWith('\\right', this.i)) {
        this.i += 6;
        close = this.readDelim();
      }
      return [{ t: 'delim', open, close, body }];
    }
    if (name === 'right') {
      this.readDelim();
      return null;
    }
    if (name === 'begin') {
      const env = this.rawBraceArg().replace(/\*$/, '');
      if (env === 'array') this.rawBraceArg();
      const rows = this.parseEnvBody(env);
      return [{ t: 'env', name: env, rows }];
    }
    if (name === 'end') {
      this.rawBraceArg();
      return null;
    }
    if (ACCENT[name]) return [{ t: 'accent', kind: ACCENT[name], body: this.parseArg() }];
    if (name === 'mathbb') {
      const raw = this.rawBraceArg().trim();
      return [{ t: 'run', text: raw.split('').map((ch) => BLACKBOARD[ch] ?? ch).join(''), plain: true }];
    }
    if (TEXT_CMDS.has(name) && !['mathrm', 'mathbf'].includes(name)) {
      return [{ t: 'run', text: this.rawBraceArg(), plain: true }];
    }
    if (name === 'mathrm' || name === 'mathbf') {
      const raw = this.rawBraceArg();
      return [{ t: 'run', text: raw.replace(/\\[A-Za-z]+/g, (x) => SYMBOLS[x.slice(1)] ?? ''), plain: true }];
    }
    if (STYLE_CMDS.has(name)) {
      if (['displaystyle', 'textstyle', 'scriptstyle'].includes(name)) return null;
      return this.parseArg();
    }
    if (name === 'overset' || name === 'underset' || name === 'stackrel') {
      const a = this.parseArg();
      const b = this.parseArg();
      return name === 'underset' ? [{ t: 'sub', base: b, sub: a }] : [{ t: 'sup', base: b, sup: a }];
    }
    if (name === 'not') {
      const nxt = this.parseAtom();
      if (nxt && nxt[0]?.t === 'run' && nxt[0].text === '=') return [{ t: 'run', text: '≠' }];
      if (nxt && nxt[0]?.t === 'run' && nxt[0].text === '∈') return [{ t: 'run', text: '∉' }];
      return nxt;
    }
    if (name === 'limits' || name === 'nolimits' || name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg' || name === 'label' || name === 'hline') return null;
    if (name === 'circ' && false) return null;
    if (NARY[name]) return [{ t: 'nary', op: NARY[name], body: [] }];
    if (FUNCS.has(name)) return [{ t: 'run', text: name, plain: true }];
    if (SYMBOLS[name] !== undefined) return [{ t: 'run', text: SYMBOLS[name] }];
    // Lệnh lạ: giữ lại phần chữ để người đọc vẫn hiểu.
    return [{ t: 'run', text: name, plain: true }];
  }
}

/** Gộp các nút chữ liền nhau cùng kiểu để cây gọn. */
function mergeRuns(list: MNode[]): MNode[] {
  const out: MNode[] = [];
  for (const n of list) {
    const prev = out[out.length - 1];
    if (n.t === 'run' && prev && prev.t === 'run' && !!prev.plain === !!n.plain) {
      out[out.length - 1] = { t: 'run', text: prev.text + n.text, plain: prev.plain };
    } else out.push(n);
  }
  return out;
}

/** Phân tích một đoạn LaTeX. Không bao giờ ném lỗi: phần không hiểu rơi về chữ thường. */
export function parseLatex(src: string): MNode[] {
  try {
    const p = new Parser(String(src ?? ''));
    const out: MNode[] = [];
    while (!p.eof()) {
      const seq = p.parseSeq('top');
      out.push(...seq);
      if (!p.eof()) p.i++;
    }
    return attachNaryBodies(out);
  } catch {
    return [{ t: 'run', text: String(src ?? ''), plain: true }];
  }
}

/** Phần sau \sum, \int là thân của toán tử (đến hết nút). */
function attachNaryBodies(list: MNode[]): MNode[] {
  const out: MNode[] = [];
  for (let k = 0; k < list.length; k++) {
    const n = list[k];
    if (n.t === 'nary') {
      out.push({ ...n, body: attachNaryBodies(list.slice(k + 1)) });
      return out;
    }
    out.push(n);
  }
  return out;
}

/* ---------- Unicode ---------- */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '−': '⁻', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ',
  e: 'ᵉ', k: 'ᵏ', m: 'ᵐ', t: 'ᵗ', p: 'ᵖ', o: 'ᵒ', '°': '°', '′': '′', '∘': '°',
};
const SUBS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '−': '₋', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ', m: 'ₘ', o: 'ₒ',
  p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

function mapAll(s: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of s) {
    const m = table[ch];
    if (m === undefined) return null;
    out += m;
  }
  return out;
}

const COMBINING: Record<string, string> = { vec: '⃗', bar: '̄', hat: '̂', tilde: '̃', dot: '̇', under: '̲' };

const REL_CHARS = new Set(['∈', '∉', '∋', '⊂', '⊆', '⊃', '⊇', '⊈', '≤', '≥', '≠', '≈', '≡', '∼', '≃', '≅', '∝', '≪', '≫', '→', '←', '↔', '⇒', '⇐', '⇔', '⟹', '⟺', '↦', '⊥', '∥', '∣', '∤']);

const REL_RE = new RegExp("[" + [...REL_CHARS].join("") + "]", "g");

function wrapIfLong(s: string): string {
  return /^[\p{L}\p{N}.,′°]+$/u.test(s) || /^\(.*\)$/.test(s) ? s : `(${s})`;
}

export function nodesToUnicode(list: MNode[]): string {
  let out = '';
  for (const n of list) {
    switch (n.t) {
      case 'run':
        out += n.plain ? n.text : n.text.replace(REL_RE, (c) => ` ${c} `);
        break;
      case 'br':
        out += '\n';
        break;
      case 'frac': {
        const a = nodesToUnicode(n.num);
        const b = nodesToUnicode(n.den);
        out += `${wrapIfLong(a)}/${wrapIfLong(b)}`;
        break;
      }
      case 'sqrt': {
        const b = nodesToUnicode(n.body);
        const deg = n.deg ? nodesToUnicode(n.deg) : '';
        const root = deg === '3' ? '∛' : deg === '4' ? '∜' : deg ? `${mapAll(deg, SUP) ?? `^(${deg})`}√` : '√';
        out += /^[\p{L}\p{N}]$/u.test(b) ? `${root}${b}` : `${root}(${b})`;
        break;
      }
      case 'sup': {
        const base = nodesToUnicode(n.base);
        const s = nodesToUnicode(n.sup);
        const m = mapAll(s, SUP);
        out += `${wrapBase(n.base, base)}${m ?? `^${s.length > 1 ? `(${s})` : s}`}`;
        break;
      }
      case 'sub': {
        const base = nodesToUnicode(n.base);
        const s = nodesToUnicode(n.sub);
        const m = mapAll(s, SUBS);
        out += `${wrapBase(n.base, base)}${m ?? `_${s.length > 1 ? `(${s})` : s}`}`;
        break;
      }
      case 'subsup': {
        const base = nodesToUnicode(n.base);
        const a = nodesToUnicode(n.sub);
        const b = nodesToUnicode(n.sup);
        const ms = mapAll(a, SUBS);
        const mp = mapAll(b, SUP);
        out += `${wrapBase(n.base, base)}${ms ?? `_${a.length > 1 ? `(${a})` : a}`}${mp ?? `^${b.length > 1 ? `(${b})` : b}`}`;
        break;
      }
      case 'delim': {
        const body = nodesToUnicode(n.body);
        out += `${n.open}${body}${n.close}`;
        break;
      }
      case 'accent': {
        const body = nodesToUnicode(n.body);
        if (n.kind === 'vec' && body.length > 1) out += `${body}⃗`;
        else out += body.length === 1 ? `${body}${COMBINING[n.kind]}` : n.kind === 'bar' ? `${body}̅` : `${body}${COMBINING[n.kind]}`;
        break;
      }
      case 'nary': {
        const lo = n.sub ? nodesToUnicode(n.sub) : '';
        const hi = n.sup ? nodesToUnicode(n.sup) : '';
        const limits = lo || hi ? `[${lo}${hi ? `→${hi}` : ''}]` : '';
        out += `${n.op}${limits}${nodesToUnicode(n.body)}`;
        break;
      }
      case 'env': {
        const rows = n.rows.map((r) => r.map((c) => nodesToUnicode(c)).join(MATRIX_ENVS.has(n.name) ? ' ' : ' '));
        if (n.name === 'cases') out += rows.map((r) => `  ${r}`).join('\n').replace(/^ {2}/, '{ ');
        else if (MATRIX_ENVS.has(n.name)) out += `[${rows.join('; ')}]`;
        else out += rows.join('\n');
        break;
      }
    }
  }
  return out;
}

function wrapBase(base: MNode[], text: string): string {
  if (base.length <= 1 && /^[\p{L}\p{N}′°)\]]*$/u.test(text)) return text;
  if (/^[\p{L}\p{N}]+$/u.test(text) && text.length === 1) return text;
  return /^\(.*\)$/.test(text) ? text : /^[\p{L}\p{N}.]+$/u.test(text) ? text : `(${text})`;
}

/** LaTeX -> chuỗi Unicode đọc được. */
export function latexToUnicode(src: string): string {
  return nodesToUnicode(parseLatex(src)).replace(/[ \t]{2,}/g, ' ').trim();
}

/** Thay mọi công thức trong văn bản bằng chuỗi Unicode (dùng cho PowerPoint, Gamma, NotebookLM). */
export function mathToUnicode(text: string): string {
  const s = String(text ?? '');
  if (!s.includes('$') && !s.includes('\\(') && !s.includes('\\[')) return s;
  return splitMath(s)
    .map((seg) => (seg.type === 'text' ? seg.value : latexToUnicode(seg.value)))
    .join('');
}
