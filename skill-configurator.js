(() => {
  'use strict';

  const openButton = document.getElementById('skill-config-open');
  const jobSelect = document.getElementById('job');
  if (!openButton || !jobSelect) return;

  const STORE_KEY = 'maplestorym-skill-config-v1';
  const queryApi = new URLSearchParams(window.location.search).get('skill_api');
  const CONFIG_ENDPOINT = String(
    queryApi || window.MSM_SKILL_CONFIG_ENDPOINT || window.MSM_VISITOR_LOG_ENDPOINT || ''
  ).replace(/\/+$/, '');
  const COMBO_REF_PREFIX = '@combo:';
  const MODE_LABELS = {
    mobile: ['技能按鍵', '依照遊戲 Type B 技能盤配置；可放單一技能或 P1–P8 組合技能。'],
    combo: ['組合技能', '依照遊戲 Preset 8×8 結構：P1–P8，每組可依序放入 8 個技能。'],
    pc: ['PC 鍵盤配置', '兩排 16 格可放單一技能或 P1–P8；右側功能快捷欄只接受單一技能。']
  };
  const TYPE_LABELS = { active: '主動', buff: 'BUFF', combo: '組合技能' };
  const DEFAULT_KEYS = {
    mobile: ['T', 'Tab', 'Delete', 'W', 'E', 'R', 'Q', 'Enter'],
    pc: [
      ['Q', 'W', 'E', 'R', 'T', 'Tab', 'Delete', 'Enter'],
      ['A', 'S', 'D', 'F', 'L.Alt', 'PgDn', 'R.Ctrl', 'R.Shift']
    ],
    functions: ['1', '2', '3', '4']
  };

  const state = {
    mode: 'mobile',
    mobilePage: 0,
    comboGroup: 0,
    libraryType: 'all',
    libraryQuery: '',
    target: null,
    recording: null,
    skills: [],
    skillMap: new Map(),
    configs: loadStore(),
    publishedDefaults: new Map(),
    defaultRequests: new Map(),
    toastTimer: 0,
    metaSaveTimer: 0,
    submitting: false
  };

  const shell = document.createElement('div');
  shell.className = 'sc-shell';
  shell.hidden = true;
  shell.innerHTML = `
    <section class="sc-app" role="dialog" aria-modal="true" aria-labelledby="sc-title">
      <header class="sc-topbar">
        <div class="sc-title">
          <span class="sc-eyebrow">MAPLESTORY M · GAME UI</span>
          <h2 id="sc-title">技能</h2>
        </div>
        <span class="sc-job-chip" id="sc-job-name"></span>
        <button class="sc-close" type="button" aria-label="關閉技能配置">×</button>
      </header>
      <nav class="sc-tabs" aria-label="配置模式">
        <button class="sc-tab" type="button" data-mode="mobile" role="tab" aria-selected="true">技能按鍵</button>
        <button class="sc-tab" type="button" data-mode="combo" role="tab" aria-selected="false">組合技能 <span>8×8</span></button>
        <button class="sc-tab" type="button" data-mode="pc" role="tab" aria-selected="false">PC 鍵盤</button>
      </nav>
      <div class="sc-main">
        <section class="sc-workspace" aria-live="polite"></section>
        <aside class="sc-library">
          <div class="sc-library-head">
            <h3>可配置技能</h3>
            <input class="sc-search" type="search" placeholder="搜尋技能名稱…" aria-label="搜尋可配置技能">
          </div>
          <div class="sc-library-filters" aria-label="技能類型">
            <button class="sc-filter is-active" type="button" data-type="all">全部</button>
            <button class="sc-filter" type="button" data-type="active">主動</button>
            <button class="sc-filter" type="button" data-type="buff">BUFF</button>
            <button class="sc-filter" type="button" data-type="combo">組合</button>
          </div>
          <div class="sc-palette"></div>
          <div class="sc-library-note">先點左側欄位，再點技能即可配置；P1–P8 可放進技能按鍵與 PC 鍵盤，但不能放進另一個組合或功能快捷欄。</div>
        </aside>
      </div>
      <footer class="sc-footer">
        <span class="sc-status">草稿只儲存在這台裝置；提交後才會送給站長審核</span>
        <button class="sc-button" type="button" data-action="reset">還原推薦</button>
        <button class="sc-button is-danger" type="button" data-action="clear">清空目前</button>
        <button class="sc-button" type="button" data-action="save">儲存草稿</button>
        <button class="sc-button is-primary" type="button" data-action="submit">提交建議</button>
      </footer>
      <div class="sc-toast" role="status"></div>
      <div class="sc-submit-overlay" hidden>
        <form class="sc-submit-dialog" aria-labelledby="sc-submit-title">
          <div class="sc-submit-head">
            <div>
              <span>PLAYER RECOMMENDATION</span>
              <h3 id="sc-submit-title">提交技能配置建議</h3>
            </div>
            <button type="button" class="sc-submit-close" aria-label="關閉提交視窗">×</button>
          </div>
          <p class="sc-submit-summary"></p>
          <label class="sc-submit-field">
            <span>玩家名稱（選填）</span>
            <input name="submitter_name" maxlength="40" autocomplete="nickname" placeholder="方便站長辨識這份建議">
          </label>
          <label class="sc-submit-field">
            <span>配置說明（選填）</span>
            <textarea name="message" maxlength="500" rows="4" placeholder="例如：打王配置、練等配置，或推薦這樣安排的原因"></textarea>
          </label>
          <label class="sc-honeypot" aria-hidden="true">網站<input name="website" tabindex="-1" autocomplete="off"></label>
          <p class="sc-submit-note">會送出目前職業的兩頁技能按鍵、8 組組合技能與 PC 鍵盤配置；不會送出其他職業的草稿。</p>
          <p class="sc-submit-error" role="alert"></p>
          <div class="sc-submit-actions">
            <button type="button" class="sc-button sc-submit-cancel">取消</button>
            <button type="submit" class="sc-button is-primary sc-submit-confirm">確認提交</button>
          </div>
        </form>
      </div>
    </section>`;
  document.body.appendChild(shell);

  const app = shell.querySelector('.sc-app');
  const workspace = shell.querySelector('.sc-workspace');
  const palette = shell.querySelector('.sc-palette');
  const searchInput = shell.querySelector('.sc-search');
  const jobChip = shell.querySelector('#sc-job-name');
  const closeButton = shell.querySelector('.sc-close');
  const toast = shell.querySelector('.sc-toast');
  const submitOverlay = shell.querySelector('.sc-submit-overlay');
  const submitForm = shell.querySelector('.sc-submit-dialog');
  const submitSummary = shell.querySelector('.sc-submit-summary');
  const submitError = shell.querySelector('.sc-submit-error');
  const submitConfirm = shell.querySelector('.sc-submit-confirm');

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveStore(message = '') {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.configs)); } catch (_) {}
    if (message) showToast(message);
  }

  function showToast(message, duration = 1500) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  function currentJobCode() {
    return jobSelect.value || document.querySelector('.job-section:not([hidden])')?.dataset.job || 'SoulMaster';
  }

  function currentJobName() {
    const code = currentJobCode();
    return [...jobSelect.options].find(option => option.value === code)?.textContent?.trim() || code;
  }

  function comboRef(index) {
    return `${COMBO_REF_PREFIX}${index}`;
  }

  function comboIndexFromRef(value) {
    const match = /^@combo:([0-7])$/.exec(String(value || ''));
    return match ? Number(match[1]) : -1;
  }

  function comboAssignment(index, cfg = config()) {
    if (!Number.isInteger(index) || index < 0 || index > 7) return null;
    const items = cfg.combos?.[index] || [];
    const lead = state.skillMap.get(items.find(id => state.skillMap.has(id)));
    const meta = cfg.comboMeta?.[index] || {};
    const used = items.filter(id => state.skillMap.has(id)).length;
    const name = shortClientText(meta.name || `${index + 1} 號自訂`, 32);
    const description = shortClientText(meta.description || '', 300);
    return {
      id: comboRef(index),
      kind: 'combo',
      comboIndex: index,
      name,
      description,
      icon: lead?.icon || '',
      type: 'combo',
      stage: `P${index + 1} · ${used}/8`,
      used,
      searchable: `P${index + 1} ${name} ${description}`.toLocaleLowerCase('zh-Hant')
    };
  }

  function assignmentForId(id, cfg = config()) {
    const comboIndex = comboIndexFromRef(id);
    if (comboIndex >= 0) return comboAssignment(comboIndex, cfg);
    const skill = state.skillMap.get(id);
    return skill ? { ...skill, kind: 'skill' } : null;
  }

  function canAssignTo(ref, id) {
    if (!ref || !id) return false;
    if (state.skillMap.has(id)) return true;
    return comboIndexFromRef(id) >= 0 && (ref.area === 'mobile' || ref.area === 'pc');
  }

  function assignmentRestrictionMessage(id) {
    return comboIndexFromRef(id) >= 0
      ? '組合技能只能放在技能按鍵或 PC 鍵盤欄位'
      : '這個項目不能放在目前欄位';
  }

  function extractSkills() {
    const section = document.querySelector(`.job-section[data-job="${CSS.escape(currentJobCode())}"]`);
    if (!section) return [];
    const seen = new Set();
    return [...section.querySelectorAll('.skill-card')].flatMap((card, index) => {
      const type = card.dataset.type;
      if (!['active', 'buff'].includes(type)) return [];
      const name = card.querySelector('.skill-title h3')?.textContent?.trim() || card.querySelector('.skill-icon img')?.alt || `技能 ${index + 1}`;
      const icon = card.querySelector('.skill-icon img')?.getAttribute('src') || '';
      const code = (card.dataset.text || '').match(/\bskill_[a-z0-9_]+/i)?.[0];
      let id = code || `${name}|${icon}`;
      if (seen.has(id)) id = `${id}|${index}`;
      seen.add(id);
      return [{
        id,
        name,
        icon,
        type,
        stage: stageLabel(card.dataset.stage),
        searchable: `${name} ${code || ''}`.toLocaleLowerCase('zh-Hant')
      }];
    });
  }

  function stageLabel(stage) {
    if (!stage) return '';
    if (stage === 'v') return 'V 技能';
    if (stage === 'hexa') return 'HEXA';
    if (stage === 'hyper') return '超技能';
    if (stage === 'origin') return '起源技能';
    return stage.replace(/^lv/i, 'Lv.');
  }

  function makeGeneratedRecommendedConfig() {
    const ids = state.skills.map(skill => skill.id);
    return {
      schemaVersion: 2,
      mobilePages: [
        Array.from({ length: 8 }, (_, i) => ids[i] || null),
        Array.from({ length: 8 }, (_, i) => ids[i + 8] || null)
      ],
      combos: Array.from({ length: 8 }, () => Array(8).fill(null)),
      comboMeta: Array.from({ length: 8 }, (_, i) => ({ name: `${i + 1} 號自訂`, description: '' })),
      pc: [
        Array.from({ length: 8 }, (_, i) => i < 6 ? ids[i] || null : null),
        Array.from({ length: 8 }, (_, i) => ids[i + 6] || null)
      ],
      functions: Array(4).fill(null),
      keys: {
        mobile: [...DEFAULT_KEYS.mobile],
        pc: DEFAULT_KEYS.pc.map(row => [...row]),
        functions: [...DEFAULT_KEYS.functions]
      }
    };
  }

  function recommendedForCurrentJob() {
    const published = state.publishedDefaults.get(currentJobCode());
    return cloneValue(published || makeGeneratedRecommendedConfig());
  }

  function normalizeConfig(config, fallback = recommendedForCurrentJob()) {
    const fresh = fallback && typeof fallback === 'object' ? fallback : makeGeneratedRecommendedConfig();
    if (!config || typeof config !== 'object') return fresh;
    const legacyMobile = Array.isArray(config.mobile) ? config.mobile : null;
    return {
      schemaVersion: 2,
      mobilePages: Array.from({ length: 2 }, (_, page) => fixedArray(
        config.mobilePages?.[page] || (page === 0 ? legacyMobile : null),
        8,
        fresh.mobilePages?.[page] || []
      )),
      combos: Array.from({ length: 8 }, (_, i) => fixedArray(config.combos?.[i], 8, [])),
      comboMeta: Array.from({ length: 8 }, (_, i) => ({
        name: shortClientText(config.comboMeta?.[i]?.name || fresh.comboMeta?.[i]?.name || `${i + 1} 號自訂`, 32),
        description: shortClientText(config.comboMeta?.[i]?.description || '', 300)
      })),
      pc: Array.from({ length: 2 }, (_, i) => fixedArray(config.pc?.[i], 8, fresh.pc[i])),
      functions: fixedArray(config.functions, 4, fresh.functions),
      keys: {
        mobile: fixedArray(config.keys?.mobile, 8, fresh.keys.mobile),
        pc: Array.from({ length: 2 }, (_, i) => fixedArray(config.keys?.pc?.[i], 8, fresh.keys.pc[i])),
        functions: fixedArray(config.keys?.functions, 4, fresh.keys.functions)
      }
    };
  }

  function cloneValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function shortClientText(value, maxLength) {
    return String(value ?? '').slice(0, maxLength);
  }

  function fixedArray(value, length, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    return Array.from({ length }, (_, i) => source?.[i] ?? null);
  }

  function config() {
    const job = currentJobCode();
    state.configs[job] = normalizeConfig(state.configs[job]);
    return state.configs[job];
  }

  async function loadPublishedDefault(jobCode, applyWhenNoLocal = false, force = false) {
    if (!CONFIG_ENDPOINT) return false;
    if (!force && state.publishedDefaults.has(jobCode)) return true;
    if (!force && state.defaultRequests.has(jobCode)) return state.defaultRequests.get(jobCode);
    const request = (async () => {
      try {
        const response = await fetch(`${CONFIG_ENDPOINT}/skill-defaults?job_code=${encodeURIComponent(jobCode)}`, {
          mode: 'cors', cache: 'no-store', credentials: 'omit'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.default?.config) return false;
        const normalized = normalizeConfig(data.default.config, makeGeneratedRecommendedConfig());
        state.publishedDefaults.set(jobCode, normalized);
        if (applyWhenNoLocal && currentJobCode() === jobCode) {
          state.configs[jobCode] = cloneValue(normalized);
          saveStore();
          if (!shell.hidden) renderWorkspace();
        }
        return true;
      } catch (_) {
        return false;
      } finally {
        state.defaultRequests.delete(jobCode);
      }
    })();
    state.defaultRequests.set(jobCode, request);
    return request;
  }

  function open() {
    const jobCode = currentJobCode();
    const hadLocalConfig = Boolean(state.configs[jobCode]);
    state.skills = extractSkills();
    state.skillMap = new Map(state.skills.map(skill => [skill.id, skill]));
    config();
    state.target = null;
    jobChip.textContent = currentJobName();
    shell.hidden = false;
    document.body.classList.add('sc-locked');
    render();
    closeButton.focus({ preventScroll: true });
    loadPublishedDefault(jobCode, !hadLocalConfig);
  }

  function close() {
    cancelKeyRecording();
    closeSubmitDialog();
    shell.hidden = true;
    document.body.classList.remove('sc-locked');
    openButton.focus({ preventScroll: true });
  }

  function render() {
    renderWorkspace();
    renderPalette();
    shell.querySelectorAll('.sc-tab').forEach(tab => {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === state.mode));
    });
  }

  function renderWorkspace() {
    const [title, description] = MODE_LABELS[state.mode];
    let body = '';
    if (state.mode === 'mobile') body = renderMobile();
    if (state.mode === 'combo') body = renderCombos();
    if (state.mode === 'pc') body = renderPc();
    workspace.innerHTML = `<div class="sc-workspace-inner">
      <div class="sc-mode-heading">
        <div><h3>${title}</h3><p>${description}</p></div>
        <span class="sc-help-chip">點欄位 → 選技能　／　拖曳配置</span>
      </div>${body}</div>`;
    bindSlots();
  }

  function renderMobile() {
    const page = state.mobilePage;
    const slots = config().mobilePages[page];
    return `<div class="sc-mobile-frame">
      <div class="sc-mobile-board sc-mobile-gamepad">
        ${slots.map((id, index) => slotMarkup({ area: 'mobile', page, index, id, key: config().keys.mobile[index] })).join('')}
        <aside class="sc-mobile-page-control" aria-label="技能按鍵換頁">
          <span class="sc-game-page-indicator" aria-hidden="true">
            <img class="sc-page-indicator-bg" src="/maplestorym-global-skills-twn-preview/assets/game-ui/skill-config/main-hud/Preset_page_bg.png" alt="">
            <img class="sc-page-indicator-dot sc-page-indicator-dot--one" src="/maplestorym-global-skills-twn-preview/assets/game-ui/skill-config/main-hud/${page === 0 ? 'Preset_page_A.png' : 'Preset_page_D.png'}" alt="">
            <img class="sc-page-indicator-dot sc-page-indicator-dot--two" src="/maplestorym-global-skills-twn-preview/assets/game-ui/skill-config/main-hud/${page === 1 ? 'Preset_page_A.png' : 'Preset_page_D.png'}" alt="">
          </span>
          <button class="sc-mobile-page-switch" type="button" aria-label="切換到技能按鍵頁面 ${page === 0 ? 2 : 1}" title="切換技能按鍵頁面">
            <img src="/maplestorym-global-skills-twn-preview/assets/game-ui/skill-config/main-hud/Swap_btn_L.png" alt="">
          </button>
        </aside>
      </div>
    </div>`;
  }

  function renderCombos() {
    const groups = config().combos.map((items, index) => {
      const used = items.filter(Boolean).length;
      const lead = state.skillMap.get(items.find(Boolean));
      const meta = config().comboMeta[index];
      return `<section class="sc-combo-row${index === state.comboGroup ? ' is-active' : ''}">
        <button class="sc-group-button" type="button" data-group="${index}" aria-label="選擇 P${index + 1}">
          <strong>P${index + 1}</strong>
          <span class="sc-group-preview">${lead ? `<img src="${escapeAttr(lead.icon)}" alt="">` : '<i>＋</i>'}</span>
          <span><span class="sc-group-name-display">${escapeHtml(meta.name)}</span><small>${used} / 8</small></span>
        </button>
        <span class="sc-combo-arrow" aria-hidden="true">≪</span>
        <div class="sc-combo-body">
          <div class="sc-combo-editor">
            <label><span>自訂名稱</span><input class="sc-combo-name" data-combo-index="${index}" maxlength="32" value="${escapeAttr(meta.name)}" aria-label="P${index + 1} 組合名稱"></label>
            <label class="is-description"><span>配置說明</span><textarea class="sc-combo-description" data-combo-index="${index}" maxlength="300" rows="2" aria-label="P${index + 1} 配置說明" placeholder="輸入用途、施放順序或注意事項…">${escapeHtml(meta.description)}</textarea></label>
          </div>
          <div class="sc-combo-grid">${items.map((id, slotIndex) => slotMarkup({ area: 'combo', group: index, index: slotIndex, id })).join('')}</div>
        </div>
      </section>`;
    }).join('');
    return `<div class="sc-combo-layout">
      <div class="sc-combo-title"><strong>技能自訂</strong><span>觀看順序　●</span></div>
      <div class="sc-combo-groups" aria-label="組合技能群組">${groups}</div>
    </div>`;
  }

  function renderPc() {
    const pages = config().pc.map((items, page) => `<section class="sc-pc-page">
      <div class="sc-pc-page-title"><span>技能快速欄位頁面 ${page + 1}</span><b>${page === 0 ? 'PAGE 1' : 'PAGE 2'}</b></div>
      <div class="sc-pc-grid">${items.map((id, index) => slotMarkup({ area: 'pc', page, index, id, key: config().keys.pc[page][index] })).join('')}</div>
    </section>`).join('');
    const functions = config().functions.map((id, index) => slotMarkup({ area: 'functions', index, id, key: config().keys.functions[index] })).join('');
    return `<div class="sc-pc-layout">
      <div class="sc-pc-pages">${pages}</div>
      <aside class="sc-pc-side">
        <div class="sc-function-title">功能快捷欄位</div>
        <div class="sc-function-grid">${functions}</div>
        <div class="sc-pc-options">
          <div><span>操作類型設定</span><b>類型 B　●</b></div>
          <div><span>快捷欄位尺寸套用 2 倍率</span><b>○　off</b></div>
        </div>
      </aside>
    </div>`;
  }

  function slotMarkup(ref) {
    const id = ref.id;
    const assignment = id ? assignmentForId(id) : null;
    const isCombo = assignment?.kind === 'combo';
    const encoded = encodeURIComponent(JSON.stringify(refIdentity(ref)));
    const isTarget = sameTarget(ref, state.target);
    const key = ref.key != null
      ? `<button class="sc-key" type="button" data-key-ref="${encoded}" title="點一下後按新的鍵">${escapeHtml(ref.key || '未設定')}</button>`
      : '';
    const visual = assignment?.icon
      ? `<img src="${escapeAttr(assignment.icon)}" alt="">`
      : isCombo
        ? `<span class="sc-slot-combo-placeholder">P${assignment.comboIndex + 1}</span>`
        : '';
    const comboBadge = isCombo
      ? `<span class="sc-slot-combo-badge sc-combo-color-${assignment.comboIndex + 1}">P${assignment.comboIndex + 1}</span>`
      : '';
    const content = assignment
      ? `${visual}${comboBadge}<span class="sc-slot-name">${escapeHtml(assignment.name)}</span><button class="sc-remove" type="button" aria-label="移除 ${escapeAttr(assignment.name)}">×</button>`
      : `<span class="sc-slot-number">${ref.index + 1}</span>`;
    const comboTitle = isCombo ? `P${assignment.comboIndex + 1}｜${assignment.name}｜${assignment.used}/8 個技能` : assignment?.name;
    return `<div class="sc-slot sc-slot--${escapeAttr(ref.area)}${assignment ? ' has-skill' : ' is-empty'}${isCombo ? ' has-combo' : ''}${isTarget ? ' is-target' : ''}" role="button" tabindex="0" draggable="${Boolean(assignment)}" data-slot-ref="${encoded}" aria-label="${assignment ? escapeAttr(comboTitle) : `空白欄位 ${ref.index + 1}`}" title="${assignment ? escapeAttr(comboTitle) : '選擇此欄位'}">${key}${content}</div>`;
  }

  function refIdentity(ref) {
    const out = { area: ref.area, index: ref.index };
    if (Number.isInteger(ref.group)) out.group = ref.group;
    if (Number.isInteger(ref.page)) out.page = ref.page;
    return out;
  }

  function sameTarget(a, b) {
    return Boolean(a && b && a.area === b.area && a.index === b.index && a.group === b.group && a.page === b.page);
  }

  function bindSlots() {
    workspace.querySelector('.sc-recommend')?.addEventListener('click', resetRecommended);

    workspace.querySelector('.sc-mobile-page-switch')?.addEventListener('click', () => {
      state.mobilePage = state.mobilePage === 0 ? 1 : 0;
      state.target = null;
      renderWorkspace();
    });

    workspace.querySelectorAll('[data-group]').forEach(button => {
      button.addEventListener('click', () => {
        state.comboGroup = Number(button.dataset.group);
        state.target = null;
        workspace.querySelectorAll('.sc-combo-row').forEach((row, index) => row.classList.toggle('is-active', index === state.comboGroup));
      });
    });

    workspace.querySelectorAll('.sc-combo-name, .sc-combo-description').forEach(field => {
      field.addEventListener('click', event => event.stopPropagation());
      field.addEventListener('input', () => {
        const index = Number(field.dataset.comboIndex);
        if (!Number.isInteger(index) || !config().comboMeta[index]) return;
        const key = field.classList.contains('sc-combo-name') ? 'name' : 'description';
        const limit = key === 'name' ? 32 : 300;
        config().comboMeta[index][key] = shortClientText(field.value, limit);
        if (key === 'name') {
          const display = field.closest('.sc-combo-row')?.querySelector('.sc-group-name-display');
          if (display) display.textContent = config().comboMeta[index].name || `${index + 1} 號自訂`;
        }
        clearTimeout(state.metaSaveTimer);
        state.metaSaveTimer = setTimeout(() => saveStore(), 250);
      });
      field.addEventListener('change', () => saveStore('組合資料已儲存'));
    });

    workspace.querySelectorAll('.sc-slot').forEach(slot => {
      const ref = decodeRef(slot.dataset.slotRef);
      slot.addEventListener('click', event => {
        if (event.target.closest('.sc-remove, .sc-key')) return;
        state.target = ref;
        renderWorkspace();
      });
      slot.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.target = ref;
          renderWorkspace();
        }
      });
      slot.addEventListener('dragstart', event => {
        const id = getSlot(ref);
        if (!id) return event.preventDefault();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.setData('application/x-msm-origin', JSON.stringify(ref));
      });
      slot.addEventListener('dragover', event => {
        event.preventDefault();
        slot.classList.add('is-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('is-over'));
      slot.addEventListener('drop', event => {
        event.preventDefault();
        slot.classList.remove('is-over');
        const id = event.dataTransfer.getData('text/plain');
        if (!canAssignTo(ref, id)) return showToast(assignmentRestrictionMessage(id));
        const originRaw = event.dataTransfer.getData('application/x-msm-origin');
        let origin = null;
        try { origin = originRaw ? JSON.parse(originRaw) : null; } catch (_) {}
        if (origin && !sameTarget(origin, ref)) {
          const displaced = getSlot(ref);
          if (displaced && !canAssignTo(origin, displaced)) {
            return showToast('無法交換：組合技能不能移入組合內容或功能快捷欄');
          }
          setSlot(origin, displaced || null);
        }
        setSlot(ref, id);
        state.target = ref;
        saveStore('配置已更新');
        renderWorkspace();
      });
    });

    workspace.querySelectorAll('.sc-remove').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const ref = decodeRef(button.closest('.sc-slot').dataset.slotRef);
        setSlot(ref, null);
        saveStore('技能已移除');
        renderWorkspace();
      });
    });

    workspace.querySelectorAll('.sc-key').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        startKeyRecording(button, decodeRef(button.dataset.keyRef));
      });
    });
  }

  function renderPalette() {
    const query = state.libraryQuery.trim().toLocaleLowerCase('zh-Hant');
    const filteredSkills = state.skills.filter(skill => {
      const matchesType = state.libraryType === 'all' || skill.type === state.libraryType;
      return state.libraryType !== 'combo' && matchesType && (!query || skill.searchable.includes(query));
    });
    const comboItems = state.mode === 'combo' || !['all', 'combo'].includes(state.libraryType)
      ? []
      : Array.from({ length: 8 }, (_, index) => comboAssignment(index))
        .filter(item => item.used > 0 && (!query || item.searchable.includes(query)));
    const comboCards = comboItems.map(item => `
      <button class="sc-palette-card is-combo" type="button" draggable="true" data-skill-id="${escapeAttr(item.id)}" title="配置 P${item.comboIndex + 1}｜${escapeAttr(item.name)}">
        <span class="sc-palette-combo-visual">
          ${item.icon ? `<img src="${escapeAttr(item.icon)}" alt="">` : `<i>P${item.comboIndex + 1}</i>`}
          <b class="sc-palette-combo-badge sc-combo-color-${item.comboIndex + 1}">P${item.comboIndex + 1}</b>
        </span>
        <span><strong>${escapeHtml(item.name)}</strong><span>組合技能 · ${item.used}/8</span></span>
      </button>`).join('');
    const skillCards = filteredSkills.map(skill => `
      <button class="sc-palette-card" type="button" draggable="true" data-skill-id="${escapeAttr(skill.id)}" title="配置 ${escapeAttr(skill.name)}">
        <img src="${escapeAttr(skill.icon)}" alt=""><span><strong>${escapeHtml(skill.name)}</strong><span>${TYPE_LABELS[skill.type]} · ${escapeHtml(skill.stage)}</span></span>
      </button>`).join('');
    const sections = [];
    if (comboCards) sections.push(`<div class="sc-palette-section-title"><strong>組合技能 P1–P8</strong><span>可配置到技能按鍵與 PC 鍵盤</span></div>${comboCards}`);
    if (skillCards) {
      const skillTitle = comboCards ? '<div class="sc-palette-section-title"><strong>單一技能</strong></div>' : '';
      sections.push(`${skillTitle}${skillCards}`);
    }
    if (!sections.length && state.libraryType === 'combo' && state.mode === 'combo') {
      sections.push('<p class="sc-empty-palette">組合技能不能放進另一個組合技能；請切換到技能按鍵或 PC 鍵盤配置。</p>');
    }
    palette.innerHTML = sections.join('') || '<p class="sc-empty-palette">找不到符合條件的技能</p>';

    palette.querySelectorAll('.sc-palette-card').forEach(card => {
      const id = card.dataset.skillId;
      card.addEventListener('click', () => assignSkill(id));
      card.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', id);
      });
    });
  }

  function assignSkill(id) {
    let target = state.target;
    if (!target) target = firstEmptyInCurrentMode();
    if (!target) return showToast('請先選擇一個欄位');
    if (!canAssignTo(target, id)) return showToast(assignmentRestrictionMessage(id));
    setSlot(target, id);
    state.target = target;
    saveStore(comboIndexFromRef(id) >= 0 ? '組合技能已配置' : '技能已配置');
    renderWorkspace();
  }

  function firstEmptyInCurrentMode() {
    if (state.mode === 'mobile') {
      const index = config().mobilePages[state.mobilePage].findIndex(value => !value);
      return index >= 0 ? { area: 'mobile', page: state.mobilePage, index } : null;
    }
    if (state.mode === 'combo') {
      const index = config().combos[state.comboGroup].findIndex(value => !value);
      return index >= 0 ? { area: 'combo', group: state.comboGroup, index } : null;
    }
    for (let page = 0; page < 2; page += 1) {
      const index = config().pc[page].findIndex(value => !value);
      if (index >= 0) return { area: 'pc', page, index };
    }
    return null;
  }

  function getSlot(ref) {
    const cfg = config();
    if (ref.area === 'mobile') return cfg.mobilePages[ref.page ?? state.mobilePage][ref.index];
    if (ref.area === 'combo') return cfg.combos[ref.group][ref.index];
    if (ref.area === 'pc') return cfg.pc[ref.page][ref.index];
    if (ref.area === 'functions') return cfg.functions[ref.index];
    return null;
  }

  function setSlot(ref, value) {
    const cfg = config();
    if (ref.area === 'mobile') cfg.mobilePages[ref.page ?? state.mobilePage][ref.index] = value;
    if (ref.area === 'combo') cfg.combos[ref.group][ref.index] = value;
    if (ref.area === 'pc') cfg.pc[ref.page][ref.index] = value;
    if (ref.area === 'functions') cfg.functions[ref.index] = value;
  }

  function getKey(ref) {
    const keys = config().keys;
    if (ref.area === 'mobile') return keys.mobile[ref.index];
    if (ref.area === 'pc') return keys.pc[ref.page][ref.index];
    if (ref.area === 'functions') return keys.functions[ref.index];
    return '';
  }

  function setKey(ref, value) {
    const keys = config().keys;
    if (ref.area === 'mobile') keys.mobile[ref.index] = value;
    if (ref.area === 'pc') keys.pc[ref.page][ref.index] = value;
    if (ref.area === 'functions') keys.functions[ref.index] = value;
  }

  function startKeyRecording(button, ref) {
    cancelKeyRecording();
    const old = getKey(ref);
    state.recording = { button, ref, old };
    button.classList.add('is-recording');
    button.textContent = '按任意鍵…';
    window.addEventListener('keydown', captureKey, true);
  }

  function captureKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!state.recording) return;
    if (event.key === 'Escape') return cancelKeyRecording();
    const ref = state.recording.ref;
    setKey(ref, displayKey(event));
    state.recording = null;
    window.removeEventListener('keydown', captureKey, true);
    saveStore('按鍵已變更');
    renderWorkspace();
  }

  function cancelKeyRecording() {
    if (!state.recording) return;
    state.recording.button.classList.remove('is-recording');
    state.recording.button.textContent = state.recording.old;
    state.recording = null;
    window.removeEventListener('keydown', captureKey, true);
  }

  function displayKey(event) {
    const aliases = {
      ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Control: event.location === 2 ? 'R.Ctrl' : 'L.Ctrl',
      Shift: event.location === 2 ? 'R.Shift' : 'L.Shift',
      Alt: event.location === 2 ? 'R.Alt' : 'L.Alt',
      PageDown: 'PgDn', PageUp: 'PgUp', Delete: 'Delete', Enter: 'Enter', Tab: 'Tab'
    };
    return aliases[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  }

  function clearCurrent() {
    const cfg = config();
    if (state.mode === 'mobile') cfg.mobilePages.forEach(page => page.fill(null));
    if (state.mode === 'combo') cfg.combos[state.comboGroup].fill(null);
    if (state.mode === 'pc') {
      cfg.pc.forEach(page => page.fill(null));
      cfg.functions.fill(null);
    }
    state.target = null;
    saveStore('目前配置已清空');
    renderWorkspace();
  }

  async function resetRecommended() {
    const jobCode = currentJobCode();
    await loadPublishedDefault(jobCode, false, true);
    state.configs[jobCode] = recommendedForCurrentJob();
    state.target = null;
    saveStore('已還原推薦配置');
    renderWorkspace();
  }

  function openSubmitDialog() {
    saveStore();
    const cfg = config();
    const mobileCount = cfg.mobilePages.flat().filter(Boolean).length;
    const comboCount = cfg.combos.flat().filter(Boolean).length;
    const pcCount = cfg.pc.flat().concat(cfg.functions).filter(Boolean).length;
    submitSummary.textContent = `${currentJobName()}｜技能按鍵 ${mobileCount}/16｜組合技能 ${comboCount}/64｜PC 鍵盤 ${pcCount}/20`;
    submitError.textContent = '';
    submitOverlay.hidden = false;
    submitForm.querySelector('[name="submitter_name"]').focus({ preventScroll: true });
  }

  function closeSubmitDialog() {
    if (!submitOverlay || submitOverlay.hidden || state.submitting) return;
    submitOverlay.hidden = true;
    submitError.textContent = '';
  }

  function usedSkillIds(cfg) {
    return [...new Set([
      ...cfg.mobilePages.flat(),
      ...cfg.combos.flat(),
      ...cfg.pc.flat(),
      ...cfg.functions
    ].filter(Boolean))];
  }

  function buildSkillCatalog(cfg) {
    const catalog = Object.create(null);
    usedSkillIds(cfg).forEach(id => {
      const assignment = assignmentForId(id, cfg);
      catalog[id] = assignment ? {
        name: assignment.name,
        icon: assignment.icon,
        type: assignment.type,
        stage: assignment.stage
      } : { name: id, icon: '', type: '', stage: '' };
    });
    return catalog;
  }

  function submissionErrorMessage(code, fallback) {
    const messages = {
      origin_not_allowed: '目前的網站來源不允許提交。',
      invalid_payload: '配置資料格式不正確，請重新整理後再試。',
      payload_too_large: '這份配置資料太大，無法提交。',
      rate_limited: '短時間提交次數過多，請稍後再試。',
      unavailable: '建議服務目前無法使用。'
    };
    return messages[code] || fallback || '提交失敗，請稍後再試。';
  }

  async function submitRecommendation(event) {
    event.preventDefault();
    if (state.submitting) return;
    if (!CONFIG_ENDPOINT) {
      submitError.textContent = '尚未設定建議服務網址。';
      return;
    }

    const cfg = normalizeConfig(cloneValue(config()));
    const payload = {
      schema_version: 2,
      job_code: currentJobCode(),
      job_name: currentJobName(),
      submitter_name: submitForm.querySelector('[name="submitter_name"]').value.trim(),
      message: submitForm.querySelector('[name="message"]').value.trim(),
      website: submitForm.querySelector('[name="website"]').value,
      config: cfg,
      skill_catalog: buildSkillCatalog(cfg)
    };

    state.submitting = true;
    submitConfirm.disabled = true;
    submitConfirm.textContent = '提交中…';
    submitError.textContent = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${CONFIG_ENDPOINT}/skill-suggestions`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(submissionErrorMessage(data.error, response.statusText));
      saveStore();
      state.submitting = false;
      submitOverlay.hidden = true;
      submitForm.reset();
      showToast(`建議已送出｜編號 ${String(data.id || '').slice(0, 8)}`, 3600);
    } catch (error) {
      const message = error.name === 'AbortError' ? '提交逾時，請確認網路後再試。' : error.message;
      submitError.textContent = message;
    } finally {
      clearTimeout(timer);
      state.submitting = false;
      submitConfirm.disabled = false;
      submitConfirm.textContent = '確認提交';
    }
  }

  function decodeRef(value) {
    return JSON.parse(decodeURIComponent(value));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttr(value) { return escapeHtml(value); }

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  shell.addEventListener('click', event => { if (event.target === shell) close(); });
  submitForm.addEventListener('submit', submitRecommendation);
  submitForm.querySelector('.sc-submit-close').addEventListener('click', closeSubmitDialog);
  submitForm.querySelector('.sc-submit-cancel').addEventListener('click', closeSubmitDialog);
  submitOverlay.addEventListener('click', event => { if (event.target === submitOverlay) closeSubmitDialog(); });
  shell.querySelector('.sc-tabs').addEventListener('click', event => {
    const tab = event.target.closest('.sc-tab');
    if (!tab) return;
    cancelKeyRecording();
    state.mode = tab.dataset.mode;
    if (state.mode === 'combo' && state.libraryType === 'combo') {
      state.libraryType = 'all';
      shell.querySelectorAll('.sc-filter').forEach(item => item.classList.toggle('is-active', item.dataset.type === 'all'));
    }
    state.target = null;
    render();
  });
  shell.querySelector('.sc-library-filters').addEventListener('click', event => {
    const button = event.target.closest('.sc-filter');
    if (!button) return;
    state.libraryType = button.dataset.type;
    shell.querySelectorAll('.sc-filter').forEach(item => item.classList.toggle('is-active', item === button));
    renderPalette();
  });
  searchInput.addEventListener('input', () => {
    state.libraryQuery = searchInput.value;
    renderPalette();
  });
  shell.querySelector('.sc-footer').addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'reset') resetRecommended();
    if (action === 'clear') clearCurrent();
    if (action === 'save') saveStore('草稿已儲存');
    if (action === 'submit') openSubmitDialog();
  });
  window.addEventListener('keydown', event => {
    if (shell.hidden || event.key !== 'Escape' || state.recording) return;
    if (!submitOverlay.hidden) closeSubmitDialog();
    else close();
  });
  jobSelect.addEventListener('change', () => {
    if (shell.hidden) return;
    const jobCode = currentJobCode();
    const hadLocalConfig = Boolean(state.configs[jobCode]);
    state.skills = extractSkills();
    state.skillMap = new Map(state.skills.map(skill => [skill.id, skill]));
    config();
    jobChip.textContent = currentJobName();
    state.target = null;
    render();
    loadPublishedDefault(jobCode, !hadLocalConfig);
  });
})();
