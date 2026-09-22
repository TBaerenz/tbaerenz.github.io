window.createVariableDropdown = function(selectedValue, onChangeCallback, localVars = []) {
    const sel = makeControl('select');
    sel.innerHTML = `<option value="__NEW__" style="font-weight:bold; color:var(--accent-color);">+ Neu...</option>`;
    
    let isMissing = selectedValue && !appModel.variables.includes(selectedValue) && !localVars.includes(selectedValue);
    if (isMissing) sel.innerHTML += `<option value="${selectedValue}" class="invalid-ref" selected>${selectedValue} (Fehlt)</option>`;
    else if (!selectedValue) sel.innerHTML += `<option value="" disabled selected>Wähle...</option>`;

    if (appModel.variables.length > 0) {
        let optgroup = document.createElement('optgroup'); optgroup.label = "Globale Variablen";
        appModel.variables.forEach(v => { let opt = document.createElement('option'); opt.value = v; opt.textContent = v; if (v === selectedValue) opt.selected = true; optgroup.appendChild(opt); });
        sel.appendChild(optgroup);
    }
    if (localVars.length > 0) {
        let optgroup = document.createElement('optgroup'); optgroup.label = "Lokale Variablen / Params / Loop";
        localVars.forEach(v => { let opt = document.createElement('option'); opt.value = v; opt.textContent = v; if (v === selectedValue) opt.selected = true; optgroup.appendChild(opt); });
        sel.appendChild(optgroup);
    }
    sel.onchange = async (e) => {
        if (e.target.value === '__NEW__') {
            e.target.value = selectedValue || ''; 
            let newVar = await window.promptNewVariable(localVars.length > 0);
            if (newVar) {
                if (localVars.length === 0) appModel.variables.push(newVar);
                onChangeCallback(newVar, true);
            }
        } else { onChangeCallback(e.target.value, false); }
    };
    return sel;
};

window.createFunctionDropdown = function(selectedValue, onChangeCallback) {
    const sel = makeControl('select');
    let isMissing = selectedValue && !appModel.functions.some(f => f.name === selectedValue);
    if (isMissing) sel.innerHTML += `<option value="${selectedValue}" class="invalid-ref" selected>${selectedValue} (Fehlt)</option>`;
    else if (!selectedValue) sel.innerHTML += `<option value="" disabled selected>Wähle...</option>`;

    if (appModel.functions.length > 0) {
        appModel.functions.forEach(f => { sel.innerHTML += `<option value="${f.name}" ${f.name === selectedValue ? 'selected' : ''}>${f.name}</option>`; });
    } else if (!isMissing) { sel.disabled = true; sel.innerHTML = `<option value="" disabled selected>Keine Funktionen</option>`; }
    sel.onchange = (e) => onChangeCallback(e.target.value);
    return sel;
};

window.createDropZone = function(parentId, index) {
    let dz = document.createElement('div');
    dz.className = 'drop-zone'; dz.setAttribute('data-parent-id', parentId); dz.setAttribute('data-index', index);
    dz.addEventListener('dragover', e => { 
        if (document.body.classList.contains('dragging-stmt') && window.draggedNodeType !== 'FunctionDef' && window.draggedNodeType !== 'UIEvent' && !document.body.classList.contains('dragging-ui-element')) {
            e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); 
        }
    });
    dz.addEventListener('dragleave', e => { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', e => window.handleStatementDrop(e, parentId, index));
    return dz;
};

window.createExpressionSlot = function(parentNode, propName, slotType, localVars = []) {
    const condSlot = document.createElement('div');
    condSlot.className = slotType === 'boolean' ? 'pill-slot' : 'val-slot';
    let currentValue = parentNode[propName];
    
    if (currentValue) {
        condSlot.classList.add('has-value'); 
        condSlot.appendChild(window.createExpressionBlock(currentValue, parentNode, propName, localVars));
    } else {
        condSlot.innerHTML = dictionary['drop_expr'][currentLang] || '...ablegen';
    }
    condSlot.addEventListener('dragover', e => { if (window.draggedExprType === slotType) { e.preventDefault(); e.stopPropagation(); condSlot.classList.add('drag-over'); } });
    condSlot.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); condSlot.classList.remove('drag-over'); });
    condSlot.addEventListener('drop', e => window.handleExpressionDrop(e, parentNode, propName, slotType));
    return condSlot;
};

window.createExpressionBlock = function(exprNode, parentNode, propertyName, localVars = []) {
    const el = document.createElement('div');
    el.className = 'expr-block';
    
    let expType = window.getExprType(exprNode.type);
    el.style.borderRadius = expType === 'boolean' ? '20px' : '6px';
    if (!exprNode.id) exprNode.id = genId('exp'); el.id = 'expr_' + exprNode.id;
    
    el.draggable = true; el.dataset.type = exprNode.type;
    el.addEventListener('dragstart', e => {
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor-expr', node: exprNode, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }));
        window.setDragState(true, window.getExprType(exprNode.type), exprNode.type);
        setTimeout(() => { el.style.opacity = '0.3'; }, 0);
    });

    if (exprNode.type === 'BooleanValue') {
        el.classList.add('pill');
        const sel = makeControl('select');
        sel.innerHTML = `<option value="true" ${exprNode.value==='true'?'selected':''}>True</option><option value="false" ${exprNode.value==='false'?'selected':''}>False</option>`;
        sel.onchange = e => { exprNode.value = e.target.value; window.updateAllViews(); }; el.appendChild(sel);
    } else if (exprNode.type === 'LogicNot') {
        el.classList.add('pill');
        el.appendChild(document.createTextNode('NOT ')); el.appendChild(window.createExpressionSlot(exprNode, 'value', 'boolean', localVars));
    } else if (exprNode.type === 'NumberValue') {
        el.classList.add('val-expr');
        const inp = makeControl('input'); inp.type = 'text'; inp.value = exprNode.value; inp.style.width = '60px';
        inp.oninput = e => { exprNode.value = e.target.value; if(window.syncKotlinCodeToVFS) window.syncKotlinCodeToVFS(); }; el.appendChild(inp);
    } else if (exprNode.type === 'StringValue') {
        el.classList.add('val-expr');
        el.appendChild(document.createTextNode('"'));
        const inp = makeControl('input'); inp.type = 'text'; inp.value = exprNode.value; inp.style.width = '80px';
        inp.oninput = e => { exprNode.value = e.target.value; if(window.syncKotlinCodeToVFS) window.syncKotlinCodeToVFS(); };
        el.appendChild(inp); el.appendChild(document.createTextNode('"'));
    } else if (exprNode.type === 'VarValue') {
        el.classList.add('val-expr');
        if (exprNode.props.varName && !appModel.variables.includes(exprNode.props.varName) && !localVars.includes(exprNode.props.varName)) el.classList.add('invalid-ref'); 
        el.setAttribute('data-var-name', exprNode.props.varName); 
        el.appendChild(window.createVariableDropdown(exprNode.props.varName, (val, isNew) => { 
            exprNode.props.varName = val;
            if (isNew && localVars.length > 0) {
                let funcId = window.getFunctionIdByInnerNode(exprNode.id);
                if (funcId) { let fDef = getActiveScreen().floatingBlocks.find(b => b.node.id === funcId); if (fDef) { let fModel = appModel.functions.find(f => f.name === fDef.node.props.funcName); if (fModel) { if (!fModel.localVars) fModel.localVars = []; fModel.localVars.push(val); } } }
            }
            window.updateAllViews(); 
        }, localVars));
    } else if (exprNode.type === 'CallFunctionExpr') {
        el.classList.add('val-expr');
        if (exprNode.props.funcName && !appModel.functions.some(f => f.name === exprNode.props.funcName)) el.classList.add('invalid-ref'); 
        el.appendChild(document.createTextNode('Call '));
        el.appendChild(window.createFunctionDropdown(exprNode.props.funcName, e => { 
            exprNode.props.funcName = e; let f = appModel.functions.find(x => x.name === e); exprNode.args = {};
            if(f && f.params) f.params.forEach(p => exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            window.updateAllViews();
        }));
        let fModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (fModel && fModel.params && fModel.params.length > 0) {
            if (!exprNode.args) exprNode.args = {};
            fModel.params.forEach(p => {
                let pRow = document.createElement('div'); pRow.style.margin = "4px 10px"; pRow.style.display = "flex"; pRow.style.alignItems = "center";
                pRow.innerHTML = `<span style="margin-right:6px; font-weight:500;">${p} = </span>`;
                pRow.appendChild(window.createExpressionSlot(exprNode.args, p, 'value', localVars)); el.appendChild(pRow);
            });
        }
    } else if (exprNode.type === 'Comparison') {
        el.classList.add('pill');
        el.appendChild(window.createExpressionSlot(exprNode, 'left', 'value', localVars));
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['==', '!=', '>', '<', '>=', '<='].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(window.createExpressionSlot(exprNode, 'right', 'value', localVars));
    } else if (exprNode.type === 'LogicAnd' || exprNode.type === 'LogicOr') {
        el.classList.add('pill');
        el.appendChild(window.createExpressionSlot(exprNode, 'left', 'boolean', localVars));
        const opSpan = document.createElement('span'); opSpan.style.margin = '0 8px'; opSpan.style.fontWeight = 'bold'; opSpan.innerText = exprNode.type === 'LogicAnd' ? 'AND' : 'OR';
        el.appendChild(opSpan); el.appendChild(window.createExpressionSlot(exprNode, 'right', 'boolean', localVars));
    } 
    else if (exprNode.type === 'MathOp') {
        el.classList.add('math-block');
        el.appendChild(window.createExpressionSlot(exprNode, 'left', 'value', localVars));
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['+', '-', '*', '/', '%', '^'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(window.createExpressionSlot(exprNode, 'right', 'value', localVars));
    }
    else if (exprNode.type === 'MathRandom') {
        el.classList.add('math-block');
        el.appendChild(document.createTextNode('Random '));
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['int', 'float'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.randType===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.randType = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(document.createTextNode(' zw. ')); el.appendChild(window.createExpressionSlot(exprNode, 'min', 'value', localVars));
        el.appendChild(document.createTextNode(' u. ')); el.appendChild(window.createExpressionSlot(exprNode, 'max', 'value', localVars));
    }
    else if (exprNode.type === 'MathCompare') {
        el.classList.add('math-block');
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['min', 'max', 'avg'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von ')); el.appendChild(window.createExpressionSlot(exprNode, 'left', 'value', localVars));
        el.appendChild(document.createTextNode(' u. ')); el.appendChild(window.createExpressionSlot(exprNode, 'right', 'value', localVars));
    }
    else if (exprNode.type === 'MathList') {
        el.classList.add('math-block');
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['min', 'max', 'avg'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von Liste ')); el.appendChild(window.createExpressionSlot(exprNode, 'list', 'value', localVars));
    }
    else if (exprNode.type === 'MathFunc') {
        el.classList.add('math-block');
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['sqrt', 'log10', 'ln', 'abs', 'round'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von ')); el.appendChild(window.createExpressionSlot(exprNode, 'value', 'value', localVars));
    }
    else if (exprNode.type === 'MathTrig') {
        el.classList.add('math-block');
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        ['sin', 'cos', 'tan'].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; window.updateAllViews(); }; el.appendChild(selOp);
        el.appendChild(document.createTextNode(' von ')); el.appendChild(window.createExpressionSlot(exprNode, 'value', 'value', localVars));
    }
    else if (exprNode.type === 'GetUIProperty') {
        el.classList.add('ui-logic-block');
        el.setAttribute('data-var-name', exprNode.props.targetId); 
        el.appendChild(document.createTextNode(`${exprNode.props.targetId} `));
        const selOp = makeControl('select'); selOp.style.margin = '0 5px';
        let prop = exprNode.props.property; selOp.innerHTML += `<option value="${prop}" selected>${prop}</option>`; selOp.disabled = true; 
        el.appendChild(selOp);
    }
    else if (exprNode.type === 'GetScreenArgument') {
        el.classList.add('ui-logic-block');
        el.appendChild(document.createTextNode('Screen Argument'));
    }

    const delBtn = document.createElement('span'); delBtn.innerHTML = '✕';
    delBtn.style.cssText = 'cursor:pointer; margin-left:8px; color:#ef4444; font-size:14px; font-weight:bold; padding: 2px 5px; border-radius: 4px; display:flex; align-items:center; justify-content:center; transition: 0.2s;';
    delBtn.title = 'Entfernen';
    delBtn.onmouseenter = () => delBtn.style.background = 'rgba(239, 68, 68, 0.1)';
    delBtn.onmouseleave = () => delBtn.style.background = 'transparent';
    delBtn.onclick = (e) => { e.stopPropagation(); parentNode[propertyName] = null; window.updateAllViews(); };
    el.appendChild(delBtn);

    return el;
};

// ----------------------------------------------------
// HIER IST DIE FEHLENDE FUNKTION
// ----------------------------------------------------
window.renderBlockEditor = function() {
    if(window.renderVariableList) window.renderVariableList();
    if(window.renderFunctionList) window.renderFunctionList();
    if(window.renderScreenSwitcher) window.renderScreenSwitcher();
    if(window.renderUIElementsPanel) window.renderUIElementsPanel();
    
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

        const blockEl = window.createVisualBlock(fb.node, locals);
        fbWrapper.appendChild(blockEl);
        content.appendChild(fbWrapper);
    });
};
// ----------------------------------------------------

window.createVisualBlock = function(node, localVars = []) {
    const block = document.createElement('div');
    block.className = 'visual-block'; block.id = 'block_' + node.id;
    const header = document.createElement('div'); header.className = 'visual-block-header';
    
    let icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="12" y2="17"></line></svg>`;
    if (['If', 'Loop', 'ForLoop', 'ForEach'].includes(node.type)) icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    else if (node.type === 'FunctionDef') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    else if (['OpenScreen', 'CloseScreen', 'ExitApp'].includes(node.type)) icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
    else if (['UIEvent', 'SetUIProperty'].includes(node.type)) { icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`; block.classList.add('ui-logic-block'); }

    header.innerHTML = `<span>${icon}</span> <span>${node.type}</span>`;
    
    if (node.type === 'SetVariable') {
        if (node.props.varName && !appModel.variables.includes(node.props.varName) && !localVars.includes(node.props.varName)) block.classList.add('invalid-ref'); 
        block.setAttribute('data-var-name', node.props.varName); 
        header.innerHTML = `<span>${icon}</span> <span>Variable</span>`;
        header.appendChild(window.createVariableDropdown(node.props.varName, (val, isNew) => { 
            node.props.varName = val;
            if (isNew && localVars.length > 0) { let funcId = window.getFunctionIdByInnerNode(node.id); if (funcId) { let fDef = getActiveScreen().floatingBlocks.find(b => b.node.id === funcId); if (fDef) { let fModel = appModel.functions.find(f => f.name === fDef.node.props.funcName); if (fModel) { if (!fModel.localVars) fModel.localVars = []; fModel.localVars.push(val); } } } }
            window.updateAllViews(); 
        }, localVars));
        let equals = document.createElement('span'); equals.innerHTML = '='; equals.style.cssText = 'color:inherit; font-weight:bold; margin: 0 5px;';
        header.appendChild(equals); header.appendChild(window.createExpressionSlot(node, 'value', 'value', localVars));
    }
    else if (node.type === 'SetUIProperty') {
        block.setAttribute('data-var-name', node.props.targetId); 
        header.innerHTML = `<span>${icon}</span> <span>Setze <b>${node.props.targetId}</b></span>`;
        const selOp = makeControl('select'); selOp.style.margin = '0 5px'; let prop = node.props.property; selOp.innerHTML += `<option value="${prop}" selected>${prop}</option>`; selOp.disabled = true; 
        header.appendChild(selOp);
        let equals = document.createElement('span'); equals.innerHTML = 'auf'; equals.style.cssText = 'color:inherit; font-weight:bold; margin: 0 5px;';
        header.appendChild(equals); header.appendChild(window.createExpressionSlot(node, 'value', 'value', localVars));
    }
    else if (node.type === 'UIEvent') {
        block.setAttribute('data-var-name', node.props.sourceId); 
        header.innerHTML = `<span>${icon}</span> <span>Wenn <b>${node.props.sourceId}</b> geklickt wird:</span>`;
    }
    else if (node.type === 'If') {
        header.appendChild(window.createExpressionSlot(node, 'condition', 'boolean', localVars));
        let btnContainer = document.createElement('div'); btnContainer.style.marginLeft = "auto"; btnContainer.style.display = "flex"; btnContainer.style.gap = "5px";
        let btnElseIf = document.createElement('button'); btnElseIf.innerText = "+ Else If"; btnElseIf.className = 'btn-add-local-var';
        btnElseIf.onclick = (e) => { e.stopPropagation(); if(!node.elseIfs) node.elseIfs = []; node.elseIfs.push({ id: genId('elif'), condition: {type: 'BooleanValue', id: genId('exp'), value: 'true'}, children: [] }); window.updateAllViews(); };
        btnContainer.appendChild(btnElseIf);
        let btnElse = document.createElement('button'); btnElse.innerText = "+ Else"; btnElse.className = 'btn-add-local-var';
        if (node.elseBranch) btnElse.style.display = 'none'; 
        btnElse.onclick = (e) => { e.stopPropagation(); node.elseBranch = { id: genId('else'), children: [] }; window.updateAllViews(); };
        btnContainer.appendChild(btnElse); header.appendChild(btnContainer);
    }
    else if (node.type === 'Loop') {
        header.appendChild(window.createExpressionSlot(node, 'condition', 'boolean', localVars));
    }
    else if (node.type === 'ForLoop') {
        header.innerHTML = `<span>${icon}</span> <span>For</span>`;
        header.appendChild(window.createVariableDropdown(node.props.varName, (val) => { node.props.varName = val; window.updateAllViews(); }, localVars));
        header.appendChild(document.createTextNode(' = ')); header.appendChild(window.createExpressionSlot(node, 'start', 'value', localVars));
        header.appendChild(document.createTextNode(' bis ')); header.appendChild(window.createExpressionSlot(node, 'end', 'value', localVars));
        header.appendChild(document.createTextNode(' step ')); header.appendChild(window.createExpressionSlot(node, 'step', 'value', localVars));
        if (node.props.varName && !localVars.includes(node.props.varName)) localVars.push(node.props.varName);
    }
    else if (node.type === 'ForEach') {
        header.innerHTML = `<span>${icon}</span> <span>ForEach</span>`;
        header.appendChild(window.createVariableDropdown(node.props.varName, (val) => { node.props.varName = val; window.updateAllViews(); }, localVars));
        header.appendChild(document.createTextNode(' in ')); header.appendChild(window.createExpressionSlot(node, 'list', 'value', localVars));
        if (node.props.varName && !localVars.includes(node.props.varName)) localVars.push(node.props.varName);
    }
    else if (node.type === 'OpenScreen') {
        header.innerHTML = `<span>${icon}</span> <span>Open Screen:</span>`;
        const sel = makeControl('select');
        appModel.screens.forEach(s => { let opt = document.createElement('option'); opt.value = s.id; opt.text = s.id; if (s.id === node.props.screenName) opt.selected = true; sel.appendChild(opt); });
        sel.onchange = e => { node.props.screenName = e.target.value; window.updateAllViews(); }; header.appendChild(sel);
        header.appendChild(document.createTextNode(' mit Argument: ')); header.appendChild(window.createExpressionSlot(node, 'arg', 'value', localVars));
    }
    else if (node.type === 'FunctionDef') {
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        let pStr = (fModel && fModel.params && fModel.params.length > 0) ? ` (${fModel.params.join(', ')})` : ` ()`;
        header.innerHTML = `<span>${icon}</span> <span>Funktion: <b>${node.props.funcName}${pStr}</b></span>`;
        if (fModel) {
            let locContainer = document.createElement('div'); locContainer.className = 'local-vars-container';
            let title = document.createElement('div'); title.className = 'local-vars-title'; title.innerText = 'Lokale Vars & Params:';
            let btnAdd = document.createElement('button'); btnAdd.className = 'btn-add-local-var'; btnAdd.innerText = '+ Neu';
            btnAdd.onclick = async (ev) => { ev.stopPropagation(); let vName = await window.promptNewVariable(true); if (vName) { if (!fModel.localVars) fModel.localVars = []; fModel.localVars.push(vName); window.updateAllViews(); } };
            title.appendChild(btnAdd); locContainer.appendChild(title);
            let listEl = document.createElement('div'); let allLocals = [...(fModel.params || []), ...(fModel.localVars || [])];
            if (allLocals.length === 0) listEl.innerHTML = '<i>Keine</i>';
            else {
                allLocals.forEach((v, idx) => {
                    let span = document.createElement('span'); span.className = 'sidebar-list-item'; span.style.color = 'inherit'; span.style.fontWeight = 'bold'; span.innerText = v;
                    span.onmouseenter = (e) => { e.stopPropagation(); window.highlightVar(v); }
                    span.onmouseleave = (e) => { e.stopPropagation(); window.unhighlightVar(); }
                    span.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); window.hideAllMenus(); currentListTarget = { type: 'local_var', name: v, funcName: fModel.name }; const menu = document.getElementById('sidebarListMenu'); menu.style.left = ev.pageX + 'px'; menu.style.top = ev.pageY + 'px'; menu.classList.add('active'); };
                    listEl.appendChild(span); if (idx < allLocals.length - 1) listEl.appendChild(document.createTextNode(', '));
                });
            }
            locContainer.appendChild(listEl); header.appendChild(locContainer);
        }
    }
    else if (node.type === 'CallFunction') {
        if (node.props.funcName && !appModel.functions.some(f => f.name === node.props.funcName)) block.classList.add('invalid-ref');
        header.innerHTML = `<span>${icon}</span> <span>Aufruf:</span>`;
        header.appendChild(window.createFunctionDropdown(node.props.funcName, e => { 
            node.props.funcName = e; let f = appModel.functions.find(x => x.name === e); node.args = {};
            if(f && f.params) f.params.forEach(p => node.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' }); window.updateAllViews();
        }));
        let fModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (fModel && fModel.params && fModel.params.length > 0) {
            if (!node.args) node.args = {};
            fModel.params.forEach(p => {
                let pRow = document.createElement('div'); pRow.style.margin = "4px 10px"; pRow.style.display = "flex"; pRow.style.alignItems = "center";
                pRow.innerHTML = `<span style="margin-right:6px; font-weight:500;">${p} = </span>`;
                pRow.appendChild(window.createExpressionSlot(node.args, p, 'value', localVars)); header.appendChild(pRow);
            });
        }
    }
    else if (node.type === 'Return') {
        header.innerHTML = `<span>${icon}</span> <span>Return</span>`;
        header.appendChild(window.createExpressionSlot(node, 'value', 'value', localVars));
    }
    
    block.draggable = true;
    block.addEventListener('dragstart', e => { 
        e.stopPropagation(); const rect = block.getBoundingClientRect();
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor', id: node.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top })); 
        window.setDragState(false, null, node.type);
        let wasDisconnected = block.classList.contains('disconnected');
        if(wasDisconnected) block.classList.remove('disconnected');
        setTimeout(() => { if(wasDisconnected) block.classList.add('disconnected'); block.style.opacity = '0.3'; }, 0);
    });
    
    const delBtn = document.createElement('span'); delBtn.innerHTML = '✕';
    delBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:inherit; opacity: 0.7; font-size:14px; font-weight:bold; padding: 0 5px; transition: 0.2s;';
    delBtn.onmouseenter = () => { delBtn.style.opacity = '1'; delBtn.style.color = '#ef4444'; }; delBtn.onmouseleave = () => { delBtn.style.opacity = '0.7'; delBtn.style.color = 'inherit'; };
    delBtn.onclick = async (e) => { 
        e.stopPropagation();
        if (node.type === 'FunctionDef') await window.deleteFunctionDef(node.props.funcName, node.id); 
        else { extractNodeFromAnywhere(node.id); window.updateAllViews(); }
    };
    header.appendChild(delBtn);
    block.appendChild(header);
    
    if (['If', 'Loop', 'FunctionDef', 'ForLoop', 'ForEach', 'UIEvent'].includes(node.type)) {
        const childrenContainer = document.createElement('div'); childrenContainer.className = 'visual-block-children';
        if(['UIEvent'].includes(node.type)) childrenContainer.style.borderColor = "rgba(255,255,255,0.4)";
        let childCount = node.children ? node.children.length : 0;
        for (let i = 0; i <= childCount; i++) {
            childrenContainer.appendChild(window.createDropZone(node.id, i));
            if (i < childCount) childrenContainer.appendChild(window.createVisualBlock(node.children[i], localVars));
        }
        block.appendChild(childrenContainer);

        if (node.type === 'If') {
            if (node.elseIfs) {
                node.elseIfs.forEach((elif, elifIdx) => {
                    let elifHeader = document.createElement('div'); elifHeader.className = 'visual-block-header'; elifHeader.style.marginTop = "10px";
                    elifHeader.innerHTML = `<span style="color:var(--text-main);">Else If</span>`;
                    elifHeader.appendChild(window.createExpressionSlot(elif, 'condition', 'boolean', localVars));
                    let delElifBtn = document.createElement('span'); delElifBtn.innerHTML = '✕'; delElifBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold;';
                    delElifBtn.onclick = (e) => { e.stopPropagation(); node.elseIfs.splice(elifIdx, 1); window.updateAllViews(); };
                    elifHeader.appendChild(delElifBtn); block.appendChild(elifHeader);
                    
                    const elifContainer = document.createElement('div'); elifContainer.className = 'visual-block-children';
                    let cCount = elif.children ? elif.children.length : 0;
                    for (let i = 0; i <= cCount; i++) { elifContainer.appendChild(window.createDropZone(elif.id, i)); if (i < cCount) elifContainer.appendChild(window.createVisualBlock(elif.children[i], localVars)); }
                    block.appendChild(elifContainer);
                });
            }
            if (node.elseBranch) {
                let elseHeader = document.createElement('div'); elseHeader.className = 'visual-block-header'; elseHeader.style.marginTop = "10px";
                elseHeader.innerHTML = `<span style="color:var(--text-main);">Else</span>`;
                let delElseBtn = document.createElement('span'); delElseBtn.innerHTML = '✕'; delElseBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold;';
                delElseBtn.onclick = (e) => { e.stopPropagation(); delete node.elseBranch; window.updateAllViews(); };
                elseHeader.appendChild(delElseBtn); block.appendChild(elseHeader);
                
                const elseContainer = document.createElement('div'); elseContainer.className = 'visual-block-children';
                let cCount = node.elseBranch.children ? node.elseBranch.children.length : 0;
                if (!node.elseBranch.id) node.elseBranch.id = genId('else');
                for (let i = 0; i <= cCount; i++) { elseContainer.appendChild(window.createDropZone(node.elseBranch.id, i)); if (i < cCount) elseContainer.appendChild(window.createVisualBlock(node.elseBranch.children[i], localVars)); }
                block.appendChild(elseContainer);
            }
        }
    }
    return block;
};