/* Calculator with:
   - Keyboard support
   - Safe evaluation (shunting-yard parser, no eval)
   - Unary minus, (), + - * / % ^, decimals
   - Live preview of expression
*/

const exprEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const keysEl = document.getElementById('keys');
const themeToggle = document.getElementById('themeToggle');

let expression = "";

// ---------- Utilities ----------
const isDigit = c => /[0-9]/.test(c);
const isOp = c => ['+','-','*','/','%','^'].includes(c);

function formatNumber(n) {
  if (!isFinite(n)) return '∞';
  // avoid long floats: round to 12 sig figs; strip trailing zeros
  let s = Number(n).toPrecision(12);
  s = String(parseFloat(s)); // removes trailing zeros
  return s.length > 15 ? Number(n).toExponential(8) : s;
}

// ---------- Tokenizer ----------
function tokenize(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];

    if (ch === ' ') { i++; continue; }

    if (isDigit(ch) || (ch === '.' && isDigit(str[i+1]))) {
      let num = ch; i++;
      while (i < str.length && (isDigit(str[i]) || str[i] === '.')) {
        num += str[i++];
      }
      if (num.split('.').length > 2) throw new Error('Invalid number');
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }

    if (isOp(ch)) {
      // handle unary minus
      const prev = tokens[tokens.length - 1];
      const unary = (ch === '-') &&
        (!prev || (prev.type === 'op' && prev.value !== ')') || (prev.type === 'paren' && prev.value === '('));
      tokens.push(unary ? { type: 'op', value: 'u-' } : { type: 'op', value: ch });
      i++; continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++; continue;
    }

    throw new Error(`Bad character: ${ch}`);
  }
  return tokens;
}

// ---------- Shunting Yard (to RPN) ----------
const PRECEDENCE = { 'u-': 5, '^': 4, '*': 3, '/': 3, '%': 3, '+': 2, '-': 2 };
const RIGHT_ASSOC = new Set(['^', 'u-']);

function toRPN(tokens) {
  const output = [];
  const ops = [];

  for (const t of tokens) {
    if (t.type === 'num') output.push(t);
    else if (t.type === 'op') {
      while (
        ops.length &&
        ops[ops.length - 1].type === 'op' &&
        (
          (RIGHT_ASSOC.has(t.value) && PRECEDENCE[t.value] < PRECEDENCE[ops[ops.length-1].value]) ||
          (!RIGHT_ASSOC.has(t.value) && PRECEDENCE[t.value] <= PRECEDENCE[ops[ops.length-1].value])
        )
      ) {
        output.push(ops.pop());
      }
      ops.push(t);
    } else if (t.type === 'paren' && t.value === '(') {
      ops.push(t);
    } else if (t.type === 'paren' && t.value === ')') {
      while (ops.length && !(ops[ops.length - 1].type === 'paren' && ops[ops.length - 1].value === '(')) {
        output.push(ops.pop());
      }
      if (!ops.length) throw new Error('Mismatched parentheses');
      ops.pop(); // pop '('
    }
  }
  while (ops.length) {
    const op = ops.pop();
    if (op.type === 'paren') throw new Error('Mismatched parentheses');
    output.push(op);
  }
  return output;
}

// ---------- RPN Evaluation ----------
function evalRPN(rpn) {
  const st = [];
  for (const t of rpn) {
    if (t.type === 'num') st.push(t.value);
    else if (t.type === 'op') {
      if (t.value === 'u-') {
        if (st.length < 1) throw new Error('Bad expression');
        st.push(-st.pop());
        continue;
      }
      if (st.length < 2) throw new Error('Bad expression');
      const b = st.pop();
      const a = st.pop();
      let r;
      switch (t.value) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/': if (b === 0) throw new Error('Division by zero'); r = a / b; break;
        case '%': if (b === 0) throw new Error('Division by zero'); r = a % b; break;
        case '^': r = Math.pow(a, b); break;
        default: throw new Error('Unknown operator');
      }
      st.push(r);
    }
  }
  if (st.length !== 1) throw new Error('Bad expression');
  return st[0];
}

function safeEvaluate(str) {
  if (!str.trim()) return 0;
  const tokens = tokenize(str);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

// ---------- UI logic ----------
function render() {
  exprEl.textContent = expression || '';
  try {
    const val = safeEvaluate(expression || '0');
    resultEl.textContent = formatNumber(val);
    resultEl.classList.remove('error');
  } catch (e) {
    resultEl.textContent = e.message;
    resultEl.classList.add('error');
  }
}

function appendValue(v) {
  expression += v;
  render();
}

function deleteLast() {
  expression = expression.slice(0, -1);
  render();
}

function clearAll() {
  expression = '';
  render();
}

function toggleSign() {
  // Wrap the last number/term in (-1*) or apply unary minus intelligently
  // Simple approach: if ends with a number, find its start and toggle
  const m = expression.match(/(.*?)(\(?-?\d*\.?\d+|\))\s*$/);
  if (!m) { expression = `-(${expression || 0})`; render(); return; }

  const prefix = m[1] ?? '';
  const tail = m[2] ?? '';

  if (tail.startsWith('(') || tail === ')') {
    expression = `${prefix}-(${tail})`;
  } else if (/^-/.test(tail)) {
    expression = `${prefix}${tail.replace(/^-/, '')}`;
  } else {
    expression = `${prefix}-${tail}`;
  }
  render();
}

// Clicks
keysEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const val = btn.dataset.value;
  const action = btn.dataset.action;

  if (val) appendValue(val);
  else if (action === 'delete') deleteLast();
  else if (action === 'clear') clearAll();
  else if (action === 'equals') {
    try {
      const v = safeEvaluate(expression || '0');
      expression = String(v);
      render();
    } catch {
      // keep error shown
    }
  } else if (action === 'negate') toggleSign();
});

// Keyboard
window.addEventListener('keydown', (e) => {
  const key = e.key;

  if (/[0-9]/.test(key)) { appendValue(key); return; }
  if (['+','-','*','/','%','^','.','(',')'].includes(key)) { appendValue(key); return; }

  if (key === 'Enter' || key === '=') {
    e.preventDefault();
    try {
      const v = safeEvaluate(expression || '0');
      expression = String(v);
      render();
    } catch {}
    return;
  }
  if (key === 'Backspace') { deleteLast(); return; }
  if (key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) { clearAll(); return; } // Ctrl/Cmd+C typically copy; avoid hijack
  if (key === 'Escape') { clearAll(); return; }
});

// Theme
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});

// Initial render
render();
