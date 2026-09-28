// CIFOG Lab · the step explanation goes above the workspace: read first, then try it below.
// It can be folded to a single line (remembered in this browser) once you know what to do.
import { getLang, onLangChange } from './i18n.js';

const TXT = {
  hide: { en: 'Fold the explanation', ca: "Plega l'explicació", es: 'Pliega la explicación' },
  show: { en: 'Show the explanation', ca: "Mostra l'explicació", es: 'Muestra la explicación' },
};
const say = k => TXT[k][getLang()] || TXT[k].en;
const KEY = 'cifog-brief-folded';

export function setupBrief() {
  const card = document.getElementById('step-card'), below = card?.closest('.below'), ws = document.getElementById('workspace');
  if (!card || !below || !ws || below.classList.contains('brief')) return;
  ws.parentNode.insertBefore(below, ws);
  below.classList.add('brief');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'brief-toggle'; btn.dataset.noI18n = '';
  below.append(btn);
  let folded = false;
  try { folded = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
  const render = () => { below.classList.toggle('folded', folded); btn.setAttribute('aria-expanded', String(!folded)); btn.innerHTML = `<span aria-hidden="true">${folded ? '▾' : '▴'}</span> ${say(folded ? 'show' : 'hide')}`; };
  btn.addEventListener('click', () => { folded = !folded; try { localStorage.setItem(KEY, folded ? '1' : '0'); } catch { /* storage unavailable */ } render(); });
  onLangChange(render);
  render();
}
setupBrief();
