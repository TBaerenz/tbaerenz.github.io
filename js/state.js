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

let blockClipboard = null; // Zwischenablage für das visuelle Block-System

function getDefaultAppModel() {
    return {
        metadata: { appName: "MyApplication", packageName: "com.example.myapplication" },
        variables: [], 
        functions: [],
        floatingBlocks: [], // Lose platzierte Blöcke {x: 0, y: 0, node: {...}}
        screens: [{
            id: "MainActivity",
            layout: {
                type: "Scaffold", id: "root_scaffold", props: {},
                children: [
                    { type: "Greeting", id: "greet_1", props: { name: "Android" } }
                ]
            }
        }]
    };
}

let appModel = getDefaultAppModel();

// ==========================================
// HILFSFUNKTIONEN
// ==========================================
function genId(prefix) { return prefix + '_' + Date.now() + Math.floor(Math.random() * 1000); }

// Tiefe Kopie eines Blocks, wobei für jedes Element neue IDs generiert werden
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
    return null;
}

function findNodeAnywhere(id) {
    let found = findNodeById(appModel.screens[0].layout, id);
    if (found) return found;
    for (let fb of appModel.floatingBlocks) {
        if (fb.node.id === id) return fb.node;
        let inner = findNodeById(fb.node, id);
        if (inner) return inner;
    }
    return null;
}

function removeNodeById(current, id) {
    if (!current || !current.children) return null;
    for (let i = 0; i < current.children.length; i++) {
        if (current.children[i].id === id) {
            return current.children.splice(i, 1)[0];
        } else {
            let found = removeNodeById(current.children[i], id);
            if (found) return found;
        }
    }
    return null;
}

function extractNodeFromAnywhere(id) {
    let found = removeNodeById(appModel.screens[0].layout, id);
    if (found) return found;

    for (let i = 0; i < appModel.floatingBlocks.length; i++) {
        if (appModel.floatingBlocks[i].node.id === id) {
            return appModel.floatingBlocks.splice(i, 1)[0].node;
        } else {
            let inner = removeNodeById(appModel.floatingBlocks[i].node, id);
            if (inner) return inner;
        }
    }
    return null;
}

function removeExpressionById(current, id) {
    if (!current) return false;
    let props = ['condition', 'value', 'left', 'right'];
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