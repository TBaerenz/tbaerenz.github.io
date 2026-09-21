// ==========================================
// GLOBALE DRAG STATE TRACKER
// ==========================================
window.draggedExprType = null;
function getExprType(type) {
    if (['BooleanValue', 'Comparison', 'LogicAnd', 'LogicOr'].includes(type)) return 'boolean';
    if (['NumberValue', 'VarValue'].includes(type)) return 'value';
    return null;
}
function genId(prefix) { return prefix + '_' + Date.now() + Math.floor(Math.random() * 1000); }

// Hilfsfunktion: Setzt Drag-Klassen sicher (ohne Bubble-Probleme)
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

// Wenn ein Dragvorgang endet (egal ob gedroppt oder abgebrochen)
document.addEventListener('dragend', () => {
    document.body.classList.remove('dragging-expr', 'dragging-stmt');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    window.draggedExprType = null;
});

// ==========================================
// DRAG AND DROP (Logik)
// ==========================================
function handleDragStartSidebar(e) {
    const type = e.target.getAttribute('data-type');
    const isExpr = e.target.getAttribute('data-is-expr') === 'true';
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'sidebar', type: type, isExpr: isExpr }));
    setDragState(isExpr, getExprType(type));
}

function handleStatementDrop(e, parentId, index) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        let data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.isExpr || data.source === 'editor-expr') return;
        
        let parentNode = findNodeById(appModel.screens[0].layout, parentId);
        if (!parentNode || !parentNode.children) return;

        if (data.source === 'sidebar') {
            const newId = data.type.toLowerCase() + '_' + Date.now();
            let newNode = {
                type: data.type, id: newId, props: {},
                children: (data.type === 'Scaffold' || data.type === 'If' || data.type === 'Loop') ? [] : undefined
            };
            if (data.type === 'Greeting') newNode.props = { name: "Neu" };
            if (data.type === 'SetVariable') { newNode.props = { varName: appModel.variables[0] || '' }; newNode.value = { type: 'NumberValue', id: genId('exp'), value: '0' }; }
            if (data.type === 'If' || data.type === 'Loop') newNode.condition = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
            
            parentNode.children.splice(index, 0, newNode);
        } else if (data.source === 'editor' && data.id !== parentId) {
            let movedNode = removeNodeById(appModel.screens[0].layout, data.id);
            if (movedNode) parentNode.children.splice(index, 0, movedNode);
        }
        updateAllViews(); 
    } catch(err) { console.error("Drop Fehler Statement:", err); }
}

function handleExpressionDrop(e, parentNode, propName, expectedType) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch(err) { return; }
    if (!data.isExpr && data.source !== 'editor-expr') return;
    
    let incomingType = getExprType(data.type || (data.node && data.node.type));
    if (incomingType !== expectedType) return; // Strenge Typ-Prüfung
    
    let exprNode;
    if (data.source === 'sidebar') {
        if (data.type === 'BooleanValue') exprNode = { type: 'BooleanValue', id: genId('exp'), value: 'true' };
        else if (data.type === 'NumberValue') exprNode = { type: 'NumberValue', id: genId('exp'), value: '0' };
        else if (data.type === 'VarValue') exprNode = { type: 'VarValue', id: genId('exp'), props: { varName: appModel.variables[0] || '' } };
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
    } else if (data.source === 'editor-expr') {
        exprNode = data.node;
        removeExpressionById(appModel.screens[0].layout, exprNode.id); // Aus alter Position löschen
    }
    
    if (exprNode) {
        parentNode[propName] = exprNode;
        updateAllViews();
    }
}

// ==========================================
// VARIABLEN ERSTELLEN
// ==========================================
async function createNewVariable() {
    let varName = await openModal({ 
        title: dictionary['btn_new_var'][currentLang], 
        message: dictionary['prompt_new_var'][currentLang], 
        type: 'prompt', 
        validate: (name) => {
            let err = validateName(name); if(err) return err;
            if (appModel.variables.includes(name)) return 'err_var_exists';
            return null;
        } 
    });
    if (varName) {
        appModel.variables.push(varName);
        let msg = (dictionary['prompt_var_success'][currentLang] || 'Variable erstellt: ') + varName;
        logToConsole(msg);
        updateAllViews();
    }
}

function renderVariableList() {
    const listEl = document.getElementById('sidebarVarList');
    if (!listEl) return;
    if (appModel.variables.length === 0) {
        listEl.innerHTML = `<i>${dictionary['sidebar_no_vars'][currentLang]}</i>`;
    } else {
        listEl.innerHTML = `${dictionary['sidebar_vars_list'][currentLang]} <b style="color:var(--accent-color);">${appModel.variables.join(', ')}</b>`;
    }
}

function createVariableDropdown(selectedValue, onChangeCallback) {
    const sel = document.createElement('select');
    sel.className = 'block-control';
    if (appModel.variables.length === 0) {
        sel.innerHTML = `<option value="" disabled selected>Keine</option>`;
        sel.disabled = true;
    } else {
        sel.innerHTML = `<option value="" disabled ${!selectedValue ? 'selected' : ''}>Wähle...</option>`;
        appModel.variables.forEach(v => {
            sel.innerHTML += `<option value="${v}" ${v === selectedValue ? 'selected' : ''}>${v}</option>`;
        });
    }
    sel.onchange = onChangeCallback;
    return sel;
}

// ==========================================
// RENDERING: Block Editor & Drop Zones
// ==========================================
function createDropZone(parentId, index) {
    let dz = document.createElement('div');
    dz.className = 'drop-zone';
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

function createExpressionSlot(parentNode, propName, slotType) {
    const condSlot = document.createElement('div');
    condSlot.className = slotType === 'boolean' ? 'pill-slot' : 'val-slot';
    let currentValue = parentNode[propName];
    
    if (currentValue) {
        condSlot.classList.add('has-value'); 
        condSlot.appendChild(createExpressionBlock(currentValue, parentNode, propName));
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

function createExpressionBlock(exprNode, parentNode, propertyName) {
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
    });

    if (exprNode.type === 'BooleanValue') {
        const sel = document.createElement('select');
        sel.className = 'block-control';
        sel.innerHTML = `<option value="true" ${exprNode.value==='true'?'selected':''}>True</option><option value="false" ${exprNode.value==='false'?'selected':''}>False</option>`;
        sel.onchange = e => { exprNode.value = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); };
        el.appendChild(sel);
    } else if (exprNode.type === 'NumberValue') {
        const inp = document.createElement('input');
        inp.className = 'block-control';
        inp.type = 'number'; inp.value = exprNode.value;
        inp.style.width = '60px';
        inp.oninput = e => { exprNode.value = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); };
        el.appendChild(inp);
    } else if (exprNode.type === 'VarValue') {
        el.appendChild(createVariableDropdown(exprNode.props.varName, e => { exprNode.props.varName = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); }));
    } else if (exprNode.type === 'Comparison') {
        el.appendChild(createExpressionSlot(exprNode, 'left', 'value'));
        const selOp = document.createElement('select');
        selOp.className = 'block-control';
        selOp.style.margin = '0 5px';
        ['==', '!=', '>', '<', '>=', '<='].forEach(op => { selOp.innerHTML += `<option value="${op}" ${exprNode.operator===op?'selected':''}>${op}</option>`; });
        selOp.onchange = e => { exprNode.operator = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); };
        el.appendChild(selOp);
        el.appendChild(createExpressionSlot(exprNode, 'right', 'value'));
    } else if (exprNode.type === 'LogicAnd' || exprNode.type === 'LogicOr') {
        el.appendChild(createExpressionSlot(exprNode, 'left', 'boolean'));
        const opSpan = document.createElement('span');
        opSpan.style.margin = '0 8px';
        opSpan.style.fontWeight = 'bold';
        opSpan.innerText = exprNode.type === 'LogicAnd' ? 'AND' : 'OR';
        el.appendChild(opSpan);
        el.appendChild(createExpressionSlot(exprNode, 'right', 'boolean'));
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
    const container = document.getElementById('blockEditor');
    container.innerHTML = '';
    container.appendChild(createVisualBlock(appModel.screens[0].layout));
}

function createVisualBlock(node) {
    const block = document.createElement('div');
    block.className = 'visual-block';
    block.id = 'block_' + node.id;
    
    const header = document.createElement('div');
    header.className = 'visual-block-header';
    
    let icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="12" y2="17"></line></svg>`;
    if (node.type === 'Scaffold') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`;
    else if (node.type === 'If' || node.type === 'Loop') icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    
    header.innerHTML = `<span>${icon}</span> <span>${node.type}</span>`;
    
    if (node.type === 'SetVariable') {
        header.appendChild(createVariableDropdown(node.props.varName, e => { node.props.varName = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); }));
        let equals = document.createElement('span');
        equals.innerHTML = '=';
        equals.style.cssText = 'color:var(--text-main); font-weight:bold; margin: 0 5px;';
        header.appendChild(equals);
        header.appendChild(createExpressionSlot(node, 'value', 'value'));
    }
    else if (node.type === 'If' || node.type === 'Loop') {
        header.appendChild(createExpressionSlot(node, 'condition', 'boolean'));
    }
    
    if (node.id !== 'root_scaffold') {
        block.draggable = true;
        block.addEventListener('dragstart', e => { 
            e.stopPropagation(); 
            e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor', id: node.id })); 
            setDragState(false, null);
        });
        const delBtn = document.createElement('span'); delBtn.innerHTML = '✕';
        delBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:14px; font-weight:bold; padding: 0 5px;';
        delBtn.onclick = (e) => { e.stopPropagation(); removeNodeById(appModel.screens[0].layout, node.id); updateAllViews(); };
        header.appendChild(delBtn);
    }
    
    block.appendChild(header);
    
    if (node.type === 'Greeting') {
        const propRow = document.createElement('div'); propRow.className = 'visual-block-prop';
        propRow.innerHTML = `<span>Name:</span>`;
        const input = document.createElement('input'); 
        input.className = 'block-control';
        input.type = 'text'; input.value = node.props.name;
        input.addEventListener('input', (e) => { node.props.name = e.target.value; renderEmulator(); syncKotlinCodeToVFS(); });
        propRow.appendChild(input); block.appendChild(propRow);
    }
    
    if (node.type === 'Scaffold' || node.type === 'If' || node.type === 'Loop') {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'visual-block-children';
        
        let childCount = node.children ? node.children.length : 0;
        for (let i = 0; i <= childCount; i++) {
            childrenContainer.appendChild(createDropZone(node.id, i));
            if (i < childCount) {
                childrenContainer.appendChild(createVisualBlock(node.children[i]));
            }
        }
        block.appendChild(childrenContainer);
    }
    return block;
}

// ==========================================
// RENDERING: HTML Emulator (AST Engine)
// ==========================================
function evaluateExpressionJS(exprNode, ctx, defaultReturn = true) {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value === 'true';
    if (exprNode.type === 'NumberValue') return Number(exprNode.value) || 0;
    if (exprNode.type === 'VarValue') return ctx[exprNode.props.varName] || 0;
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

function renderEmulator() {
    const screenElement = document.getElementById('phoneScreen');
    screenElement.innerHTML = '';
    
    let context = {};
    appModel.variables.forEach(v => context[v] = 0);
    
    function buildHtmlNode(node, ctx, parentFragment) {
        if (node.type === 'Scaffold') {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:#fff; padding:40px 20px; gap:12px; overflow-y:auto;';
            if (node.children) node.children.forEach(c => buildHtmlNode(c, ctx, el));
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
                if (node.children) node.children.forEach(c => buildHtmlNode(c, ctx, parentFragment));
            }
        }
        else if (node.type === 'Loop') {
            let limit = 0;
            while (evaluateExpressionJS(node.condition, ctx, true) && limit < 1000) {
                if (node.children) node.children.forEach(c => buildHtmlNode(c, ctx, parentFragment));
                limit++;
            }
            if(limit >= 1000) console.warn("Emulator: Loop Limit erreicht (Endlosschleife?)");
        }
    }
    
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
    }
    return "";
}

function generateKotlinCode() {
    const meta = appModel.metadata;
    let varDeclarations = "";
    appModel.variables.forEach(v => { varDeclarations += `        var ${v} by remember { mutableStateOf<Any>(0) }\n`; });
    
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import ${meta.packageName}.ui.theme.${meta.appName}Theme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ${meta.appName}Theme {
${varDeclarations}
                ${uiCode}
            }
        }
    }
}

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