// The scan step's controls and image pane, written once for every generator
// tab. Ids start with the tab's prefix (icon-flatten, texture-flatten …), as
// ScanStep expects; the words are the scan step's, in scan.md.

import { tHtml } from '../text'

const slider = (prefix: string, id: string, key: string, min: number, max: number, step: number, value: number) => `
  <label class="slider">
    <span>${tHtml(key)} <output id="${prefix}-${id}-out"></output></span>
    <input id="${prefix}-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
  </label>`

export interface ScanMarkup {
  /** Extra controls at the end of the Colour fieldset (a tab's "in these colours" choice). */
  colourExtra?: string
  /** The hint under "Several drawings on this sheet", in the tab's own words. */
  sheetHint: string
  /** The upload button's words. */
  upload: string
  /** Several photos may be chosen at once. */
  multiple?: boolean
  /** Above the upload button, in its box: what the tab asks before photos come in. */
  setup?: string
  /** Below the upload button, in its box. */
  after?: string
}

/** Replace the element with id `${prefix}-scan-controls` with the fieldsets of the scan step. */
export function scanControls(prefix: string, m: ScanMarkup) {
  const p = prefix
  document.getElementById(`${p}-scan-controls`)!.outerHTML = `
    <fieldset>
      <legend>${tHtml('scan.paper')}</legend>
      <p class="hint">${tHtml('scan.paper.hint')}</p>
      <div class="row">
        <button id="${p}-detect" class="button small" type="button">${tHtml('scan.detect')}</button>
        <button id="${p}-whole" class="button small" type="button">${tHtml('scan.whole')}</button>
      </div>
      <div class="turn-row">
        ${slider(p, 'turn', 'scan.turn', -45, 45, 0.1, 0)}
        <button id="${p}-turn-90" class="button mini" type="button" aria-label="${tHtml('scan.turn-90')}" title="${tHtml('scan.turn-90')}">↻ 90°</button>
      </div>
    </fieldset>
    <fieldset>
      <legend>${tHtml('scan.ink')}</legend>
      ${slider(p, 'flatten', 'scan.flatten', 0, 1, 0.05, 0.9)}
      ${slider(p, 'level', 'scan.level', 1, 254, 1, 128)}
      <label class="check"><input id="${p}-level-auto" type="checkbox" checked /> ${tHtml('scan.level-auto')}</label>
      ${slider(p, 'weight', 'scan.weight', -3, 3, 1, 0)}
      ${slider(p, 'speck', 'scan.speck', 0, 400, 5, 40)}
      ${slider(p, 'trim', 'scan.trim', 0, 0.08, 0.005, 0.015)}
    </fieldset>
    <fieldset>
      <legend>${tHtml('scan.colour')}</legend>
      <p class="hint">${tHtml('scan.colour.hint')}</p>
      ${slider(p, 'ink-h', 'scan.ink-h', 0, 360, 1, 260)}
      ${slider(p, 'ink-s', 'scan.ink-s', 0, 100, 1, 16)}
      ${slider(p, 'ink-l', 'scan.ink-l', 0, 100, 1, 12)}
      <label class="check"><input id="${p}-paper-on" type="checkbox" /> ${tHtml('scan.paper-on')}</label>
      ${slider(p, 'paper-h', 'scan.paper-h', 0, 360, 1, 40)}
      ${slider(p, 'paper-s', 'scan.paper-s', 0, 100, 1, 20)}
      ${slider(p, 'paper-l', 'scan.paper-l', 0, 100, 1, 96)}
      <div class="row">
        <button id="${p}-measure" class="button small" type="button" data-icon="c-spiral-fill">${tHtml('scan.measure')}</button>
      </div>
      ${m.colourExtra ?? ''}
    </fieldset>
    <fieldset>
      <legend>${tHtml('scan.sheet')}</legend>
      <label class="check accent"><input id="${p}-sheet-on" type="checkbox" /> ${tHtml('scan.sheet-on')}</label>
      <p class="hint">${m.sheetHint}</p>
      ${slider(p, 'gap', 'scan.gap', 0, 160, 1, 30)}
      <p class="hint" id="${p}-sheet-count" aria-live="polite"></p>
    </fieldset>`

  document.getElementById(`${p}-scan-image`)!.outerHTML = `
    <div class="upload-bar">
      ${m.setup ? `<div class="upload-setup">${m.setup}</div>` : ''}
      <button id="${p}-upload" class="button primary small upload" type="button" data-icon="arrow-bar-fill-r270">${m.upload}</button>
      <input id="${p}-file" type="file" accept="image/*,.heic,.heif"${m.multiple ? ' multiple' : ''} hidden />
      <button id="${p}-remove" class="button small remove" type="button" data-icon="big-x-fill" hidden>${tHtml('scan.remove')}</button>
      ${m.after ? `<div class="upload-after">${m.after}</div>` : ''}
    </div>
    <div class="pane image-pane empty" id="${p}-image-pane">
      <div class="pane-head">
        <h2>${tHtml('scan.image')}</h2>
        <div class="toggle" role="radiogroup" aria-label="${tHtml('scan.show')}">
          <label><input type="radio" name="${p}-view" value="ink" checked /> ${tHtml('scan.show-ink')}</label>
          <label><input type="radio" name="${p}-view" value="flat" /> ${tHtml('scan.show-flat')}</label>
        </div>
      </div>
      <div class="result-wrap">
        <div class="stage checker result-stage">
          <canvas id="${p}-ink-view"></canvas>
          <canvas id="${p}-flat-view" hidden></canvas>
        </div>
        <div class="photo-inset" id="${p}-inset">
          <div class="stage photo-stage">
            <canvas id="${p}-photo"></canvas>
            <svg id="${p}-handles" class="handles" aria-label="${tHtml('scan.corners')}"></svg>
          </div>
          <button id="${p}-inset-size" class="inset-size" type="button" aria-pressed="false">${tHtml('scan.enlarge')}</button>
        </div>
      </div>
      <div class="pieces" id="${p}-pieces" role="listbox" aria-label="${tHtml('scan.tray')}" hidden></div>
      <div class="globe-arc" id="${p}-globes" aria-label="${tHtml('scan.globes')}"></div>
    </div>`
}

/** The input inside a slider's label, by the tab's prefix and the slider's id. */
export const input = (prefix: string, id: string) => document.getElementById(`${prefix}-${id}`) as HTMLInputElement
