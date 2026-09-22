// ==========================================
// GLOBALE DRAG STATE TRACKER
// ==========================================
window.draggedExprType = null;
function getExprType(type) {
    if (['BooleanValue', 'Comparison', 'LogicAnd', 'LogicOr'].includes(type)) return 'boolean';
    if (['NumberValue', 'VarValue', 'CallFunctionExpr'].includes(type)) return 'value';
    return null;
}

// Prüft ob ein Name schon als Variable oder Funktion genutzt wird
function checkNameExists(name) {
    let allNames = [...appModel.variables, ...appModel.functions.map(f => f.name)];
    return allNames.includes(name);
}

// Erstellt ein standardisiertes HTML-Element, das den DragStart vom Parent verhindert
function makeControl(tagName) {
    let el = document.createElement(tagName);
    el.className = 'block-control';
    // Dies verhindert, dass ein Klick in das Eingabefeld den Block zum Draggen auswählt!
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('touchstart', e => e.stopPropagation(), {passive: true});
    return el;
}

// Hilfsfunktion: Setzt Drag-Klassen sicher
function setDragState(isExpr, type) {
    if (isExpr) {
        document.body.classList.add('dragging-expr');
        document.body.classList.remove('dragging-stmt');
        window.draggedExprType = type;
    } else {
        document.body.classList.add('dragging-stmt');
        document.body.classList.remove('dragging-expr');
        window.draggedExprType = null;
    }
}

// Diese Funktion reinigt alle Drag-Zustände, egal was passiert ist
function clearDragState() {
    document.body.classList.remove('dragging-expr', 'dragging-stmt');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.visual-block').forEach(el => el.style.opacity = '');
    document.querySelectorAll('.expr-block').forEach(el => el.style.opacity = '');
    window.draggedExprType = null;
}

// Wenn ein Dragvorgang standardmäßig endet
document.addEventListener('dragend', clearDragState);

// ==========================================
// DRAG AND DROP (Logik)
// ==========================================
function getLocalVarsForNode(id) {
    for (let fb of appModel.floatingBlocks) {
        if (fb.node.type === 'FunctionDef') {
            if (fb.node.id === id || findNodeById(fb.node, id)) {
                let fModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
                return fModel ? fModel.params : [];
            }
        }
    }
    return [];
}

function handleDragStartSidebar(e) {
    const type = e.target.getAttribute('data-type');
    const isExpr = e.target.getAttribute('data-is-expr') === 'true';
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'sidebar', type: type, isExpr: isExpr }));
    setDragState(isExpr, getExprType(type));
}

async function handleStatementDrop(e, parentId, index) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        let data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.isExpr || data.source === 'editor-expr') { clearDragState(); return; }
        
        let parentNode = findNodeAnywhere(parentId);
        if (!parentNode || !parentNode.children) { clearDragState(); return; }

        if (data.source === 'sidebar') {
            const newId = data.type.toLowerCase() + '_' + Date.now();
            let newNode = {
                type: data.type, id: newId, props: {},
                children: (['Scaffold', 'If', 'Loop', 'FunctionDef'].includes(data.type)) ? [] : undefined
            };
            if (data.type === 'Greeting') newNode.props = { name: "Neu" };
            if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
            if (data.type === 'Return') newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            
            if (data.type === 'SetVariable') { 
                let locals = getLocalVarsForNode(parentId);
                let selectedVar = appModel.variables[0] || locals[0] || '';
                if (!selectedVar) {
                    selectedVar = await promptNewVariable();
                    if (!selectedVar) { clearDragState(); return; } // Abbruch durch Nutzer
                }
                newNode.props = { varName: selectedVar };
                newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            }
            if (data.type === 'CallFunction') { 
                let f = appModel.functions[0];
                newNode.props = { funcName: f ? f.name : '' }; 
                newNode.args = {};
                if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            }
            
            parentNode.children.splice(index, 0, newNode);
        } else if (data.source === 'editor' && data.id !== parentId) {
            let movedNode = findNodeAnywhere(data.id);
            // Funktionsdefinitionen dürfen nicht irgendwo zwischen Befehle geschoben werden
            if (movedNode && movedNode.type === 'FunctionDef') { clearDragState(); return; }

            movedNode = extractNodeFromAnywhere(data.id);
            if (movedNode) parentNode.children.splice(index, 0, movedNode);
        }
        updateAllViews(); 
    } catch(err) { console.error("Drop Fehler Statement:", err); }
    
    clearDragState();
}

async function handleExpressionDrop(e, parentNode, propName, expectedType) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch(err) { clearDragState(); return; }
    if (!data.isExpr && data.source !== 'editor-expr') { clearDragState(); return; }
    
    let incomingType = getExprType(data.type || (data.node && data.node.type));
    if (incomingType !== expectedType) { clearDragState(); return; }
    
    let exprNode;
    if (data.source === 'sidebar') {
        if (data.type === 'BooleanValue') exprNode = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
        else if (data.type === 'NumberValue') exprNode = { type: 'NumberValue', id: genId('exp'), value: '0' };
        else if (data.type === 'Comparison') exprNode = { 
            type: 'Comparison', id: genId('exp'), operator: '>', 
            left: { type: 'NumberValue', id: genId('exp'), value: '0' }, 
            right: { type: 'NumberValue', id: genId('exp'), value: '0' } 
        };
        else if (data.type === 'LogicAnd' || data.type === 'LogicOr') {
            exprNode = {
                type: data.type, id: genId('exp'),
                left: { type: 'BooleanValue', id: genId('exp'), value: 'true' },
                right: { type: 'BooleanValue', id: genId('exp'), value: 'false' }
            };
        }
        else if (data.type === 'CallFunctionExpr') {
            let f = appModel.functions[0];
            exprNode = { type: 'CallFunctionExpr', id: genId('exp'), props: { funcName: f ? f.name : '' }, args: {} };
            if (f && f.params) f.params.forEach(p => exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
        }
        else if (data.type === 'VarValue') {
            let locals = getLocalVarsForNode(parentNode.id);
            let selectedVar = appModel.variables[0] || locals[0] || '';
            if (!selectedVar) {
                selectedVar = await promptNewVariable();
                if (!selectedVar) { clearDragState(); return; }
            }
            exprNode = { type: 'VarValue', id: genId('exp'), props: { varName: selectedVar } };
        }
    } else if (data.source === 'editor-expr') {
        exprNode = data.node;
        removeExpressionById(appModel.screens[0].layout, exprNode.id);
    }
    
    if (exprNode) {
        parentNode[propName] = exprNode;
        updateAllViews();
    }
    clearDragState();
}

// ==========================================
// VARIABLEN & FUNKTIONEN ERSTELLEN / LÖSCHEN
// ==========================================
async function promptNewVariable() {
    let varName = await openModal({ 
        title: dictionary['btn_new_var'][currentLang], 
        message: dictionary['prompt_new_var'][currentLang], 
        type: 'prompt', 
        validate: (name) => {
            let err = validateName(name); if(err) return err;
            if (checkNameExists(name)) return 'err_name_exists';
            return null;
        } 
    });
    if (varName) {
        appModel.variables.push(varName);
        logToConsole((dictionary['prompt_var_success'][currentLang] || 'Variable erstellt: ') + varName);
        updateAllViews();
        return varName;
    }
    return null;
}

async function createNewVariable() {
    await promptNewVariable();
}

async function createNewFunction() {
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

    appModel.functions.push({ name: funcName, params: params });
    let newNode = { type: 'FunctionDef', id: genId('func'), props: { funcName: funcName }, children: [] };
    appModel.floatingBlocks.push({ x: 50, y: 50 + appModel.floatingBlocks.length * 80, node: newNode });
    
    logToConsole((dictionary['prompt_func_success'][currentLang] || 'Funktion erstellt: ') + funcName + "(" + params.join(", ") + ")");
    updateAllViews();
}

async function editFunctionParams(funcName) {
    let func = appModel.functions.find(f => f.name === funcName);
    if (!func) return;
    let paramsStr = await openModal({
        title: dictionary['ctx_edit_params'][currentLang],
        message: dictionary['prompt_func_params'][currentLang],
        type: 'prompt',
        defaultValue: func.params.join(', ')
    });
    if (paramsStr !== null) {
        func.params = paramsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        updateAllViews();
    }
}

async function deleteVariable(varName) {
    let confirmed = await openModal({
        title: dictionary['ctx_delete'][currentLang],
        message: dictionary['prompt_delete'][currentLang] + " '" + varName + "'?",
        type: 'confirm', danger: true
    });
    if (confirmed) {
        appModel.variables = appModel.variables.filter(v => v !== varName);
        updateAllViews();
    }
}

async function deleteFunctionDef(funcName, nodeId) {
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
            let fb = appModel.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === funcName);
            if (fb) extractNodeFromAnywhere(fb.node.id);
        }
        updateAllViews();
    }
}

function highlightFunctionBlock(funcName) {
    let fb = appModel.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === funcName);
    if (fb) {
        let el = document.getElementById('block_' + fb.node.id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            el.classList.remove('blink-highlight');
            void el.offsetWidth; // trigger reflow
            el.classList.add('blink-highlight');
        }
    }
}

let currentListTarget = null;
function renderVariableList() {
    const listEl = document.getElementById('sidebarVarList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (appModel.variables.length === 0) {
        listEl.innerHTML = `<i>${dictionary['sidebar_no_vars'][currentLang]}</i>`;
    } else {
        let titleNode = document.createTextNode(dictionary['sidebar_vars_list'][currentLang] + " ");
        listEl.appendChild(titleNode);
        
        appModel.variables.forEach((v, idx) => {
            let span = document.createElement('span');
            span.className = 'sidebar-list-item';
            span.style.color = 'var(--accent-color)';
            span.style.fontWeight = 'bold';
            span.innerText = v;
            span.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation(); hideAllMenus();
                currentListTarget = { type: 'var', name: v };
                const menu = document.getElementById('sidebarListMenu');
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
                menu.classList.add('active');
            };
            listEl.appendChild(span);
            if (idx < appModel.variables.length - 1) listEl.appendChild(document.createTextNode(', '));
        });
    }
}

function renderFunctionList() {
    const listEl = document.getElementById('sidebarFuncList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (appModel.functions.length === 0) {
        listEl.innerHTML = `<i>${dictionary['sidebar_no_funcs'][currentLang]}</i>`;
    } else {
        let titleNode = document.createTextNode(dictionary['sidebar_funcs_list'][currentLang] + " ");
        listEl.appendChild(titleNode);
        
        appModel.functions.forEach((f, idx) => {
            let span = document.createElement('span');
            span.className = 'sidebar-list-item';
            span.style.color = 'var(--accent-color)';
            span.style.fontWeight = 'bold';
            span.innerText = f.name;
            span.onclick = () => highlightFunctionBlock(f.name);
            span.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation(); hideAllMenus();
                currentListTarget = { type: 'func', name: f.name };
                const menu = document.getElementById('sidebarListMenu');
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
                menu.classList.add('active');
            };
            listEl.appendChild(span);
            if (idx < appModel.functions.length - 1) listEl.appendChild(document.createTextNode(', '));
        });
    }
}

function handleListCtxAction(action) {
    hideAllMenus();
    if (!currentListTarget) return;
    if (action === 'delete') {
        if (currentListTarget.type === 'var') {
            deleteVariable(currentListTarget.name);
        } else if (currentListTarget.type === 'func') {
            deleteFunctionDef(currentListTarget.name, null);
        }
    }
    currentListTarget = null;
}

function createVariableDropdown(selectedValue, onChangeCallback, localVars = []) {
    const sel = makeControl('select');
    
    sel.innerHTML = `<option value="__NEW__" style="font-weight:bold; color:var(--accent-color);">+ Neu...</option>`;
    
    let isMissing = selectedValue && !appModel.variables.includes(selectedValue) && !localVars.includes(selectedValue);
    
    if (isMissing) {
        sel.innerHTML += `<option value="${selectedValue}" class="invalid-ref" selected>${selectedValue} (Fehlt)</option>`;
    } else if (!selectedValue) {
        sel.innerHTML += `<option value="" disabled selected>Wähle...</option>`;
    }

    if (appModel.variables.length > 0) {
        let optgroup = document.createElement('optgroup');
        optgroup.label = "Globale Variablen";
        appModel.variables.forEach(v => {
            let opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === selectedValue) opt.selected = true;
            optgroup.appendChild(opt);
        });
        sel.appendChild(optgroup);
    }

    if (localVars.length > 0) {
        let optgroup = document.createElement('optgroup');
        optgroup.label = "Lokale Variablen";
        localVars.forEach(v => {
            let opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === selectedValue) opt.selected = true;
            optgroup.appendChild(opt);
        });
        sel.appendChild(optgroup);
    }
    
    sel.onchange = async (e) => {
        if (e.target.value === '__NEW__') {
            e.target.value = selectedValue || ''; // Direkt zurücksetzen falls Dialog abgebrochen wird
            let newVar = await promptNewVariable();
            if (newVar) {
                onChangeCallback(newVar);
            }
        } else {
            onChangeCallback(e.target.value);
        }
    };
    return sel;
}

function createFunctionDropdown(selectedValue, onChangeCallback) {
    const sel = makeControl('select');
    let isMissing = selectedValue && !appModel.functions.some(f => f.name === selectedValue);
    
    if (isMissing) {
        sel.innerHTML += `<option value="${selectedValue}" class="invalid-ref" selected>${selectedValue} (Fehlt)</option>`;
    } else if (!selectedValue) {
        sel.innerHTML += `<option value="" disabled selected>Wähle...</option>`;
    }

    if (appModel.functions.length > 0) {
        appModel.functions.forEach(f => {
            sel.innerHTML += `<option value="${f.name}" ${f.name === selectedValue ? 'selected' : ''}>${f.name}</option>`;
        });
    } else if (!isMissing) {
        sel.disabled = true;
        sel.innerHTML = `<option value="" disabled selected>Keine Funktionen</option>`;
    }
    
    sel.onchange = (e) => onChangeCallback(e.target.value);
    return sel;
}

// ==========================================
// RENDERING: Block Editor & Drop Zones
// ==========================================
function createDropZone(parentId, index) {
    let dz = document.createElement('div');
    dz.className = 'drop-zone';
    dz.setAttribute('data-parent-id', parentId);
    dz.setAttribute('data-index', index);
    
    dz.addEventListener('dragover', e => { 
        if (document.body.classList.contains('dragging-stmt')) {
            e.preventDefault(); 
            e.stopPropagation(); 
            dz.classList.add('drag-over'); 
        }
    });
    dz.addEventListener('dragleave', e => { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', e => handleStatementDrop(e, parentId, index));
    return dz;
}

function createExpressionSlot(parentNode, propName, slotType, localVars = []) {
    const condSlot = document.createElement('div');
    condSlot.className = slotType === 'boolean' ? 'pill-slot' : 'val-slot';
    let currentValue = parentNode[propName];
    
    if (currentValue) {
        condSlot.classList.add('has-value'); 
        condSlot.appendChild(createExpressionBlock(currentValue, parentNode, propName, localVars));
    } else {
        condSlot.innerHTML = dictionary['drop_expr'][currentLang] || '...ablegen';
    }
    
    // Unbedingtes DragOver Erlauben, damit Lücken auch überschrieben werden können.
    condSlot.addEventListener('dragover', e => { 
        if (window.draggedExprType === slotType) {
            e.preventDefault(); 
            e.stopPropagation(); 
            condSlot.classList.add('drag-over'); 
        }
    });
    condSlot.addEventListener('dragleave', e => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        condSlot.classList.remove('drag-over'); 
    });
    condSlot.addEventListener('drop', e => handleExpressionDrop(e, parentNode, propName, slotType));
    
    return condSlot;
}

function createExpressionBlock(exprNode, parentNode, propertyName, localVars = []) {
    const el = document.createElement('div');
    el.className = 'expr-block';
    
    let expType = getExprType(exprNode.type);
    el.style.borderRadius = expType === 'boolean' ? '20px' : '6px';
    
    if (!exprNode.id) exprNode.id = genId('exp');
    
    el.draggable = true;
    el.dataset.type = exprNode.type;
    el.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor-expr', node: exprNode }));
        setDragState(true, getExprType(exprNode.type));
        setTimeout(() => { el.style.opacity = '0.3'; }, 0);
    });

    if (exprNode.type === 'BooleanValue') {
        const sel = makeControl('select');
        sel.innerHTML = `<option value="true" ${exprNode.value==='true'?'selected':''}>True</option><option value="false" ${exprNode.value==='false'?'selected':''}>False</option>`;
        sel.onchange = e => { exprNode.value = e.target.value; updateAllViews(); };
        el.appendChild(sel);
    } else if (exprNode.type === 'NumberValue') {
        const inp = makeControl('input');
        inp.type = 'number'; inp.value = exprNode.value;
        inp.style.width = '60px';
        inp.oninput = e => { exprNode.value = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); };
        el.appendChild(inp);
    } else if (exprNode.type === 'VarValue') {
        if (exprNode.props.varName && !appModel.variables.includes(exprNode.props.varName) && !localVars.includes(exprNode.props.varName)) {
            el.classList.add('invalid-ref'); 
        }
        el.appendChild(createVariableDropdown(exprNode.props.varName, e => { exprNode.props.varName = e; updateAllViews(); }, localVars));
    } else if (exprNode.type === 'CallFunctionExpr') {
        if (exprNode.props.funcName && !appModel.functions.some(f => f.name === exprNode.props.funcName)) {
            el.classList.add('invalid-ref'); 
        }
        
        el.appendChild(document.createTextNode('Call '));
        el.appendChild(createFunctionDropdown(exprNode.props.funcName, e => { 
            exprNode.props.funcName = e; 
            let f = appModel.functions.find(x => x.name === e);
            exprNode.args = {};
            if(f) f.params.forEach(p => exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            updateAllViews();
        }));
        
        let fModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (fModel && fModel.params.length > 0) {
            if (!exprNode.args) exprNode.args = {};
            fModel.params.forEach(p => {
                let pWrap = document.createElement('span');
                pWrap.style.marginLeft = "5px";
                pWrap.innerText = p + "=";
                if (!exprNode.args[p]) exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' };
                pWrap.appendChild(createExpressionSlot(exprNode.args, p, 'value', localVars));
                el.appendChild(pWrap);
            });
        }
    } else if (exprNode.type === 'Comparison') {
        el.appendChild(createExpressionSlot(exprNode, 'left', 'value', localVars));
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['==', '!=', '>', '<', '>=', '<='].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(createExpressionSlot(exprNode, 'right', 'value', localVars));
    } else if (exprNode.type === 'LogicAnd' || exprNode.type === 'LogicOr') {
        el.appendChild(createExpressionSlot(exprNode, 'left', 'boolean', localVars));
        const opSpan = document.createElement('span');
        opSpan.style.margin = '0 8px';
        opSpan.style.fontWeight = 'bold';
        opSpan.innerText = exprNode.type === 'LogicAnd' ? 'AND' : 'OR';
        el.appendChild(opSpan);
        el.appendChild(createExpressionSlot(exprNode, 'right', 'boolean', localVars));
    }

    // Lösch-Button ("X")
    const delBtn = document.createElement('span');
    delBtn.innerHTML = '✕';
    delBtn.style.cssText = 'cursor:pointer; margin-left:8px; color:#ef4444; font-size:14px; font-weight:bold; padding: 2px 5px; border-radius: 4px; display:flex; align-items:center; justify-content:center; transition: 0.2s;';
    delBtn.title = 'Entfernen';
    delBtn.onmouseenter = () => delBtn.style.background = 'rgba(239, 68, 68, 0.1)';
    delBtn.onmouseleave = () => delBtn.style.background = 'transparent';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        parentNode[propertyName] = null;
        updateAllViews();
    };
    el.appendChild(delBtn);

    return el;
}

function renderBlockEditor() {
    renderVariableList();
    renderFunctionList();
    const container = document.getElementById('blockEditor');
    container.innerHTML = '';
    
    // Haupt-Baum rendern
    const rootWrapper = document.createElement('div');
    rootWrapper.appendChild(createVisualBlock(appModel.screens[0].layout, []));
    container.appendChild(rootWrapper);

    // Frei platzierte (Floating) Blöcke rendern
    appModel.floatingBlocks.forEach((fb) => {
        const fbWrapper = document.createElement('div');
        fbWrapper.style.position = 'absolute';
        fbWrapper.style.left = fb.x + 'px';
        fbWrapper.style.top = fb.y + 'px';
        
        let locals = [];
        if (fb.node.type === 'FunctionDef') {
            let fModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
            if (fModel) locals = fModel.params;
        }

        const blockEl = createVisualBlock(fb.node, locals);
        
        // Entsättigung für alles, was keine Funktionsdefinition ist (da diese "verbunden" in sich selbst sind)
        if (fb.node.type !== 'FunctionDef') {
            blockEl.classList.add('disconnected');
        }

        fbWrapper.appendChild(blockEl);
        container.appendChild(fbWrapper);
    });
}

function createVisualBlock(node, localVars = []) {
    const block = document.createElement('div');
    block.className = 'visual-block';
    block.id = 'block_' + node.id;
    
    const header = document.createElement('div');
    header.className = 'visual-block-header';
    
    let icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="12" y2="17"></line></svg>`;
    if (node.type === 'Scaffold') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`;
    else if (node.type === 'If' || node.type === 'Loop') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    else if (node.type === 'FunctionDef') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    
    header.innerHTML = `<span>${icon}</span> <span>${node.type}</span>`;
    
    if (node.type === 'SetVariable') {
        if (node.props.varName && !appModel.variables.includes(node.props.varName) && !localVars.includes(node.props.varName)) {
            block.classList.add('invalid-ref'); 
        }

        header.innerHTML = `<span>${icon}</span> <span>Variable</span>`;
        header.appendChild(createVariableDropdown(node.props.varName, e => { node.props.varName = e; updateAllViews(); }, localVars));
        let equals = document.createElement('span');
        equals.innerHTML = '=';
        equals.style.cssText = 'color:var(--text-main); font-weight:bold; margin: 0 5px;';
        header.appendChild(equals);
        header.appendChild(createExpressionSlot(node, 'value', 'value', localVars));
    }
    else if (node.type === 'If' || node.type === 'Loop') {
        header.appendChild(createExpressionSlot(node, 'condition', 'boolean', localVars));
    }
    else if (node.type === 'FunctionDef') {
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        let pStr = (fModel && fModel.params.length > 0) ? ` (${fModel.params.join(', ')})` : ` ()`;
        header.innerHTML = `<span>${icon}</span> <span>Funktion: <b>${node.props.funcName}${pStr}</b></span>`;
    }
    else if (node.type === 'CallFunction') {
        if (node.props.funcName && !appModel.functions.some(f => f.name === node.props.funcName)) {
            block.classList.add('invalid-ref');
        }

        header.innerHTML = `<span>${icon}</span> <span>Aufruf:</span>`;
        header.appendChild(createFunctionDropdown(node.props.funcName, e => { 
            node.props.funcName = e; 
            let f = appModel.functions.find(x => x.name === e);
            node.args = {};
            if(f) f.params.forEach(p => node.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            updateAllViews();
        }));
        
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (fModel && fModel.params.length > 0) {
            if (!node.args) node.args = {};
            fModel.params.forEach(p => {
                let pRow = document.createElement('div');
                pRow.style.margin = "4px 10px";
                pRow.style.display = "flex"; pRow.style.alignItems = "center";
                pRow.innerHTML = `<span style="margin-right:6px; font-weight:500;">${p} = </span>`;
                if (!node.args[p]) node.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' };
                pRow.appendChild(createExpressionSlot(node.args, p, 'value', localVars));
                header.appendChild(pRow);
            });
        }
    }
    else if (node.type === 'Return') {
        header.innerHTML = `<span>${icon}</span> <span>Return</span>`;
        header.appendChild(createExpressionSlot(node, 'value', 'value', localVars));
    }
    
    if (node.id !== 'root_scaffold') {
        block.draggable = true;
        block.addEventListener('dragstart', e => { 
            e.stopPropagation(); 
            e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor', id: node.id })); 
            setDragState(false, null);
            setTimeout(() => { block.style.opacity = '0.3'; }, 0);
        });
        const delBtn = document.createElement('span'); delBtn.innerHTML = '✕';
        delBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold; padding: 0 5px;';
        delBtn.onclick = async (e) => { 
            e.stopPropagation();
            if (node.type === 'FunctionDef') {
                await deleteFunctionDef(node.props.funcName, node.id);
            } else {
                extractNodeFromAnywhere(node.id); 
                updateAllViews(); 
            }
        };
        header.appendChild(delBtn);
    }
    
    block.appendChild(header);
    
    if (node.type === 'Greeting') {
        const propRow = document.createElement('div'); propRow.className = 'visual-block-prop';
        propRow.innerHTML = `<span>Name:</span>`;
        const input = makeControl('input');
        input.type = 'text'; input.value = node.props.name;
        input.addEventListener('input', (e) => { node.props.name = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); });
        propRow.appendChild(input); block.appendChild(propRow);
    }
    
    if (['Scaffold', 'If', 'Loop', 'FunctionDef'].includes(node.type)) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'visual-block-children';
        
        let childCount = node.children ? node.children.length : 0;
        for (let i = 0; i <= childCount; i++) {
            childrenContainer.appendChild(createDropZone(node.id, i));
            if (i < childCount) {
                childrenContainer.appendChild(createVisualBlock(node.children[i], localVars));
            }
        }
        block.appendChild(childrenContainer);
    }
    return block;
}

// ==========================================
// KONTEXTMENÜ FÜR BLÖCKE (Rechtsklick)
// ==========================================
let currentBlockTarget = null;

document.addEventListener('DOMContentLoaded', () => {
    const blockEditor = document.getElementById('blockEditor');
    const bCtxMenu = document.getElementById('blockContextMenu');
    
    blockEditor.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation(); hideAllMenus();
        
        let blockEl = e.target.closest('.visual-block');
        let dzEl = e.target.closest('.drop-zone');
        
        document.getElementById('ctx-edit-params').style.display = 'none';
        document.getElementById('ctx-copy-block').style.display = 'none';
        document.getElementById('ctx-cut-block').style.display = 'none';
        document.getElementById('ctx-paste-block').style.display = 'none';
        document.getElementById('ctx-delete-block').style.display = 'none';
        document.getElementById('ctx-div-1').style.display = 'none';
        document.getElementById('ctx-div-2').style.display = 'none';
        
        let hasOptions = false;
        
        if (dzEl) {
            let parentId = dzEl.getAttribute('data-parent-id');
            let index = parseInt(dzEl.getAttribute('data-index'));
            currentBlockTarget = { type: 'dropzone', parentId, index };
            if (blockClipboard) { document.getElementById('ctx-paste-block').style.display = 'flex'; hasOptions = true; }
        } else if (blockEl) {
            let id = blockEl.id.replace('block_', '');
            let node = findNodeAnywhere(id);
            currentBlockTarget = { type: 'block', id, node };
            
            document.getElementById('ctx-copy-block').style.display = 'flex';
            if (id !== 'root_scaffold') {
                document.getElementById('ctx-cut-block').style.display = 'flex';
                document.getElementById('ctx-delete-block').style.display = 'flex';
                document.getElementById('ctx-div-2').style.display = 'block';
            }
            if (node && node.type === 'FunctionDef') {
                document.getElementById('ctx-edit-params').style.display = 'flex';
                document.getElementById('ctx-div-1').style.display = 'block';
            }
            hasOptions = true;
        } else {
            const rect = blockEditor.getBoundingClientRect();
            let x = e.clientX - rect.left + blockEditor.scrollLeft;
            let y = e.clientY - rect.top + blockEditor.scrollTop;
            currentBlockTarget = { type: 'canvas', x, y };
            
            if (blockClipboard) { document.getElementById('ctx-paste-block').style.display = 'flex'; hasOptions = true; }
        }
        
        if (hasOptions) {
            bCtxMenu.style.left = e.pageX + 'px';
            bCtxMenu.style.top = e.pageY + 'px';
            bCtxMenu.classList.add('active');
        }
    });
});

function handleBlockCtxAction(action) {
    hideAllMenus();
    if (!currentBlockTarget) return;

    if (action === 'edit_params' && currentBlockTarget.type === 'block') {
        editFunctionParams(currentBlockTarget.node.props.funcName);
    }
    else if (action === 'copy' && currentBlockTarget.type === 'block') {
        blockClipboard = { action: 'copy', node: deepCloneNodeWithNewIds(currentBlockTarget.node) };
    }
    else if (action === 'cut' && currentBlockTarget.type === 'block') {
        let node = extractNodeFromAnywhere(currentBlockTarget.id);
        blockClipboard = { action: 'cut', node: node };
        updateAllViews();
    }
    else if (action === 'delete' && currentBlockTarget.type === 'block') {
        if (currentBlockTarget.node.type === 'FunctionDef') {
            deleteFunctionDef(currentBlockTarget.node.props.funcName, currentBlockTarget.id);
        } else {
            extractNodeFromAnywhere(currentBlockTarget.id);
            updateAllViews();
        }
    }
    else if (action === 'paste' && blockClipboard) {
        let nodeToPaste = blockClipboard.action === 'cut' ? blockClipboard.node : deepCloneNodeWithNewIds(blockClipboard.node);
        
        if (currentBlockTarget.type === 'dropzone') {
            let parent = findNodeAnywhere(currentBlockTarget.parentId);
            if (parent && parent.children) {
                // FunctionDef darf nicht in ein Statement!
                if (nodeToPaste.type === 'FunctionDef') {
                    appModel.floatingBlocks.push({ x: 50, y: 50, node: nodeToPaste });
                } else {
                    parent.children.splice(currentBlockTarget.index, 0, nodeToPaste);
                }
            }
        } else if (currentBlockTarget.type === 'canvas') {
            appModel.floatingBlocks.push({ x: currentBlockTarget.x, y: currentBlockTarget.y, node: nodeToPaste });
        }
        
        if (blockClipboard.action === 'cut') blockClipboard = null;
        updateAllViews();
    }
    
    currentBlockTarget = null;
}


// ==========================================
// RENDERING: HTML Emulator (AST Engine)
// ==========================================
function evaluateExpressionJS(exprNode, ctx, defaultReturn = true) {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value === 'true';
    if (exprNode.type === 'NumberValue') return Number(exprNode.value) || 0;
    if (exprNode.type === 'VarValue') return ctx[exprNode.props.varName] || 0;
    if (exprNode.type === 'CallFunctionExpr') {
        let funcDef = appModel.floatingBlocks.find(fb => fb.node.type === 'FunctionDef' && fb.node.props.funcName === exprNode.props.funcName);
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx };
            tempCtx._return = undefined;
            // Argumente in die temporäre Umgebung schreiben
            if (funcModel && funcModel.params && exprNode.args) {
                funcModel.params.forEach(p => {
                    tempCtx[p] = evaluateExpressionJS(exprNode.args[p], ctx, 0);
                });
            }
            if (funcDef.node.children) {
                const dummyFragment = document.createDocumentFragment();
                for (let c of funcDef.node.children) {
                    if (tempCtx._return !== undefined) break;
                    buildHtmlNode(c, tempCtx, dummyFragment);
                }
            }
            // Variablenänderungen (nur von echten Variablen, nicht von Params) ins Original übernehmen
            Object.keys(tempCtx).forEach(k => { 
                if(k !== '_return' && (!funcModel || !funcModel.params.includes(k))) {
                    ctx[k] = tempCtx[k]; 
                }
            });
            return tempCtx._return !== undefined ? tempCtx._return : 0;
        }
        return 0;
    }
    if (exprNode.type === 'Comparison') {
        let l = evaluateExpressionJS(exprNode.left, ctx, 0);
        let r = evaluateExpressionJS(exprNode.right, ctx, 0);
        switch(exprNode.operator) {
            case '==': return l == r;
            case '!=': return l != r;
            case '>': return l > r;
            case '<': return l < r;
            case '>=': return l >= r;
            case '<=': return l <= r;
            default: return false;
        }
    }
    if (exprNode.type === 'LogicAnd') {
        return evaluateExpressionJS(exprNode.left, ctx, true) && evaluateExpressionJS(exprNode.right, ctx, true);
    }
    if (exprNode.type === 'LogicOr') {
        return evaluateExpressionJS(exprNode.left, ctx, true) || evaluateExpressionJS(exprNode.right, ctx, true);
    }
    return defaultReturn;
}

function buildHtmlNode(node, ctx, parentFragment) {
    if (ctx._return !== undefined) return;

    if (node.type === 'Scaffold') {
        const el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:#fff; padding:40px 20px; gap:12px; overflow-y:auto;';
        if (node.children) {
            for (let c of node.children) {
                if (ctx._return !== undefined) break;
                buildHtmlNode(c, ctx, el);
            }
        }
        parentFragment.appendChild(el);
    } 
    else if (node.type === 'SetVariable') {
        if (node.props.varName) {
            ctx[node.props.varName] = evaluateExpressionJS(node.value, ctx, 0);
        }
    }
    else if (node.type === 'Greeting') {
        const el = document.createElement('div');
        el.innerText = `Hello ${node.props.name}!`;
        el.style.cssText = 'font-size:16px; color:#000; padding:10px; background:#f1f5f9; border-radius:8px; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);';
        parentFragment.appendChild(el);
    }
    else if (node.type === 'If') {
        if (evaluateExpressionJS(node.condition, ctx, true)) {
            if (node.children) {
                for (let c of node.children) {
                    if (ctx._return !== undefined) break;
                    buildHtmlNode(c, ctx, parentFragment);
                }
            }
        }
    }
    else if (node.type === 'Loop') {
        let limit = 0;
        while (evaluateExpressionJS(node.condition, ctx, true) && limit < 1000) {
            if (ctx._return !== undefined) break;
            if (node.children) {
                for (let c of node.children) {
                    if (ctx._return !== undefined) break;
                    buildHtmlNode(c, ctx, parentFragment);
                }
            }
            limit++;
        }
        if(limit >= 1000) console.warn("Emulator: Loop Limit erreicht (Endlosschleife?)");
    }
    else if (node.type === 'CallFunction') {
        let funcDef = appModel.floatingBlocks.find(fb => fb.node.type === 'FunctionDef' && fb.node.props.funcName === node.props.funcName);
        let funcModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx };
            // Parameter setzen
            if (funcModel && funcModel.params && node.args) {
                funcModel.params.forEach(p => {
                    tempCtx[p] = evaluateExpressionJS(node.args[p], ctx, 0);
                });
            }
            if (funcDef.node.children) {
                for (let c of funcDef.node.children) {
                    if (tempCtx._return !== undefined) break;
                    buildHtmlNode(c, tempCtx, parentFragment);
                }
            }
            Object.keys(tempCtx).forEach(k => { 
                if(k !== '_return' && (!funcModel || !funcModel.params.includes(k))) {
                    ctx[k] = tempCtx[k]; 
                }
            });
        }
    }
    else if (node.type === 'Return') {
        ctx._return = evaluateExpressionJS(node.value, ctx, 0);
    }
}

function renderEmulator() {
    const screenElement = document.getElementById('phoneScreen');
    screenElement.innerHTML = '';
    
    let context = {};
    appModel.variables.forEach(v => context[v] = 0);
    context._return = undefined;
    
    const fragment = document.createDocumentFragment();
    buildHtmlNode(appModel.screens[0].layout, context, fragment);
    screenElement.appendChild(fragment);
}

// ==========================================
// KOTLIN GENERATOR & VFS SYNC
// ==========================================
function evaluateExpressionKotlin(exprNode, defaultReturn = "true") {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value;
    if (exprNode.type === 'NumberValue') return exprNode.value;
    if (exprNode.type === 'VarValue') return exprNode.props.varName || "0";
    if (exprNode.type === 'CallFunctionExpr') {
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        let argsStr = "";
        if (funcModel && funcModel.params && exprNode.args) {
            argsStr = funcModel.params.map(p => evaluateExpressionKotlin(exprNode.args[p], "0")).join(", ");
        }
        return `${exprNode.props.funcName}(${argsStr})`;
    }
    if (exprNode.type === 'Comparison') {
        let l = evaluateExpressionKotlin(exprNode.left, "0");
        let r = evaluateExpressionKotlin(exprNode.right, "0");
        return `${l} ${exprNode.operator} ${r}`;
    }
    if (exprNode.type === 'LogicAnd') {
        let l = evaluateExpressionKotlin(exprNode.left, "true");
        let r = evaluateExpressionKotlin(exprNode.right, "true");
        return `(${l} && ${r})`;
    }
    if (exprNode.type === 'LogicOr') {
        let l = evaluateExpressionKotlin(exprNode.left, "true");
        let r = evaluateExpressionKotlin(exprNode.right, "true");
        return `(${l} || ${r})`;
    }
    return defaultReturn;
}

function buildComposeTree(node, indent) {
    let space = " ".repeat(indent);
    if (node.type === 'Scaffold') {
        let code = `${space}Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->\n`;
        code += `${space}    androidx.compose.foundation.layout.Column(\n`;
        code += `${space}        modifier = Modifier.padding(innerPadding).fillMaxSize()\n`;
        code += `${space}    ) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 8); });
        code += `${space}    }\n`;
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'SetVariable') {
        if(node.props.varName) return `${space}${node.props.varName} = ${evaluateExpressionKotlin(node.value, "0")}\n`;
        return "";
    } else if (node.type === 'Greeting') {
        return `${space}Greeting(name = "${node.props.name}")\n`;
    } else if (node.type === 'If') {
        let condStr = evaluateExpressionKotlin(node.condition, "true");
        let code = `${space}if (${condStr}) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'Loop') {
        let condStr = evaluateExpressionKotlin(node.condition, "true");
        let code = `${space}while (${condStr}) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'FunctionDef') {
        let code = "";
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent); });
        return code;
    } else if (node.type === 'CallFunction') {
        let funcModel = appModel.functions.find(f => f.name === node.props.funcName);
        let argsStr = "";
        if (funcModel && funcModel.params && node.args) {
            argsStr = funcModel.params.map(p => evaluateExpressionKotlin(node.args[p], "0")).join(", ");
        }
        return `${space}${node.props.funcName}(${argsStr})\n`;
    } else if (node.type === 'Return') {
        return `${space}return ${evaluateExpressionKotlin(node.value, "0")}\n`;
    }
    return "";
}

function generateKotlinCode() {
    const meta = appModel.metadata;
    let varDeclarations = "";
    appModel.variables.forEach(v => { varDeclarations += `var ${v} by mutableStateOf<Any>(0)\n`; });
    
    let functionsCode = "";
    appModel.floatingBlocks.forEach(fb => {
        if (fb.node.type === 'FunctionDef') {
            let funcModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
            let paramsCode = (funcModel && funcModel.params) ? funcModel.params.map(p => `${p}: Any`).join(", ") : "";
            let funcBody = buildComposeTree(fb.node, 4);
            functionsCode += `@Composable\nfun ${fb.node.props.funcName}(${paramsCode}) : Any {\n${funcBody}    return 0\n}\n\n`;
        }
    });

    let uiCode = buildComposeTree(appModel.screens[0].layout, 12).trim();

    return `package ${meta.packageName}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import ${meta.packageName}.ui.theme.${meta.appName}Theme

// Globale Variablen aus dem Block Editor
${varDeclarations}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ${meta.appName}Theme {
                ${uiCode}
            }
        }
    }
}

// Generierte Funktionen
${functionsCode}
@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(text = "Hello $name!", modifier = modifier)
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    ${meta.appName}Theme {
        Greeting("Preview")
    }
}`;
}

function syncKotlinCodeToVFS() {
    if(!vfs) return;
    const mainActivityPath = Object.keys(vfs).find(k => k.endsWith('MainActivity.kt'));
    if (mainActivityPath) {
        vfs[mainActivityPath] = generateKotlinCode();
        if (activeFile === mainActivityPath && currentEditorMode === 'code') {
            document.getElementById('codeEditor').value = vfs[mainActivityPath];
        }
    }
}

function printCodeToConsole() {
    logToConsole("[Build-Worker simuliert] APK wird generiert...\n" + generateKotlinCode());
}

// Init Canvas Drop (für Free-Floating Blocks)
document.addEventListener('DOMContentLoaded', () => {
    const blockEditor = document.getElementById('blockEditor');
    blockEditor.addEventListener('dragover', e => {
        if (document.body.classList.contains('dragging-stmt')) {
            e.preventDefault(); 
        }
    });
    blockEditor.addEventListener('drop', async e => {
        e.preventDefault();
        try {
            let data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.isExpr || data.source === 'editor-expr') { clearDragState(); return; }
            
            const rect = blockEditor.getBoundingClientRect();
            const x = e.clientX - rect.left + blockEditor.scrollLeft - 20;
            const y = e.clientY - rect.top + blockEditor.scrollTop - 20;

            if (data.source === 'sidebar') {
                const newId = data.type.toLowerCase() + '_' + Date.now();
                let newNode = {
                    type: data.type, id: newId, props: {},
                    children: (['Scaffold', 'If', 'Loop', 'FunctionDef'].includes(data.type)) ? [] : undefined
                };
                if (data.type === 'Greeting') newNode.props = { name: "Neu" };
                if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
                if (data.type === 'Return') { newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' }; }
                
                if (data.type === 'SetVariable') { 
                    // Auf dem Canvas-Root gibt es keine lokalen Variablen, nur Globale
                    let selectedVar = appModel.variables[0] || '';
                    if (!selectedVar) {
                        selectedVar = await promptNewVariable();
                        if (!selectedVar) { clearDragState(); return; }
                    }
                    newNode.props = { varName: selectedVar };
                    newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
                }
                if (data.type === 'CallFunction') { 
                    let f = appModel.functions[0];
                    newNode.props = { funcName: f ? f.name : '' }; 
                    newNode.args = {};
                    if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
                }
                
                appModel.floatingBlocks.push({ x, y, node: newNode });
            } else if (data.source === 'editor') {
                let movedNode = extractNodeFromAnywhere(data.id);
                if (movedNode) {
                    appModel.floatingBlocks.push({ x, y, node: movedNode });
                }
            }
            updateAllViews();
        } catch(err) { console.error("Canvas Drop Fehler:", err); }
        
        clearDragState();
    });
});