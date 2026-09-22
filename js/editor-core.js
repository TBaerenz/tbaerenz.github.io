let highlightTimeout = null; 

function getAllVariables() {
    return Array.from(new Set([
        ...appModel.variables, 
        ...appModel.functions.flatMap(f => f.params)
    ]));
}

function checkNameExists(name) {
    let allNames = [...appModel.variables, ...appModel.functions.map(f => f.name), ...appModel.screens.map(s => s.id)];
    appModel.functions.forEach(f => {
        allNames.push(...(f.params || []));
        allNames.push(...(f.localVars || []));
    });
    appModel.screens.forEach(s => {
        function collectUiIds(node) {
            if(!node) return;
            if(['TextLabel', 'TextField', 'Button', 'Column', 'Row', 'Scaffold'].includes(node.type) && node.id) allNames.push(node.id);
            if(node.children) node.children.forEach(collectUiIds);
        }
        collectUiIds(s.uiTree);
    });
    return allNames.includes(name);
}

function makeControl(tagName) {
    let el = document.createElement(tagName);
    el.className = 'block-control';
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('touchstart', e => e.stopPropagation(), {passive: true});
    return el;
}

// ----------------------------------------------------
// HAUPT-UPDATE-FUNKTION (Hier fehlte sie zuvor!)
// ----------------------------------------------------
window.updateAllViews = function() {
    if (typeof window.renderBlockEditor === 'function') window.renderBlockEditor();      
    if (typeof window.renderEmulator === 'function') window.renderEmulator(true);         
    if (typeof window.syncKotlinCodeToVFS === 'function') window.syncKotlinCodeToVFS();
    if (typeof window.refreshStaticAnalysis === 'function') window.refreshStaticAnalysis();
};

window.renderScreenSwitcher = function() {
    const sel = document.getElementById('screenSelect');
    if (!sel) return;
    sel.innerHTML = '';
    appModel.screens.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.id; opt.text = s.id;
        if(s.id === appModel.activeScreenId) opt.selected = true;
        sel.appendChild(opt);
    });
};

window.switchScreen = function(screenId, arg = "") {
    if(appModel.screens.some(s => s.id === screenId)) {
        appModel.activeScreenId = screenId;
        window.emulatorScreenArg = arg;
        window.updateAllViews();
    }
};

window.promptNewScreen = async function() {
    let name = await openModal({ 
        title: 'Neuer Screen', 
        message: dictionary['prompt_new_screen'][currentLang] || 'Name des neuen Screens:', 
        type: 'prompt', 
        validate: (n) => {
            let err = validateName(n); if(err) return err;
            if(appModel.screens.some(s => s.id === n)) return 'err_name_exists';
            return null;
        } 
    });
    if (name) {
        appModel.screens.push({
            id: name,
            uiTree: { type: "Column", id: genId("col"), props: {}, children: [] },
            floatingBlocks: []
        });
        appModel.activeScreenId = name;
        window.updateAllViews();
    }
};

window.deleteCurrentScreen = async function() {
    if(appModel.screens.length <= 1) {
        alert("Der letzte Screen kann nicht gelöscht werden.");
        return;
    }
    let confirmed = await openModal({
        title: "Screen löschen",
        message: "Möchtest du den Screen '" + appModel.activeScreenId + "' wirklich löschen?",
        type: "confirm", danger: true
    });
    if(confirmed) {
        appModel.screens = appModel.screens.filter(s => s.id !== appModel.activeScreenId);
        appModel.activeScreenId = appModel.screens[0].id;
        window.updateAllViews();
    }
};

window.currentAnalysis = { varUsageOrder: {}, errors: [], warnings: [] };

window.highlightVar = function(varName) {
    clearTimeout(highlightTimeout);
    window.unhighlightVar();
    if (!varName) return;
    
    let order = window.currentAnalysis.varUsageOrder[varName] || [];
    order.forEach((id, idx) => {
        let el = document.getElementById('block_' + id) || document.getElementById('expr_' + id);
        if (el) {
            if (idx === 0) el.classList.add('highlight-first');
            else el.classList.add('highlight-sub');
        }
    });

    let uiEls = document.querySelectorAll(`[data-ui-id="${varName}"]`);
    uiEls.forEach(el => el.classList.add('ui-highlight'));
    let listEl = document.querySelector(`[data-sidebar-ui-id="${varName}"]`);
    if(listEl) listEl.classList.add('ui-highlight-list');
};

window.unhighlightVar = function() {
    clearTimeout(highlightTimeout);
    document.querySelectorAll('.highlight-first, .highlight-sub').forEach(el => el.classList.remove('highlight-first', 'highlight-sub'));
    document.querySelectorAll('.ui-highlight').forEach(el => el.classList.remove('ui-highlight'));
    document.querySelectorAll('.ui-highlight-list').forEach(el => el.classList.remove('ui-highlight-list'));
};

function analyzeAST() {
    let errors = []; let warnings = []; let varUsageOrder = {}; 
    let everAssigned = new Set(); let traversedFuncs = new Set(); let calledFuncs = new Set(); 

    function addUsage(v, id) { if(!varUsageOrder[v]) varUsageOrder[v] = []; varUsageOrder[v].push(id); }

    function checkVarExists(vName, declaredVars, nodeId) {
        if (!declaredVars.has(vName)) {
            errors.push({ type: 'error', msg: `Variable '${vName}' existiert nicht (gelöscht?).`, nodeId });
            return false;
        }
        return true;
    }

    function checkFuncExists(fName, nodeId) {
        if (!appModel.functions.some(f => f.name === fName)) {
            errors.push({ type: 'error', msg: `Funktion '${fName}' existiert nicht (gelöscht?).`, nodeId });
            return false;
        }
        return true;
    }

    function checkScreenExists(sName, nodeId) {
        if (!appModel.screens.some(s => s.id === sName)) {
            errors.push({ type: 'error', msg: `Screen '${sName}' existiert nicht (gelöscht?).`, nodeId });
            return false;
        }
        return true;
    }

    function traverse(node, ctx) {
        if (!node || typeof node !== 'object') return;

        // UI Interactions
        if (node.type === 'SetUIProperty') {
            if(node.props.targetId) addUsage(node.props.targetId, node.id);
            if (node.value) traverse(node.value, ctx);
        } else if (node.type === 'GetUIProperty') {
            if(node.props.targetId) addUsage(node.props.targetId, node.id);
        } else if (node.type === 'UIEvent') {
            if(node.props.sourceId) addUsage(node.props.sourceId, node.id);
        }

        if (node.type === 'SetVariable') {
            if (node.value) traverse(node.value, ctx);
            let v = node.props.varName;
            if (v) {
                addUsage(v, node.id);
                if (checkVarExists(v, ctx.declaredVars, node.id)) { ctx.assignedVars.add(v); everAssigned.add(v); }
            }
        } else if (node.type === 'VarValue') {
            let v = node.props.varName;
            if (v) {
                addUsage(v, node.id);
                if (checkVarExists(v, ctx.declaredVars, node.id) && !ctx.assignedVars.has(v)) {
                    errors.push({ type: 'error', msg: `Variable '${v}' wird verwendet, bevor ein Wert zugewiesen wurde.`, nodeId: node.id });
                }
            }
        } else if (node.type === 'CallFunction' || node.type === 'CallFunctionExpr') {
            let fName = node.props.funcName;
            if (node.args) { Object.values(node.args).forEach(arg => traverse(arg, ctx)); }
            
            if (fName && checkFuncExists(fName, node.id)) {
                calledFuncs.add(fName); 
                let fModel = appModel.functions.find(f => f.name === fName);
                let fb = null;
                appModel.screens.forEach(s => {
                    if (s.floatingBlocks) { let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === fName); if(found) fb = found; }
                });

                if (fb && !traversedFuncs.has(fName)) {
                    traversedFuncs.add(fName); 
                    let funcCtx = {
                        assignedVars: new Set(ctx.assignedVars),
                        declaredVars: new Set([...ctx.declaredVars, ...(fModel.params||[]), ...(fModel.localVars||[])])
                    };
                    if (fModel.params) fModel.params.forEach(p => funcCtx.assignedVars.add(p)); 
                    if (fb.node.children) fb.node.children.forEach(c => traverse(c, funcCtx));
                    funcCtx.assignedVars.forEach(v => { if (appModel.variables.includes(v)) { ctx.assignedVars.add(v); everAssigned.add(v); } });
                    traversedFuncs.delete(fName);
                }
            }
        } else if (node.type === 'If') {
            if (node.condition) traverse(node.condition, ctx);
            let branchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars };
            if (node.children) node.children.forEach(c => traverse(c, branchCtx));
            if (node.elseIfs) { node.elseIfs.forEach(elif => { if (elif.condition) traverse(elif.condition, ctx); let elBranchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars }; if (elif.children) elif.children.forEach(c => traverse(c, elBranchCtx)); }); }
            if (node.elseBranch && node.elseBranch.children) { let elseCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars }; node.elseBranch.children.forEach(c => traverse(c, elseCtx)); }
        } else if (node.type === 'Loop' || node.type === 'ForLoop' || node.type === 'ForEach') {
            if (node.condition) traverse(node.condition, ctx);
            if (node.start) traverse(node.start, ctx); if (node.end) traverse(node.end, ctx); if (node.step) traverse(node.step, ctx); if (node.list) traverse(node.list, ctx);
            let branchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: new Set(ctx.declaredVars) };
            if (node.type === 'ForLoop' || node.type === 'ForEach') { if(node.props.varName) { branchCtx.declaredVars.add(node.props.varName); branchCtx.assignedVars.add(node.props.varName); } }
            if (node.children) node.children.forEach(c => traverse(c, branchCtx));
        } else if (node.type === 'OpenScreen') {
            checkScreenExists(node.props.screenName, node.id);
            if (node.arg) traverse(node.arg, ctx);
        } else {
            if (node.children) node.children.forEach(c => traverse(c, ctx));
            if (node.condition) traverse(node.condition, ctx);
            if (node.left) traverse(node.left, ctx); if (node.right) traverse(node.right, ctx);
            if (node.value) traverse(node.value, ctx); if (node.min) traverse(node.min, ctx); if (node.max) traverse(node.max, ctx);
            if (node.list) traverse(node.list, ctx); if (node.arg) traverse(node.arg, ctx);
        }
    }

    let mainCtx = { assignedVars: new Set(), declaredVars: new Set(appModel.variables) };
    
    appModel.screens.forEach(s => {
        traverse(s.uiTree, mainCtx);
        if(!s.floatingBlocks) s.floatingBlocks = [];
        s.floatingBlocks.forEach(fb => {
            if (fb.node.type === 'FunctionDef') {
                let fModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
                if (fModel && !calledFuncs.has(fModel.name)) { warnings.push({ type: 'warning', msg: `Funktion '${fModel.name}' wird definiert, aber nie aufgerufen.`, nodeId: fb.node.id }); }
                let funcCtx = { assignedVars: new Set(fModel ? fModel.params || [] : []), declaredVars: new Set([...appModel.variables, ...(fModel? fModel.params||[] : []), ...(fModel? fModel.localVars||[] : [])]) };
                if (fb.node.children) fb.node.children.forEach(c => traverse(c, funcCtx));
            } else if (fb.node.type === 'UIEvent') {
                traverse(fb.node, mainCtx);
                let evtCtx = { assignedVars: new Set(), declaredVars: new Set(appModel.variables) };
                if (fb.node.children) fb.node.children.forEach(c => traverse(c, evtCtx));
            }
        });
    });

    appModel.variables.forEach(v => {
        if (!varUsageOrder[v] || varUsageOrder[v].length === 0) {
            if (!everAssigned.has(v)) warnings.push({ type: 'warning', msg: `Variable '${v}' ist ungenutzt.` });
        }
    });

    return { errors, warnings, varUsageOrder };
}

window.updateStatusUI = function(analysis) {
    const errBadge = document.getElementById('errorBadge');
    const warnBadge = document.getElementById('warningBadge');
    const problemsList = document.getElementById('problemsList');
    
    if(errBadge) errBadge.style.display = analysis.errors.length > 0 ? 'flex' : 'none';
    if(warnBadge) warnBadge.style.display = analysis.warnings.length > 0 ? 'flex' : 'none';
    if(document.getElementById('errorCount')) document.getElementById('errorCount').innerText = analysis.errors.length;
    if(document.getElementById('warningCount')) document.getElementById('warningCount').innerText = analysis.warnings.length;
    
    const overlay = document.getElementById('statusOverlay');
    if (!overlay || !problemsList) return;

    if (analysis.errors.length === 0 && analysis.warnings.length === 0) {
        overlay.style.display = 'none';
        problemsList.innerHTML = `<div style="padding: 15px; color: var(--text-muted); font-size: 12px;">${dictionary['no_problems'][currentLang] || 'Keine Probleme gefunden.'}</div>`;
        return;
    }
    
    overlay.style.display = 'flex';
    problemsList.innerHTML = '';
    
    let allItems = [...analysis.errors, ...analysis.warnings];
    allItems.forEach(item => {
        let el = document.createElement('div');
        el.className = `status-item ${item.type}`;
        el.innerText = item.msg;
        if (item.nodeId) {
            el.onmouseenter = () => { let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId); if (blockEl) blockEl.classList.add('error-pulse'); };
            el.onmouseleave = () => { let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId); if (blockEl) blockEl.classList.remove('error-pulse'); };
            el.onclick = () => { let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId); if (blockEl) blockEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); };
            el.style.cursor = 'pointer';
        }
        problemsList.appendChild(el);
    });
};

window.refreshStaticAnalysis = function() {
    window.currentAnalysis = analyzeAST();
    window.updateStatusUI(window.currentAnalysis);
};

window.promptNewVariable = async function(isLocal = false) {
    let titleKey = isLocal ? 'prompt_new_local_var' : 'btn_new_var';
    let msgKey = isLocal ? 'prompt_new_local_var' : 'prompt_new_var';
    
    let varName = await openModal({ 
        title: dictionary[titleKey][currentLang] || dictionary['btn_new_var'][currentLang], 
        message: dictionary[msgKey][currentLang] || dictionary['prompt_new_var'][currentLang], 
        type: 'prompt', 
        validate: (name) => {
            let err = validateName(name); if(err) return err;
            if (checkNameExists(name)) return 'err_name_exists';
            return null;
        } 
    });
    return varName;
};

window.createNewVariable = async function() {
    let v = await window.promptNewVariable(false);
    if (v) {
        appModel.variables.push(v);
        logToConsole((dictionary['prompt_var_success'][currentLang] || 'Variable erstellt: ') + v);
        window.updateAllViews();
    }
};

window.createNewFunction = async function() {
    let funcName = await openModal({
        title: dictionary['btn_new_func'][currentLang],
        message: dictionary['prompt_new_func'][currentLang],
        type: 'prompt',
        validate: (name) => {
            let err = validateName(name); if(err) return err;
            if (checkNameExists(name)) return 'err_name_exists';
            return null;
        }
    });
    if (!funcName) return;

    let paramsStr = await openModal({
        title: 'Parameter',
        message: dictionary['prompt_func_params'][currentLang] || 'Parameter (kommagetrennt):',
        type: 'prompt',
        defaultValue: ''
    });

    let params = [];
    if (paramsStr) {
        params = paramsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    appModel.functions.push({ name: funcName, params: params, localVars: [] });
    let newNode = { type: 'FunctionDef', id: genId('func'), props: { funcName: funcName }, children: [] };
    
    const x = (-window.canvasState.x + 50) / window.canvasState.scale;
    const y = (-window.canvasState.y + 50 + getActiveScreen().floatingBlocks.length * 80) / window.canvasState.scale;
    getActiveScreen().floatingBlocks.push({ x: x, y: y, node: newNode });
    
    logToConsole((dictionary['prompt_func_success'][currentLang] || 'Funktion erstellt: ') + funcName + "(" + params.join(", ") + ")");
    window.updateAllViews();
};

window.editFunctionParams = async function(funcName) {
    let func = appModel.functions.find(f => f.name === funcName);
    if (!func) return;
    let paramsStr = await openModal({
        title: dictionary['ctx_edit_params'][currentLang],
        message: dictionary['prompt_func_params'][currentLang],
        type: 'prompt',
        defaultValue: (func.params || []).join(', ')
    });
    if (paramsStr !== null) {
        func.params = paramsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        window.updateAllViews();
    }
};

window.deleteVariable = async function(varName) {
    let confirmed = await openModal({
        title: dictionary['ctx_delete'][currentLang],
        message: dictionary['prompt_delete'][currentLang] + " '" + varName + "'?",
        type: 'confirm', danger: true
    });
    if (confirmed) {
        appModel.variables = appModel.variables.filter(v => v !== varName);
        window.updateAllViews();
    }
};

window.deleteFunctionDef = async function(funcName, nodeId) {
    let confirmed = await openModal({
        title: dictionary['ctx_delete'][currentLang],
        message: dictionary['prompt_delete'][currentLang] + " '" + funcName + "'?",
        type: 'confirm', danger: true
    });
    if (confirmed) {
        appModel.functions = appModel.functions.filter(f => f.name !== funcName);
        if (nodeId) {
            extractNodeFromAnywhere(nodeId);
        } else {
            let fb = getActiveScreen().floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === funcName);
            if (fb) extractNodeFromAnywhere(fb.node.id);
        }
        window.updateAllViews();
    }
};

function highlightFunctionBlock(funcName) {
    let fb = getActiveScreen().floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === funcName);
    if (fb) {
        let el = document.getElementById('block_' + fb.node.id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            el.classList.remove('blink-highlight');
            void el.offsetWidth; 
            el.classList.add('blink-highlight');
        }
    }
}

let currentListTarget = null;
function bindListHoverEvents(span, name) {
    span.onmouseenter = (e) => { e.stopPropagation(); window.highlightVar(name); }
    span.onmouseleave = (e) => { e.stopPropagation(); window.unhighlightVar(); }
    span.onmousedown = (e) => { e.stopPropagation(); window.highlightVar(name); }
}

window.renderVariableList = function() {
    const listEl = document.getElementById('sidebarVarList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (appModel.variables.length === 0) {
        listEl.innerHTML = `<i>${dictionary['sidebar_no_vars'][currentLang]}</i>`;
    } else {
        let titleNode = document.createTextNode(dictionary['sidebar_vars_list'][currentLang] + " ");
        listEl.appendChild(titleNode);
        appModel.variables.forEach((v, idx) => {
            let span = document.createElement('span'); span.className = 'sidebar-list-item'; span.style.color = 'var(--accent-color)'; span.style.fontWeight = 'bold'; span.innerText = v;
            bindListHoverEvents(span, v);
            span.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation(); hideAllMenus();
                currentListTarget = { type: 'var', name: v };
                const menu = document.getElementById('sidebarListMenu');
                menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px'; menu.classList.add('active');
            };
            listEl.appendChild(span);
            if (idx < appModel.variables.length - 1) listEl.appendChild(document.createTextNode(', '));
        });
    }
};

window.renderFunctionList = function() {
    const listEl = document.getElementById('sidebarFuncList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (appModel.functions.length === 0) {
        listEl.innerHTML = `<i>${dictionary['sidebar_no_funcs'][currentLang]}</i>`;
    } else {
        let titleNode = document.createTextNode(dictionary['sidebar_funcs_list'][currentLang] + " ");
        listEl.appendChild(titleNode);
        appModel.functions.forEach((f, idx) => {
            let span = document.createElement('span'); span.className = 'sidebar-list-item'; span.style.color = 'var(--accent-color)'; span.style.fontWeight = 'bold'; span.innerText = f.name;
            span.onclick = () => highlightFunctionBlock(f.name);
            span.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation(); hideAllMenus();
                currentListTarget = { type: 'func', name: f.name };
                const menu = document.getElementById('sidebarListMenu');
                menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px'; menu.classList.add('active');
            };
            listEl.appendChild(span);
            if (idx < appModel.functions.length - 1) listEl.appendChild(document.createTextNode(', '));
        });
    }
};

window.handleListCtxAction = function(action) {
    hideAllMenus();
    if (!currentListTarget) return;
    if (action === 'delete') {
        if (currentListTarget.type === 'var') { window.deleteVariable(currentListTarget.name); } 
        else if (currentListTarget.type === 'func') { window.deleteFunctionDef(currentListTarget.name, null); } 
        else if (currentListTarget.type === 'local_var') {
            let fModel = appModel.functions.find(f => f.name === currentListTarget.funcName);
            if (fModel) {
                if (fModel.params && fModel.params.includes(currentListTarget.name)) fModel.params = fModel.params.filter(p => p !== currentListTarget.name);
                else if (fModel.localVars && fModel.localVars.includes(currentListTarget.name)) fModel.localVars = fModel.localVars.filter(v => v !== currentListTarget.name);
                window.updateAllViews();
            }
        }
    }
    currentListTarget = null;
};

window.renameUIElement = async function(oldId) {
    let newId = await openModal({
        title: dictionary['ctx_rename'][currentLang],
        message: 'Neue ID für UI Element:', type: 'prompt', defaultValue: oldId,
        validate: (n) => { let err = validateName(n); if(err) return err; if(n !== oldId && checkNameExists(n)) return 'err_name_exists'; return null; }
    });
    if(!newId || newId === oldId) return;

    function renameInTree(node) {
        if(!node) return;
        if(node.id === oldId) node.id = newId;
        if(node.children) node.children.forEach(renameInTree);
    }
    renameInTree(getActiveScreen().uiTree);

    getActiveScreen().floatingBlocks.forEach(fb => {
        function renameInLogic(node) {
            if(!node) return;
            if(node.type === 'UIEvent' && node.props.sourceId === oldId) node.props.sourceId = newId;
            if(node.type === 'SetUIProperty' && node.props.targetId === oldId) node.props.targetId = newId;
            if(node.type === 'GetUIProperty' && node.props.targetId === oldId) node.props.targetId = newId;
            if(node.children) node.children.forEach(renameInLogic);
            if(node.value) renameInLogic(node.value); if(node.condition) renameInLogic(node.condition);
            if(node.left) renameInLogic(node.left); if(node.right) renameInLogic(node.right);
            if(node.elseIfs) node.elseIfs.forEach(elif => { if(elif.condition) renameInLogic(elif.condition); if(elif.children) elif.children.forEach(renameInLogic); });
            if(node.elseBranch && node.elseBranch.children) node.elseBranch.children.forEach(renameInLogic);
            let props = ['min', 'max', 'list', 'start', 'end', 'step', 'textExpr', 'arg'];
            for(let p of props) if(node[p]) renameInLogic(node[p]);
        }
        renameInLogic(fb.node);
    });

    let tempVal1 = window.emulatorCtx[oldId + "_text"]; let tempVal2 = window.emulatorCtx[oldId + "_label"];
    if(tempVal1 !== undefined) { window.emulatorCtx[newId + "_text"] = tempVal1; delete window.emulatorCtx[oldId + "_text"]; }
    if(tempVal2 !== undefined) { window.emulatorCtx[newId + "_label"] = tempVal2; delete window.emulatorCtx[oldId + "_label"]; }
    window.updateAllViews();
};

window.deleteUIElement = function(id, e) {
    if(e) e.stopPropagation();
    let activeScreen = getActiveScreen();
    function removeUI(node) {
        if(!node || !node.children) return false;
        for(let i=0; i<node.children.length; i++) {
            if(node.children[i].id === id) { node.children.splice(i, 1); return true; }
            if(removeUI(node.children[i])) return true;
        }
        return false;
    }
    removeUI(activeScreen.uiTree);
    activeScreen.floatingBlocks = activeScreen.floatingBlocks.filter(fb => !(fb.node.type === 'UIEvent' && fb.node.props.sourceId === id));
    window.updateAllViews();
};

window.renderUIElementsPanel = function() {
    const list = document.getElementById('uiElementsList');
    if(!list) return;
    list.innerHTML = '';
    let activeScreen = getActiveScreen();
    function collectUI(node, result) {
        if(!node) return;
        if (['TextLabel', 'TextField', 'Button', 'Row', 'Column', 'Scaffold'].includes(node.type) && node.id) result.push(node);
        if (node.children) node.children.forEach(c => collectUI(c, result));
    }
    let uiElements = [];
    collectUI(activeScreen.uiTree, uiElements);
    
    if(uiElements.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:10px;">Keine UI-Elemente vorhanden. Ziehe sie aus "Logic & UI" in den Emulator.</div>`;
        return;
    }
    
    uiElements.forEach(el => {
        let details = document.createElement('details'); details.className = 'category';
        let summary = document.createElement('summary'); summary.setAttribute('data-sidebar-ui-id', el.id);
        let icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        summary.innerHTML = `${icon} <span style="font-family:monospace; margin-left:5px;">${el.id}</span> (${el.type})`;
        bindListHoverEvents(summary, el.id);
        details.appendChild(summary);

        let cmds = document.createElement('div'); cmds.className = 'commands-list';
        let prop = 'text'; if (el.type === 'Button') prop = 'label';
        
        if (['TextLabel', 'TextField', 'Button'].includes(el.type)) {
            let setBtn = document.createElement('div'); setBtn.className = 'command-block ui-logic-block'; setBtn.draggable = true; setBtn.innerText = `Setze ${prop}`;
            setBtn.ondragstart = (e) => {
                const rect = setBtn.getBoundingClientRect();
                e.dataTransfer.setData('application/json', JSON.stringify({ source: 'sidebar', type: 'SetUIProperty', targetId: el.id, property: prop, isExpr: false, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }));
                window.setDragState(false, null, 'SetUIProperty');
            };
            cmds.appendChild(setBtn);
            
            let getBtn = document.createElement('div'); getBtn.className = 'command-block val-expr ui-logic-block'; getBtn.draggable = true; getBtn.innerText = `Lese ${prop}`;
            getBtn.ondragstart = (e) => {
                const rect = getBtn.getBoundingClientRect();
                e.dataTransfer.setData('application/json', JSON.stringify({ source: 'sidebar', type: 'GetUIProperty', targetId: el.id, property: prop, isExpr: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }));
                window.setDragState(true, 'value', 'GetUIProperty');
            };
            cmds.appendChild(getBtn);
        } else {
            let hint = document.createElement('div'); hint.style.cssText = 'color:var(--text-muted); font-size:11px;'; hint.innerText = "Container Element"; cmds.appendChild(hint);
        }
        
        let actionsRow = document.createElement('div'); actionsRow.style.cssText = 'display:flex; gap:5px; margin-top:5px;';
        let btnRename = document.createElement('button'); btnRename.className = 'btn-add-var'; btnRename.style.flex = "1"; btnRename.style.padding = "4px"; btnRename.innerText = dictionary['ctx_rename'][currentLang];
        btnRename.onclick = (e) => { e.stopPropagation(); window.renameUIElement(el.id); };
        
        let btnDelete = document.createElement('button'); btnDelete.className = 'btn-add-var'; btnDelete.style.flex = "1"; btnDelete.style.padding = "4px"; btnDelete.style.color = '#ef4444'; btnDelete.style.borderColor = 'rgba(239,68,68,0.3)'; btnDelete.innerText = dictionary['ctx_delete'][currentLang];
        btnDelete.onmouseenter = () => btnDelete.style.backgroundColor = "rgba(239, 68, 68, 0.1)"; btnDelete.onmouseleave = () => btnDelete.style.backgroundColor = "transparent";
        btnDelete.onclick = (e) => { e.stopPropagation(); window.deleteUIElement(el.id, e); };
        
        actionsRow.appendChild(btnRename); actionsRow.appendChild(btnDelete); cmds.appendChild(actionsRow);
        details.appendChild(cmds); list.appendChild(details);
    });
};

window.getLocalVarsForNode = function(targetId) {
    let locals = [];
    function findPath(node, path) {
        if (!node) return false;
        if (node.id === targetId) return true;
        let currentLocals = [];
        if (node.type === 'FunctionDef') { let f = appModel.functions.find(x => x.name === node.props.funcName); if (f) currentLocals = [...(f.params||[]), ...(f.localVars||[])]; } 
        else if (node.type === 'ForLoop' || node.type === 'ForEach') { if (node.props.varName) currentLocals = [node.props.varName]; }
        path.push(...currentLocals);
        if (node.children) { for (let c of node.children) { if (findPath(c, path)) return true; } }
        if (node.type === 'If') {
            if (node.elseIfs) { for (let branch of node.elseIfs) { if (branch.children) { for(let c of branch.children) if(findPath(c, path)) return true; } } }
            if (node.elseBranch && node.elseBranch.children) { for(let c of node.elseBranch.children) if(findPath(c, path)) return true; }
        }
        for(let i=0; i<currentLocals.length; i++) path.pop();
        return false;
    }
    let activeScreen = getActiveScreen();
    if(activeScreen && activeScreen.floatingBlocks) { for (let fb of activeScreen.floatingBlocks) { if (findPath(fb.node, locals)) return locals; } }
    return locals;
};

window.getFunctionIdByInnerNode = function(nodeId) {
    for (let fb of getActiveScreen().floatingBlocks) {
        if (fb.node.type === 'FunctionDef') { if (fb.node.id === nodeId || findNodeById(fb.node, nodeId)) return fb.node.id; }
    }
    return null;
};