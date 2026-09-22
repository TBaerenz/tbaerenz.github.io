// ==========================================
// SYSTEM START
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Projekt automatisch laden (ohne Warnung beim App-Start). 
    // fetchAndLoadZip wird das Standard-Projekt (inkl. Button, Input, Logic) laden, 
    // da template.zip lokal nicht existiert. Danach ruft es updateAllViews() auf 
    // und wechselt in den Block-Editor-Modus.
    if (typeof window.fetchAndLoadZip === 'function') {
        window.fetchAndLoadZip();
    } else if (typeof window.updateAllViews === 'function') {
        // Fallback falls fetchAndLoadZip aus irgendeinem Grund fehlt
        window.updateAllViews();
    }
    
    // Live-Update des Dateisystems bei Eingaben im reinen Code Texteditor
    document.getElementById('codeEditor').addEventListener('input', (e) => {
        if (activeFile) {
            vfs[activeFile] = e.target.value;
        }
    });
});