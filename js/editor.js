// ==========================================
// DRAG AND DROP (Visual Editor)
// ==========================================
function handleDragStartSidebar(e) {
    const type = e.target.getAttribute('data-type');
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'sidebar', type: type }));
}

function handleVisualBlockDrop(e, targetNodeId) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        let data = JSON.parse(e.dataTransfer.getData('application/json'));
        let targetNode = findNodeById(appModel.screens[0].layout, targetNodeId);
        
        if (!targetNode) return;
        if (!targetNode.children) targetNode.children = [];

        if (data.source === 'sidebar') {
            const newId = data.type.toLowerCase() + '_' + Date.now();
            targetNode.children.push({
                type: data.type,
                id: newId,
                props: data.type === 'Greeting' ? { name: "Neu" } : {},
                children: data.type === 'Scaffold' ? [] : undefined
            });
        } else if (data.source === 'editor' && data.id !== targetNodeId) {
            let movedNode = removeNodeById(appModel.screens[0].layout, data.id);
            if (movedNode) targetNode.children.push(movedNode);
        }
        updateAllViews(); 
    } catch(err) { console.error("Drop Fehler:", err); }
}

// ==========================================
// RENDERING: Block Editor
// ==========================================
function renderBlockEditor() {
    const container = document.getElementById('blockEditor');
    container.innerHTML = '';
    container.appendChild(createVisualBlock(appModel.screens[0].layout));
}

function createVisualBlock(node) {
    const block = document.createElement('div');
    block.className = 'visual-block';
    
    const header = document.createElement('div');
    header.className = 'visual-block-header';
    
    let icon = node.type === 'Scaffold' 
        ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="12" y2="17"></line></svg>`;
    
    header.innerHTML = `${icon} <span>${node.type}</span>`;
    
    if (node.id !== 'root_scaffold') {
        block.draggable = true;
        block.addEventListener('dragstart', e => {
            e.stopPropagation();
            e.dataTransfer.setData('application/json', JSON.stringify({ source: 'editor', id: node.id }));
        });

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '✕';
        delBtn.style.cssText = 'cursor:pointer; margin-left:auto; color:#ef4444; font-size:16px;';
        delBtn.onclick = (e) => { e.stopPropagation(); removeNodeById(appModel.screens[0].layout, node.id); updateAllViews(); };
        header.appendChild(delBtn);
    }
    block.appendChild(header);
    
    if (node.type === 'Greeting') {
        const propRow = document.createElement('div');
        propRow.className = 'visual-block-prop';
        propRow.innerHTML = `<span>Name:</span>`;
        
        const input = document.createElement('input');
        input.type = 'text'; input.value = node.props.name;
        
        input.addEventListener('input', (e) => {
            node.props.name = e.target.value; 
            renderEmulator(); syncKotlinCodeToVFS();
        });
        propRow.appendChild(input); block.appendChild(propRow);
    }
    
    if (node.type === 'Scaffold') {
        block.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); block.classList.add('drag-over'); });
        block.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); block.classList.remove('drag-over'); });
        block.addEventListener('drop', e => handleVisualBlockDrop(e, node.id));
        
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'visual-block-children';
        
        if (node.children) node.children.forEach(child => childrenContainer.appendChild(createVisualBlock(child)));
        block.appendChild(childrenContainer);
    }
    return block;
}

// ==========================================
// RENDERING: HTML Emulator
// ==========================================
function renderEmulator() {
    const screenElement = document.getElementById('phoneScreen');
    screenElement.innerHTML = '';
    
    function buildHtmlNode(node) {
        if (node.type === 'Scaffold') {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:#fff; padding:40px 20px; gap:12px; overflow-y:auto;';
            if (node.children) node.children.forEach(c => el.appendChild(buildHtmlNode(c)));
            return el;
        } 
        else if (node.type === 'Greeting') {
            const el = document.createElement('div');
            el.innerText = `Hello ${node.props.name}!`;
            el.style.cssText = 'font-size:16px; color:#000; padding:10px; background:#f1f5f9; border-radius:8px; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);';
            return el;
        }
        return document.createElement('div');
    }
    screenElement.appendChild(buildHtmlNode(appModel.screens[0].layout));
}

// ==========================================
// KOTLIN GENERATOR & VFS SYNC
// ==========================================
function buildComposeTree(node, indent) {
    let space = " ".repeat(indent);
    if (node.type === 'Scaffold') {
        let code = `${space}Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->\n`;
        code += `${space}    androidx.compose.foundation.layout.Column(\n`;
        code += `${space}        modifier = Modifier.padding(innerPadding).fillMaxSize()\n`;
        code += `${space}    ) {\n`;
        if (node.children) {
            node.children.forEach(child => { code += buildComposeTree(child, indent + 8); });
        }
        code += `${space}    }\n`;
        code += `${space}}\n`;
        return code;
    } else if (node.type === 'Greeting') {
        return `${space}Greeting(name = "${node.props.name}")\n`;
    }
    return "";
}

function generateKotlinCode() {
    const meta = appModel.metadata;
    let uiCode = buildComposeTree(appModel.screens[0].layout, 16).trim();

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import ${meta.packageName}.ui.theme.${meta.appName}Theme

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

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
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