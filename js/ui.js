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
    'panel_blocks': { de: 'Logic & UI (Drag)', en: 'Logic & UI (Drag)' },
    'panel_files': { de: 'Projektdateien', en: 'Project Files' },
    'ui_screen': { de: 'Screen:', en: 'Screen:' },
    'ui_elements_title': { de: 'Bestehende UI', en: 'Existing UI' },
    'btn_goto_ui': { de: 'Zu bestehenden UI Elementen', en: 'Go to existing UI elements' },
    
    'cat_ui_drag': { de: 'UI (in den Emulator ziehen!)', en: 'UI (Drag into Emulator!)' },
    'cat_logic': { de: 'Logik & Schleifen', en: 'Logic & Loops' },
    'cat_vars': { de: 'Variablen', en: 'Variables' },
    'cat_functions': { de: 'Funktionen', en: 'Functions' },
    'cat_math': { de: 'Mathematik', en: 'Math' },
    'cat_screens': { de: 'Screens & Navigation', en: 'Screens & Navigation' },
    
    'block_textlabel': { de: 'Textanzeige (Label)', en: 'Text Display (Label)' },
    'block_button': { de: 'Button (Klick)', en: 'Button (Click)' },
    'block_textfield': { de: 'Eingabefeld (TextField)', en: 'Input Field (TextField)' },
    'block_column': { de: 'Spalte (Column)', en: 'Column' },
    'block_row': { de: 'Zeile (Row)', en: 'Row' },
    
    'block_if': { de: 'If (Bedingung)', en: 'If (Condition)' },
    'block_loop': { de: 'Schleife (Solange...)', en: 'Loop (While...)' },
    'block_for': { de: 'Zähler-Schleife (For)', en: 'Count-Loop (For)' },
    'block_foreach': { de: 'Listen-Schleife (ForEach)', en: 'List-Loop (ForEach)' },
    'block_boolean': { de: 'Wahr / Falsch', en: 'True / False' },
    'block_not': { de: 'Nicht (NOT)', en: 'Not (NOT)' },
    'block_string': { de: 'Text (String)', en: 'Text (String)' },
    'block_number': { de: 'Zahl (123)', en: 'Number (123)' },
    'block_comparison': { de: 'Vergleich (=, >)', en: 'Comparison (=, >)' },
    'block_and': { de: 'Und (AND)', en: 'And (AND)' },
    'block_or': { de: 'Oder (OR)', en: 'Or (OR)' },
    'block_set_var': { de: 'Setze Variable', en: 'Set Variable' },
    'block_get_var': { de: 'Variable (Wert)', en: 'Variable (Value)' },
    'block_call_func': { de: 'Funktionsaufruf', en: 'Call Function' },
    'block_call_func_expr': { de: 'Funktion (Wert)', en: 'Function (Value)' },
    'block_return': { de: 'Return (Rückgabe)', en: 'Return (Value)' },
    
    'block_math_op': { de: 'Grundrechenarten (+, -)', en: 'Basic Math (+, -)' },
    'block_math_random': { de: 'Zufallszahl', en: 'Random Number' },
    'block_math_compare': { de: 'Min / Max / Avg (2 Werte)', en: 'Min / Max / Avg (2 values)' },
    'block_math_list': { de: 'Min / Max / Avg (Liste)', en: 'Min / Max / Avg (List)' },
    'block_math_func': { de: 'Wurzel, Log, ...', en: 'Sqrt, Log, ...' },
    'block_math_trig': { de: 'Sin, Cos, Tan', en: 'Sin, Cos, Tan' },

    'block_open_screen': { de: 'Screen öffnen', en: 'Open Screen' },
    'block_close_screen': { de: 'Screen schließen (Zurück)', en: 'Close Screen (Back)' },
    'block_exit_app': { de: 'App beenden', en: 'Exit App' },
    'block_get_screen_arg': { de: 'Screen Argument (Wert)', en: 'Screen Argument (Value)' },

    'btn_new_var': { de: '+ Neue Variable', en: '+ New Variable' },
    'prompt_new_var': { de: 'Name der neuen Variable:', en: 'Name of new variable:' },
    'prompt_new_local_var': { de: 'Name der neuen lokalen Variable:', en: 'Name of new local variable:' },
    'prompt_var_success': { de: 'Variable erfolgreich erstellt: ', en: 'Variable successfully created: ' },
    'sidebar_no_vars': { de: 'Keine Variablen definiert', en: 'No variables defined' },
    'sidebar_vars_list': { de: 'Variablen:', en: 'Variables:' },
    'drop_expr': { de: '...ablegen', en: '...drop' },

    'btn_new_func': { de: '+ Neue Funktion', en: '+ New Function' },
    'prompt_new_func': { de: 'Name der neuen Funktion:', en: 'Name of new function:' },
    'prompt_func_params': { de: 'Parameter-Namen (kommagetrennt, z.B. x, y):', en: 'Parameter names (comma separated, e.g. x, y):' },
    'prompt_func_success': { de: 'Funktion erstellt: ', en: 'Function created: ' },
    'sidebar_no_funcs': { de: 'Keine Funktionen', en: 'No functions' },
    'sidebar_funcs_list': { de: 'Funktionen:', en: 'Functions:' },

    'ctx_edit_params': { de: 'Parameter bearbeiten...', en: 'Edit Parameters...' },
    'ctx_copy_block': { de: 'Block kopieren', en: 'Copy Block' },
    'ctx_cut_block': { de: 'Block ausschneiden', en: 'Cut Block' },
    'ctx_paste_block': { de: 'Einfügen', en: 'Paste' },
    'ctx_delete_block': { de: 'Löschen', en: 'Delete' },

    'tree_empty': { de: 'Kein Projekt geladen. Wähle "Datei -> Neues Projekt".', en: 'No project loaded. Choose "File -> New Project".' },
    'terminal_title': { de: 'Terminal / Logs', en: 'Terminal / Logs' },
    'terminal_ready': { de: '> System bereit.', en: '> System ready.' },
    'emulator_title': { de: 'Live Emulator', en: 'Live Emulator' },
    'problems_title': { de: 'Fehler & Warnungen', en: 'Problems' },
    'no_problems': { de: 'Keine Probleme gefunden.', en: 'No problems found.' },
    
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
    'err_name_exists': { de: 'Dieser Name existiert bereits.', en: 'This name already exists.' },
    
    'prompt_new_screen': { de: 'Name des neuen Screens:', en: 'Name of new screen:' },
    
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
const blockContextMenu = document.getElementById('blockContextMenu');
const sidebarListMenu = document.getElementById('sidebarListMenu');

function hideAllMenus() { 
    contextMenu.classList.remove('active'); 
    createMenu.classList.remove('active'); 
    viewMenu.classList.remove('active'); 
    fileMenuDropdown.classList.remove('active'); 
    if (blockContextMenu) blockContextMenu.classList.remove('active');
    if (sidebarListMenu) sidebarListMenu.classList.remove('active');
}
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
    document.getElementById('btn-blocks').classList.remove('active'); 
    document.getElementById('btn-uielements').classList.remove('active'); 
    document.getElementById('btn-files').classList.remove('active');
    
    document.getElementById('panel-blocks').classList.remove('active'); 
    document.getElementById('panel-uielements').classList.remove('active'); 
    document.getElementById('panel-files').classList.remove('active');
    
    document.getElementById(`btn-${panelId}`).classList.add('active'); 
    document.getElementById(`panel-${panelId}`).classList.add('active');
}

function toggleRightPanel(panelId) {
    if (sidebarRight.classList.contains('collapsed')) { 
        sidebarRight.classList.remove('collapsed'); 
        switchRightTab(panelId);
        if(document.getElementById('contentRight').getBoundingClientRect().width < 50) {
            document.getElementById('contentRight').style.width = '280px';
        }
    } 
    else { 
        if (document.getElementById(`btn-${panelId}`).classList.contains('active')) { 
            sidebarRight.classList.add('collapsed'); 
            document.getElementById(`btn-${panelId}`).classList.remove('active'); 
        } else { 
            switchRightTab(panelId); 
        } 
    }
}

function switchRightTab(panelId) {
    document.getElementById('btn-emulator').classList.remove('active');
    document.getElementById('btn-problems').classList.remove('active');
    
    document.getElementById('panel-emulator').classList.remove('active');
    document.getElementById('panel-problems').classList.remove('active');

    document.getElementById(`btn-${panelId}`).classList.add('active');
    document.getElementById(`panel-${panelId}`).classList.add('active');
}

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

initResizer('resizerLeft', 'contentLeft', 'x', false, 'sidebarLeft', o => { if(o && !document.getElementById('btn-blocks').classList.contains('active') && !document.getElementById('btn-files').classList.contains('active') && !document.getElementById('btn-uielements').classList.contains('active')) switchLeftTab('blocks'); else if(!o) { document.getElementById('btn-blocks').classList.remove('active'); document.getElementById('btn-files').classList.remove('active'); document.getElementById('btn-uielements').classList.remove('active'); } });

initResizer('resizerRight', 'contentRight', 'x', true, 'sidebarRight', o => { 
    if(o && !document.getElementById('btn-emulator').classList.contains('active') && !document.getElementById('btn-problems').classList.contains('active')) {
        switchRightTab('emulator'); 
    } else if(!o) { 
        document.getElementById('btn-emulator').classList.remove('active'); 
        document.getElementById('btn-problems').classList.remove('active'); 
    } 
});

initResizer('resizerBottom', 'consoleContent', 'y', true, 'consolePanel', null);