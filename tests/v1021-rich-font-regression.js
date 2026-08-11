"use strict";
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('public/app.js'),gallery=read('public/gallery.js'),publicUi=read('public/public-ui.js'),admin=read('public/admin.js'),print=read('public/print.js'),css=read('public/styles.css'),pkg=JSON.parse(read('package.json'));
assert.ok(/^1\.0\.(?:2[1-9]|[3-9]\d|\d{3,})$/.test(pkg.version),`expected version >= 1.0.21, got ${pkg.version}`);
assert(/while\(element\.lastElementChild&&(?:!element\.lastElementChild\.childNodes\.length|element\.lastElementChild\.childNodes\.length===0)\)element\.lastElementChild\.remove\(\)/.test(app));
assert(/while\(element\.lastElementChild&&(?:!element\.lastElementChild\.childNodes\.length|element\.lastElementChild\.childNodes\.length===0)\)element\.lastElementChild\.remove\(\)/.test(publicUi));
assert(!app.includes("line.appendChild(document.createElement('br'))"),'tree public rich renderer must not create phantom BR lines');
assert(!publicUi.includes("line.appendChild(document.createElement('br'))"),'shared public rich renderer must not create phantom BR lines');
assert(css.includes('.public-rich-line{display:block;min-height:0;margin:0;padding:0;line-height:1.35'));
assert(css.includes('.rich-text-editor>div,.rich-text-editor>p{min-height:0;margin:0;padding:0;line-height:1.35}'));
assert(gallery.includes('GiaPhaPublicUI.applyFont(s.tree_font)'));
assert(css.includes('body.public-page{font-family:var(--tree-font)}'));
for(const src of [app,publicUi,admin,print,css]){assert(src.includes('Noto Sans')||src.includes('Noto Serif'));assert(src.includes('DejaVu Sans')||src.includes('DejaVu Serif'));assert(src.includes('Liberation Sans')||src.includes('Liberation Serif'));}
assert(admin.includes('Hệ thống / Unicode (khuyến nghị)'));
console.log('v1.0.21 rich spacing + Vietnamese font regression: OK');
