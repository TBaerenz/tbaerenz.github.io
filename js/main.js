// ==========================================
// SYNCHRONISATION
// ==========================================
function updateAllViews() {
    renderBlockEditor();      
    renderEmulator();         
    syncKotlinCodeToVFS();    
}

// ==========================================
// SYSTEM START
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Initiales Update des JSON Models
    updateAllViews();
    
    // Projekt automatisch laden (ohne Warnung beim App-Start)
    fetchAndLoadZip();
    
    // Live-Update des Dateisystems bei Eingaben im Texteditor
    document.getElementById('codeEditor').addEventListener('input', (e) => {
        if (activeFile) {
            vfs[activeFile] = e.target.value;
        }
    });
});