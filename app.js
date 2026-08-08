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

function updatePositionInputs() {
  const shouldScan = $('scanSamePosition').checked;
  for (const id of ['leftPos', 'rightPos']) {
    const input = $(id);
    if (shouldScan) {
      if (input.value) input.dataset.previousValue = input.value;
      input.value = '';
      input.disabled = true;
    } else {
      input.disabled = false;
      input.value = input.dataset.previousValue || '1';
    }
  }
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

function scanMatchingPairs(row, left, right, ignoreSameWord) {
  const matches = [];
  for (const leftWord of row[left.lang]) {
    for (const rightWord of row[right.lang]) {
      if (ignoreSameWord && leftWord === rightWord) continue;
      const limit = Math.min(splitChars(leftWord).length, splitChars(rightWord).length);
      const positions = [];
      for (let position = 1; position <= limit; position += 1) {
        if (
          charAt(leftWord, left.dir, position) === left.char
          && charAt(rightWord, right.dir, position) === right.char
        ) {
          positions.push(position);
        }
      }
      if (positions.length) matches.push({ leftWord, rightWord, positions });
    }
  }
  return matches;
}

function fixedPositionPairs(row, left, right, ignoreSameWord) {
  const leftWords = matchingVariants(row, left);
  const rightWords = matchingVariants(row, right);
  const matches = [];
  for (const leftWord of leftWords) {
    for (const rightWord of rightWords) {
      if (ignoreSameWord && leftWord === rightWord) continue;
      matches.push({ leftWord, rightWord, positions: [] });
    }
  }
  return matches;
}

function searchPosition() {
  try {
    if (!state.rows.length) throw new Error('内蔵データの読み込みに失敗しています。');
    if (!validateInputs()) throw new Error(inputErrorEl.textContent || '入力形式を確認してください。');

    const left = readCondition('left');
    const right = readCondition('right');
    const scanSamePosition = $('scanSamePosition').checked;
    const ignoreSameWord = $('ignoreSameWord').checked;
    if (!scanSamePosition && ![left.pos, right.pos].every((value) => Number.isInteger(value) && value >= 1)) {
      throw new Error('文字目は1以上の整数で入力してください。');
    }
    if (!left.char || !right.char) throw new Error('指定文字を両方入力してください。');

    const hits = state.rows.flatMap((row) => scanSamePosition
      ? scanMatchingPairs(row, left, right, ignoreSameWord)
      : fixedPositionPairs(row, left, right, ignoreSameWord));

    summaryEl.textContent = `${hits.length}件ヒット`;
    resultsEl.innerHTML = hits.length
      ? hits.map((hit) => `
          <article class="result-item">
            ${scanSamePosition ? `<div class="match-position">${hit.positions.map((position) => `${position}文字目`).join('・')}</div>` : ''}
            <div><span class="tag">${escapeHtml(LANGUAGES[left.lang].label)}</span>${escapeHtml(hit.leftWord)}</div>
            <div><span class="tag">${escapeHtml(LANGUAGES[right.lang].label)}</span>${escapeHtml(hit.rightWord)}</div>
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
  $('scanSamePosition').addEventListener('change', updatePositionInputs);
  ['leftChar', 'rightChar'].forEach((id) => $(id).addEventListener('input', () => validateInputs(false)));
  ['leftChar', 'rightChar', 'leftPos', 'rightPos'].forEach((id) => {
    $(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchPosition();
    });
  });
  searchBtn.addEventListener('click', searchPosition);
  updateLanguageControls();
  updatePositionInputs();
}

init();
