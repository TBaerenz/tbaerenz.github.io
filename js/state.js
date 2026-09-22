// ==========================================
// GLOBALE STATE-VARIABLEN & SVG CONSTANTS
// ==========================================
const SVG_FILE = `<svg class="icon icon-file" viewBox="0 0 24 24" width="1.2em" height="1.2em" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
const SVG_FOLDER_CLOSED = `<svg class="folder-closed" viewBox="0 0 24 24" width="1.2em" height="1.2em" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
const SVG_FOLDER_OPEN = `<svg class="folder-open" viewBox="0 0 24 24" width="1.2em" height="1.2em" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M2 5v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2h-8l-2-2H4c-1.1 0-2 .9-2 2z"></path><path d="M2 11h20"></path></svg>`;
const SVG_CLOSE = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

let vfs = {}; 
let openFiles = []; 
let activeFile = null;
let currentEditorMode = 'code';
let clipboard = null;
let currentContextTarget = null;
let currentLang = 'de';

let blockClipboard = null; 

// Initialize Global Emulator State
window.emulatorScreenArg = "";

function getDefaultAppModel() {
    return {
        metadata: { appName: "MyApplication", packageName: "com.example.myapplication" },
        variables: [], 
        functions: [],
        activeScreenId: "MainActivity",
        screens: [{
            id: "MainActivity",
            uiTree: {
                type: "Column", id: "root_col", props: {},
                children: [
                    { type: "TextLabel", id: "lbl_1", props: { text: "Willkommen in der App!" } }
                ]
            },
            floatingBlocks: []
        }]
    };
}

let appModel = getDefaultAppModel();

function getActiveScreen() {
    return appModel.screens.find(s => s.id === appModel.activeScreenId) || appModel.screens[0];
}

// ==========================================
// HILFSFUNKTIONEN
// ==========================================
function genId(prefix) { return prefix + '_' + Date.now() + Math.floor(Math.random() * 1000); }

function deepCloneNodeWithNewIds(node) {
    if (!node || typeof node !== 'object') return node;
    let clone = Array.isArray(node) ? [] : {};
    for (let key in node) {
        if (key === 'id') {
            clone[key] = genId(node.type ? node.type.toLowerCase() : 'node');
        } else if (typeof node[key] === 'object') {
            clone[key] = deepCloneNodeWithNewIds(node[key]);
        } else {
            clone[key] = node[key];
        }
    }
    return clone;
}

function findNodeById(current, id) {
    if (!current) return null;
    if (current.id === id) return current;
    
    if (current.children) {
        for (let child of current.children) {
            let found = findNodeById(child, id);
            if (found) return found;
        }
    }
    
    if (current.elseIfs) {
        for (let elif of current.elseIfs) {
            if (elif.id === id) return elif;
            if (elif.children) {
                for (let child of elif.children) {
                    let found = findNodeById(child, id);
                    if (found) return found;
                }
            }
        }
    }
    
    if (current.elseBranch) {
        if (current.elseBranch.id === id) return current.elseBranch;
        if (current.elseBranch.children) {
            for (let child of current.elseBranch.children) {
                let found = findNodeById(child, id);
                if (found) return found;
            }
        }
    }
    
    return null;
}

function findNodeAnywhere(id) {
    for (let fb of getActiveScreen().floatingBlocks) {
        if (fb.node.id === id) return fb.node;
        let inner = findNodeById(fb.node, id);
        if (inner) return inner;
    }
    return null;
}

function removeNodeById(current, id) {
    if (!current) return null;
    
    if (current.children) {
        for (let i = 0; i < current.children.length; i++) {
            if (current.children[i].id === id) {
                return current.children.splice(i, 1)[0];
            } else {
                let found = removeNodeById(current.children[i], id);
                if (found) return found;
            }
        }
    }
    
    if (current.elseIfs) {
        for (let elif of current.elseIfs) {
            if (elif.children) {
                for (let i = 0; i < elif.children.length; i++) {
                    if (elif.children[i].id === id) return elif.children.splice(i, 1)[0];
                    let found = removeNodeById(elif.children[i], id);
                    if (found) return found;
                }
            }
        }
    }
    
    if (current.elseBranch && current.elseBranch.children) {
        for (let i = 0; i < current.elseBranch.children.length; i++) {
            if (current.elseBranch.children[i].id === id) return current.elseBranch.children.splice(i, 1)[0];
            let found = removeNodeById(current.elseBranch.children[i], id);
            if (found) return found;
        }
    }
    
    return null;
}

function extractNodeFromAnywhere(id) {
    let screen = getActiveScreen();
    for (let i = 0; i < screen.floatingBlocks.length; i++) {
        if (screen.floatingBlocks[i].node.id === id) {
            return screen.floatingBlocks.splice(i, 1)[0].node;
        } else {
            let inner = removeNodeById(screen.floatingBlocks[i].node, id);
            if (inner) return inner;
        }
    }
    return null;
}

function removeExpressionById(current, id) {
    if (!current) return false;
    let props = ['condition', 'value', 'left', 'right', 'min', 'max', 'list', 'start', 'end', 'step', 'textExpr', 'arg']; 
    for (let p of props) {
        if (current[p] && typeof current[p] === 'object') {
            if (current[p].id === id) {
                current[p] = null;
                return true;
            }
            if (removeExpressionById(current[p], id)) return true;
        }
    }
    
    if (current.children) {
        for (let child of current.children) {
            if (removeExpressionById(child, id)) return true;
        }
    }
    if (current.elseIfs) {
        for (let elif of current.elseIfs) {
            if (elif.condition && typeof elif.condition === 'object') {
                if (elif.condition.id === id) { elif.condition = null; return true; }
                if (removeExpressionById(elif.condition, id)) return true;
            }
            if (elif.children) {
                for (let child of elif.children) { if (removeExpressionById(child, id)) return true; }
            }
        }
    }
    if (current.elseBranch && current.elseBranch.children) {
        for (let child of current.elseBranch.children) { if (removeExpressionById(child, id)) return true; }
    }
    
    return false;
}

function getFullPath(element) {
    let pathParts = [];
    let current = element;
    while(current && current.id !== 'fileTree') {
        if (current.classList.contains('file-item')) {
            pathParts.unshift(current.querySelector('.item-name').textContent);
        } else if (current.tagName.toLowerCase() === 'details' && current.classList.contains('folder')) {
            pathParts.unshift(current.querySelector('summary .item-name').textContent);
        }
        current = current.parentElement;
    }
    return pathParts.join('/');
}

function logToConsole(msg, isError = false) {
    const consoleContent = document.getElementById('consoleContent');
    const logEntry = document.createElement('div');
    logEntry.style.marginTop = '4px';
    logEntry.style.color = isError ? '#ef4444' : (document.documentElement.getAttribute('data-theme') === 'light' ? '#0f172a' : '#4ade80');
    logEntry.innerText = `> ${msg}`;
    consoleContent.appendChild(logEntry);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

function clearConsole(e) {
    if (e) e.stopPropagation();
    const consoleContent = document.getElementById('consoleContent');
    consoleContent.innerHTML = '';
    logToConsole(dictionary['terminal_ready'][currentLang].replace('> ', ''));
}