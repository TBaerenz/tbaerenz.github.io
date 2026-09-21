// ==========================================
// TRANSLATION (i18n) & THEMES
// ==========================================
const dictionary = {
    'menu_file': { de: 'Datei', en: 'File' }, 'menu_edit': { de: 'Bearbeiten', en: 'Edit' },
    'menu_view': { de: 'Ansicht', en: 'View' }, 'menu_run': { de: 'Ausführen', en: 'Run' },
    'menu_file_load_default': { de: 'Neues Projekt (Standard)', en: 'New Project (Default)' },
    'menu_view_block': { de: 'Block-Editor (Visuell)', en: 'Block Editor (Visual)' },
    'menu_view_code': { de: 'Text-Editor (Code)', en: 'Text Editor (Code)' },
    'menu_view_theme': { de: 'Dark / Light Mode wechseln', en: 'Toggle Dark / Light Mode' },
    'menu_view_palette': { de: 'Farbpalette wählen...', en: 'Choose Color Palette...' },
    'panel_blocks': { de: 'UI Elemente (Drag)', en: 'UI Elements (Drag)' },
    'panel_files': { de: 'Projektdateien', en: 'Project Files' },
    
    'cat_control': { de: 'Container & Layout', en: 'Container & Layout' },
    'cat_logic': { de: 'Logik & Schleifen', en: 'Logic & Loops' },
    'cat_vars': { de: 'Variablen', en: 'Variables' },
    
    'block_scaffold': { de: 'Scaffold Container', en: 'Scaffold Container' },
    'block_greeting': { de: 'Text (Greeting)', en: 'Text (Greeting)' },
    'block_if': { de: 'If (Bedingung)', en: 'If (Condition)' },
    'block_loop': { de: 'Schleife (Solange...)', en: 'Loop (While...)' },
    'block_boolean': { de: 'Wahr / Falsch', en: 'True / False' },
    'block_number': { de: 'Zahl (123)', en: 'Number (123)' },
    'block_comparison': { de: 'Vergleich (=, >)', en: 'Comparison (=, >)' },
    'block_and': { de: 'Und (AND)', en: 'And (AND)' },
    'block_or': { de: 'Oder (OR)', en: 'Or (OR)' },
    'block_set_var': { de: 'Setze Variable', en: 'Set Variable' },
    'block_get_var': { de: 'Variable (Wert)', en: 'Variable (Value)' },
    
    'btn_new_var': { de: '+ Neue Variable', en: '+ New Variable' },
    'prompt_new_var': { de: 'Name der neuen Variable (z.B. punkte):', en: 'Name of new variable (e.g. score):' },
    'prompt_var_success': { de: 'Variable erfolgreich erstellt: ', en: 'Variable successfully created: ' },
    'sidebar_no_vars': { de: 'Keine Variablen definiert', en: 'No variables defined' },
    'sidebar_vars_list': { de: 'Variablen:', en: 'Variables:' },
    'drop_expr': { de: '...ablegen', en: '...drop' },

    'tree_empty': { de: 'Kein Projekt geladen. Wähle "Datei -> Neues Projekt".', en: 'No project loaded. Choose "File -> New Project".' },
    'terminal_title': { de: 'Terminal / Logs', en: 'Terminal / Logs' },
    'terminal_ready': { de: '> System bereit.', en: '> System ready.' },
    'emulator_title': { de: 'Live Emulator', en: 'Live Emulator' },
    'ctx_new': { de: 'Erstellen', en: 'Create' }, 'ctx_add': { de: 'Hinzufügen', en: 'Add' },
    'ctx_new_app': { de: 'Neue .app Datei', en: 'New .app File' }, 'ctx_new_folder': { de: 'Neuer Ordner', en: 'New Folder' },
    'ctx_rename': { de: 'Umbenennen', en: 'Rename' }, 'ctx_delete': { de: 'Löschen', en: 'Delete' },
    'ctx_copy': { de: 'Kopieren', en: 'Copy' }, 'ctx_cut': { de: 'Ausschneiden', en: 'Cut' }, 'ctx_paste': { de: 'Einfügen', en: 'Paste' },
    'prompt_new': { de: 'Bitte Dateinamen eingeben:', en: 'Please enter file name:' },
    'prompt_new_folder': { de: 'Bitte Ordnernamen eingeben:', en: 'Please enter folder name:' },
    'prompt_rename': { de: 'Neuer Name:', en: 'New name:' },
    'prompt_delete': { de: 'Möchtest du dieses Element wirklich löschen: ', en: 'Do you really want to delete: ' },
    'btn_cancel': { de: 'Abbrechen', en: 'Cancel' }, 'btn_ok': { de: 'OK', en: 'OK' },
    'err_empty_name': { de: 'Der Name darf nicht leer sein.', en: 'Name cannot be empty.' },
    'err_invalid_name': { de: 'Punkte (.) und Sonderzeichen sind nicht erlaubt.', en: 'Dots (.) and special characters are not allowed.' },
    'err_var_exists': { de: 'Diese Variable existiert bereits.', en: 'This variable already exists.' },
    'color_sunset': { de: 'Sunset Orange', en: 'Sunset Orange' },
    'color_ocean': { de: 'Ocean Blue', en: 'Ocean Blue' },
    'color_emerald': { de: 'Emerald Green', en: 'Emerald Green' },
    'color_amethyst': { de: 'Amethyst Purple', en: 'Amethyst Purple' },
    'prompt_new_project_warn': { de: 'Achtung: Alle nicht gespeicherten Änderungen werden verworfen. Fortfahren?', en: 'Warning: All unsaved changes will be lost. Continue?' },
    'btn_clear': { de: 'Leeren', en: 'Clear' },
};

function toggleLanguage() {
    currentLang = currentLang === 'de' ? 'en' : 'de';
    document.getElementById('lang-text').textContent = currentLang === 'de' ? 'DE' : 'EN';
    document.querySelectorAll('[data-i18n]').forEach(el => {
        if (dictionary[el.getAttribute('data-i18n')]) el.textContent = dictionary[el.getAttribute('data-i18n')][currentLang];
    });
}

function toggleTheme() { const htmlTag = document.documentElement; htmlTag.setAttribute('data-theme', htmlTag.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); hideAllMenus(); }
function applyColorPalette(colorName) { document.documentElement.setAttribute('data-color', colorName); hideAllMenus(); }

function validateName(name) {
    if (!name || name.trim() === '') return 'err_empty_name';
    const forbiddenChars = /[\\/:\*\?"<>\|.\s]/;
    if (forbiddenChars.test(name)) return 'err_invalid_name';
    return null; 
}

function openModal(options) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModal');
        const titleEl = document.getElementById('modalTitle');
        const msgEl = document.getElementById('modalMessage');
        const inputEl = document.getElementById('modalInput');
        const errorEl = document.getElementById('modalError');
        const btnCancel = document.getElementById('modalBtnCancel');
        const btnConfirm = document.getElementById('modalBtnConfirm');

        titleEl.textContent = options.title || '';
        msgEl.textContent = options.message || '';
        btnCancel.textContent = dictionary['btn_cancel'][currentLang];
        btnConfirm.textContent = dictionary['btn_ok'][currentLang];
        errorEl.style.display = 'none'; errorEl.textContent = '';

        if (options.type === 'prompt') {
            inputEl.style.display = 'block'; inputEl.value = options.defaultValue || '';
            setTimeout(() => inputEl.focus(), 100);
        } else { inputEl.style.display = 'none'; }

        if (options.danger) { btnConfirm.classList.remove('btn-confirm'); btnConfirm.classList.add('btn-danger'); } 
        else { btnConfirm.classList.remove('btn-danger'); btnConfirm.classList.add('btn-confirm'); }

        overlay.classList.add('active');

        function cleanup() {
            overlay.classList.remove('active');
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            inputEl.removeEventListener('keydown', onKey);
        }
        function onConfirm() {
            let val = options.type === 'prompt' ? inputEl.value.trim() : true;
            if (options.type === 'prompt' && options.validate) {
                let errorKey = options.validate(val);
                if (errorKey) { errorEl.textContent = dictionary[errorKey][currentLang]; errorEl.style.display = 'block'; inputEl.focus(); return; }
            }
            cleanup(); resolve(val);
        }
        function onCancel() { cleanup(); resolve(null); }
        function onKey(e) { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }

        btnConfirm.addEventListener('click', onConfirm); btnCancel.addEventListener('click', onCancel);
        inputEl.addEventListener('keydown', onKey);
    });
}

const contextMenu = document.getElementById('contextMenu');
const createMenu = document.getElementById('createMenu');
const viewMenu = document.getElementById('viewMenu');
const fileMenuDropdown = document.getElementById('fileMenuDropdown');

function hideAllMenus() { contextMenu.classList.remove('active'); createMenu.classList.remove('active'); viewMenu.classList.remove('active'); fileMenuDropdown.classList.remove('active'); }
function showFileMenu(e) { e.stopPropagation(); hideAllMenus(); const rect = e.target.getBoundingClientRect(); fileMenuDropdown.style.left = rect.left + 'px'; fileMenuDropdown.style.top = (rect.bottom + 10) + 'px'; fileMenuDropdown.classList.add('active'); }
function showViewMenu(e) { e.stopPropagation(); hideAllMenus(); const rect = e.target.getBoundingClientRect(); viewMenu.style.left = rect.left + 'px'; viewMenu.style.top = (rect.bottom + 10) + 'px'; viewMenu.classList.add('active'); }
function showCreateMenu(e) { e.stopPropagation(); hideAllMenus(); const rect = e.target.getBoundingClientRect(); createMenu.style.left = rect.left + 'px'; createMenu.style.top = (rect.bottom + 5) + 'px'; createMenu.classList.add('active'); }
document.addEventListener('click', hideAllMenus);

const sidebarLeft = document.getElementById('sidebarLeft'); 
const sidebarRight = document.getElementById('sidebarRight');

function toggleLeftPanel(panelId) {
    if (sidebarLeft.classList.contains('collapsed')) { sidebarLeft.classList.remove('collapsed'); switchLeftTab(panelId); } 
    else { if (document.getElementById(`btn-${panelId}`).classList.contains('active')) { sidebarLeft.classList.add('collapsed'); document.getElementById(`btn-${panelId}`).classList.remove('active'); } else { switchLeftTab(panelId); } }
}
function switchLeftTab(panelId) {
    document.getElementById('btn-blocks').classList.remove('active'); document.getElementById('btn-files').classList.remove('active');
    document.getElementById('panel-blocks').classList.remove('active'); document.getElementById('panel-files').classList.remove('active');
    document.getElementById(`btn-${panelId}`).classList.add('active'); document.getElementById(`panel-${panelId}`).classList.add('active');
}
function toggleRightPanel() { sidebarRight.classList.toggle('collapsed'); document.getElementById('btn-emulator').classList.toggle('active'); }
function toggleConsole() { const p = document.getElementById('consolePanel'); p.classList.toggle('collapsed'); }

function initResizer(rId, pId, dir, rev, cId, cb) {
    const r = document.getElementById(rId), p = document.getElementById(pId), c = document.getElementById(cId);
    let sP = 0, sS = 0, isDO = false;
    r.addEventListener('mousedown', e => {
        e.preventDefault(); sP = dir === 'x' ? e.clientX : e.clientY;
        if (c.classList.contains('collapsed')) { c.classList.remove('collapsed'); if (cb) cb(true); isDO = true; sS = 0; p.style[dir === 'x' ? 'width' : 'height'] = '0px'; } 
        else { isDO = false; sS = p.getBoundingClientRect()[dir === 'x' ? 'width' : 'height']; }
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
        document.body.style.cursor = dir === 'x' ? 'col-resize' : 'row-resize'; document.body.classList.add('is-resizing');
    });
    function move(e) {
        let dx = (dir === 'x' ? e.clientX : e.clientY) - sP; if (rev) dx = -dx; let nS = sS + dx;
        if (isDO && nS < 50) { p.style[dir === 'x' ? 'width' : 'height'] = `${Math.max(0, nS)}px`; return; } else if (isDO && nS >= 50) { isDO = false; }
        if (nS < 50) { if (!c.classList.contains('collapsed')) { c.classList.add('collapsed'); p.style[dir === 'x' ? 'width' : 'height'] = dir === 'x' ? '260px' : '150px'; if (cb) cb(false); } return; } 
        else if (c.classList.contains('collapsed')) { c.classList.remove('collapsed'); if (cb) cb(true); }
        p.style[dir === 'x' ? 'width' : 'height'] = `${nS}px`;
    }
    function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.cursor = 'default'; document.body.classList.remove('is-resizing'); }
}

initResizer('resizerLeft', 'contentLeft', 'x', false, 'sidebarLeft', o => { if(o && !document.getElementById('btn-blocks').classList.contains('active') && !document.getElementById('btn-files').classList.contains('active')) switchLeftTab('blocks'); else if(!o) { document.getElementById('btn-blocks').classList.remove('active'); document.getElementById('btn-files').classList.remove('active'); } });
initResizer('resizerRight', 'contentRight', 'x', true, 'sidebarRight', o => { if(o) document.getElementById('btn-emulator').classList.add('active'); else document.getElementById('btn-emulator').classList.remove('active'); });
initResizer('resizerBottom', 'consoleContent', 'y', true, 'consolePanel', null);