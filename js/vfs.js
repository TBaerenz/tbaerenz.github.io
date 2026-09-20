// ==========================================
// DATEIOPERATIONEN / KONTEXTMENÜ
// ==========================================
document.getElementById('fileTree').addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.file-item, .folder summary');
    if (item) {
        e.preventDefault(); 
        currentContextTarget = item;
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        contextMenu.classList.add('active');
        createMenu.classList.remove('active');
        viewMenu.classList.remove('active');
        fileMenuDropdown.classList.remove('active');
    }
});

function startCreate(type, extension) {
    let targetUl = document.getElementById('fileTree').querySelector('ul');
    if(targetUl) performCreate(type, extension, targetUl);
}

async function performCreate(type, extension, targetUl) {
    hideAllMenus();
    let msg = type === 'folder' ? dictionary['prompt_new_folder'][currentLang] : dictionary['prompt_new'][currentLang] + ` (Endung: ${extension})`;
    let name = await openModal({ title: dictionary['ctx_new'][currentLang], message: msg, type: 'prompt', validate: validateName });
    
    if (name !== null) {
        let finalName = type === 'folder' ? name : name + extension;
        let parentDetails = targetUl.parentElement; 
        let parentPath = parentDetails.classList.contains('folder') ? getFullPath(parentDetails) : '';
        let newFullPath = parentPath ? parentPath + '/' + finalName : finalName;

        if (type === 'folder') {
            const details = document.createElement('details');
            details.className = 'folder'; details.open = true;
            details.innerHTML = `<summary><span class="folder-icon">${SVG_FOLDER_CLOSED}${SVG_FOLDER_OPEN}</span> <span class="item-name">${finalName}</span></summary><ul></ul>`;
            targetUl.appendChild(details);
        } else {
            vfs[newFullPath] = ""; 
            const li = document.createElement('li');
            li.className = 'file-item';
            li.onclick = function() { openFileByNode(this); };
            li.innerHTML = `${SVG_FILE} <span class="item-name">${finalName}</span>`;
            targetUl.appendChild(li);
        }
    }
}

async function handleCtxAction(action) {
    hideAllMenus();
    if (!currentContextTarget) return;
    let isFolder = currentContextTarget.tagName.toLowerCase() === 'summary';
    let nameSpan = currentContextTarget.querySelector('.item-name');
    let fullName = nameSpan.textContent;
    let nodeContainer = isFolder ? currentContextTarget.parentElement : currentContextTarget;
    let targetUl = isFolder ? currentContextTarget.nextElementSibling : currentContextTarget.parentElement;
    
    let oldPath = getFullPath(nodeContainer);

    if (action.startsWith('new_')) {
        let type = action === 'new_folder' ? 'folder' : 'file';
        let ext = action === 'new_app' ? '.app' : action === 'new_kt' ? '.kt' : action === 'new_xml' ? '.xml' : '';
        await performCreate(type, ext, targetUl);
    }
    else if (action === 'rename') {
        let baseName = fullName; let extension = "";
        if (!isFolder) {
            const lastDot = fullName.lastIndexOf('.');
            if(lastDot > 0) { baseName = fullName.substring(0, lastDot); extension = fullName.substring(lastDot); }
        }
        
        let newBaseName = await openModal({ title: dictionary['ctx_rename'][currentLang], message: dictionary['prompt_rename'][currentLang], type: 'prompt', defaultValue: baseName, validate: validateName });

        if (newBaseName !== null && newBaseName !== baseName) {
            let finalNewName = newBaseName + extension;
            nameSpan.textContent = finalNewName; 
            let newPath = getFullPath(nodeContainer); 
            
            if (isFolder) {
                Object.keys(vfs).forEach(k => {
                    if (k.startsWith(oldPath + '/')) {
                        let newK = k.replace(oldPath + '/', newPath + '/');
                        vfs[newK] = vfs[k]; delete vfs[k];
                        updateTabPaths(k, newK);
                    }
                });
            } else {
                vfs[newPath] = vfs[oldPath] || ""; delete vfs[oldPath];
                updateTabPaths(oldPath, newPath);
            }
        }
    } 
    else if (action === 'delete') {
        let confirmed = await openModal({ title: dictionary['ctx_delete'][currentLang], message: dictionary['prompt_delete'][currentLang] + "'" + fullName + "'?", type: 'confirm', danger: true });
        if (confirmed) {
            nodeContainer.remove();
            if (isFolder) {
                Object.keys(vfs).forEach(k => { if (k.startsWith(oldPath + '/')) { delete vfs[k]; forceCloseTab(k); } });
            } else {
                delete vfs[oldPath]; forceCloseTab(oldPath);
            }
        }
    }
    else if (action === 'copy' || action === 'cut') {
        document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
        clipboard = { action: action, node: nodeContainer, isFolder: isFolder, originPath: oldPath };
        if (action === 'cut') nodeContainer.classList.add('cut-item');
    }
    else if (action === 'paste') {
        if (!clipboard || !clipboard.node) return;
        
        if (clipboard.action === 'cut') {
            targetUl.appendChild(clipboard.node);
            clipboard.node.classList.remove('cut-item');
            let pastedPath = getFullPath(clipboard.node);
            
            if (clipboard.isFolder) {
                Object.keys(vfs).forEach(k => {
                    if (k.startsWith(clipboard.originPath + '/')) {
                        let newK = k.replace(clipboard.originPath + '/', pastedPath + '/');
                        vfs[newK] = vfs[k]; delete vfs[k]; updateTabPaths(k, newK);
                    }
                });
            } else {
                vfs[pastedPath] = vfs[clipboard.originPath]; delete vfs[clipboard.originPath]; updateTabPaths(clipboard.originPath, pastedPath);
            }
            clipboard = null; 
        } 
        else if (clipboard.action === 'copy') {
            let clone = clipboard.node.cloneNode(true);
            let cloneNameSpan = clone.querySelector(clipboard.isFolder ? 'summary .item-name' : '.item-name');
            let oldName = cloneNameSpan.textContent; let newName = oldName;

            if (clipboard.isFolder) newName = oldName + "_kopie";
            else {
                let dotIdx = oldName.lastIndexOf('.');
                newName = dotIdx > 0 ? oldName.substring(0, dotIdx) + "_kopie" + oldName.substring(dotIdx) : oldName + "_kopie";
                clone.onclick = function() { openFileByNode(this); };
            }
            cloneNameSpan.textContent = newName;
            targetUl.appendChild(clone);
            
            let pastedPath = getFullPath(clone);
            if (clipboard.isFolder) {
                Object.keys(vfs).forEach(k => {
                    if (k.startsWith(clipboard.originPath + '/')) {
                        let newK = k.replace(clipboard.originPath + '/', pastedPath + '/');
                        vfs[newK] = vfs[k];
                    }
                });
            } else {
                vfs[pastedPath] = vfs[clipboard.originPath];
            }
        }
    }
    currentContextTarget = null;
}

// ==========================================
// TABS & EDITOR MODI
// ==========================================
const tabsContainer = document.getElementById('editorTabs');
const editorElement = document.getElementById('codeEditor');
const mainCanvas = document.getElementById('mainCanvas');

function setEditorMode(mode) {
    currentEditorMode = mode;
    hideAllMenus();
    if (mode === 'block') {
        mainCanvas.classList.add('mode-block'); mainCanvas.classList.remove('mode-code');
        renderBlockEditor(); 
    } else {
        mainCanvas.classList.add('mode-code'); mainCanvas.classList.remove('mode-block');
        if(activeFile && vfs[activeFile] !== undefined) {
            editorElement.value = vfs[activeFile];
        }
    }
}

function openFileByNode(liElement) {
    let fullPath = getFullPath(liElement);
    if (!openFiles.includes(fullPath)) openFiles.push(fullPath);
    activeFile = fullPath;
    if(currentEditorMode === 'block') setEditorMode('code');
    renderTabs(); renderEditorContent();
}

function closeFile(fullPath, event) {
    event.stopPropagation();
    if (activeFile === fullPath) vfs[fullPath] = editorElement.value; 
    forceCloseTab(fullPath);
}

function forceCloseTab(fullPath) {
    openFiles = openFiles.filter(f => f !== fullPath);
    if (activeFile === fullPath) activeFile = openFiles.length > 0 ? openFiles[openFiles.length - 1] : null;
    renderTabs(); renderEditorContent();
}

function updateTabPaths(oldP, newP) {
    let idx = openFiles.indexOf(oldP);
    if (idx > -1) openFiles[idx] = newP;
    if (activeFile === oldP) activeFile = newP;
    renderTabs();
}

function switchTab(fullPath) { 
    if (activeFile && vfs[activeFile] !== undefined) vfs[activeFile] = editorElement.value; 
    activeFile = fullPath; 
    if(currentEditorMode === 'block') setEditorMode('code');
    renderTabs(); renderEditorContent();
}

function renderTabs() {
    if (openFiles.length === 0) { tabsContainer.classList.add('hidden'); tabsContainer.innerHTML = ''; return; }
    tabsContainer.classList.remove('hidden');
    tabsContainer.innerHTML = openFiles.map((fPath, index) => {
        let name = fPath.split('/').pop();
        return `
        <div class="editor-tab ${fPath === activeFile ? 'active' : ''}" 
             draggable="true" data-index="${index}" onclick="switchTab('${fPath}')" title="${fPath}">
            ${SVG_FILE}
            <span>${name}</span>
            <span class="tab-close" onclick="closeFile('${fPath}', event)">${SVG_CLOSE}</span>
        </div>`
    }).join('');
    
    const tabElements = tabsContainer.querySelectorAll('.editor-tab');
    tabElements.forEach(tab => {
        tab.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', tab.getAttribute('data-index')); tab.classList.add('dragging'); });
        tab.addEventListener('dragover', e => { 
            e.preventDefault(); e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const midPoint = rect.left + rect.width / 2;
            e.currentTarget.classList.remove('drag-over-left', 'drag-over-right');
            if (e.clientX < midPoint) e.currentTarget.classList.add('drag-over-left');
            else e.currentTarget.classList.add('drag-over-right');
        });
        tab.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over-left', 'drag-over-right'));
        tab.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('drag-over-left', 'drag-over-right');
            let startIdx = parseInt(e.dataTransfer.getData('text/plain'));
            let targetIdx = parseInt(e.currentTarget.getAttribute('data-index'));
            const rect = e.currentTarget.getBoundingClientRect();
            const isAfter = e.clientX >= (rect.left + rect.width / 2);
            let insertIndex = isAfter ? targetIdx + 1 : targetIdx;
            if (startIdx < insertIndex) insertIndex--;
            if (startIdx !== insertIndex) {
                const draggedItem = openFiles.splice(startIdx, 1)[0];
                openFiles.splice(insertIndex, 0, draggedItem);
                renderTabs();
            }
        });
        tab.addEventListener('dragend', () => { tabElements.forEach(t => { t.classList.remove('dragging', 'drag-over-left', 'drag-over-right'); }); });
    });
}

function renderEditorContent() {
    if (activeFile && vfs[activeFile] !== undefined) {
        mainCanvas.classList.add('has-file');
        editorElement.value = vfs[activeFile];
    } else {
        mainCanvas.classList.remove('has-file');
        editorElement.value = '';
    }
}

// ==========================================
// VFS LADEN (ZIP ODER DEFAULT)
// ==========================================
async function loadDefaultProject() {
    hideAllMenus();
    
    let confirmed = await openModal({ 
        title: dictionary['menu_file_load_default'][currentLang], 
        message: dictionary['prompt_new_project_warn'][currentLang], 
        type: 'confirm', 
        danger: true 
    });
    
    if (confirmed) {
        await fetchAndLoadZip();
    }
}

async function fetchAndLoadZip() {
    logToConsole("Versuche 'template.zip' vom Server zu laden...");
    
    // WICHTIG: Setze das Block-Modell auf den Standard zurück!
    appModel = getDefaultAppModel();
    
    try {
        const response = await fetch('template.zip');
        if (!response.ok) throw new Error("Status " + response.status);
        
        const blob = await response.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(blob);
        
        vfs = {};
        let paths = [];
        for (let [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (relativePath.startsWith('__MACOSX') || zipEntry.dir) continue;
            vfs[relativePath] = await zipEntry.async("text");
            paths.push(relativePath);
        }
        logToConsole(`Erfolgreich geladen: ${paths.length} Dateien aus ZIP.`);
        renderFileTreeFromPaths(paths);
    } catch (e) {
        logToConsole(`Keine template.zip gefunden (${e.message}). Lade Standard-Dummy-Projekt.`, true);
        vfs = {
            "MyApplication/src/main/AndroidManifest.xml": "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <application android:label=\"MyApplication\">\n        <activity android:name=\".MainActivity\">\n        </activity>\n    </application>\n</manifest>",
            "MyApplication/src/main/java/com/example/myapplication/MainActivity.kt": generateKotlinCode(),
            "MyApplication/build.gradle.kts": "plugins {\n    alias(libs.plugins.android.application)\n    alias(libs.plugins.jetbrains.kotlin.android)\n}\n\nandroid {\n    namespace = \"com.example.myapplication\"\n    compileSdk = 34\n}"
        };
        renderFileTreeFromPaths(Object.keys(vfs));
    }

    if (!document.getElementById('btn-files').classList.contains('active')) {
        toggleLeftPanel('files');
    }

    // Standard-Aktion nach dem Laden: MainActivity im Block-Editor öffnen
    const mainActivityPath = Object.keys(vfs).find(k => k.endsWith('MainActivity.kt'));
    if (mainActivityPath) {
        openFiles = [mainActivityPath];
        activeFile = mainActivityPath;
        
        // Alle Views (inklusive Code und Emulator) frisch synchronisieren
        updateAllViews();
        
        setEditorMode('block'); // Aktiviert den Block-Modus & zeichnet den Block Editor
    } else {
        openFiles = [];
        activeFile = null;
        updateAllViews();
        renderTabs();
        renderEditorContent();
    }
}

function renderFileTreeFromPaths(paths) {
    const root = {};
    paths.forEach(path => {
        const parts = path.split('/');
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) current[part] = path;
            else { current[part] = current[part] || {}; current = current[part]; }
        }
    });

    function buildHtml(nodeObj, isRoot = false) {
        const ul = document.createElement('ul');
        if (isRoot) ul.style.marginLeft = '0';
        
        const keys = Object.keys(nodeObj).sort((a, b) => {
            const isDirA = typeof nodeObj[a] === 'object';
            const isDirB = typeof nodeObj[b] === 'object';
            if (isDirA && !isDirB) return -1;
            if (!isDirA && isDirB) return 1;
            return a.localeCompare(b);
        });

        keys.forEach(key => {
            const val = nodeObj[key];
            if (typeof val === 'object') {
                const details = document.createElement('details');
                details.className = 'folder';
                if (isRoot) details.open = true;
                details.innerHTML = `<summary><span class="folder-icon">${SVG_FOLDER_CLOSED}${SVG_FOLDER_OPEN}</span> <span class="item-name">${key}</span></summary>`;
                details.appendChild(buildHtml(val));
                ul.appendChild(details);
            } else {
                const li = document.createElement('li');
                li.className = 'file-item';
                li.onclick = function() { openFileByNode(this); };
                li.innerHTML = `${SVG_FILE} <span class="item-name">${key}</span>`;
                ul.appendChild(li);
            }
        });
        return ul;
    }

    document.getElementById('fileTree').innerHTML = '';
    document.getElementById('fileTree').appendChild(buildHtml(root, true));
}