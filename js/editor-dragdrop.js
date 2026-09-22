window.getExprType = function(type) {
    if (['BooleanValue', 'Comparison', 'LogicAnd', 'LogicOr', 'LogicNot'].includes(type)) return 'boolean';
    if (['NumberValue', 'StringValue', 'VarValue', 'CallFunctionExpr', 'MathOp', 'MathRandom', 'MathCompare', 'MathList', 'MathFunc', 'MathTrig', 'GetUIProperty', 'GetScreenArgument'].includes(type)) return 'value';
    return null;
};

window.setDragState = function(isExpr, type, nodeType) {
    if (isExpr) {
        document.body.classList.add('dragging-expr'); document.body.classList.remove('dragging-stmt');
        window.draggedExprType = type;
    } else {
        document.body.classList.add('dragging-stmt'); document.body.classList.remove('dragging-expr');
        window.draggedExprType = null;
    }
    window.draggedNodeType = nodeType || null;
    if (['TextLabel', 'Button', 'TextField', 'Column', 'Row', 'Scaffold'].includes(nodeType)) {
        document.body.classList.add('dragging-ui-element');
    }
};

window.clearDragState = function() {
    document.body.classList.remove('dragging-expr', 'dragging-stmt', 'dragging-ui-element');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.visual-block').forEach(el => el.style.opacity = '');
    document.querySelectorAll('.expr-block').forEach(el => el.style.opacity = '');
    window.draggedExprType = null; window.draggedNodeType = null;
};

document.addEventListener('dragend', window.clearDragState);

window.handleDragStartSidebar = function(e) {
    const type = e.target.getAttribute('data-type');
    const isExpr = e.target.getAttribute('data-is-expr') === 'true';
    const rect = e.target.getBoundingClientRect();
    let payload = { source: 'sidebar', type: type, isExpr: isExpr, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    
    if (type === 'SetUIProperty' || type === 'GetUIProperty') { payload.targetId = e.target.getAttribute('data-target'); payload.property = e.target.getAttribute('data-prop'); }
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    window.setDragState(isExpr, window.getExprType(type), type);
};

window.handleStatementDrop = async function(e, parentId, index) {
    e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over');
    try {
        let data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.isExpr || data.source === 'editor-expr') { window.clearDragState(); return; }
        if (data.type === 'FunctionDef' || data.type === 'UIEvent') { window.clearDragState(); return; } 
        
        let parentNode = findNodeAnywhere(parentId);
        if (!parentNode) { window.clearDragState(); return; }
        
        let targetChildrenArray = parentNode.children; 
        if (parentNode.elseIfs) { let el = parentNode.elseIfs.find(x => x.id === parentId); if (el) targetChildrenArray = el.children; }
        if (parentNode.elseBranch && parentNode.elseBranch.id === parentId) targetChildrenArray = parentNode.elseBranch.children;
        if (!targetChildrenArray) { window.clearDragState(); return; }

        if (data.source === 'sidebar') {
            const newId = data.type.toLowerCase() + '_' + Date.now();
            let newNode = { type: data.type, id: newId, props: {}, children: (['If', 'Loop', 'ForLoop', 'ForEach'].includes(data.type)) ? [] : undefined };
            
            if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
            if (data.type === 'Return') newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            if (data.type === 'OpenScreen') { newNode.props = { screenName: appModel.screens[0].id }; newNode.arg = { type: 'StringValue', id: genId('exp'), value: '' }; }

            if (data.type === 'ForLoop') {
                newNode.start = { type: 'NumberValue', id: genId('exp'), value: '1' }; newNode.end = { type: 'NumberValue', id: genId('exp'), value: '10' }; newNode.step = { type: 'NumberValue', id: genId('exp'), value: '1' };
                newNode.props = { varName: await window.promptNewVariable(false) || 'i' };
                if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
            }
            if (data.type === 'ForEach') {
                newNode.list = { type: 'StringValue', id: genId('exp'), value: '1, 2, 3' }; newNode.props = { varName: await window.promptNewVariable(false) || 'element' };
                if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
            }
            if (data.type === 'SetVariable') { 
                let locals = window.getLocalVarsForNode(parentId); let selectedVar = appModel.variables[0] || locals[0] || '';
                if (!selectedVar) { selectedVar = await window.promptNewVariable(false); if (!selectedVar) { window.clearDragState(); return; } appModel.variables.push(selectedVar); }
                newNode.props = { varName: selectedVar }; newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
            }
            if (data.type === 'SetUIProperty') { newNode.props = { targetId: data.targetId, property: data.property }; newNode.value = { type: 'StringValue', id: genId('exp'), value: '' }; }
            if (data.type === 'CallFunction') { 
                let f = appModel.functions[0]; newNode.props = { funcName: f ? f.name : '' }; newNode.args = {};
                if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
            }
            targetChildrenArray.splice(index, 0, newNode);
        } else if (data.source === 'editor' && data.id !== parentId) {
            let movedNode = findNodeAnywhere(data.id);
            if (movedNode && (movedNode.type === 'FunctionDef' || movedNode.type === 'UIEvent')) { window.clearDragState(); return; }
            movedNode = extractNodeFromAnywhere(data.id);
            if (movedNode) targetChildrenArray.splice(index, 0, movedNode);
        }
        window.updateAllViews(); 
    } catch(err) { console.error("Drop Fehler Statement:", err); }
    window.clearDragState();
};

window.handleExpressionDrop = async function(e, parentNode, propName, expectedType) {
    e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over');
    let data; try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch(err) { window.clearDragState(); return; }
    if (!data.isExpr && data.source !== 'editor-expr') { window.clearDragState(); return; }
    
    let incomingType = window.getExprType(data.type || (data.node && data.node.type));
    if (incomingType !== expectedType) { window.clearDragState(); return; }
    
    let exprNode;
    if (data.source === 'sidebar') {
        if (data.type === 'BooleanValue') exprNode = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
        else if (data.type === 'LogicNot') exprNode = { type: 'LogicNot', id: genId('exp'), value: { type: 'BooleanValue', id: genId('exp'), value: 'false' } };
        else if (data.type === 'NumberValue') exprNode = { type: 'NumberValue', id: genId('exp'), value: '0' };
        else if (data.type === 'StringValue') exprNode = { type: 'StringValue', id: genId('exp'), value: 'Text' };
        else if (data.type === 'Comparison') exprNode = { type: 'Comparison', id: genId('exp'), operator: '>', left: { type: 'NumberValue', id: genId('exp'), value: '0' }, right: { type: 'NumberValue', id: genId('exp'), value: '0' } };
        else if (data.type === 'LogicAnd' || data.type === 'LogicOr') exprNode = { type: data.type, id: genId('exp'), left: { type: 'BooleanValue', id: genId('exp'), value: 'true' }, right: { type: 'BooleanValue', id: genId('exp'), value: 'false' } };
        else if (data.type === 'CallFunctionExpr') {
            let f = appModel.functions[0]; exprNode = { type: 'CallFunctionExpr', id: genId('exp'), props: { funcName: f ? f.name : '' }, args: {} };
            if (f && f.params) f.params.forEach(p => exprNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
        }
        else if (data.type === 'VarValue') {
            let locals = window.getLocalVarsForNode(parentNode.id); let selectedVar = appModel.variables[0] || locals[0] || '';
            if (!selectedVar) { selectedVar = await window.promptNewVariable(false); if (!selectedVar) { window.clearDragState(); return; } appModel.variables.push(selectedVar); }
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
    
    if (exprNode) { parentNode[propName] = exprNode; window.updateAllViews(); }
    window.clearDragState();
};

document.addEventListener('DOMContentLoaded', () => {
    const blockEditor = document.getElementById('blockEditor');
    const content = document.getElementById('canvasContent');
    let isPanning = false; let startX = 0, startY = 0;

    function applyCanvasTransform() { content.style.transform = `translate(${window.canvasState.x}px, ${window.canvasState.y}px) scale(${window.canvasState.scale})`; }

    blockEditor.addEventListener('mousedown', (e) => {
        if(e.target === blockEditor || e.target === content) {
            isPanning = true; startX = e.clientX - window.canvasState.x; startY = e.clientY - window.canvasState.y; blockEditor.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => { if (!isPanning) return; window.canvasState.x = e.clientX - startX; window.canvasState.y = e.clientY - startY; applyCanvasTransform(); });
    window.addEventListener('mouseup', () => { isPanning = false; blockEditor.style.cursor = 'grab'; });
    window.addEventListener('mouseleave', () => { isPanning = false; blockEditor.style.cursor = 'grab'; });

    blockEditor.addEventListener('wheel', (e) => {
        if(!e.ctrlKey) return; 
        e.preventDefault();
        const zoomIntensity = 0.1; const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        const rect = blockEditor.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
        const newScale = Math.min(Math.max(0.3, window.canvasState.scale + delta), 2);
        window.canvasState.x = mouseX - (mouseX - window.canvasState.x) * (newScale / window.canvasState.scale);
        window.canvasState.y = mouseY - (mouseY - window.canvasState.y) * (newScale / window.canvasState.scale);
        window.canvasState.scale = newScale;
        applyCanvasTransform();
    }, { passive: false });

    const phoneScreen = document.getElementById('phoneScreen');
    
    // Dieser Listener ermöglicht das Ablegen überall auf dem Canvas
    blockEditor.addEventListener('dragover', e => { 
        if (document.body.classList.contains('dragging-stmt') && !document.body.classList.contains('dragging-ui-element')) { 
            e.preventDefault(); 
        } 
    });
    
    phoneScreen.addEventListener('dragover', e => { if(document.body.classList.contains('dragging-ui-element')) { e.preventDefault(); phoneScreen.classList.add('drag-over'); } });
    phoneScreen.addEventListener('dragleave', e => phoneScreen.classList.remove('drag-over'));
    
    phoneScreen.addEventListener('drop', async e => {
        e.preventDefault(); phoneScreen.classList.remove('drag-over');
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
                getActiveScreen().floatingBlocks.push({ x: dropX, y: dropY, node: { type: 'UIEvent', id: genId('evt'), props: { sourceId: newId, eventType: 'onClick' }, children: [] } });
            }
            window.updateAllViews();
        } catch(err) { console.error("Drop into Emulator failed", err); }
        window.clearDragState();
    });

    // Hier werden die Blöcke im leeren Feld fallen gelassen (Erstellt freischwebende Blöcke)
    blockEditor.addEventListener('drop', async e => {
        e.preventDefault();
        try {
            let data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.isExpr || data.source === 'editor-expr' || ['TextLabel', 'Button', 'TextField', 'Column', 'Row', 'Scaffold'].includes(data.type)) { window.clearDragState(); return; }
            
            const offsetX = data.offsetX || 20; const offsetY = data.offsetY || 20;
            const rect = blockEditor.getBoundingClientRect();
            const x = (e.clientX - rect.left - window.canvasState.x) / window.canvasState.scale - offsetX;
            const y = (e.clientY - rect.top - window.canvasState.y) / window.canvasState.scale - offsetY;

            if (data.source === 'sidebar') {
                const newId = data.type.toLowerCase() + '_' + Date.now();
                let newNode = { type: data.type, id: newId, props: {}, children: (['If', 'Loop', 'FunctionDef', 'ForLoop', 'ForEach'].includes(data.type)) ? [] : undefined };
                
                if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
                if (data.type === 'Return') { newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' }; }
                if (data.type === 'OpenScreen') { newNode.props = { screenName: appModel.screens[0].id }; newNode.arg = { type: 'StringValue', id: genId('exp'), value: '' }; }

                if (data.type === 'ForLoop') {
                    newNode.start = { type: 'NumberValue', id: genId('exp'), value: '1' }; newNode.end = { type: 'NumberValue', id: genId('exp'), value: '10' }; newNode.step = { type: 'NumberValue', id: genId('exp'), value: '1' };
                    newNode.props = { varName: await window.promptNewVariable(false) || 'i' };
                    if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
                }
                if (data.type === 'ForEach') {
                    newNode.list = { type: 'StringValue', id: genId('exp'), value: '1, 2, 3' }; newNode.props = { varName: await window.promptNewVariable(false) || 'element' };
                    if (!appModel.variables.includes(newNode.props.varName)) appModel.variables.push(newNode.props.varName);
                }
                if (data.type === 'SetVariable') { 
                    let selectedVar = appModel.variables[0] || '';
                    if (!selectedVar) { selectedVar = await window.promptNewVariable(false); if (!selectedVar) { window.clearDragState(); return; } appModel.variables.push(selectedVar); }
                    newNode.props = { varName: selectedVar }; newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' };
                }
                if (data.type === 'SetUIProperty') { newNode.props = { targetId: data.targetId, property: data.property }; newNode.value = { type: 'StringValue', id: genId('exp'), value: '' }; }
                if (data.type === 'CallFunction') { 
                    let f = appModel.functions[0]; newNode.props = { funcName: f ? f.name : '' }; newNode.args = {};
                    if (f && f.params) f.params.forEach(p => newNode.args[p] = { type: 'NumberValue', id: genId('exp'), value: '0' });
                }
                getActiveScreen().floatingBlocks.push({ x, y, node: newNode });
            } else if (data.source === 'editor') {
                // Hier wird das Verschieben von bestehenden Blöcken im leeren Feld geregelt
                let movedNode = extractNodeFromAnywhere(data.id);
                if (movedNode) getActiveScreen().floatingBlocks.push({ x, y, node: movedNode });
            }
            window.updateAllViews();
        } catch(err) { console.error("Canvas Drop Fehler:", err); }
        window.clearDragState();
    });
});
