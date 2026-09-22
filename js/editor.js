// ==========================================
// GLOBALE DRAG STATE TRACKER
// ==========================================
window.draggedExprType = null;
window.draggedNodeType = null; 
let highlightTimeout = null; 

// Panning and Zooming State
window.canvasState = { x: 0, y: 0, scale: 1 };

function getExprType(type) {
    if (['BooleanValue', 'Comparison', 'LogicAnd', 'LogicOr', 'LogicNot'].includes(type)) return 'boolean';
    if (['NumberValue', 'StringValue', 'VarValue', 'CallFunctionExpr', 'MathOp', 'MathRandom', 'MathCompare', 'MathList', 'MathFunc', 'MathTrig', 'GetUIProperty', 'GetScreenArgument'].includes(type)) return 'value';
    return null;
}

function getAllVariables() {
    return Array.from(new Set([
        ...appModel.variables, 
        ...appModel.functions.flatMap(f => f.params)
    ]));
}

// Prüft ob ein Name schon irgendwo existiert (Globale Vars, Lokale Vars, Parameter, Funktionen, Screens, UI Elements)
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

function setDragState(isExpr, type, nodeType) {
    if (isExpr) {
        document.body.classList.add('dragging-expr');
        document.body.classList.remove('dragging-stmt');
        window.draggedExprType = type;
    } else {
        document.body.classList.add('dragging-stmt');
        document.body.classList.remove('dragging-expr');
        window.draggedExprType = null;
    }
    window.draggedNodeType = nodeType || null;
    
    if (['TextLabel', 'Button', 'TextField', 'Column', 'Row', 'Scaffold'].includes(nodeType)) {
        document.body.classList.add('dragging-ui-element');
    }
}

function clearDragState() {
    document.body.classList.remove('dragging-expr', 'dragging-stmt', 'dragging-ui-element');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.visual-block').forEach(el => el.style.opacity = '');
    document.querySelectorAll('.expr-block').forEach(el => el.style.opacity = '');
    window.draggedExprType = null;
    window.draggedNodeType = null;
}

document.addEventListener('dragend', clearDragState);

// ==========================================
// SCREEN MANAGEMENT
// ==========================================
function renderScreenSwitcher() {
    const sel = document.getElementById('screenSelect');
    if (!sel) return;
    sel.innerHTML = '';
    appModel.screens.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.id;
        opt.text = s.id;
        if(s.id === appModel.activeScreenId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function switchScreen(screenId, arg = "") {
    if(appModel.screens.some(s => s.id === screenId)) {
        appModel.activeScreenId = screenId;
        window.emulatorScreenArg = arg;
        updateAllViews();
    }
}

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
        updateAllViews();
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
        updateAllViews();
    }
};

// ==========================================
// HIGHLIGHTING (Laufzeit-basiert)
// ==========================================
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

// ==========================================
// STATIC ANALYSIS (AST)
// ==========================================
function analyzeAST() {
    let errors = [];
    let warnings = [];
    let varUsageOrder = {}; 
    let everAssigned = new Set();
    let traversedFuncs = new Set();
    let calledFuncs = new Set(); 

    function addUsage(v, id) {
        if(!varUsageOrder[v]) varUsageOrder[v] = [];
        varUsageOrder[v].push(id);
    }

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
                if (checkVarExists(v, ctx.declaredVars, node.id)) {
                    ctx.assignedVars.add(v);
                    everAssigned.add(v);
                }
            }
        } else if (node.type === 'VarValue') {
            let v = node.props.varName;
            if (v) {
                addUsage(v, node.id);
                if (checkVarExists(v, ctx.declaredVars, node.id)) {
                    if (!ctx.assignedVars.has(v)) {
                        errors.push({ type: 'error', msg: `Variable '${v}' wird verwendet, bevor ein Wert zugewiesen wurde.`, nodeId: node.id });
                    }
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
                    if (s.floatingBlocks) {
                        let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === fName);
                        if(found) fb = found;
                    }
                });

                if (fb && !traversedFuncs.has(fName)) {
                    traversedFuncs.add(fName); 
                    let funcCtx = {
                        assignedVars: new Set(ctx.assignedVars),
                        declaredVars: new Set([...ctx.declaredVars, ...(fModel.params||[]), ...(fModel.localVars||[])])
                    };
                    if (fModel.params) fModel.params.forEach(p => funcCtx.assignedVars.add(p)); 
                    
                    if (fb.node.children) fb.node.children.forEach(c => traverse(c, funcCtx));

                    funcCtx.assignedVars.forEach(v => {
                        if (appModel.variables.includes(v)) {
                            ctx.assignedVars.add(v);
                            everAssigned.add(v);
                        }
                    });
                    traversedFuncs.delete(fName);
                }
            }
        } else if (node.type === 'If') {
            if (node.condition) traverse(node.condition, ctx);
            let branchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars };
            if (node.children) node.children.forEach(c => traverse(c, branchCtx));
            
            if (node.elseIfs) {
                node.elseIfs.forEach(elif => {
                    if (elif.condition) traverse(elif.condition, ctx);
                    let elBranchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars };
                    if (elif.children) elif.children.forEach(c => traverse(c, elBranchCtx));
                });
            }
            if (node.elseBranch && node.elseBranch.children) {
                let elseCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: ctx.declaredVars };
                node.elseBranch.children.forEach(c => traverse(c, elseCtx));
            }
            
        } else if (node.type === 'Loop' || node.type === 'ForLoop' || node.type === 'ForEach') {
            if (node.condition) traverse(node.condition, ctx);
            if (node.start) traverse(node.start, ctx);
            if (node.end) traverse(node.end, ctx);
            if (node.step) traverse(node.step, ctx);
            if (node.list) traverse(node.list, ctx);

            let branchCtx = { assignedVars: new Set(ctx.assignedVars), declaredVars: new Set(ctx.declaredVars) };
            if (node.type === 'ForLoop' || node.type === 'ForEach') {
                if(node.props.varName) {
                    branchCtx.declaredVars.add(node.props.varName);
                    branchCtx.assignedVars.add(node.props.varName);
                }
            }
            if (node.children) node.children.forEach(c => traverse(c, branchCtx));
        } else if (node.type === 'OpenScreen') {
            checkScreenExists(node.props.screenName, node.id);
            if (node.arg) traverse(node.arg, ctx);
        } else {
            if (node.children) node.children.forEach(c => traverse(c, ctx));
            if (node.condition) traverse(node.condition, ctx);
            if (node.left) traverse(node.left, ctx);
            if (node.right) traverse(node.right, ctx);
            if (node.value) traverse(node.value, ctx);
            if (node.min) traverse(node.min, ctx);
            if (node.max) traverse(node.max, ctx);
            if (node.list) traverse(node.list, ctx);
            if (node.textExpr) traverse(node.textExpr, ctx);
            if (node.arg) traverse(node.arg, ctx);
        }
    }

    let mainCtx = { assignedVars: new Set(), declaredVars: new Set(appModel.variables) };
    
    appModel.screens.forEach(s => {
        traverse(s.uiTree, mainCtx);
        if(!s.floatingBlocks) s.floatingBlocks = [];
        
        s.floatingBlocks.forEach(fb => {
            if (fb.node.type === 'FunctionDef') {
                let fModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
                if (fModel && !calledFuncs.has(fModel.name)) {
                    warnings.push({ type: 'warning', msg: `Funktion '${fModel.name}' wird definiert, aber nie aufgerufen.`, nodeId: fb.node.id });
                }
                let funcCtx = {
                    assignedVars: new Set(fModel ? fModel.params || [] : []), 
                    declaredVars: new Set([...appModel.variables, ...(fModel? fModel.params||[] : []), ...(fModel? fModel.localVars||[] : [])])
                };
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
            if (!everAssigned.has(v)) {
                warnings.push({ type: 'warning', msg: `Variable '${v}' ist ohne Startwert und ungenutzt.` });
            } else {
                warnings.push({ type: 'warning', msg: `Variable '${v}' wurde belegt, aber nie gelesen.` });
            }
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
            el.onmouseenter = () => {
                let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId);
                if (blockEl) blockEl.classList.add('error-pulse');
            };
            el.onmouseleave = () => {
                let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId);
                if (blockEl) blockEl.classList.remove('error-pulse');
            };
            el.onclick = () => {
                let blockEl = document.getElementById('block_' + item.nodeId) || document.getElementById('expr_' + item.nodeId);
                if (blockEl) blockEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            };
            el.style.cursor = 'pointer';
        }
        problemsList.appendChild(el);
    });
}

window.refreshStaticAnalysis = function() {
    window.currentAnalysis = analyzeAST();
    updateStatusUI(window.currentAnalysis);
};

// ==========================================
// DRAG AND DROP (Logik)
// ==========================================
function getLocalVarsForNode(targetId) {
    let locals = [];
    
    function findPath(node, path) {
        if (!node) return false;
        if (node.id === targetId) return true;
        
        let currentLocals = [];
        if (node.type === 'FunctionDef') {
            let f = appModel.functions.find(x => x.name === node.props.funcName);
            if (f) currentLocals = [...(f.params||[]), ...(f.localVars||[])];
        } else if (node.type === 'ForLoop' || node.type === 'ForEach') {
            if (node.props.varName) currentLocals = [node.props.varName];
        }

        path.push(...currentLocals);

        if (node.children) {
            for (let c of node.children) { if (findPath(c, path)) return true; }
        }
        if (node.type === 'If') {
            if (node.elseIfs) {
                for (let branch of node.elseIfs) {
                    if (branch.children) { for(let c of branch.children) if(findPath(c, path)) return true; }
                }
            }
            if (node.elseBranch && node.elseBranch.children) {
                for(let c of node.elseBranch.children) if(findPath(c, path)) return true;
            }
        }
        
        // Backtrack
        for(let i=0; i<currentLocals.length; i++) path.pop();
        return false;
    }

    let activeScreen = getActiveScreen();
    if(activeScreen && activeScreen.floatingBlocks) {
        for (let fb of activeScreen.floatingBlocks) {
            if (findPath(fb.node, locals)) return locals;
        }
    }
    return locals;
}


function handleDragStartSidebar(e) {
    const type = e.target.getAttribute('data-type');
    const isExpr = e.target.getAttribute('data-is-expr') === 'true';

    const rect = e.target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    let payload = { 
        source: 'sidebar', 
        type: type, 
        isExpr: isExpr,
        offsetX: offsetX,
        offsetY: offsetY
    };
    
    if (type === 'SetUIProperty' || type === 'GetUIProperty') {
        payload.targetId = e.target.getAttribute('data-target');
        payload.property = e.target.getAttribute('data-prop');
    }

    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    setDragState(isExpr, getExprType(type), type);
}

async function handleStatementDrop(e, parentId, index) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        let data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.isExpr || data.source === 'editor-expr') { clearDragState(); return; }
        if (data.type === 'FunctionDef' || data.type === 'UIEvent') { clearDragState(); return; } 
        
        let parentNode = findNodeAnywhere(parentId);
        if (!parentNode) { clearDragState(); return; }
        
        let targetChildrenArray = parentNode.children; 
        if (parentNode.elseIfs) {
            let el = parentNode.elseIfs.find(x => x.id === parentId);
            if (el) targetChildrenArray = el.children;
        }
        if (parentNode.elseBranch && parentNode.elseBranch.id === parentId) targetChildrenArray = parentNode.elseBranch.children;

        if (!targetChildrenArray) { clearDragState(); return; }

        if (data.source === 'sidebar') {
            const newId = data.type.toLowerCase() + '_' + Date.now();
            let newNode = {
                type: data.type, id: newId, props: {},
                children: (['If', 'Loop', 'ForLoop', 'ForEach'].includes(data.type)) ? [] : undefined
            };
            
            if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
            if (data.type === 'Return') newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            if (data.type === 'OpenScreen') {
                newNode.props = { screenName: appModel.screens[0].id };
                newNode.arg = { type: 'StringValue', id: genId('exp'), value: '' };
            }

            if (data.type === 'ForLoop') {
                newNode.start = { type: 'NumberValue', id: genId('exp'), value: '1' };
                newNode.end = { type: 'NumberValue', id: genId('exp'), value: '10' };
                newNode.step = { type: 'NumberValue', id: genId('exp'), value: '1' };
                newNode.props = { varName: await promptNewVariable(false) || 'i' };
                if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
            }
            if (data.type === 'ForEach') {
                newNode.list = { type: 'StringValue', id: genId('exp'), value: '1, 2, 3' }; 
                newNode.props = { varName: await promptNewVariable(false) || 'element' };
                if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
            }
            
            if (data.type === 'SetVariable') { 
                let locals = getLocalVarsForNode(parentId);
                let selectedVar = appModel.variables[0] || locals[0] || '';
                if (!selectedVar) {
                    selectedVar = await promptNewVariable(false);
                    if (!selectedVar) { clearDragState(); return; } 
                    appModel.variables.push(selectedVar);
                }
                newNode.props = { varName: selectedVar };
                newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            }
            
            if (data.type === 'SetUIProperty') {
                newNode.props = { targetId: data.targetId, property: data.property };
                newNode.value = { type: 'StringValue', id: genId('exp'), value: '' };
            }

            if (data.type === 'CallFunction') { 
                let f = appModel.functions[0];
                newNode.props = { funcName: f ? f.name : '' }; 
                newNode.args = {};
                if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            }
            
            targetChildrenArray.splice(index, 0, newNode);
        } else if (data.source === 'editor' && data.id !== parentId) {
            let movedNode = findNodeAnywhere(data.id);
            if (movedNode && (movedNode.type === 'FunctionDef' || movedNode.type === 'UIEvent')) { clearDragState(); return; }

            movedNode = extractNodeFromAnywhere(data.id);
            if (movedNode) targetChildrenArray.splice(index, 0, movedNode);
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
        else if (data.type === 'LogicNot') exprNode = { type: 'LogicNot', id: genId('exp'), value: { type: 'BooleanValue', id: genId('exp'), value: 'false' } };
        else if (data.type === 'NumberValue') exprNode = { type: 'NumberValue', id: genId('exp'), value: '0' };
        else if (data.type === 'StringValue') exprNode = { type: 'StringValue', id: genId('exp'), value: 'Text' };
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
                selectedVar = await promptNewVariable(false);
                if (!selectedVar) { clearDragState(); return; }
                appModel.variables.push(selectedVar);
            }
            exprNode = { type: 'VarValue', id: genId('exp'), props: { varName: selectedVar } };
        }
        else if (data.type === 'MathOp') exprNode = { type: 'MathOp', id: genId('exp'), operator: '+', left: { type: 'NumberValue', id: genId('exp'), value: '0' }, right: { type: 'NumberValue', id: genId('exp'), value: '0' } };
        else if (data.type === 'MathRandom') exprNode = { type: 'MathRandom', id: genId('exp'), randType: 'int', min: { type: 'NumberValue', id: genId('exp'), value: '0' }, max: { type: 'NumberValue', id: genId('exp'), value: '100' } };
        else if (data.type === 'MathCompare') exprNode = { type: 'MathCompare', id: genId('exp'), operator: 'min', left: { type: 'NumberValue', id: genId('exp'), value: '0' }, right: { type: 'NumberValue', id: genId('exp'), value: '10' } };
        else if (data.type === 'MathList') exprNode = { type: 'MathList', id: genId('exp'), operator: 'min', list: { type: 'StringValue', id: genId('exp'), value: '1, 2, 3' } };
        else if (data.type === 'MathFunc') exprNode = { type: 'MathFunc', id: genId('exp'), operator: 'sqrt', value: { type: 'NumberValue', id: genId('exp'), value: '0' } };
        else if (data.type === 'MathTrig') exprNode = { type: 'MathTrig', id: genId('exp'), operator: 'sin', value: { type: 'NumberValue', id: genId('exp'), value: '0' } };
        else if (data.type === 'GetUIProperty') exprNode = { type: 'GetUIProperty', id: genId('exp'), props: { targetId: data.targetId, property: data.property } };
        else if (data.type === 'GetScreenArgument') exprNode = { type: 'GetScreenArgument', id: genId('exp') };
    } else if (data.source === 'editor-expr') {
        exprNode = data.node;
        removeExpressionById(null, exprNode.id); 
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
async function promptNewVariable(isLocal = false) {
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
}

window.createNewVariable = async function() {
    let v = await promptNewVariable(false);
    if (v) {
        appModel.variables.push(v);
        logToConsole((dictionary['prompt_var_success'][currentLang] || 'Variable erstellt: ') + v);
        updateAllViews();
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
    updateAllViews();
};

async function editFunctionParams(funcName) {
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
            let fb = getActiveScreen().floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === funcName);
            if (fb) extractNodeFromAnywhere(fb.node.id);
        }
        updateAllViews();
    }
}

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
            
            bindListHoverEvents(span, v);

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
        } else if (currentListTarget.type === 'local_var') {
            let fModel = appModel.functions.find(f => f.name === currentListTarget.funcName);
            if (fModel) {
                if (fModel.params && fModel.params.includes(currentListTarget.name)) {
                    fModel.params = fModel.params.filter(p => p !== currentListTarget.name);
                } else if (fModel.localVars && fModel.localVars.includes(currentListTarget.name)) {
                    fModel.localVars = fModel.localVars.filter(v => v !== currentListTarget.name);
                }
                updateAllViews();
            }
        }
    }
    currentListTarget = null;
}

window.renameUIElement = async function(oldId) {
    let newId = await openModal({
        title: dictionary['ctx_rename'][currentLang],
        message: 'Neue ID für UI Element:',
        type: 'prompt',
        defaultValue: oldId,
        validate: (n) => {
            let err = validateName(n); if(err) return err;
            if(n !== oldId && checkNameExists(n)) return 'err_name_exists';
            return null;
        }
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
            if(node.value) renameInLogic(node.value);
            if(node.condition) renameInLogic(node.condition);
            if(node.left) renameInLogic(node.left);
            if(node.right) renameInLogic(node.right);
            if(node.elseIfs) node.elseIfs.forEach(elif => {
                if(elif.condition) renameInLogic(elif.condition);
                if(elif.children) elif.children.forEach(renameInLogic);
            });
            if(node.elseBranch && node.elseBranch.children) node.elseBranch.children.forEach(renameInLogic);
            
            let props = ['min', 'max', 'list', 'start', 'end', 'step', 'textExpr', 'arg'];
            for(let p of props) if(node[p]) renameInLogic(node[p]);
        }
        renameInLogic(fb.node);
    });

    let tempVal1 = window.emulatorCtx[oldId + "_text"];
    let tempVal2 = window.emulatorCtx[oldId + "_label"];
    if(tempVal1 !== undefined) { window.emulatorCtx[newId + "_text"] = tempVal1; delete window.emulatorCtx[oldId + "_text"]; }
    if(tempVal2 !== undefined) { window.emulatorCtx[newId + "_label"] = tempVal2; delete window.emulatorCtx[oldId + "_label"]; }

    updateAllViews();
}

window.deleteUIElement = function(id, e) {
    if(e) e.stopPropagation();
    let activeScreen = getActiveScreen();
    function removeUI(node) {
        if(!node || !node.children) return false;
        for(let i=0; i<node.children.length; i++) {
            if(node.children[i].id === id) {
                node.children.splice(i, 1);
                return true;
            }
            if(removeUI(node.children[i])) return true;
        }
        return false;
    }
    removeUI(activeScreen.uiTree);
    
    activeScreen.floatingBlocks = activeScreen.floatingBlocks.filter(fb => !(fb.node.type === 'UIEvent' && fb.node.props.sourceId === id));
    
    updateAllViews();
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
        optgroup.label = "Lokale Variablen / Params / Loop";
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
            e.target.value = selectedValue || ''; 
            let newVar = await promptNewVariable(localVars.length > 0);
            if (newVar) {
                if (localVars.length > 0) {
                } else {
                    appModel.variables.push(newVar);
                }
                onChangeCallback(newVar, true);
            }
        } else {
            onChangeCallback(e.target.value, false);
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
        if (document.body.classList.contains('dragging-stmt') && window.draggedNodeType !== 'FunctionDef' && window.draggedNodeType !== 'UIEvent' && !document.body.classList.contains('dragging-ui-element')) {
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
    el.id = 'expr_' + exprNode.id;
    
    el.draggable = true;
    el.dataset.type = exprNode.type;
    el.addEventListener('dragstart', e => {
        e.stopPropagation();
        
        const rect = el.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.setData('application/json', JSON.stringify({ 
            source: 'editor-expr', 
            node: exprNode,
            offsetX: offsetX,
            offsetY: offsetY
        }));
        setDragState(true, getExprType(exprNode.type), exprNode.type);
        setTimeout(() => { el.style.opacity = '0.3'; }, 0);
    });

    if (exprNode.type === 'BooleanValue') {
        const sel = makeControl('select');
        sel.innerHTML = `<option value="true" ${exprNode.value==='true'?'selected':''}>True</option><option value="false" ${exprNode.value==='false'?'selected':''}>False</option>`;
        sel.onchange = e => { exprNode.value = e.target.value; updateAllViews(); };
        el.appendChild(sel);
    } else if (exprNode.type === 'LogicNot') {
        el.appendChild(document.createTextNode('NOT '));
        el.appendChild(createExpressionSlot(exprNode, 'value', 'boolean', localVars));
    } else if (exprNode.type === 'NumberValue') {
        const inp = makeControl('input');
        inp.type = 'text'; inp.value = exprNode.value;
        inp.style.width = '60px';
        inp.oninput = e => { exprNode.value = e.target.value; syncKotlinCodeToVFS(); };
        el.appendChild(inp);
    } else if (exprNode.type === 'StringValue') {
        el.appendChild(document.createTextNode('"'));
        const inp = makeControl('input');
        inp.type = 'text'; inp.value = exprNode.value;
        inp.style.width = '80px';
        inp.oninput = e => { exprNode.value = e.target.value; syncKotlinCodeToVFS(); };
        el.appendChild(inp);
        el.appendChild(document.createTextNode('"'));
    } else if (exprNode.type === 'VarValue') {
        if (exprNode.props.varName && !appModel.variables.includes(exprNode.props.varName) && !localVars.includes(exprNode.props.varName)) {
            el.classList.add('invalid-ref'); 
        }
        el.setAttribute('data-var-name', exprNode.props.varName); 
        el.appendChild(createVariableDropdown(exprNode.props.varName, (val, isNew) => { 
            exprNode.props.varName = val;
            if (isNew && localVars.length > 0) {
                let funcId = getFunctionIdByInnerNode(exprNode.id);
                if (funcId) {
                    let fDef = getActiveScreen().floatingBlocks.find(b => b.node.id === funcId);
                    if (fDef) {
                        let fModel = appModel.functions.find(f => f.name === fDef.node.props.funcName);
                        if (fModel) {
                            if (!fModel.localVars) fModel.localVars = [];
                            fModel.localVars.push(val);
                        }
                    }
                }
            }
            updateAllViews(); 
        }, localVars));
    } else if (exprNode.type === 'CallFunctionExpr') {
        if (exprNode.props.funcName && !appModel.functions.some(f => f.name === exprNode.props.funcName)) {
            el.classList.add('invalid-ref'); 
        }
        
        el.appendChild(document.createTextNode('Call '));
        el.appendChild(createFunctionDropdown(exprNode.props.funcName, e => { 
            exprNode.props.funcName = e; 
            let f = appModel.functions.find(x => x.name === e);
            exprNode.args = {};
            if(f && f.params) f.params.forEach(p => exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            updateAllViews();
        }));
        
        let fModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (fModel && fModel.params && fModel.params.length > 0) {
            if (!exprNode.args) exprNode.args = {};
            fModel.params.forEach(p => {
                let pRow = document.createElement('div');
                pRow.style.margin = "4px 10px";
                pRow.style.display = "flex"; pRow.style.alignItems = "center";
                pRow.innerHTML = `<span style="margin-right:6px; font-weight:500;">${p} = </span>`;
                pRow.appendChild(createExpressionSlot(exprNode.args, p, 'value', localVars));
                el.appendChild(pRow);
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
    else if (exprNode.type === 'MathOp') {
        el.classList.add('math-block');
        el.appendChild(createExpressionSlot(exprNode, 'left', 'value', localVars));
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['+', '-', '*', '/', '%', '^'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(createExpressionSlot(exprNode, 'right', 'value', localVars));
    }
    else if (exprNode.type === 'MathRandom') {
        el.classList.add('math-block');
        el.appendChild(document.createTextNode('Random '));
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['int', 'float'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.randType===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.randType = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(document.createTextNode(' zw. '));
        el.appendChild(createExpressionSlot(exprNode, 'min', 'value', localVars));
        el.appendChild(document.createTextNode(' u. '));
        el.appendChild(createExpressionSlot(exprNode, 'max', 'value', localVars));
    }
    else if (exprNode.type === 'MathCompare') {
        el.classList.add('math-block');
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['min', 'max', 'avg'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von '));
        el.appendChild(createExpressionSlot(exprNode, 'left', 'value', localVars));
        el.appendChild(document.createTextNode(' u. '));
        el.appendChild(createExpressionSlot(exprNode, 'right', 'value', localVars));
    }
    else if (exprNode.type === 'MathList') {
        el.classList.add('math-block');
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['min', 'max', 'avg'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von Liste '));
        el.appendChild(createExpressionSlot(exprNode, 'list', 'value', localVars));
    }
    else if (exprNode.type === 'MathFunc') {
        el.classList.add('math-block');
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['sqrt', 'log10', 'ln', 'abs', 'round'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von '));
        el.appendChild(createExpressionSlot(exprNode, 'value', 'value', localVars));
    }
    else if (exprNode.type === 'MathTrig') {
        el.classList.add('math-block');
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        ['sin', 'cos', 'tan'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; updateAllViews(); };
        el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von '));
        el.appendChild(createExpressionSlot(exprNode, 'value', 'value', localVars));
    }
    else if (exprNode.type === 'GetUIProperty') {
        el.classList.add('ui-logic-block');
        el.setAttribute('data-var-name', exprNode.props.targetId); 
        el.appendChild(document.createTextNode(`${exprNode.props.targetId} `));
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        let prop = exprNode.props.property;
        selOp.innerHTML += `<option value="${prop}" selected>${prop}</option>`;
        selOp.disabled = true; 
        el.appendChild(selOp);
    }
    else if (exprNode.type === 'GetScreenArgument') {
        el.classList.add('ui-logic-block');
        el.appendChild(document.createTextNode('Screen Argument'));
    }

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

function getFunctionIdByInnerNode(nodeId) {
    for (let fb of getActiveScreen().floatingBlocks) {
        if (fb.node.type === 'FunctionDef') {
            if (fb.node.id === nodeId || findNodeById(fb.node, nodeId)) return fb.node.id;
        }
    }
    return null;
}

function renderBlockEditor() {
    renderVariableList();
    renderFunctionList();
    renderScreenSwitcher();
    renderUIElementsPanel();
    
    const content = document.getElementById('canvasContent');
    if(!content) return;
    content.innerHTML = '';
    
    getActiveScreen().floatingBlocks.forEach((fb) => {
        const fbWrapper = document.createElement('div');
        fbWrapper.style.position = 'absolute';
        fbWrapper.style.left = fb.x + 'px';
        fbWrapper.style.top = fb.y + 'px';
        
        let locals = [];
        if (fb.node.type === 'FunctionDef') {
            let fModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
            if (fModel) locals = [...(fModel.params || []), ...(fModel.localVars || [])];
        }

        const blockEl = createVisualBlock(fb.node, locals);
        fbWrapper.appendChild(blockEl);
        content.appendChild(fbWrapper);
    });
}

function renderUIElementsPanel() {
    const list = document.getElementById('uiElementsList');
    if(!list) return;
    list.innerHTML = '';
    
    let activeScreen = getActiveScreen();
    
    function collectUI(node, result) {
        if(!node) return;
        if (['TextLabel', 'TextField', 'Button', 'Row', 'Column', 'Scaffold'].includes(node.type) && node.id) {
            result.push(node);
        }
        if (node.children) node.children.forEach(c => collectUI(c, result));
    }
    
    let uiElements = [];
    collectUI(activeScreen.uiTree, uiElements);
    
    if(uiElements.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:10px;">Keine UI-Elemente vorhanden. Ziehe sie aus "Logic & UI" in den Emulator.</div>`;
        return;
    }
    
    uiElements.forEach(el => {
        let details = document.createElement('details');
        details.className = 'category';
        
        let summary = document.createElement('summary');
        summary.setAttribute('data-sidebar-ui-id', el.id);
        let icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        summary.innerHTML = `${icon} <span style="font-family:monospace; margin-left:5px;">${el.id}</span> (${el.type})`;
        
        bindListHoverEvents(summary, el.id);
        details.appendChild(summary);

        let cmds = document.createElement('div');
        cmds.className = 'commands-list';
        
        let prop = 'text';
        if (el.type === 'Button') prop = 'label';
        
        if (['TextLabel', 'TextField', 'Button'].includes(el.type)) {
            let setBtn = document.createElement('div');
            setBtn.className = 'command-block ui-logic-block';
            setBtn.draggable = true;
            setBtn.innerText = `Setze ${prop}`;
            setBtn.ondragstart = (e) => {
                const rect = setBtn.getBoundingClientRect();
                e.dataTransfer.setData('application/json', JSON.stringify({ 
                    source: 'sidebar', type: 'SetUIProperty', targetId: el.id, property: prop, isExpr: false,
                    offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top
                }));
                setDragState(false, null, 'SetUIProperty');
            };
            cmds.appendChild(setBtn);
            
            let getBtn = document.createElement('div');
            getBtn.className = 'command-block val-expr ui-logic-block';
            getBtn.draggable = true;
            getBtn.innerText = `Lese ${prop}`;
            getBtn.ondragstart = (e) => {
                const rect = getBtn.getBoundingClientRect();
                e.dataTransfer.setData('application/json', JSON.stringify({ 
                    source: 'sidebar', type: 'GetUIProperty', targetId: el.id, property: prop, isExpr: true,
                    offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top
                }));
                setDragState(true, 'value', 'GetUIProperty');
            };
            cmds.appendChild(getBtn);
        } else {
            let hint = document.createElement('div');
            hint.style.cssText = 'color:var(--text-muted); font-size:11px;';
            hint.innerText = "Container Element";
            cmds.appendChild(hint);
        }
        
        // Inline Buttons für Rename und Delete
        let actionsRow = document.createElement('div');
        actionsRow.style.cssText = 'display:flex; gap:5px; margin-top:5px;';
        
        let btnRename = document.createElement('button');
        btnRename.className = 'btn-add-var';
        btnRename.style.flex = "1";
        btnRename.style.padding = "4px";
        btnRename.innerText = dictionary['ctx_rename'][currentLang];
        btnRename.onclick = (e) => { e.stopPropagation(); window.renameUIElement(el.id); };
        
        let btnDelete = document.createElement('button');
        btnDelete.className = 'btn-add-var';
        btnDelete.style.flex = "1";
        btnDelete.style.padding = "4px";
        btnDelete.style.color = '#ef4444';
        btnDelete.style.borderColor = 'rgba(239,68,68,0.3)';
        btnDelete.innerText = dictionary['ctx_delete'][currentLang];
        btnDelete.onmouseenter = () => btnDelete.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        btnDelete.onmouseleave = () => btnDelete.style.backgroundColor = "transparent";
        btnDelete.onclick = (e) => { e.stopPropagation(); window.deleteUIElement(el.id, e); };
        
        actionsRow.appendChild(btnRename);
        actionsRow.appendChild(btnDelete);
        cmds.appendChild(actionsRow);
        
        details.appendChild(cmds);
        list.appendChild(details);
    });
}

function createVisualBlock(node, localVars = []) {
    const block = document.createElement('div');
    block.className = 'visual-block';
    block.id = 'block_' + node.id;
    
    const header = document.createElement('div');
    header.className = 'visual-block-header';
    
    let icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="12" y2="17"></line></svg>`;
    
    if (node.type === 'If' || node.type === 'Loop' || node.type === 'ForLoop' || node.type === 'ForEach') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    else if (node.type === 'FunctionDef') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    else if (node.type === 'OpenScreen' || node.type === 'CloseScreen' || node.type === 'ExitApp') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
    else if (node.type === 'UIEvent' || node.type === 'SetUIProperty') { icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`; block.classList.add('ui-logic-block'); }

    header.innerHTML = `<span>${icon}</span> <span>${node.type}</span>`;
    
    if (node.type === 'SetVariable') {
        if (node.props.varName && !appModel.variables.includes(node.props.varName) && !localVars.includes(node.props.varName)) {
            block.classList.add('invalid-ref'); 
        }
        block.setAttribute('data-var-name', node.props.varName); 

        header.innerHTML = `<span>${icon}</span> <span>Variable</span>`;
        header.appendChild(createVariableDropdown(node.props.varName, (val, isNew) => { 
            node.props.varName = val;
            if (isNew && localVars.length > 0) {
                let funcId = getFunctionIdByInnerNode(node.id);
                if (funcId) {
                    let fDef = getActiveScreen().floatingBlocks.find(b => b.node.id === funcId);
                    if (fDef) {
                        let fModel = appModel.functions.find(f => f.name === fDef.node.props.funcName);
                        if (fModel) {
                            if (!fModel.localVars) fModel.localVars = [];
                            fModel.localVars.push(val);
                        }
                    }
                }
            }
            updateAllViews(); 
        }, localVars));
        let equals = document.createElement('span');
        equals.innerHTML = '=';
        equals.style.cssText = 'color:inherit; font-weight:bold; margin: 0 5px;';
        header.appendChild(equals);
        header.appendChild(createExpressionSlot(node, 'value', 'value', localVars));
    }
    else if (node.type === 'SetUIProperty') {
        block.setAttribute('data-var-name', node.props.targetId); 
        header.innerHTML = `<span>${icon}</span> <span>Setze <b>${node.props.targetId}</b></span>`;
        const selOp = makeControl('select');
        selOp.style.margin = '0 5px';
        let prop = node.props.property;
        selOp.innerHTML += `<option value="${prop}" selected>${prop}</option>`;
        selOp.disabled = true; 
        header.appendChild(selOp);
        let equals = document.createElement('span');
        equals.innerHTML = 'auf';
        equals.style.cssText = 'color:inherit; font-weight:bold; margin: 0 5px;';
        header.appendChild(equals);
        header.appendChild(createExpressionSlot(node, 'value', 'value', localVars));
    }
    else if (node.type === 'UIEvent') {
        block.setAttribute('data-var-name', node.props.sourceId); 
        header.innerHTML = `<span>${icon}</span> <span>Wenn <b>${node.props.sourceId}</b> geklickt wird:</span>`;
    }
    else if (node.type === 'If') {
        header.appendChild(createExpressionSlot(node, 'condition', 'boolean', localVars));
        
        let btnContainer = document.createElement('div');
        btnContainer.style.marginLeft = "auto";
        btnContainer.style.display = "flex"; btnContainer.style.gap = "5px";
        
        let btnElseIf = document.createElement('button');
        btnElseIf.innerText = "+ Else If"; btnElseIf.className = 'btn-add-local-var';
        btnElseIf.onclick = (e) => {
            e.stopPropagation();
            if(!node.elseIfs) node.elseIfs = [];
            node.elseIfs.push({ id: genId('elif'), condition: {type: 'BooleanValue', id: genId('exp'), value: 'true'}, children: [] });
            updateAllViews();
        };
        btnContainer.appendChild(btnElseIf);

        let btnElse = document.createElement('button');
        btnElse.innerText = "+ Else"; btnElse.className = 'btn-add-local-var';
        if (node.elseBranch) btnElse.style.display = 'none'; 
        btnElse.onclick = (e) => {
            e.stopPropagation();
            node.elseBranch = { id: genId('else'), children: [] };
            updateAllViews();
        };
        btnContainer.appendChild(btnElse);
        header.appendChild(btnContainer);
    }
    else if (node.type === 'Loop') {
        header.appendChild(createExpressionSlot(node, 'condition', 'boolean', localVars));
    }
    else if (node.type === 'ForLoop') {
        header.innerHTML = `<span>${icon}</span> <span>For</span>`;
        header.appendChild(createVariableDropdown(node.props.varName, (val) => { node.props.varName = val; updateAllViews(); }, localVars));
        header.appendChild(document.createTextNode(' = '));
        header.appendChild(createExpressionSlot(node, 'start', 'value', localVars));
        header.appendChild(document.createTextNode(' bis '));
        header.appendChild(createExpressionSlot(node, 'end', 'value', localVars));
        header.appendChild(document.createTextNode(' step '));
        header.appendChild(createExpressionSlot(node, 'step', 'value', localVars));
        
        if (node.props.varName && !localVars.includes(node.props.varName)) localVars.push(node.props.varName);
    }
    else if (node.type === 'ForEach') {
        header.innerHTML = `<span>${icon}</span> <span>ForEach</span>`;
        header.appendChild(createVariableDropdown(node.props.varName, (val) => { node.props.varName = val; updateAllViews(); }, localVars));
        header.appendChild(document.createTextNode(' in '));
        header.appendChild(createExpressionSlot(node, 'list', 'value', localVars));
        
        if (node.props.varName && !localVars.includes(node.props.varName)) localVars.push(node.props.varName);
    }
    else if (node.type === 'OpenScreen') {
        header.innerHTML = `<span>${icon}</span> <span>Open Screen:</span>`;
        const sel = makeControl('select');
        appModel.screens.forEach(s => {
            let opt = document.createElement('option');
            opt.value = s.id; opt.text = s.id;
            if (s.id === node.props.screenName) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = e => { node.props.screenName = e.target.value; updateAllViews(); };
        header.appendChild(sel);
        
        header.appendChild(document.createTextNode(' mit Argument: '));
        header.appendChild(createExpressionSlot(node, 'arg', 'value', localVars));
    }
    else if (node.type === 'FunctionDef') {
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        let pStr = (fModel && fModel.params && fModel.params.length > 0) ? ` (${fModel.params.join(', ')})` : ` ()`;
        header.innerHTML = `<span>${icon}</span> <span>Funktion: <b>${node.props.funcName}${pStr}</b></span>`;
        
        if (fModel) {
            let locContainer = document.createElement('div');
            locContainer.className = 'local-vars-container';
            
            let title = document.createElement('div');
            title.className = 'local-vars-title';
            title.innerText = 'Lokale Vars & Params:';
            
            let btnAdd = document.createElement('button');
            btnAdd.className = 'btn-add-local-var';
            btnAdd.innerText = '+ Neu';
            btnAdd.onclick = async (ev) => {
                ev.stopPropagation();
                let vName = await promptNewVariable(true);
                if (vName) {
                    if (!fModel.localVars) fModel.localVars = [];
                    fModel.localVars.push(vName);
                    updateAllViews();
                }
            };
            title.appendChild(btnAdd);
            locContainer.appendChild(title);
            
            let listEl = document.createElement('div');
            let allLocals = [...(fModel.params || []), ...(fModel.localVars || [])];
            
            if (allLocals.length === 0) {
                listEl.innerHTML = '<i>Keine</i>';
            } else {
                allLocals.forEach((v, idx) => {
                    let span = document.createElement('span');
                    span.className = 'sidebar-list-item';
                    span.style.color = 'inherit';
                    span.style.fontWeight = 'bold';
                    span.innerText = v;
                    
                    bindListHoverEvents(span, v);
                    
                    span.oncontextmenu = (ev) => {
                        ev.preventDefault(); ev.stopPropagation(); hideAllMenus();
                        currentListTarget = { type: 'local_var', name: v, funcName: fModel.name };
                        const menu = document.getElementById('sidebarListMenu');
                        menu.style.left = ev.pageX + 'px';
                        menu.style.top = ev.pageY + 'px';
                        menu.classList.add('active');
                    };
                    listEl.appendChild(span);
                    if (idx < allLocals.length - 1) listEl.appendChild(document.createTextNode(', '));
                });
            }
            locContainer.appendChild(listEl);
            header.appendChild(locContainer);
        }
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
            if(f && f.params) f.params.forEach(p => node.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            updateAllViews();
        }));
        
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (fModel && fModel.params && fModel.params.length > 0) {
            if (!node.args) node.args = {};
            fModel.params.forEach(p => {
                let pRow = document.createElement('div');
                pRow.style.margin = "4px 10px";
                pRow.style.display = "flex"; pRow.style.alignItems = "center";
                pRow.innerHTML = `<span style="margin-right:6px; font-weight:500;">${p} = </span>`;
                pRow.appendChild(createExpressionSlot(node.args, p, 'value', localVars));
                header.appendChild(pRow);
            });
        }
    }
    else if (node.type === 'Return') {
        header.innerHTML = `<span>${icon}</span> <span>Return</span>`;
        header.appendChild(createExpressionSlot(node, 'value', 'value', localVars));
    }
    
    block.draggable = true;
    block.addEventListener('dragstart', e => { 
        e.stopPropagation(); 
        const rect = block.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.setData('application/json', JSON.stringify({ 
            source: 'editor', 
            id: node.id,
            offsetX: offsetX,
            offsetY: offsetY
        })); 
        setDragState(false, null, node.type);
        
        let wasDisconnected = block.classList.contains('disconnected');
        if(wasDisconnected) block.classList.remove('disconnected');
        
        setTimeout(() => { 
            if(wasDisconnected) block.classList.add('disconnected');
            block.style.opacity = '0.3'; 
        }, 0);
    });
    const delBtn = document.createElement('span'); delBtn.innerHTML = '✕';
    delBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:inherit; opacity: 0.7; font-size:14px; font-weight:bold; padding: 0 5px; transition: 0.2s;';
    delBtn.onmouseenter = () => { delBtn.style.opacity = '1'; delBtn.style.color = '#ef4444'; };
    delBtn.onmouseleave = () => { delBtn.style.opacity = '0.7'; delBtn.style.color = 'inherit'; };
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
    
    block.appendChild(header);
    
    if (['If', 'Loop', 'FunctionDef', 'ForLoop', 'ForEach', 'UIEvent'].includes(node.type)) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'visual-block-children';
        if(['UIEvent'].includes(node.type)) childrenContainer.style.borderColor = "rgba(255,255,255,0.4)";
        
        let childCount = node.children ? node.children.length : 0;
        for (let i = 0; i <= childCount; i++) {
            childrenContainer.appendChild(createDropZone(node.id, i));
            if (i < childCount) {
                childrenContainer.appendChild(createVisualBlock(node.children[i], localVars));
            }
        }
        block.appendChild(childrenContainer);

        if (node.type === 'If') {
            if (node.elseIfs) {
                node.elseIfs.forEach((elif, elifIdx) => {
                    let elifHeader = document.createElement('div');
                    elifHeader.className = 'visual-block-header';
                    elifHeader.style.marginTop = "10px";
                    elifHeader.innerHTML = `<span style="color:var(--text-main);">Else If</span>`;
                    elifHeader.appendChild(createExpressionSlot(elif, 'condition', 'boolean', localVars));
                    
                    let delElifBtn = document.createElement('span');
                    delElifBtn.innerHTML = '✕';
                    delElifBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold;';
                    delElifBtn.onclick = (e) => { e.stopPropagation(); node.elseIfs.splice(elifIdx, 1); updateAllViews(); };
                    elifHeader.appendChild(delElifBtn);
                    block.appendChild(elifHeader);
                    
                    const elifContainer = document.createElement('div');
                    elifContainer.className = 'visual-block-children';
                    let cCount = elif.children ? elif.children.length : 0;
                    for (let i = 0; i <= cCount; i++) {
                        elifContainer.appendChild(createDropZone(elif.id, i));
                        if (i < cCount) elifContainer.appendChild(createVisualBlock(elif.children[i], localVars));
                    }
                    block.appendChild(elifContainer);
                });
            }
            if (node.elseBranch) {
                let elseHeader = document.createElement('div');
                elseHeader.className = 'visual-block-header';
                elseHeader.style.marginTop = "10px";
                elseHeader.innerHTML = `<span style="color:var(--text-main);">Else</span>`;
                
                let delElseBtn = document.createElement('span');
                delElseBtn.innerHTML = '✕';
                delElseBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold;';
                delElseBtn.onclick = (e) => { e.stopPropagation(); delete node.elseBranch; updateAllViews(); };
                elseHeader.appendChild(delElseBtn);
                block.appendChild(elseHeader);
                
                const elseContainer = document.createElement('div');
                elseContainer.className = 'visual-block-children';
                let cCount = node.elseBranch.children ? node.elseBranch.children.length : 0;
                if (!node.elseBranch.id) node.elseBranch.id = genId('else');
                for (let i = 0; i <= cCount; i++) {
                    elseContainer.appendChild(createDropZone(node.elseBranch.id, i));
                    if (i < cCount) elseContainer.appendChild(createVisualBlock(node.elseBranch.children[i], localVars));
                }
                block.appendChild(elseContainer);
            }
        }
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
            document.getElementById('ctx-cut-block').style.display = 'flex';
            document.getElementById('ctx-delete-block').style.display = 'flex';
            document.getElementById('ctx-div-2').style.display = 'block';

            if (node && node.type === 'FunctionDef') {
                document.getElementById('ctx-edit-params').style.display = 'flex';
                document.getElementById('ctx-div-1').style.display = 'block';
            }
            hasOptions = true;
        } else {
            const rect = blockEditor.getBoundingClientRect();
            let x = (e.clientX - rect.left - window.canvasState.x) / window.canvasState.scale;
            let y = (e.clientY - rect.top - window.canvasState.y) / window.canvasState.scale;
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
            
            let targetChildrenArray = parent.children;
            if (parent.elseIfs) { let el = parent.elseIfs.find(x => x.id === currentBlockTarget.parentId); if (el) targetChildrenArray = el.children; }
            if (parent.elseBranch && parent.elseBranch.id === currentBlockTarget.parentId) targetChildrenArray = parent.elseBranch.children;

            if (targetChildrenArray) {
                if (nodeToPaste.type === 'FunctionDef' || nodeToPaste.type === 'UIEvent') {
                    getActiveScreen().floatingBlocks.push({ x: 50, y: 50, node: nodeToPaste });
                } else {
                    targetChildrenArray.splice(currentBlockTarget.index, 0, nodeToPaste);
                }
            }
        } else if (currentBlockTarget.type === 'canvas') {
            getActiveScreen().floatingBlocks.push({ x: currentBlockTarget.x, y: currentBlockTarget.y, node: nodeToPaste });
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
    if (exprNode.type === 'LogicNot') return !evaluateExpressionJS(exprNode.value, ctx, true);
    if (exprNode.type === 'NumberValue') return Number(exprNode.value) || 0;
    if (exprNode.type === 'StringValue') return exprNode.value || "";
    if (exprNode.type === 'VarValue') return ctx[exprNode.props.varName] !== undefined ? ctx[exprNode.props.varName] : 0;
    if (exprNode.type === 'GetScreenArgument') return window.emulatorScreenArg !== undefined ? window.emulatorScreenArg : "";

    if (exprNode.type === 'MathOp') {
        let l = evaluateExpressionJS(exprNode.left, ctx, 0);
        let r = evaluateExpressionJS(exprNode.right, ctx, 0);
        switch(exprNode.operator) {
            case '+': return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/': return r !== 0 ? l / r : 0;
            case '%': return r !== 0 ? l % r : 0;
            case '^': return Math.pow(l, r);
            default: return 0;
        }
    }
    if (exprNode.type === 'MathRandom') {
        let min = evaluateExpressionJS(exprNode.min, ctx, 0);
        let max = evaluateExpressionJS(exprNode.max, ctx, 100);
        if(exprNode.randType === 'int') return Math.floor(Math.random() * (max - min + 1)) + min;
        return Math.random() * (max - min) + min;
    }
    if (exprNode.type === 'MathCompare') {
        let l = evaluateExpressionJS(exprNode.left, ctx, 0);
        let r = evaluateExpressionJS(exprNode.right, ctx, 0);
        if(exprNode.operator === 'min') return Math.min(l, r);
        if(exprNode.operator === 'max') return Math.max(l, r);
        if(exprNode.operator === 'avg') return (l + r) / 2;
        return 0;
    }
    if (exprNode.type === 'MathList') {
        let val = evaluateExpressionJS(exprNode.list, ctx, "");
        let arr = [];
        if (Array.isArray(val)) arr = val;
        else if (typeof val === 'string') arr = val.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n));
        else arr = [Number(val)];
        
        if (arr.length === 0) return 0;
        if (exprNode.operator === 'min') return Math.min(...arr);
        if (exprNode.operator === 'max') return Math.max(...arr);
        if (exprNode.operator === 'avg') return arr.reduce((a, b) => a + b, 0) / arr.length;
        return 0;
    }
    if (exprNode.type === 'MathFunc') {
        let v = evaluateExpressionJS(exprNode.value, ctx, 0);
        if(exprNode.operator === 'sqrt') return Math.sqrt(v);
        if(exprNode.operator === 'log10') return Math.log10(v);
        if(exprNode.operator === 'ln') return Math.log(v);
        if(exprNode.operator === 'abs') return Math.abs(v);
        if(exprNode.operator === 'round') return Math.round(v);
        return 0;
    }
    if (exprNode.type === 'MathTrig') {
        let v = evaluateExpressionJS(exprNode.value, ctx, 0);
        if(exprNode.operator === 'sin') return Math.sin(v);
        if(exprNode.operator === 'cos') return Math.cos(v);
        if(exprNode.operator === 'tan') return Math.tan(v);
        return 0;
    }

    if (exprNode.type === 'CallFunctionExpr') {
        let funcDef = null;
        appModel.screens.forEach(s => {
            if(s.floatingBlocks) {
                let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === exprNode.props.funcName);
                if(found) funcDef = found;
            }
        });
        
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx };
            tempCtx._return = undefined;
            if (funcModel && funcModel.localVars) {
                funcModel.localVars.forEach(lv => { tempCtx[lv] = 0; });
            }
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
            Object.keys(tempCtx).forEach(k => { 
                let isParam = funcModel && funcModel.params && funcModel.params.includes(k);
                let isLocal = funcModel && funcModel.localVars && funcModel.localVars.includes(k);
                if(k !== '_return' && !isParam && !isLocal) {
                    ctx[k] = tempCtx[k]; 
                }
            });
            return tempCtx._return !== undefined ? tempCtx._return : 0;
        }
        return 0;
    }
    if (exprNode.type === 'GetUIProperty') {
        let key = exprNode.props.targetId + "_" + exprNode.props.property;
        return window.emulatorCtx[key] !== undefined ? window.emulatorCtx[key] : "";
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

    if (node.type === 'SetVariable') {
        if (node.props.varName) ctx[node.props.varName] = evaluateExpressionJS(node.value, ctx, 0);
    }
    else if (node.type === 'SetUIProperty') {
        let key = node.props.targetId + "_" + node.props.property;
        window.emulatorCtx[key] = evaluateExpressionJS(node.value, ctx, "");
    }
    else if (node.type === 'If') {
        let handled = false;
        if (evaluateExpressionJS(node.condition, ctx, true)) {
            if (node.children) {
                for (let c of node.children) {
                    if (ctx._return !== undefined) break;
                    buildHtmlNode(c, ctx, parentFragment);
                }
            }
            handled = true;
        }
        if (!handled && node.elseIfs) {
            for (let elif of node.elseIfs) {
                if (evaluateExpressionJS(elif.condition, ctx, true)) {
                    if (elif.children) {
                        for (let c of elif.children) {
                            if (ctx._return !== undefined) break;
                            buildHtmlNode(c, ctx, parentFragment);
                        }
                    }
                    handled = true;
                    break;
                }
            }
        }
        if (!handled && node.elseBranch) {
            if (node.elseBranch.children) {
                for (let c of node.elseBranch.children) {
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
    }
    else if (node.type === 'ForLoop') {
        let s = evaluateExpressionJS(node.start, ctx, 1);
        let e = evaluateExpressionJS(node.end, ctx, 10);
        let step = evaluateExpressionJS(node.step, ctx, 1);
        let limit = 0;
        let counterVar = node.props.varName;
        
        ctx[counterVar] = s;
        while(limit < 1000) {
            if(s <= e && ctx[counterVar] > e) break;
            if(s > e && ctx[counterVar] < e) break;

            if (ctx._return !== undefined) break;
            if (node.children) {
                for (let c of node.children) {
                    if (ctx._return !== undefined) break;
                    buildHtmlNode(c, ctx, parentFragment);
                }
            }
            ctx[counterVar] += (s <= e) ? step : -step;
            limit++;
        }
    }
    else if (node.type === 'ForEach') {
        let listVal = evaluateExpressionJS(node.list, ctx, "");
        let arr = [];
        if (Array.isArray(listVal)) arr = listVal;
        else if (typeof listVal === 'string') arr = listVal.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n));
        else arr = [Number(listVal)];
        
        let elVar = node.props.varName;
        for (let i = 0; i < arr.length; i++) {
            if (ctx._return !== undefined) break;
            ctx[elVar] = arr[i];
            if (node.children) {
                for (let c of node.children) {
                    if (ctx._return !== undefined) break;
                    buildHtmlNode(c, ctx, parentFragment);
                }
            }
        }
    }
    else if (node.type === 'CallFunction') {
        let funcDef = null;
        appModel.screens.forEach(s => {
            if(s.floatingBlocks) {
                let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === node.props.funcName);
                if(found) funcDef = found;
            }
        });
        
        let funcModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx };
            if (funcModel && funcModel.localVars) {
                funcModel.localVars.forEach(lv => { tempCtx[lv] = 0; });
            }
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
                let isParam = funcModel && funcModel.params && funcModel.params.includes(k);
                let isLocal = funcModel && funcModel.localVars && funcModel.localVars.includes(k);
                if(k !== '_return' && !isParam && !isLocal) {
                    ctx[k] = tempCtx[k]; 
                }
            });
        }
    }
    else if (node.type === 'Return') {
        ctx._return = evaluateExpressionJS(node.value, ctx, 0);
    }
    else if (node.type === 'OpenScreen') {
        let argVal = evaluateExpressionJS(node.arg, ctx, "");
        logToConsole(`[Emulator] Navigation -> ${node.props.screenName} (Arg: ${argVal})`);
        switchScreen(node.props.screenName, argVal);
    }
    else if (node.type === 'CloseScreen') {
        logToConsole("[Emulator] Navigation -> Close Screen (Simulation: Back)");
    }
    else if (node.type === 'ExitApp') {
        logToConsole("[Emulator] App Exit requested.");
    }
}

function triggerUIEvent(sourceId, eventType) {
    let evtBlock = getActiveScreen().floatingBlocks.find(fb => fb.node.type === 'UIEvent' && fb.node.props.sourceId === sourceId && fb.node.props.eventType === eventType);
    if (evtBlock && evtBlock.node.children) {
        const dummyFrag = document.createDocumentFragment();
        for(let c of evtBlock.node.children) {
            if(window.emulatorCtx._return !== undefined) break;
            buildHtmlNode(c, window.emulatorCtx, dummyFrag);
        }
    }
    renderEmulator(true); 
}

function extractDefaultUIState(tree, ctx) {
    if(!tree) return;
    if (['TextLabel', 'TextField'].includes(tree.type)) {
        let key = tree.id + "_text";
        if (ctx[key] === undefined) ctx[key] = tree.props.text || "";
    }
    if (tree.type === 'Button') {
        let key = tree.id + "_label";
        if (ctx[key] === undefined) ctx[key] = tree.props.label || "Button";
    }
    if (tree.children) tree.children.forEach(c => extractDefaultUIState(c, ctx));
}

function renderUITree(node, parentEl) {
    if (!node) return;
    let el = null;
    
    if (node.type === 'Scaffold') {
        el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; padding:20px; gap:12px; overflow-y:auto; box-sizing:border-box; background:#ffffff;';
        if(node.children) node.children.forEach(c => renderUITree(c, el));
    }
    else if (node.type === 'Column') {
        el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:column; gap:8px; width:100%; box-sizing: border-box;';
        if(node.children && node.children.length === 0) el.style.minHeight = "20px";
        if(node.children) node.children.forEach(c => renderUITree(c, el));
    }
    else if (node.type === 'Row') {
        el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:row; gap:8px; width:100%; box-sizing: border-box; align-items:center; flex-wrap: wrap;';
        if(node.children && node.children.length === 0) el.style.minHeight = "20px";
        if(node.children) node.children.forEach(c => renderUITree(c, el));
    }
    else if (node.type === 'TextLabel') {
        el = document.createElement('div');
        el.innerText = window.emulatorCtx[node.id + "_text"] || "";
        el.style.cssText = 'font-size:16px; color:#334155; display:block;';
    }
    else if (node.type === 'Button') {
        el = document.createElement('button');
        el.innerText = window.emulatorCtx[node.id + "_label"] || "Button";
        el.style.cssText = 'padding: 10px 16px; background: var(--ui-bg, #0ea5e9); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: fit-content; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition:0.2s;';
        el.onmouseenter = (e) => { e.stopPropagation(); el.style.filter = "brightness(1.1)"; window.highlightVar(node.id); };
        el.onmouseleave = (e) => { e.stopPropagation(); el.style.filter = "brightness(1)"; window.unhighlightVar(); };
        el.onclick = (e) => { e.stopPropagation(); triggerUIEvent(node.id, 'onClick'); };
    }
    else if (node.type === 'TextField') {
        el = document.createElement('input');
        el.type = 'text';
        el.placeholder = node.props.label || '';
        el.value = window.emulatorCtx[node.id + "_text"] || "";
        el.style.cssText = 'padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; outline: none; color: #0f172a; background: #f8fafc; transition: border-color 0.2s;';
        el.onfocus = (e) => { e.stopPropagation(); el.style.borderColor = "var(--ui-bg, #0ea5e9)"; };
        el.onblur = (e) => { e.stopPropagation(); el.style.borderColor = "#cbd5e1"; };
        el.oninput = (e) => {
            window.emulatorCtx[node.id + "_text"] = e.target.value;
        };
    }
    
    if (el) {
        el.setAttribute('data-ui-id', node.id);
        if (node.type !== 'Button') {
            el.addEventListener('mouseenter', (e) => { e.stopPropagation(); window.highlightVar(node.id); });
            el.addEventListener('mouseleave', (e) => { e.stopPropagation(); window.unhighlightVar(); });
        }
        parentEl.appendChild(el);
    }
}

function renderEmulator(preserveState = false) {
    const screenElement = document.getElementById('phoneScreen');
    screenElement.innerHTML = '';
    
    let activeScreen = getActiveScreen();

    if (!preserveState || !window.emulatorCtx) {
        window.emulatorCtx = {};
        appModel.variables.forEach(v => window.emulatorCtx[v] = 0);
        appModel.screens.forEach(s => extractDefaultUIState(s.uiTree, window.emulatorCtx));
    } else {
        appModel.variables.forEach(v => { if(window.emulatorCtx[v] === undefined) window.emulatorCtx[v] = 0; });
        appModel.screens.forEach(s => extractDefaultUIState(s.uiTree, window.emulatorCtx)); 
    }
    window.emulatorCtx._return = undefined;
    
    renderUITree(activeScreen.uiTree, screenElement);
}

window.updateAllViews = function() {
    renderBlockEditor();      
    renderEmulator(true);         
    if (typeof syncKotlinCodeToVFS === 'function') syncKotlinCodeToVFS();
    if (window.refreshStaticAnalysis) window.refreshStaticAnalysis();
};

// ==========================================
// KOTLIN GENERATOR & VFS SYNC
// ==========================================
function evaluateExpressionKotlin(exprNode, defaultReturn = "true") {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value;
    if (exprNode.type === 'LogicNot') return `!(${evaluateExpressionKotlin(exprNode.value, "true")})`;
    if (exprNode.type === 'NumberValue') return exprNode.value;
    if (exprNode.type === 'StringValue') return `"${exprNode.value || ""}"`;
    if (exprNode.type === 'VarValue') return exprNode.props.varName || "0";
    if (exprNode.type === 'GetScreenArgument') return `navArg`;
    
    if (exprNode.type === 'MathOp') {
        let l = evaluateExpressionKotlin(exprNode.left, "0");
        let r = evaluateExpressionKotlin(exprNode.right, "0");
        let lF = `(${l}.toString().toFloatOrNull() ?: 0f)`;
        let rF = `(${r}.toString().toFloatOrNull() ?: 0f)`;
        
        switch(exprNode.operator) {
            case '+': return `(${lF} + ${rF})`;
            case '-': return `(${lF} - ${rF})`;
            case '*': return `(${lF} * ${rF})`;
            case '/': return `(if(${rF} != 0f) ${lF} / ${rF} else 0f)`;
            case '%': return `(${lF} % ${rF})`;
            case '^': return `kotlin.math.pow(${lF}.toDouble(), ${rF}.toDouble()).toFloat()`;
            default: return "0f";
        }
    }
    if (exprNode.type === 'MathRandom') {
        let min = evaluateExpressionKotlin(exprNode.min, "0");
        let max = evaluateExpressionKotlin(exprNode.max, "100");
        let minF = `(${min}.toString().toFloatOrNull() ?: 0f)`;
        let maxF = `(${max}.toString().toFloatOrNull() ?: 100f)`;
        if(exprNode.randType === 'int') return `(${minF}.toInt()..${maxF}.toInt()).random()`;
        return `kotlin.random.Random.nextDouble(${minF}.toDouble(), ${maxF}.toDouble()).toFloat()`;
    }
    if (exprNode.type === 'MathCompare') {
        let l = evaluateExpressionKotlin(exprNode.left, "0");
        let r = evaluateExpressionKotlin(exprNode.right, "0");
        let lF = `(${l}.toString().toFloatOrNull() ?: 0f)`;
        let rF = `(${r}.toString().toFloatOrNull() ?: 0f)`;
        if(exprNode.operator === 'min') return `kotlin.math.min(${lF}, ${rF})`;
        if(exprNode.operator === 'max') return `kotlin.math.max(${lF}, ${rF})`;
        if(exprNode.operator === 'avg') return `((${lF} + ${rF}) / 2f)`;
        return "0f";
    }
    if (exprNode.type === 'MathList') {
        let list = evaluateExpressionKotlin(exprNode.list, "\"\"");
        return `mathListOp(${list}.toString(), "${exprNode.operator}")`;
    }
    if (exprNode.type === 'MathFunc') {
        let v = evaluateExpressionKotlin(exprNode.value, "0");
        let vF = `(${v}.toString().toDoubleOrNull() ?: 0.0)`;
        if(exprNode.operator === 'sqrt') return `kotlin.math.sqrt(${vF}).toFloat()`;
        if(exprNode.operator === 'log10') return `kotlin.math.log10(${vF}).toFloat()`;
        if(exprNode.operator === 'ln') return `kotlin.math.ln(${vF}).toFloat()`;
        if(exprNode.operator === 'abs') return `kotlin.math.abs(${vF}).toFloat()`;
        if(exprNode.operator === 'round') return `kotlin.math.round(${vF}).toFloat()`;
        return "0f";
    }
    if (exprNode.type === 'MathTrig') {
        let v = evaluateExpressionKotlin(exprNode.value, "0");
        let vF = `(${v}.toString().toDoubleOrNull() ?: 0.0)`;
        if(exprNode.operator === 'sin') return `kotlin.math.sin(${vF}).toFloat()`;
        if(exprNode.operator === 'cos') return `kotlin.math.cos(${vF}).toFloat()`;
        if(exprNode.operator === 'tan') return `kotlin.math.tan(${vF}).toFloat()`;
        return "0f";
    }

    if (exprNode.type === 'CallFunctionExpr') {
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        let argsStr = "";
        if (funcModel && funcModel.params && exprNode.args) {
            argsStr = funcModel.params.map(p => evaluateExpressionKotlin(exprNode.args[p], "0")).join(", ");
        }
        return `${exprNode.props.funcName}(${argsStr})`;
    }
    if (exprNode.type === 'GetUIProperty') {
        return `ui_${exprNode.props.targetId}_${exprNode.props.property}`;
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
        code += `${space}    Column(\n`;
        code += `${space}        modifier = Modifier.padding(innerPadding).fillMaxSize().padding(16.dp),\n`;
        code += `${space}        verticalArrangement = Arrangement.spacedBy(12.dp)\n`;
        code += `${space}    ) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 8); });
        code += `${space}    }\n`;
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'Column') {
        let code = `${space}Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'Row') {
        let code = `${space}Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'TextLabel') {
        return `${space}Text(text = ui_${node.id}_text.toString())\n`;
    } else if (node.type === 'Button') {
        return `${space}Button(onClick = { event_${node.id}_onClick() }) {\n${space}    Text(ui_${node.id}_label.toString())\n${space}}\n`;
    } else if (node.type === 'TextField') {
        let label = node.props.label || "";
        return `${space}OutlinedTextField(value = ui_${node.id}_text.toString(), onValueChange = { ui_${node.id}_text = it }, label = { Text("${label}") }, modifier = Modifier.fillMaxWidth())\n`;
    } 
    
    // Statements (Logic)
    else if (node.type === 'SetVariable') {
        if(node.props.varName) return `${space}${node.props.varName} = ${evaluateExpressionKotlin(node.value, "0")}\n`;
        return "";
    } else if (node.type === 'SetUIProperty') {
        return `${space}ui_${node.props.targetId}_${node.props.property} = ${evaluateExpressionKotlin(node.value, '""')}\n`;
    } else if (node.type === 'If') {
        let condStr = evaluateExpressionKotlin(node.condition, "true");
        let code = `${space}if (${condStr}) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        
        if (node.elseIfs) {
            node.elseIfs.forEach(elif => {
                code += `${space}else if (${evaluateExpressionKotlin(elif.condition, "true")}) {\n`;
                if (elif.children) elif.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
                code += `${space}}\n`;
            });
        }
        
        if (node.elseBranch) {
            code += `${space}else {\n`;
            if (node.elseBranch.children) node.elseBranch.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
            code += `${space}}\n`;
        }
        
        return code;
    } else if (node.type === 'Loop') {
        let condStr = evaluateExpressionKotlin(node.condition, "true");
        let code = `${space}while (${condStr}) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'ForLoop') {
        let varName = node.props.varName || "i";
        let start = evaluateExpressionKotlin(node.start, "1");
        let end = evaluateExpressionKotlin(node.end, "10");
        let step = evaluateExpressionKotlin(node.step, "1");
        
        let code = `${space}run {\n`;
        code += `${space}    var ${varName} = (${start}.toString().toFloatOrNull() ?: 1f)\n`;
        code += `${space}    val _end = (${end}.toString().toFloatOrNull() ?: 10f)\n`;
        code += `${space}    val _step = (${step}.toString().toFloatOrNull() ?: 1f)\n`;
        code += `${space}    var _limit = 0\n`;
        code += `${space}    while (_limit < 1000) {\n`;
        code += `${space}        if (${varName} > _end && _step > 0) break\n`;
        code += `${space}        if (${varName} < _end && _step < 0) break\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 8); });
        code += `${space}        ${varName} += _step\n`;
        code += `${space}        _limit++\n`;
        code += `${space}    }\n`;
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'ForEach') {
        let varName = node.props.varName || "element";
        let listStr = evaluateExpressionKotlin(node.list, "\"\"");
        
        let code = `${space}run {\n`;
        code += `${space}    val _listStr = ${listStr}.toString()\n`;
        code += `${space}    val _arr = _listStr.split(",").mapNotNull { it.trim().toFloatOrNull() }\n`;
        code += `${space}    for(${varName} in _arr) {\n`;
        if (node.children) node.children.forEach(child => { code += buildComposeTree(child, indent + 8); });
        code += `${space}    }\n`;
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
    } else if (node.type === 'OpenScreen') {
        let argStr = evaluateExpressionKotlin(node.arg, '""');
        return `${space}navigateTo("${node.props.screenName}", ${argStr})\n`;
    } else if (node.type === 'CloseScreen') {
        return `${space}closeScreen()\n`;
    } else if (node.type === 'ExitApp') {
        return `${space}exitApp()\n`;
    }
    return "";
}

function generateKotlinCode() {
    const meta = appModel.metadata;
    
    // Generiere States für Variablen und UI Elemente global
    let stateDeclarations = "";
    appModel.variables.forEach(v => { stateDeclarations += `var ${v} by mutableStateOf<Any>("")\n`; });
    
    function collectUIStates(tree) {
        if(!tree) return;
        if(['TextLabel', 'TextField'].includes(tree.type)) stateDeclarations += `var ui_${tree.id}_text by mutableStateOf<Any>("${tree.props.text || ""}")\n`;
        if(tree.type === 'Button') stateDeclarations += `var ui_${tree.id}_label by mutableStateOf<Any>("${tree.props.label || "Button"}")\n`;
        if(tree.children) tree.children.forEach(c => collectUIStates(c));
    }
    appModel.screens.forEach(s => collectUIStates(s.uiTree));
    
    let functionsCode = "";
    appModel.screens.forEach(s => {
        if(s.floatingBlocks) {
            s.floatingBlocks.forEach(fb => {
                if (fb.node.type === 'FunctionDef') {
                    let funcModel = appModel.functions.find(f => f.name === fb.node.props.funcName);
                    let paramsCode = (funcModel && funcModel.params) ? funcModel.params.map(p => `${p}: Any`).join(", ") : "";
                    
                    let localVarsCode = "";
                    if (funcModel && funcModel.localVars) {
                        funcModel.localVars.forEach(lv => {
                            localVarsCode += `    var ${lv} by mutableStateOf<Any>("")\n`;
                        });
                    }

                    let funcBody = buildComposeTree(fb.node, 4);
                    functionsCode += `fun ${fb.node.props.funcName}(${paramsCode}) : Any {\n${localVarsCode}${funcBody}    return 0\n}\n\n`;
                } 
                else if (fb.node.type === 'UIEvent') {
                    let funcBody = buildComposeTree(fb.node, 4);
                    functionsCode += `fun event_${fb.node.props.sourceId}_${fb.node.props.eventType}() {\n${funcBody}}\n\n`;
                }
            });
        }
    });

    // Erzeuge eine Funktion für jeden Screen
    let screensCode = "";
    appModel.screens.forEach(s => {
        let sBody = buildComposeTree(s.uiTree, 4);
        screensCode += `@Composable\nfun Screen_${s.id}(navArg: Any, navigateTo: (String, Any) -> Unit, closeScreen: () -> Unit, exitApp: () -> Unit) {\n${sBody}}\n\n`;
    });
    
    // Generiere den Navigator
    let navigatorCases = appModel.screens.map(s => `        "${s.id}" -> Screen_${s.id}(current.arg, navigateTo, closeScreen, exitApp)`).join("\n");
    let navCode = `
data class NavEntry(val route: String, val arg: Any)

@Composable
fun AppNavigation() {
    var backStack by androidx.compose.runtime.remember { mutableStateOf(listOf(NavEntry("${appModel.screens[0].id}", ""))) }
    val current = backStack.lastOrNull() ?: NavEntry("${appModel.screens[0].id}", "")
    
    val context = androidx.compose.ui.platform.LocalContext.current
    val exitApp = { (context as? android.app.Activity)?.finish() }
    
    val navigateTo: (String, Any) -> Unit = { screen, arg -> backStack = backStack + NavEntry(screen, arg) }
    val closeScreen: () -> Unit = { 
        if (backStack.size > 1) backStack = backStack.dropLast(1)
        else { exitApp(); Unit }
    }

    when (current.route) {
${navigatorCases}
    }
}
`;

    return `package ${meta.packageName}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ${meta.packageName}.ui.theme.${meta.appName}Theme

// Globale States
${stateDeclarations}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ${meta.appName}Theme {
                AppNavigation()
            }
        }
    }
}

// App Navigation & Screens
${navCode}
${screensCode}

// Logik & Events
${functionsCode}

// Hilfsfunktion für Listen-Mathematik (MathList)
fun mathListOp(listStr: String, op: String): Float {
    val arr = listStr.split(",").mapNotNull { it.trim().toFloatOrNull() }
    if(arr.isEmpty()) return 0f
    return when(op) {
        "min" -> arr.minOrNull() ?: 0f
        "max" -> arr.maxOrNull() ?: 0f
        "avg" -> arr.average().toFloat()
        else -> 0f
    }
}
`;
}

window.syncKotlinCodeToVFS = function() {
    if(!vfs) return;
    const mainActivityPath = Object.keys(vfs).find(k => k.endsWith('MainActivity.kt'));
    if (mainActivityPath) {
        vfs[mainActivityPath] = generateKotlinCode();
        if (activeFile === mainActivityPath && currentEditorMode === 'code') {
            document.getElementById('codeEditor').value = vfs[mainActivityPath];
        }
    }
};

// ==========================================
// PANNING & ZOOMING SCRIPT (CANVAS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const blockEditor = document.getElementById('blockEditor');
    const content = document.getElementById('canvasContent');
    
    let isPanning = false;
    let startX = 0, startY = 0;

    function applyCanvasTransform() {
        content.style.transform = `translate(${window.canvasState.x}px, ${window.canvasState.y}px) scale(${window.canvasState.scale})`;
    }

    blockEditor.addEventListener('mousedown', (e) => {
        if(e.target === blockEditor || e.target === content) {
            isPanning = true;
            startX = e.clientX - window.canvasState.x;
            startY = e.clientY - window.canvasState.y;
            blockEditor.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        window.canvasState.x = e.clientX - startX;
        window.canvasState.y = e.clientY - startY;
        applyCanvasTransform();
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        blockEditor.style.cursor = 'grab';
    });
    
    window.addEventListener('mouseleave', () => {
        isPanning = false;
        blockEditor.style.cursor = 'grab';
    });

    blockEditor.addEventListener('wheel', (e) => {
        if(!e.ctrlKey) return; 
        e.preventDefault();
        
        const zoomIntensity = 0.1;
        const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        
        const rect = blockEditor.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newScale = Math.min(Math.max(0.3, window.canvasState.scale + delta), 2);
        
        window.canvasState.x = mouseX - (mouseX - window.canvasState.x) * (newScale / window.canvasState.scale);
        window.canvasState.y = mouseY - (mouseY - window.canvasState.y) * (newScale / window.canvasState.scale);
        window.canvasState.scale = newScale;

        applyCanvasTransform();
    }, { passive: false });
});

// Init Canvas Drop (für Free-Floating Blocks)
document.addEventListener('DOMContentLoaded', () => {
    const blockEditor = document.getElementById('blockEditor');
    const phoneScreen = document.getElementById('phoneScreen');

    blockEditor.addEventListener('dragover', e => {
        if (document.body.classList.contains('dragging-stmt') && !document.body.classList.contains('dragging-ui-element')) {
            e.preventDefault(); 
        }
    });
    
    phoneScreen.addEventListener('dragover', e => {
        if(document.body.classList.contains('dragging-ui-element')) {
            e.preventDefault();
            phoneScreen.classList.add('drag-over');
        }
    });
    phoneScreen.addEventListener('dragleave', e => phoneScreen.classList.remove('drag-over'));
    
    phoneScreen.addEventListener('drop', async e => {
        e.preventDefault();
        phoneScreen.classList.remove('drag-over');
        
        try {
            let data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (!['TextLabel', 'Button', 'TextField', 'Column', 'Row', 'Scaffold'].includes(data.type)) return;
            
            let newId = data.type.toLowerCase() + '_' + Date.now();
            let newNode = { type: data.type, id: newId, props: {} };
            
            if(data.type === 'TextLabel') newNode.props = { text: "Neuer Text" };
            if(data.type === 'TextField') newNode.props = { text: "", label: "Eingabe" };
            if(data.type === 'Button') newNode.props = { label: "Button" };
            if(['Column', 'Row', 'Scaffold'].includes(data.type)) newNode.children = [];
            
            getActiveScreen().uiTree.children.push(newNode);
            
            if(data.type === 'Button') {
                const dropX = (-window.canvasState.x + 50) / window.canvasState.scale;
                const dropY = (-window.canvasState.y + 50 + getActiveScreen().floatingBlocks.length * 80) / window.canvasState.scale;
                getActiveScreen().floatingBlocks.push({
                    x: dropX, y: dropY,
                    node: { type: 'UIEvent', id: genId('evt'), props: { sourceId: newId, eventType: 'onClick' }, children: [] }
                });
            }
            updateAllViews();
        } catch(err) { console.error("Drop into Emulator failed", err); }
        clearDragState();
    });

    blockEditor.addEventListener('drop', async e => {
        e.preventDefault();
        try {
            let data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.isExpr || data.source === 'editor-expr' || ['TextLabel', 'Button', 'TextField', 'Column', 'Row', 'Scaffold'].includes(data.type)) { clearDragState(); return; }
            
            const offsetX = data.offsetX || 20;
            const offsetY = data.offsetY || 20;

            const rect = blockEditor.getBoundingClientRect();
            // Koordinaten an Pan & Zoom anpassen
            const x = (e.clientX - rect.left - window.canvasState.x) / window.canvasState.scale - offsetX;
            const y = (e.clientY - rect.top - window.canvasState.y) / window.canvasState.scale - offsetY;

            if (data.source === 'sidebar') {
                const newId = data.type.toLowerCase() + '_' + Date.now();
                let newNode = {
                    type: data.type, id: newId, props: {},
                    children: (['If', 'Loop', 'FunctionDef', 'ForLoop', 'ForEach'].includes(data.type)) ? [] : undefined
                };
                
                if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
                if (data.type === 'Return') { newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' }; }
                if (data.type === 'OpenScreen') {
                    newNode.props = { screenName: appModel.screens[0].id };
                    newNode.arg = { type: 'StringValue', id: genId('exp'), value: '' };
                }

                if (data.type === 'ForLoop') {
                    newNode.start = { type: 'NumberValue', id: genId('exp'), value: '1' };
                    newNode.end = { type: 'NumberValue', id: genId('exp'), value: '10' };
                    newNode.step = { type: 'NumberValue', id: genId('exp'), value: '1' };
                    newNode.props = { varName: await promptNewVariable(false) || 'i' };
                    if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
                }
                if (data.type === 'ForEach') {
                    newNode.list = { type: 'StringValue', id: genId('exp'), value: '1, 2, 3' };
                    newNode.props = { varName: await promptNewVariable(false) || 'element' };
                    if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
                }
                
                if (data.type === 'SetVariable') { 
                    let selectedVar = appModel.variables[0] || '';
                    if (!selectedVar) {
                        selectedVar = await promptNewVariable(false);
                        if (!selectedVar) { clearDragState(); return; }
                        appModel.variables.push(selectedVar);
                    }
                    newNode.props = { varName: selectedVar };
                    newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
                }
                
                if (data.type === 'SetUIProperty') {
                    newNode.props = { targetId: data.targetId, property: data.property };
                    newNode.value = { type: 'StringValue', id: genId('exp'), value: '' };
                }
                if (data.type === 'GetUIProperty') {
                    // Ignoriere Expression-Drop in Statement-Ebene
                }

                if (data.type === 'CallFunction') { 
                    let f = appModel.functions[0];
                    newNode.props = { funcName: f ? f.name : '' }; 
                    newNode.args = {};
                    if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
                }
                
                getActiveScreen().floatingBlocks.push({ x, y, node: newNode });
            } else if (data.source === 'editor') {
                let movedNode = extractNodeFromAnywhere(data.id);
                if (movedNode) {
                    getActiveScreen().floatingBlocks.push({ x, y, node: movedNode });
                }
            }
            updateAllViews();
        } catch(err) { console.error("Canvas Drop Fehler:", err); }
        
        clearDragState();
    });
});