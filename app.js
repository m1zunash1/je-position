const LANGUAGES = {
  ja: { label: '日本語', column: 1, placeholder: 'ひらがな1文字' },
  en: { label: '英語', column: 0, placeholder: 'アルファベット1文字' },
  reading: { label: 'カタカナ英語（英語読み）', column: 2, placeholder: 'ひらがな1文字' },
};

const state = { rows: [] };

const $ = (id) => document.getElementById(id);
const searchBtn = $('searchBtn');
const summaryEl = $('summary');
const resultsEl = $('results');
const inputErrorEl = $('inputError');

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function splitChars(value) {
  return Array.from(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

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
    } else if (!inQuotes && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => normalize(value))) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => normalize(value))) rows.push(row);
  return rows;
}

function splitVariants(value) {
  return normalize(value).split(/[\/／]/).map(normalize).filter(Boolean);
}

function processRows(rawRows) {
  return rawRows
    .filter((row, index) => index > 0 || normalize(row[0]) !== '英単語')
    .map((row) => ({
      en: splitVariants(row[0]),
      ja: splitVariants(row[1]),
      reading: splitVariants(row[2]),
    }))
    .filter((row) => row.en.length && row.ja.length && row.reading.length);
}

function charAt(word, direction, position) {
  const chars = splitChars(word);
  const index = direction === 'start' ? position - 1 : chars.length - position;
  return chars[index] || '';
}

function setFieldError(element, hasError) {
  element.classList.toggle('field-error', hasError);
}

function updateLanguageControls() {
  const leftLang = $('leftLang').value;
  const rightLang = $('rightLang').value;
  for (const option of $('leftLang').options) {
    const unavailable = option.value === rightLang;
    option.disabled = unavailable;
    option.hidden = unavailable;
  }
  for (const option of $('rightLang').options) {
    const unavailable = option.value === leftLang;
    option.disabled = unavailable;
    option.hidden = unavailable;
  }
  $('leftChar').placeholder = LANGUAGES[leftLang].placeholder;
  $('rightChar').placeholder = LANGUAGES[rightLang].placeholder;
  validateInputs(false);
}

function validateOne(side, showMessage) {
  const lang = $(`${side}Lang`).value;
  const input = $(`${side}Char`);
  const value = normalize(input.value);
  let message = '';

  if (value && splitChars(value).length !== 1) {
    message = `${LANGUAGES[lang].label}の指定文字は1文字で入力してください。`;
  } else if (value && lang === 'en' && !/^[a-z]$/.test(value)) {
    message = '英語の指定文字はアルファベット1文字で入力してください。';
  } else if (value && lang !== 'en' && !/^[ぁ-ゖーゝゞ]$/.test(value)) {
    message = `${LANGUAGES[lang].label}の指定文字はひらがな1文字で入力してください。`;
  }

  setFieldError(input, Boolean(message));
  return showMessage ? message : '';
}

function validateInputs(showMessage = true) {
  const duplicate = $('leftLang').value === $('rightLang').value;
  const message = duplicate
    ? '異なる2つの言語を選んでください。'
    : validateOne('left', showMessage) || validateOne('right', showMessage);
  inputErrorEl.textContent = message;
  return !duplicate && !message;
}

function readCondition(side) {
  return {
    lang: $(`${side}Lang`).value,
    dir: $(`${side}Dir`).value,
    pos: Number($(`${side}Pos`).value),
    char: normalize($(`${side}Char`).value),
  };
}

function matchingVariants(row, condition) {
  return row[condition.lang].filter((word) => charAt(word, condition.dir, condition.pos) === condition.char);
}

function searchPosition() {
  try {
    if (!state.rows.length) throw new Error('内蔵データの読み込みに失敗しています。');
    if (!validateInputs()) throw new Error(inputErrorEl.textContent || '入力形式を確認してください。');

    const left = readCondition('left');
    const right = readCondition('right');
    if (![left.pos, right.pos].every((value) => Number.isInteger(value) && value >= 1)) {
      throw new Error('文字目は1以上の整数で入力してください。');
    }
    if (!left.char || !right.char) throw new Error('指定文字を両方入力してください。');

    const hits = state.rows.flatMap((row) => {
      const leftWords = matchingVariants(row, left);
      const rightWords = matchingVariants(row, right);
      return leftWords.length && rightWords.length ? [{ leftWords, rightWords }] : [];
    });

    summaryEl.textContent = `${hits.length}件ヒット`;
    resultsEl.innerHTML = hits.length
      ? hits.map((hit) => `
          <article class="result-item">
            <div><span class="tag">${escapeHtml(LANGUAGES[left.lang].label)}</span>${escapeHtml(hit.leftWords.join('／'))}</div>
            <div><span class="tag">${escapeHtml(LANGUAGES[right.lang].label)}</span>${escapeHtml(hit.rightWords.join('／'))}</div>
          </article>`).join('')
      : '<div class="result-item empty">ヒットなし</div>';
  } catch (error) {
    summaryEl.textContent = error.message || String(error);
    resultsEl.innerHTML = '';
  }
}

function init() {
  if (typeof EMBEDDED_SHEET_CSV === 'string') state.rows = processRows(parseCsv(EMBEDDED_SHEET_CSV));
  ['leftLang', 'rightLang'].forEach((id) => $(id).addEventListener('change', updateLanguageControls));
  ['leftChar', 'rightChar'].forEach((id) => $(id).addEventListener('input', () => validateInputs(false)));
  ['leftChar', 'rightChar', 'leftPos', 'rightPos'].forEach((id) => {
    $(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchPosition();
    });
  });
  searchBtn.addEventListener('click', searchPosition);
  updateLanguageControls();
}

init();
