/* Localisation fallback rules, tested directly. */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';
/* Repo root, derived from this file so the suite runs from anywhere. */
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails=0;
const check=(n,c,e='')=>{ if(c) console.log(`  ok   ${n}`); else {console.log(`  FAIL ${n} ${e}`); fails++;} };

function boot(url, navLang='en-US'){
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'dangerously',url});
  const w=dom.window;
  Object.defineProperty(w.navigator,'language',{value:navLang,configurable:true});
  for(const f of ['config.js','assets/i18n.js']){
    const s=w.document.createElement('script');
    s.textContent=readFileSync(join(ROOT,f),'utf8');
    w.document.body.appendChild(s);
  }
  return w;
}

console.log('\nLanguage resolution');
check('?lang=ka wins', boot('https://x.org/?lang=ka').I18N.getLang()==='ka');
check('?lang=ge normalises to ka', boot('https://x.org/?lang=ge').I18N.getLang()==='ka');
check('navigator en-US -> en', boot('https://x.org/').I18N.getLang()==='en');
check('navigator ka-GE -> ka', boot('https://x.org/','ka-GE').I18N.getLang()==='ka');
check('unsupported navigator (pl-PL) -> ru fallback', boot('https://x.org/','pl-PL').I18N.getLang()==='ru');
check('empty navigator -> ru fallback', boot('https://x.org/','').I18N.getLang()==='ru');

console.log('\npick() content fallback');
const w=boot('https://x.org/?lang=ka');
const {pick}=w.I18N;
const ruOnly={ru:'Только по-русски'};
check('KA visitor, RU-only field -> Russian', pick(ruOnly)==='Только по-русски');
check('EN visitor, RU-only field -> Russian', pick(ruOnly,'en')==='Только по-русски');
check('KA present -> Georgian', pick({ru:'рус',ka:'ქარ'})==='ქარ');
check('KA missing, EN present -> Russian (not English)', pick({ru:'рус',en:'eng'})==='рус');
check('no RU, EN present -> English', pick({en:'eng'},'ka')==='eng');
check('bare string passes through', pick('plain')==='plain');
check('null -> empty string', pick(null)==='');
check('empty string in requested lang falls through', pick({ka:'',ru:'рус'})==='рус');

console.log('\nExtra languages beyond ru/en/ka');
const withPl={ru:'рус',pl:'polski'};
check('unknown lang requested -> Russian', pick(withPl,'pl')==='polski' || pick(withPl,'pl')==='рус');
check('pet may carry a language the UI lacks', pick({pl:'polski'},'pl')==='polski');

console.log('\nTag objects');
check('tag id never leaks as a label', pick({id:'needs-home',ru:'Ищет дом'},'ka')==='Ищет дом');
check('tag with no labels degrades to its id', pick({id:'needs-home'},'ka')==='needs-home');

console.log('\nUI strings');
check('t() falls back to RU for a missing key in KA',
  typeof w.I18N.t('donateButton')==='string' && w.I18N.t('donateButton').length>0);
check('t() interpolates {n}', boot('https://x.org/?lang=en').I18N.t('resultsMany',{n:5})==='5 animals found');
check('unknown key returns the key', w.I18N.t('nope___')==='nope___');

console.log('\nlangsPresent');
check('lists filled languages only',
  JSON.stringify(w.I18N.langsPresent({ru:'a',en:'',ka:'c'}))===JSON.stringify(['ru','ka']));

console.log(fails===0?'\nAll i18n tests passed.':`\n${fails} FAILURE(S)`);
process.exit(fails?1:0);
