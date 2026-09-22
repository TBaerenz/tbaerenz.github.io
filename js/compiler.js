window.evaluateExpressionJS = function(exprNode, ctx, defaultReturn = true) {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value === 'true';
    if (exprNode.type === 'LogicNot') return !window.evaluateExpressionJS(exprNode.value, ctx, true);
    if (exprNode.type === 'NumberValue') return Number(exprNode.value) || 0;
    if (exprNode.type === 'StringValue') return exprNode.value || "";
    if (exprNode.type === 'VarValue') return ctx[exprNode.props.varName] !== undefined ? ctx[exprNode.props.varName] : 0;
    if (exprNode.type === 'GetScreenArgument') return window.emulatorScreenArg !== undefined ? window.emulatorScreenArg : "";

    if (exprNode.type === 'MathOp') {
        let l = window.evaluateExpressionJS(exprNode.left, ctx, 0);
        let r = window.evaluateExpressionJS(exprNode.right, ctx, 0);
        switch(exprNode.operator) {
            case '+': return l + r; case '-': return l - r; case '*': return l * r;
            case '/': return r !== 0 ? l / r : 0; case '%': return r !== 0 ? l % r : 0; case '^': return Math.pow(l, r); default: return 0;
        }
    }
    if (exprNode.type === 'MathRandom') {
        let min = window.evaluateExpressionJS(exprNode.min, ctx, 0); let max = window.evaluateExpressionJS(exprNode.max, ctx, 100);
        if(exprNode.randType === 'int') return Math.floor(Math.random() * (max - min + 1)) + min; return Math.random() * (max - min) + min;
    }
    if (exprNode.type === 'MathCompare') {
        let l = window.evaluateExpressionJS(exprNode.left, ctx, 0); let r = window.evaluateExpressionJS(exprNode.right, ctx, 0);
        if(exprNode.operator === 'min') return Math.min(l, r); if(exprNode.operator === 'max') return Math.max(l, r);
        if(exprNode.operator === 'avg') return (l + r) / 2; return 0;
    }
    if (exprNode.type === 'MathList') {
        let val = window.evaluateExpressionJS(exprNode.list, ctx, ""); let arr = [];
        if (Array.isArray(val)) arr = val; else if (typeof val === 'string') arr = val.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n)); else arr = [Number(val)];
        if (arr.length === 0) return 0;
        if (exprNode.operator === 'min') return Math.min(...arr); if (exprNode.operator === 'max') return Math.max(...arr);
        if (exprNode.operator === 'avg') return arr.reduce((a, b) => a + b, 0) / arr.length; return 0;
    }
    if (exprNode.type === 'MathFunc') {
        let v = window.evaluateExpressionJS(exprNode.value, ctx, 0);
        if(exprNode.operator === 'sqrt') return Math.sqrt(v); if(exprNode.operator === 'log10') return Math.log10(v);
        if(exprNode.operator === 'ln') return Math.log(v); if(exprNode.operator === 'abs') return Math.abs(v); if(exprNode.operator === 'round') return Math.round(v); return 0;
    }
    if (exprNode.type === 'MathTrig') {
        let v = window.evaluateExpressionJS(exprNode.value, ctx, 0);
        if(exprNode.operator === 'sin') return Math.sin(v); if(exprNode.operator === 'cos') return Math.cos(v); if(exprNode.operator === 'tan') return Math.tan(v); return 0;
    }

    if (exprNode.type === 'CallFunctionExpr') {
        let funcDef = null;
        appModel.screens.forEach(s => { if(s.floatingBlocks) { let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === exprNode.props.funcName); if(found) funcDef = found; } });
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx }; tempCtx._return = undefined;
            if (funcModel && funcModel.localVars) { funcModel.localVars.forEach(lv => { tempCtx[lv] = 0; }); }
            if (funcModel && funcModel.params && exprNode.args) { funcModel.params.forEach(p => { tempCtx[p] = window.evaluateExpressionJS(exprNode.args[p], ctx, 0); }); }
            if (funcDef.node.children) {
                const dummyFragment = document.createDocumentFragment();
                for (let c of funcDef.node.children) { if (tempCtx._return !== undefined) break; window.buildHtmlNode(c, tempCtx, dummyFragment); }
            }
            Object.keys(tempCtx).forEach(k => { 
                let isParam = funcModel && funcModel.params && funcModel.params.includes(k); let isLocal = funcModel && funcModel.localVars && funcModel.localVars.includes(k);
                if(k !== '_return' && !isParam && !isLocal) { ctx[k] = tempCtx[k]; }
            });
            return tempCtx._return !== undefined ? tempCtx._return : 0;
        }
        return 0;
    }
    if (exprNode.type === 'GetUIProperty') { return window.emulatorCtx[exprNode.props.targetId + "_" + exprNode.props.property] !== undefined ? window.emulatorCtx[exprNode.props.targetId + "_" + exprNode.props.property] : ""; }
    if (exprNode.type === 'Comparison') {
        let l = window.evaluateExpressionJS(exprNode.left, ctx, 0); let r = window.evaluateExpressionJS(exprNode.right, ctx, 0);
        switch(exprNode.operator) { case '==': return l == r; case '!=': return l != r; case '>': return l > r; case '<': return l < r; case '>=': return l >= r; case '<=': return l <= r; default: return false; }
    }
    if (exprNode.type === 'LogicAnd') return window.evaluateExpressionJS(exprNode.left, ctx, true) && window.evaluateExpressionJS(exprNode.right, ctx, true);
    if (exprNode.type === 'LogicOr') return window.evaluateExpressionJS(exprNode.left, ctx, true) || window.evaluateExpressionJS(exprNode.right, ctx, true);
    return defaultReturn;
};

window.buildHtmlNode = function(node, ctx, parentFragment) {
    if (ctx._return !== undefined) return;

    if (node.type === 'SetVariable') { if (node.props.varName) ctx[node.props.varName] = window.evaluateExpressionJS(node.value, ctx, 0); }
    else if (node.type === 'SetUIProperty') { window.emulatorCtx[node.props.targetId + "_" + node.props.property] = window.evaluateExpressionJS(node.value, ctx, ""); }
    else if (node.type === 'If') {
        let handled = false;
        if (window.evaluateExpressionJS(node.condition, ctx, true)) {
            if (node.children) { for (let c of node.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } }
            handled = true;
        }
        if (!handled && node.elseIfs) {
            for (let elif of node.elseIfs) {
                if (window.evaluateExpressionJS(elif.condition, ctx, true)) {
                    if (elif.children) { for (let c of elif.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } }
                    handled = true; break;
                }
            }
        }
        if (!handled && node.elseBranch) { if (node.elseBranch.children) { for (let c of node.elseBranch.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } } }
    }
    else if (node.type === 'Loop') {
        let limit = 0;
        while (window.evaluateExpressionJS(node.condition, ctx, true) && limit < 1000) {
            if (ctx._return !== undefined) break;
            if (node.children) { for (let c of node.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } }
            limit++;
        }
    }
    else if (node.type === 'ForLoop') {
        let s = window.evaluateExpressionJS(node.start, ctx, 1); let e = window.evaluateExpressionJS(node.end, ctx, 10); let step = window.evaluateExpressionJS(node.step, ctx, 1);
        let limit = 0; let counterVar = node.props.varName; ctx[counterVar] = s;
        while(limit < 1000) {
            if(s <= e && ctx[counterVar] > e) break; if(s > e && ctx[counterVar] < e) break;
            if (ctx._return !== undefined) break;
            if (node.children) { for (let c of node.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } }
            ctx[counterVar] += (s <= e) ? step : -step; limit++;
        }
    }
    else if (node.type === 'ForEach') {
        let listVal = window.evaluateExpressionJS(node.list, ctx, ""); let arr = [];
        if (Array.isArray(listVal)) arr = listVal; else if (typeof listVal === 'string') arr = listVal.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n)); else arr = [Number(listVal)];
        let elVar = node.props.varName;
        for (let i = 0; i < arr.length; i++) {
            if (ctx._return !== undefined) break;
            ctx[elVar] = arr[i];
            if (node.children) { for (let c of node.children) { if (ctx._return !== undefined) break; window.buildHtmlNode(c, ctx, parentFragment); } }
        }
    }
    else if (node.type === 'CallFunction') {
        let funcDef = null;
        appModel.screens.forEach(s => { if(s.floatingBlocks) { let found = s.floatingBlocks.find(b => b.node.type === 'FunctionDef' && b.node.props.funcName === node.props.funcName); if(found) funcDef = found; } });
        let funcModel = appModel.functions.find(f => f.name === node.props.funcName);
        if (funcDef) {
            let tempCtx = { ...ctx };
            if (funcModel && funcModel.localVars) { funcModel.localVars.forEach(lv => { tempCtx[lv] = 0; }); }
            if (funcModel && funcModel.params && node.args) { funcModel.params.forEach(p => { tempCtx[p] = window.evaluateExpressionJS(node.args[p], ctx, 0); }); }
            if (funcDef.node.children) { for (let c of funcDef.node.children) { if (tempCtx._return !== undefined) break; window.buildHtmlNode(c, tempCtx, parentFragment); } }
            Object.keys(tempCtx).forEach(k => { 
                let isParam = funcModel && funcModel.params && funcModel.params.includes(k); let isLocal = funcModel && funcModel.localVars && funcModel.localVars.includes(k);
                if(k !== '_return' && !isParam && !isLocal) { ctx[k] = tempCtx[k]; }
            });
        }
    }
    else if (node.type === 'Return') { ctx._return = window.evaluateExpressionJS(node.value, ctx, 0); }
    else if (node.type === 'OpenScreen') { let argVal = window.evaluateExpressionJS(node.arg, ctx, ""); logToConsole(`[Emulator] Navigation -> ${node.props.screenName} (Arg: ${argVal})`); window.switchScreen(node.props.screenName, argVal); }
    else if (node.type === 'CloseScreen') { logToConsole("[Emulator] Navigation -> Close Screen (Simulation: Back)"); }
    else if (node.type === 'ExitApp') { logToConsole("[Emulator] App Exit requested."); }
};

window.triggerUIEvent = function(sourceId, eventType) {
    let evtBlock = getActiveScreen().floatingBlocks.find(fb => fb.node.type === 'UIEvent' && fb.node.props.sourceId === sourceId && fb.node.props.eventType === eventType);
    if (evtBlock && evtBlock.node.children) {
        const dummyFrag = document.createDocumentFragment();
        for(let c of evtBlock.node.children) {
            if(window.emulatorCtx._return !== undefined) break;
            window.buildHtmlNode(c, window.emulatorCtx, dummyFrag);
        }
    }
    window.renderEmulator(true); 
};

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

window.renderUITree = function(node, parentEl) {
    if (!node) return;
    let el = null;
    
    if (node.type === 'Scaffold') {
        el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; padding:20px; gap:12px; overflow-y:auto; box-sizing:border-box; background:#ffffff;';
        if(node.children) node.children.forEach(c => window.renderUITree(c, el));
    }
    else if (node.type === 'Column') {
        el = document.createElement('div'); el.style.cssText = 'display:flex; flex-direction:column; gap:8px; width:100%; box-sizing: border-box;';
        if(node.children && node.children.length === 0) el.style.minHeight = "20px";
        if(node.children) node.children.forEach(c => window.renderUITree(c, el));
    }
    else if (node.type === 'Row') {
        el = document.createElement('div'); el.style.cssText = 'display:flex; flex-direction:row; gap:8px; width:100%; box-sizing: border-box; align-items:center; flex-wrap: wrap;';
        if(node.children && node.children.length === 0) el.style.minHeight = "20px";
        if(node.children) node.children.forEach(c => window.renderUITree(c, el));
    }
    else if (node.type === 'TextLabel') {
        el = document.createElement('div'); el.innerText = window.emulatorCtx[node.id + "_text"] || ""; el.style.cssText = 'font-size:16px; color:#334155; display:block;';
    }
    else if (node.type === 'Button') {
        el = document.createElement('button'); el.innerText = window.emulatorCtx[node.id + "_label"] || "Button";
        el.style.cssText = 'padding: 10px 16px; background: var(--ui-bg, #0ea5e9); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: fit-content; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition:0.2s;';
        el.onmouseenter = (e) => { e.stopPropagation(); el.style.filter = "brightness(1.1)"; if(window.highlightVar) window.highlightVar(node.id); };
        el.onmouseleave = (e) => { e.stopPropagation(); el.style.filter = "brightness(1)"; if(window.unhighlightVar) window.unhighlightVar(); };
        el.onclick = (e) => { e.stopPropagation(); window.triggerUIEvent(node.id, 'onClick'); };
    }
    else if (node.type === 'TextField') {
        el = document.createElement('input'); el.type = 'text'; el.placeholder = node.props.label || ''; el.value = window.emulatorCtx[node.id + "_text"] || "";
        el.style.cssText = 'padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; outline: none; color: #0f172a; background: #f8fafc; transition: border-color 0.2s;';
        el.onfocus = (e) => { e.stopPropagation(); el.style.borderColor = "var(--ui-bg, #0ea5e9)"; };
        el.onblur = (e) => { e.stopPropagation(); el.style.borderColor = "#cbd5e1"; };
        el.oninput = (e) => { window.emulatorCtx[node.id + "_text"] = e.target.value; };
    }
    
    if (el) {
        el.setAttribute('data-ui-id', node.id);
        if (node.type !== 'Button') {
            el.addEventListener('mouseenter', (e) => { e.stopPropagation(); if(window.highlightVar) window.highlightVar(node.id); });
            el.addEventListener('mouseleave', (e) => { e.stopPropagation(); if(window.unhighlightVar) window.unhighlightVar(); });
        }
        parentEl.appendChild(el);
    }
};

window.renderEmulator = function(preserveState = false) {
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
    window.renderUITree(activeScreen.uiTree, screenElement);
};

window.evaluateExpressionKotlin = function(exprNode, defaultReturn = "true") {
    if (!exprNode) return defaultReturn;
    if (exprNode.type === 'BooleanValue') return exprNode.value;
    if (exprNode.type === 'LogicNot') return `!(${window.evaluateExpressionKotlin(exprNode.value, "true")})`;
    if (exprNode.type === 'NumberValue') return exprNode.value;
    if (exprNode.type === 'StringValue') return `"${exprNode.value || ""}"`;
    if (exprNode.type === 'VarValue') return exprNode.props.varName || "0";
    if (exprNode.type === 'GetScreenArgument') return `navArg`;
    
    if (exprNode.type === 'MathOp') {
        let l = window.evaluateExpressionKotlin(exprNode.left, "0"); let r = window.evaluateExpressionKotlin(exprNode.right, "0");
        let lF = `(${l}.toString().toFloatOrNull() ?: 0f)`; let rF = `(${r}.toString().toFloatOrNull() ?: 0f)`;
        switch(exprNode.operator) {
            case '+': return `(${lF} + ${rF})`; case '-': return `(${lF} - ${rF})`; case '*': return `(${lF} * ${rF})`;
            case '/': return `(if(${rF} != 0f) ${lF} / ${rF} else 0f)`; case '%': return `(${lF} % ${rF})`; case '^': return `kotlin.math.pow(${lF}.toDouble(), ${rF}.toDouble()).toFloat()`;
            default: return "0f";
        }
    }
    if (exprNode.type === 'MathRandom') {
        let min = window.evaluateExpressionKotlin(exprNode.min, "0"); let max = window.evaluateExpressionKotlin(exprNode.max, "100");
        let minF = `(${min}.toString().toFloatOrNull() ?: 0f)`; let maxF = `(${max}.toString().toFloatOrNull() ?: 100f)`;
        if(exprNode.randType === 'int') return `(${minF}.toInt()..${maxF}.toInt()).random()`;
        return `kotlin.random.Random.nextDouble(${minF}.toDouble(), ${maxF}.toDouble()).toFloat()`;
    }
    if (exprNode.type === 'MathCompare') {
        let l = window.evaluateExpressionKotlin(exprNode.left, "0"); let r = window.evaluateExpressionKotlin(exprNode.right, "0");
        let lF = `(${l}.toString().toFloatOrNull() ?: 0f)`; let rF = `(${r}.toString().toFloatOrNull() ?: 0f)`;
        if(exprNode.operator === 'min') return `kotlin.math.min(${lF}, ${rF})`; if(exprNode.operator === 'max') return `kotlin.math.max(${lF}, ${rF})`;
        if(exprNode.operator === 'avg') return `((${lF} + ${rF}) / 2f)`; return "0f";
    }
    if (exprNode.type === 'MathList') {
        let list = window.evaluateExpressionKotlin(exprNode.list, "\"\"");
        return `mathListOp(${list}.toString(), "${exprNode.operator}")`;
    }
    if (exprNode.type === 'MathFunc') {
        let v = window.evaluateExpressionKotlin(exprNode.value, "0"); let vF = `(${v}.toString().toDoubleOrNull() ?: 0.0)`;
        if(exprNode.operator === 'sqrt') return `kotlin.math.sqrt(${vF}).toFloat()`; if(exprNode.operator === 'log10') return `kotlin.math.log10(${vF}).toFloat()`;
        if(exprNode.operator === 'ln') return `kotlin.math.ln(${vF}).toFloat()`; if(exprNode.operator === 'abs') return `kotlin.math.abs(${vF}).toFloat()`;
        if(exprNode.operator === 'round') return `kotlin.math.round(${vF}).toFloat()`; return "0f";
    }
    if (exprNode.type === 'MathTrig') {
        let v = window.evaluateExpressionKotlin(exprNode.value, "0"); let vF = `(${v}.toString().toDoubleOrNull() ?: 0.0)`;
        if(exprNode.operator === 'sin') return `kotlin.math.sin(${vF}).toFloat()`; if(exprNode.operator === 'cos') return `kotlin.math.cos(${vF}).toFloat()`;
        if(exprNode.operator === 'tan') return `kotlin.math.tan(${vF}).toFloat()`; return "0f";
    }
    if (exprNode.type === 'CallFunctionExpr') {
        let funcModel = appModel.functions.find(f => f.name === exprNode.props.funcName); let argsStr = "";
        if (funcModel && funcModel.params && exprNode.args) { argsStr = funcModel.params.map(p => window.evaluateExpressionKotlin(exprNode.args[p], "0")).join(", "); }
        return `${exprNode.props.funcName}(${argsStr})`;
    }
    if (exprNode.type === 'GetUIProperty') return `ui_${exprNode.props.targetId}_${exprNode.props.property}`;
    if (exprNode.type === 'Comparison') return `${window.evaluateExpressionKotlin(exprNode.left, "0")} ${exprNode.operator} ${window.evaluateExpressionKotlin(exprNode.right, "0")}`;
    if (exprNode.type === 'LogicAnd') return `(${window.evaluateExpressionKotlin(exprNode.left, "true")} && ${window.evaluateExpressionKotlin(exprNode.right, "true")})`;
    if (exprNode.type === 'LogicOr') return `(${window.evaluateExpressionKotlin(exprNode.left, "true")} || ${window.evaluateExpressionKotlin(exprNode.right, "true")})`;
    return defaultReturn;
};

window.buildComposeTree = function(node, indent) {
    let space = " ".repeat(indent);
    
    if (node.type === 'Scaffold') {
        let code = `${space}Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->\n${space}    Column(modifier = Modifier.padding(innerPadding).fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 8); });
        return code + `${space}    }\n${space}}\n`;
    } else if (node.type === 'Column') {
        let code = `${space}Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
        return code + `${space}}\n`;
    } else if (node.type === 'Row') {
        let code = `${space}Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
        return code + `${space}}\n`;
    } else if (node.type === 'TextLabel') {
        return `${space}Text(text = ui_${node.id}_text.toString())\n`;
    } else if (node.type === 'Button') {
        return `${space}Button(onClick = { event_${node.id}_onClick() }) {\n${space}    Text(ui_${node.id}_label.toString())\n${space}}\n`;
    } else if (node.type === 'TextField') {
        let label = node.props.label || "";
        return `${space}OutlinedTextField(value = ui_${node.id}_text.toString(), onValueChange = { ui_${node.id}_text = it }, label = { Text("${label}") }, modifier = Modifier.fillMaxWidth())\n`;
    } 
    
    else if (node.type === 'SetVariable') {
        if(node.props.varName) return `${space}${node.props.varName} = ${window.evaluateExpressionKotlin(node.value, "0")}\n`; return "";
    } else if (node.type === 'SetUIProperty') {
        return `${space}ui_${node.props.targetId}_${node.props.property} = ${window.evaluateExpressionKotlin(node.value, '""')}\n`;
    } else if (node.type === 'If') {
        let code = `${space}if (${window.evaluateExpressionKotlin(node.condition, "true")}) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
        code += `${space}}\n`;
        if (node.elseIfs) {
            node.elseIfs.forEach(elif => {
                code += `${space}else if (${window.evaluateExpressionKotlin(elif.condition, "true")}) {\n`;
                if (elif.children) elif.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
                code += `${space}}\n`;
            });
        }
        if (node.elseBranch) {
            code += `${space}else {\n`;
            if (node.elseBranch.children) node.elseBranch.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
            code += `${space}}\n`;
        }
        return code;
    } else if (node.type === 'Loop') {
        let code = `${space}while (${window.evaluateExpressionKotlin(node.condition, "true")}) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 4); });
        return code + `${space}}\n`;
    } else if (node.type === 'ForLoop') {
        let varName = node.props.varName || "i";
        let code = `${space}run {\n${space}    var ${varName} = (${window.evaluateExpressionKotlin(node.start, "1")}.toString().toFloatOrNull() ?: 1f)\n${space}    val _end = (${window.evaluateExpressionKotlin(node.end, "10")}.toString().toFloatOrNull() ?: 10f)\n${space}    val _step = (${window.evaluateExpressionKotlin(node.step, "1")}.toString().toFloatOrNull() ?: 1f)\n${space}    var _limit = 0\n${space}    while (_limit < 1000) {\n${space}        if (${varName} > _end && _step > 0) break\n${space}        if (${varName} < _end && _step < 0) break\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 8); });
        return code + `${space}        ${varName} += _step\n${space}        _limit++\n${space}    }\n${space}}\n`;
    } else if (node.type === 'ForEach') {
        let varName = node.props.varName || "element";
        let code = `${space}run {\n${space}    val _listStr = ${window.evaluateExpressionKotlin(node.list, "\"\"")}.toString()\n${space}    val _arr = _listStr.split(",").mapNotNull { it.trim().toFloatOrNull() }\n${space}    for(${varName} in _arr) {\n`;
        if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent + 8); });
        return code + `${space}    }\n${space}}\n`;
    } else if (node.type === 'FunctionDef') {
        let code = ""; if (node.children) node.children.forEach(child => { code += window.buildComposeTree(child, indent); }); return code;
    } else if (node.type === 'CallFunction') {
        let funcModel = appModel.functions.find(f => f.name === node.props.funcName); let argsStr = "";
        if (funcModel && funcModel.params && node.args) { argsStr = funcModel.params.map(p => window.evaluateExpressionKotlin(node.args[p], "0")).join(", "); }
        return `${space}${node.props.funcName}(${argsStr})\n`;
    } else if (node.type === 'Return') { return `${space}return ${window.evaluateExpressionKotlin(node.value, "0")}\n`;
    } else if (node.type === 'OpenScreen') { return `${space}navigateTo("${node.props.screenName}", ${window.evaluateExpressionKotlin(node.arg, '""')})\n`;
    } else if (node.type === 'CloseScreen') { return `${space}closeScreen()\n`;
    } else if (node.type === 'ExitApp') { return `${space}exitApp()\n`; }
    return "";
};

window.generateKotlinCode = function() {
    const meta = appModel.metadata;
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
                    if (funcModel && funcModel.localVars) { funcModel.localVars.forEach(lv => { localVarsCode += `    var ${lv} by mutableStateOf<Any>("")\n`; }); }
                    let funcBody = window.buildComposeTree(fb.node, 4);
                    functionsCode += `fun ${fb.node.props.funcName}(${paramsCode}) : Any {\n${localVarsCode}${funcBody}    return 0\n}\n\n`;
                } 
                else if (fb.node.type === 'UIEvent') {
                    let funcBody = window.buildComposeTree(fb.node, 4);
                    functionsCode += `fun event_${fb.node.props.sourceId}_${fb.node.props.eventType}() {\n${funcBody}}\n\n`;
                }
            });
        }
    });

    let screensCode = "";
    appModel.screens.forEach(s => {
        let sBody = window.buildComposeTree(s.uiTree, 4);
        screensCode += `@Composable\nfun Screen_${s.id}(navArg: Any, navigateTo: (String, Any) -> Unit, closeScreen: () -> Unit, exitApp: () -> Unit) {\n${sBody}}\n\n`;
    });
    
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
};

window.syncKotlinCodeToVFS = function() {
    if(!vfs) return;
    const mainActivityPath = Object.keys(vfs).find(k => k.endsWith('MainActivity.kt'));
    if (mainActivityPath) {
        vfs[mainActivityPath] = window.generateKotlinCode();
        if (activeFile === mainActivityPath && currentEditorMode === 'code') {
            document.getElementById('codeEditor').value = vfs[mainActivityPath];
        }
    }
};

window.printCodeToConsole = function() {
    logToConsole("[Build-Worker simuliert] APK wird generiert...\n" + window.generateKotlinCode());
};
