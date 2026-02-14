const state = { rows: [] };

const searchBtn = document.getElementById('searchBtn');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const inputErrorEl = document.getElementById('inputError');

function normalize(s) {
  return String(s || '').normalize('NFKC').trim().toLowerCase();
}

function splitChars(s) {
  return Array.from(s);
}

function parseCsvLike(text, delimiterGuess) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const delimiter = delimiterGuess || (text.includes('\t') ? '\t' : ',');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell);
      if (row.some((x) => String(x).trim() !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((x) => String(x).trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

function processRows(rawRows) {
  const out = [];
  for (const r of rawRows) {
    const a = normalize(r[0] || '');
    const bRaw = normalize(r[1] || '');
    if (!a || !bRaw) {
      continue;
    }

    out.push({
      a,
      meanings: bRaw
        .split(/[\/／]/)
        .map((x) => normalize(x))
        .filter(Boolean),
    });
  }
  return out;
}

function charAt(word, dir, pos) {
  const chars = splitChars(word);
  if (pos < 1 || pos > chars.length) {
    return '';
  }
  if (dir === 'start') {
    return chars[pos - 1] || '';
  }
  return chars[chars.length - pos] || '';
}

function setFieldError(el, hasError) {
  if (!el) {
    return;
  }
  el.classList.toggle('field-error', hasError);
}

function validateCharInputs() {
  const aEl = document.getElementById('aChar');
  const bEl = document.getElementById('bChar');
  const aVal = normalize(aEl.value);
  const bVal = normalize(bEl.value);

  let message = '';
  let aError = false;
  let bError = false;

  if (aVal && !/^[a-z]+$/.test(aVal)) {
    aError = true;
    message = '英語の指定文字はアルファベットで入力してください。';
  }
  if (bVal && !/^[ぁ-ゖーゝゞ]+$/.test(bVal)) {
    bError = true;
    message = message || '日本語の指定文字はひらがなで入力してください。';
  }

  setFieldError(aEl, aError);
  setFieldError(bEl, bError);
  inputErrorEl.textContent = message;

  return !aError && !bError;
}

function searchPosition() {
  try {
    if (state.rows.length === 0) {
      throw new Error('内蔵データの読み込みに失敗しています。');
    }

    if (!validateCharInputs()) {
      throw new Error('入力形式を確認してください。');
    }

    const aDir = document.getElementById('aDir').value;
    const bDir = document.getElementById('bDir').value;
    const aPos = Number(document.getElementById('aPos').value);
    const bPos = Number(document.getElementById('bPos').value);
    const aCharInput = normalize(document.getElementById('aChar').value);
    const bCharInput = normalize(document.getElementById('bChar').value);

    if (!Number.isInteger(aPos) || aPos < 1 || !Number.isInteger(bPos) || bPos < 1) {
      throw new Error('文字目は1以上の整数で入力してください。');
    }
    if (!aCharInput || !bCharInput) {
      throw new Error('指定文字を入力してください。');
    }

    const aChar = splitChars(aCharInput)[0];
    const bChar = splitChars(bCharInput)[0];

    const hits = [];
    for (const row of state.rows) {
      if (charAt(row.a, aDir, aPos) !== aChar) {
        continue;
      }
      const matched = row.meanings.filter((m) => charAt(m, bDir, bPos) === bChar);
      if (matched.length === 0) {
        continue;
      }
      hits.push({ a: row.a, b: matched.join('/') });
    }

    summaryEl.textContent = `${hits.length}件ヒット`;
    if (hits.length === 0) {
      resultsEl.innerHTML = '<div class="result-item">ヒットなし</div>';
      return;
    }

    resultsEl.innerHTML = hits
      .map((x) => `
        <div class="result-item">
          <div><span class="tag">日本語</span>${x.b}</div>
          <div><span class="tag">英語</span>${x.a}</div>
        </div>
      `)
      .join('');
  } catch (err) {
    summaryEl.textContent = err.message || String(err);
    resultsEl.innerHTML = '';
  }
}

function loadEmbeddedIfExists() {
  if (typeof EMBEDDED_SHEET_CSV !== 'string' || !EMBEDDED_SHEET_CSV.trim()) {
    return false;
  }
  const rawRows = parseCsvLike(EMBEDDED_SHEET_CSV, EMBEDDED_SHEET_CSV.includes('\t') ? '\t' : undefined);
  state.rows = processRows(rawRows);
  return true;
}

function init() {
  document.getElementById('aChar').addEventListener('input', validateCharInputs);
  document.getElementById('bChar').addEventListener('input', validateCharInputs);

  loadEmbeddedIfExists();
  searchBtn.addEventListener('click', searchPosition);
}

init();
