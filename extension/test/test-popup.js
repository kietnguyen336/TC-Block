import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const popupHTML = read('popup', 'popup.html');
const popupCSS = read('popup', 'popup.css');
const popupJS = read('popup', 'popup.js');
const detailsHTML = read('details', 'details.html');
const detailsJS = read('details', 'details.js');
const EMOJI = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
const VIETNAMESE_UI = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;

for (const [name, source] of Object.entries({ popupHTML, popupCSS, popupJS })) {
  assert.equal(source.match(EMOJI), null, `${name} must not contain emoji`);
  assert.equal(source.match(VIETNAMESE_UI), null, `${name} must be English-only`);
}

assert.ok(popupHTML.includes('id="blockedCount"'));
assert.ok(popupHTML.includes('id="openDetails"'));
assert.ok(popupHTML.includes('id="donateLink"'));
assert.ok(popupHTML.includes('id="githubLink"'));
assert.ok(popupHTML.includes('v1.1.1'));
assert.ok(!popupHTML.includes('searchInput'));
assert.ok(!popupHTML.includes('listContainer'));
assert.ok(!popupHTML.includes('syncBtn'));
assert.ok(popupJS.includes("action: 'GET_SUMMARY'"));
assert.ok(!popupJS.includes('GET_BLOCKED_CHANNELS'), 'Popup must not load the channel collection');
assert.ok(popupJS.includes("details/details.html"));
assert.ok(popupCSS.includes('box-shadow'));

assert.ok(detailsHTML.includes('id="searchInput"'));
assert.ok(detailsHTML.includes('id="listContainer"'));
assert.ok(detailsHTML.includes('id="syncBtn"'));
assert.ok(detailsHTML.includes('Sync now'));
assert.ok(detailsJS.includes('GET_BLOCKED_CHANNELS'));
assert.ok(detailsJS.includes('UNBLOCK_CHANNEL'));
assert.ok(detailsJS.includes('FORCE_SYNC'));
assert.equal((detailsJS.match(/FORCE_SYNC/g) || []).length, 1, 'Sync must only run after the user clicks Sync now');
assert.ok(!detailsJS.includes('SET_SETTINGS'));

console.log('PASS lightweight English popup and separate blocked-channel management page');
