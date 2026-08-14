// version:19.4 - Added slider protection & profile import/export

// ===== Protocol Switch Domains =====
// HTTP-Version der Seite (ohne trailing slash)
const PROTOCOL_HTTP_DOMAIN  = "http://braineebug.github.io";
// HTTPS-Version der Seite (ohne trailing slash)
const PROTOCOL_HTTPS_DOMAIN = "https://braineebug.github.io";
// =====================================

let client=null;
// Internal variables for URL-based connection
let currentBroker = null;
let currentUser = "";
let currentPass = "";
let currentTopic = "";

// ===== Manual Connection Setup (Fallback/Override zu den URL-Hash-Parametern) =====
// Speichert ip/mqtt_WSPort/mqtt_Topic/mqtt_User/mqtt_Pass im localStorage, damit die
// Verbindung auch ohne (oder abweichend von) URL-Parametern konfiguriert werden kann.
const CONN_STORAGE_KEY = 'vcloud_manual_connection';

function loadManualConnection() {
    try {
        return JSON.parse(localStorage.getItem(CONN_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Exportiert NUR die manuellen Connection-Settings (ip/port/topic/user/pass) als
// eigene JSON-Datei - unabhaengig vom Profil-Export weiter unten.
function exportConnectionSettings() {
    const conn = loadManualConnection();
    const hasAny = Object.values(conn).some(v => v);

    if (!hasAny) {
        log("⚠️ No manual connection settings saved yet! Use 'Manual Connection Setup' first.");
        return;
    }

    const exportConn = { ...conn, mqtt_Port: "1883", mqtt_mode: "1" };

    const dataStr = JSON.stringify(exportConn, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vcloud_connection_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    log("✅ Connection settings exported!");
}

// Importiert eine mit exportConnectionSettings() erzeugte Datei zurueck in den
// manuellen Connection-Override. Komplett getrennt vom normalen Profil-Import -
// eine normale Profil-Datei (mit "profiles"/"config") wird hier abgelehnt, damit
// nichts falsch interpretiert wird.
function importConnectionSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = JSON.parse(event.target.result);

                if (!data || typeof data !== 'object' || Array.isArray(data) || 'profiles' in data) {
                    throw new Error("This doesn't look like a connection-settings file (looks like a profile export instead)");
                }

                const conn = {
                    ip: (data.ip || '').toString().trim(),
                    mqtt_WSPort: (data.mqtt_WSPort || '').toString().trim(),
                    mqtt_Topic: (data.mqtt_Topic || '').toString().trim(),
                    mqtt_User: (data.mqtt_User || '').toString().trim(),
                    mqtt_Pass: (data.mqtt_Pass || '').toString().trim()
                };

                const hasAny = Object.values(conn).some(v => v);
                if (!hasAny) throw new Error("File contains no usable connection values");

                localStorage.setItem(CONN_STORAGE_KEY, JSON.stringify(conn));
                log("✅ Connection settings imported!");

                // Panel ggf. offen -> Felder direkt aktualisieren, dann neu verbinden
                const panel = document.getElementById('connSetupPanel');
                if (panel && panel.style.display !== 'none') {
                    document.getElementById('connIp').value = conn.ip;
                    document.getElementById('connPort').value = conn.mqtt_WSPort;
                    document.getElementById('connTopic').value = conn.mqtt_Topic;
                    document.getElementById('connUser').value = conn.mqtt_User;
                    document.getElementById('connPass').value = conn.mqtt_Pass;
                }
                initializeServerSelect();
                selectServer();
            } catch (err) {
                log("❌ Connection import failed: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
const _atStored = localStorage.getItem('vcloud_auto_transmit');
let autoTransmitEnabled = _atStored === null ? true : _atStored === '1';

// ===== Server & Cloud Profile System =====
let serverDefaultProfiles = []; // Loaded from default_profiles.json
let serverUserProfiles = [];   // Loaded from user_profiles.json

const hkeyOptions = [
  ["", "Disabled"], ["{HOME}", "HOME"], ["{END}", "END"], ["{INSERT}", "INS"], ["{DELETE}", "DELETE"], ["{PGUP}", "PageUp"], ["{PGDN}", "PageDown"], ["{TAB}", "TAB"], ["{PRINTSCREEN}", "Print Screen"],
  ["{ESCAPE}", "ESCAPE"], ["{UP}", "Up arrow"], ["{DOWN}", "Down arrow"], ["{LEFT}", "Left arrow"], ["{RIGHT}", "Right arrow"], ["{SPACE}", "SPACE"], ["{ENTER}", "ENTER"], ["{BACKSPACE}", "BACKSPACE"],
  ["{F1}", "F1"], ["{F2}", "F2"], ["{F3}", "F3"], ["{F4}", "F4"], ["{F5}", "F5"], ["{F6}", "F6"], ["{F7}", "F7"], ["{F8}", "F8"], ["{F9}", "F9"], ["{F10}", "F10"], ["{F11}", "F11"], ["{NUMLOCK}", "NUMLOCK"],
  ["{CAPSLOCK}", "CAPSLOCK"], ["{SCROLLLOCK}", "SCROLLLOCK"], ["{PAUSE}", "PAUSE"], ["{NUMPAD0}", "Numpad 0"], ["{NUMPAD1}", "Numpad 1"], ["{NUMPAD2}", "Numpad 2"], ["{NUMPAD3}", "Numpad 3"],
  ["{NUMPAD4}", "Numpad 4"], ["{NUMPAD5}", "Numpad 5"], ["{NUMPAD6}", "Numpad 6"], ["{NUMPAD7}", "Numpad 7"], ["{NUMPAD8}", "Numpad 8"], ["{NUMPAD9}", "Numpad 9"], ["{NUMPADMULT}", "Numpad Multiply"],
  ["{NUMPADADD}", "Numpad Add"], ["{NUMPADSUB}", "Numpad Subtract"], ["{NUMPADDIV}", "Numpad Divide"]
];

const ukeyOptions = [
			["", "▄︻デ══━一💥"], ["00", "👾AlwaysON👾"], ["01", "Left Mouse Button"], ["02", "Right Mouse Button"], ["03", "Control-break processing"], ["04", "Middle Mouse Button"],
			["05", "X1 Mouse Button"], ["06", "X2 Mouse Button"], ["08", "Backspace"], ["09", "Tab"], ["0C", "Clear"], ["0D", "Enter"], ["10", "Shift"], ["11", "Ctrl"], ["12", "Alt"],
			["13", "Pause"], ["14", "Caps Lock"], ["15", "IME Kana mode"], ["16", "IME On"], ["17", "IME Junja mode"], ["18", "IME Final mode"], ["19", "IME Hanja mode"], ["1A", "IME Off"],
			["1B", "Esc"], ["1C", "IME convert"], ["1D", "IME nonconvert"], ["1E", "IME accept"], ["1F", "IME mode change request"], ["20", "Space"], ["21", "Page Up"], ["22", "Page Down"],
			["23", "End"], ["24", "Home"], ["25", "Left Arrow"], ["26", "Up Arrow"], ["27", "Right Arrow"], ["28", "Down Arrow"], ["29", "Select"], ["2A", "Print"], ["2B", "Execute"],
			["2C", "Print Screen"], ["2D", "Insert"], ["2E", "Delete"], ["2F", "Help"], ["30", "0"], ["31", "1"], ["32", "2"], ["33", "3"], ["34", "4"], ["35", "5"], ["36", "6"], ["37", "7"],
			["38", "8"], ["39", "9"], ["41", "A"], ["42", "B"], ["43", "C"], ["44", "D"], ["45", "E"], ["46", "F"], ["47", "G"], ["48", "H"], ["49", "I"], ["4A", "J"], ["4B", "K"], ["4C", "L"],
			["4D", "M"], ["4E", "N"], ["4F", "O"], ["50", "P"],	["51", "Q"], ["52", "R"], ["53", "S"], ["54", "T"],	["55", "U"], ["56", "V"], ["57", "W"], ["58", "X"],	["59", "Y"], ["5A", "Z"],
			["5B", "Left Windows"], ["5C", "Right Windows"], ["5D", "Applications"], ["5F", "Computer Sleep"], ["60", "Numpad 0"], ["61", "Numpad 1"], ["62", "Numpad 2"], ["63", "Numpad 3"],
			["64", "Numpad 4"],	["65", "Numpad 5"], ["66", "Numpad 6"], ["67", "Numpad 7"], ["68", "Numpad 8"],	["69", "Numpad 9"], ["6A", "Multiply"], ["6B", "Add"], ["6C", "Separator"],
			["6D", "Subtract"], ["6E", "Decimal"], ["6F", "Divide"], ["70", "F1"], ["71", "F2"], ["72", "F3"], ["73", "F4"], ["74", "F5"], ["75", "F6"], ["76", "F7"], ["77", "F8"], ["78", "F9"],
			["79", "F10"], ["7A", "F11"], ["7B", "F12"], ["7C", "F13"], ["7D", "F14"], ["7E", "F15"], ["7F", "F16"], ["80", "F17"], ["81", "F18"], ["82", "F19"], ["83", "F20"], ["84", "F21"],
			["85", "F22"], ["86", "F23"], ["87", "F24"], ["90", "Num Lock"], ["91", "Scroll Lock"], ["92", "OEM specific"], ["93", "OEM specific"], ["94", "OEM specific"], ["95", "OEM specific"],
			["96", "OEM specific"], ["A0", "Left Shift"], ["A1", "Right Shift"], ["A2", "Left Control"], ["A3", "Right Control"], ["A4", "Left Menu"], ["A5", "Right Menu"], ["A6", "Browser Back"],
			["A7", "Browser Forward"], ["A8", "Browser Refresh"], ["A9", "Browser Stop"], ["AA", "Browser Search"], ["AB", "Browser Favorites"], ["AC", "Browser Start and Home"],["AD", "Volume Mute"],
			["AE", "Volume Down"], ["AF", "Volume Up"], ["B0", "Next Track"], ["B1", "Previous Track"], ["B2", "Stop Media"], ["B3", "Play/Pause Media"], ["B4", "Start Mail"], ["B5", "Select Media"],
			["B6", "Start Application 1"], ["B7", "Start Application 2"], ["BA", "OEM 1"], ["BB", "OEM Plus"], ["BC", "OEM Comma"], ["BD", "OEM Minus"], ["BE", "OEM Period"], ["BF", "OEM 2"],
			["C0", "OEM 3"], ["DB", "OEM 4"], ["DC", "OEM 5"], ["DD", "OEM 6"], ["E2", "OEM 102"]
			];
const skeyOptions = [
	["", "❌ Disabled"], ["<", "(DE1/GER) < Working100%"], ["OEM_102", "(DE2/GER_RAW) <"], ["`", "(INT1) ` UserTested!"], ["'", "(INT2) ' UserTested!"],  ["SPACE", "SPACE"], ["ENTER", "ENTER main keyboard"], ["ALT", "ALT"], ["BACKSPACE", "BACKSPACE"], ["DELETE", "DELETE"],
    ["UP", "Up arrow"], ["DOWN", "Down arrow"], ["LEFT", "Left arrow"], ["RIGHT", "Right arrow"], ["HOME", "HOME"], ["END", "END"], ["ESCAPE", "ESCAPE"], ["INSERT", "INS"], ["PGUP", "PageUp"], ["PGDN", "PageDown"],
    ["F1", "Function key F1"], ["F2", "Function key F2"], ["F3", "Function key F3"], ["F5", "Function key F5"], ["F6", "Function key F6"], ["F7", "Function key F7"], ["F8", "Function key F8"],
	["F9", "Function key F9"], ["F10", "Function key F10"], ["F12", "Function key F12"], ["PAUSE", "PAUSE"]
];
const orderedKeys = [
        "V1", "V2", "V3", "V4", "V5", 
        "V6", "V7", "V8",
        "V9", "V10", "V11", "V12", "V13", "V14",
        "V15", "V16", "V17", "V18",
        "V19", "V20", "V21", "V22", "V23",
        "V24", "V25",
        "V26", "V27", "V28", "V29", "V30", "V31", "V32",
        "V33", "V34", "V35", "V36", "V37", "V38",
        "V39", "V40", "V41", "V42", "V43",
        "V44", "V45", "V46", "V47"
];

// Momentary "Switch"-Settings (Quick-Buttons: Runtime On/Off, Shutdown Loader,
// Woofer/Pixel/TS3Connect/Screensaver-Test, HelpMe, ChangeLog). Frueher ueber
// die "_sw"-Namenskonvention erkannt (start_stop_sw, ...) -> seit dem Vxx-
// Umbau brauchen wir dafuer eine explizite Liste, da V1-V8 keinen Suffix mehr haben.
const swKeys = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];

// Default configuration (frozen to prevent accidental changes)
const defaultConfig = Object.freeze({
V1:0, V2:0, V3:0, V4:0, V5:0, V6:0, V7:0, V8:0,
V9:1, V10:30, V11:"scr", V12:0, V13:0, V14:4, V15:0, V16:"", V17:245, V18:95,
V19:125, V20:45, V21:40, V22:4, V23:50, V24:0, V25:0, V26:1, V27:1, V28:1, V29:"", V30:1, V31:1,
V32:"{DELETE}", V33:"DEFAULT", V34:"10", V35:"01", V36:"<", V37:"{INSERT}", V38:"{END}",
V39:2, V40:2, V41:2, V42:-6, V43:"00000000", V44:"Beep", V45:30, V46:25, V47:25
});

let configObj = {...defaultConfig};

const settingLabels = {
    V9: "Stealth Mode", V12: "Loading Music", V13: "Ignore Woofer",
    V14: "CPU Priority", V15: "Ignore Resolution Check", V26: "Anti AFK", V27: "SSP/AC-FIX",
    V28: "Active Visual Profile", V30: "Input Handling", V31: "AutoPistol (mPROXY/AP)",
    V33: "Trigger Mode", V37: "Main ON/OFF hKey", V16: "CFG-Reload hKey",
    V29: "Viewport Tgl hKey", V32: "Autopistol Tgl hKey", V38: "Delay Tgl hKey",
    V34: "Trigger uKey", V35: "User (Shoot_uKey)", V36: "Game (Shoot_sKey)",
    V44: "Feedback Mode", V46: "HeadSENS", V47: "BodySENS", sense_master: "MasterSENS", V45: "SoundVol",
    V10: "Screensaver Time", V17: "Duration (ms)", V18: "Delay (ms)",
    V19: "Dur.-Tgl (ms)", V20: "Delay-Tgl (ms)", V21: "mPROXY/AP Delay (ms)", V22: "Field of View",
    V23: "AAI-Ratio (%)", V24: "BrainAssist (Magnet)", V25: "Pre-Delay (ms)", V1: "Runtime On/Off", V2: "Shutdown Loader",
    V3: "Woofer (PC)", V4: "Pixel Test (PC)", V5: "TS3Connect (PC)",
    V6: "Screensaver Test (PC)",
    V7: "HelpMe", V8: "ChangeLog",
    V11: "Runtime Filetype",
    V39: "Top Offset", V40: "Left Offset", V41: "Right Offset", V42: "Bottom Offset",
    V43: "QuickBot Color (00000000=Setup)"
};

const settingMeta = {
  V9:{type:"select",values:[0,1,2,3,4],labels:["⚠️OFF⚠️","ON_ReLoad","FLASH_ReLoad","ON_Single","FLASH_Single"]},
  V12:{type:"select",values:[0,1,2,3,4,5,6,7,8],labels:["OFF","DrEAmInG","TrIbAl","GlItCh","DaRk","BAttLe","SyS","AmbiX","DnBrAiN"]},
  V13:{type:"select",values:[0,1],labels:["OFF","ON"]},
  V15:{type:"select",values:[0,1],labels:["OFF","ON"]},
  V26:{type:"select",values:[0,1],labels:["OFF","ON"]},
  V27:{type:"select",values:[0,1],labels:["OFF","ON"]},
  V28:{type:"select",values:[1,0],labels:["Default","User"]},
  V30:{type:"select",values:[0,1],labels:["None (2Key)","mPROXY (1Key)"]},
  V31:{type:"select",values:[0,1],labels:["OFF","ON"]},
  V33:{type:"select",values:["DEFAULT","DEFAULT_PM","QB","DEBUG","TESTMODE"], labels: ["VAL","VAL+Playmode","QuickBot","Debug (no features)","TestMode (VAL)"]},
  V11: {type: "select", values: ["random","scr","tmp","exe"], labels: ["Random","Screensaver","Tempfile","Executable"]},
  V44:{type:"select",values:["Beep","Voice","Both","Muted"], labels: ["Beep","Voice","Both","Muted"]},
  V14:{type:"select",values:[0,1,2,3,4],labels:["Lowest","Below Normal","Normal","Above Normal","Highest"]},
  V10:{type:"select",values:[0,1,5,15,30,60,90,120,180],labels:["OFF","1 min","5 min","15 min","30 min","1 hour","1.5 hours","2 hours","3 hours"]},
  V45:{type:"range",min:0,max:100,step:1},
  V46:{type:"range",min:0,max:100,step:1},
  V47:{type:"range",min:0,max:100,step:1},
  sense_master:{type:"range",min:0,max:100,step:1,isMaster:true},
  V17:{type:"range",min:0,max:1000,step:1},
  V18:{type:"range",min:0,max:1000,step:1},
  V19:{type:"range",min:0,max:1000,step:1},
  V20:{type:"range",min:0,max:1000,step:1},
  V21:{type:"range",min:0,max:1000,step:1},
  V22:{type:"range",min:1,max:20,step:1},
  V23:{type:"range",min:0,max:100,step:1},
  V24:{type:"select",values:[0,1,2],labels:["OFF","SOFT","HARD (use low timings)"]},
  V25:{type:"range",min:0,max:100,step:1},
  V39:{type:"text"},
  V40:{type:"text"},
  V41:{type:"text"},
  V42:{type:"text"},
  V43:{type:"colorpicker"},
  V29:{type:"hkeyselect"},
  V32:{type:"hkeyselect"},
  V38:{type:"hkeyselect"},
  V37:{type:"hkeyselect"},
  V16:{type:"hkeyselect"},
  V34:{type:"ukeyselect"},
  V35:{type:"ukeyselect_single"},
  V36:{type:"skeyselect"},
  shoottest_sw:{type:"button"},
  mousetest_sw:{type:"button"}
};

// ===== Loading Music Radio Player =====
// Basis-URL anpassen, falls die Tracks woanders liegen
const MUSIC_BASE_URL = "pub_ext/loading_music/";

// Tracks werden automatisch aus dem V12 Dropdown übernommen
// (Titel aus settingMeta.labels, Dateiname = Wert.mp3, z.B. 1.mp3, 2.mp3 ...)
const musicTracks = settingMeta.V12.values
    .map((v, i) => ({ value: v, name: settingMeta.V12.labels[i], file: `${v}.mp3` }))
    .filter(t => t.value !== 0); // OFF überspringen

let musicPlayerAudio = null;
let musicPlayerCurrentValue = null;
let radioLoopEnabled = false;

function ensureAudio() {
    if (!musicPlayerAudio) {
        musicPlayerAudio = new Audio();
        musicPlayerAudio.onended = handleTrackEnded;
    }
    return musicPlayerAudio;
}

function handleTrackEnded() {
    if (radioLoopEnabled) {
        playNextTrack();
    } else {
        stopMusic();
    }
}

function playTrack(track) {
    const audio = ensureAudio();
    audio.src = MUSIC_BASE_URL + track.file;
    audio.currentTime = 0;
    audio.play().catch(() => log(`⚠️ Could not load track "${track.name}"`));
    musicPlayerCurrentValue = track.value;
    highlightPlayingRow(track.value);
    updateTransportUI();
}

function stopMusic() {
    if (musicPlayerAudio) musicPlayerAudio.pause();
    musicPlayerCurrentValue = null;
    highlightPlayingRow(null);
    updateTransportUI();
}

function playNextTrack() {
    const idx = musicTracks.findIndex(t => t.value === musicPlayerCurrentValue);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % musicTracks.length;
    playTrack(musicTracks[nextIdx]);
}

function playPrevTrack() {
    const idx = musicTracks.findIndex(t => t.value === musicPlayerCurrentValue);
    const prevIdx = idx === -1 ? 0 : (idx - 1 + musicTracks.length) % musicTracks.length;
    playTrack(musicTracks[prevIdx]);
}

function highlightPlayingRow(value) {
    document.querySelectorAll('.music-track-row').forEach(row => {
        row.classList.remove('playing');
        const btn = row.querySelector('.btn-music-play');
        if (btn) btn.textContent = '▶️';
    });
    if (value !== null) {
        const row = document.getElementById(`musicRow_${value}`);
        if (row) {
            row.classList.add('playing');
            const btn = row.querySelector('.btn-music-play');
            if (btn) btn.textContent = '⏸️';
        }
    }
}

function updateTransportUI() {
    const playPauseBtn = document.getElementById('radioPlayPauseBtn');
    const nowPlaying = document.getElementById('radioNowPlaying');
    if (!playPauseBtn) return;
    const isPlaying = musicPlayerAudio && !musicPlayerAudio.paused;
    playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
    if (nowPlaying) {
        const track = musicTracks.find(t => t.value === musicPlayerCurrentValue);
        nowPlaying.textContent = track ? `Now Playing: ${track.name}` : 'Nothing playing';
    }
}

function openMusicPlayer() {
    if (document.getElementById('musicPlayerModal')) {
        document.getElementById('musicPlayerModal').style.display = 'flex';
        updateTransportUI();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'musicPlayerModal';
    overlay.className = 'music-player-overlay';

    const box = document.createElement('div');
    box.className = 'music-player-box';

    const header = document.createElement('div');
    header.className = 'music-player-header';
    const title = document.createElement('span');
    title.textContent = '📻 Loading-Music Radio';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close';
    closeBtn.textContent = '×';
    closeBtn.onclick = closeMusicPlayer;
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // Transport controls
    const transport = document.createElement('div');
    transport.className = 'music-transport';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-transport';
    prevBtn.textContent = '⏮️';
    prevBtn.title = 'Previous track';
    prevBtn.onclick = playPrevTrack;

    const playPauseBtn = document.createElement('button');
    playPauseBtn.id = 'radioPlayPauseBtn';
    playPauseBtn.className = 'btn-transport';
    playPauseBtn.textContent = '▶️';
    playPauseBtn.title = 'Play/Pause';
    playPauseBtn.onclick = () => {
        if (musicPlayerAudio && !musicPlayerAudio.paused) {
            stopMusic();
        } else if (musicPlayerCurrentValue !== null) {
            const track = musicTracks.find(t => t.value === musicPlayerCurrentValue);
            if (track) playTrack(track); else playNextTrack();
        } else {
            playNextTrack();
        }
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-transport';
    nextBtn.textContent = '⏭️';
    nextBtn.title = 'Next track';
    nextBtn.onclick = playNextTrack;

    const loopBtn = document.createElement('button');
    loopBtn.id = 'radioLoopBtn';
    loopBtn.className = 'btn-transport' + (radioLoopEnabled ? ' active' : '');
    loopBtn.textContent = '🔁';
    loopBtn.title = 'Radio loop (auto-advance to next track)';
    loopBtn.onclick = () => {
        radioLoopEnabled = !radioLoopEnabled;
        loopBtn.classList.toggle('active', radioLoopEnabled);
    };

    transport.appendChild(prevBtn);
    transport.appendChild(playPauseBtn);
    transport.appendChild(nextBtn);
    transport.appendChild(loopBtn);
    box.appendChild(transport);

    const nowPlaying = document.createElement('div');
    nowPlaying.id = 'radioNowPlaying';
    nowPlaying.className = 'music-now-playing';
    nowPlaying.textContent = 'Nothing playing';
    box.appendChild(nowPlaying);

    const list = document.createElement('div');
    list.className = 'music-track-list';

    musicTracks.forEach(track => {
        const row = document.createElement('div');
        row.className = 'music-track-row';
        row.id = `musicRow_${track.value}`;

        const label = document.createElement('span');
        label.className = 'music-track-name';
        label.textContent = track.name;
        label.onclick = () => playTrack(track);

        const playBtn = document.createElement('button');
        playBtn.className = 'btn-music-play';
        playBtn.textContent = '▶️';
        playBtn.onclick = () => {
            if (musicPlayerCurrentValue === track.value && musicPlayerAudio && !musicPlayerAudio.paused) {
                stopMusic();
            } else {
                playTrack(track);
            }
        };

        row.appendChild(label);
        row.appendChild(playBtn);
        list.appendChild(row);
    });

    box.appendChild(list);

    const hint = document.createElement('small');
    hint.className = 'music-player-hint';
    hint.textContent = '🔁 enables endless radio mode (auto-plays the next track). Dropdown selection stays independent of this.';
    box.appendChild(hint);

    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) closeMusicPlayer(); };
    document.body.appendChild(overlay);

    highlightPlayingRow(musicPlayerCurrentValue);
    updateTransportUI();
}

function closeMusicPlayer() {
    // Player läuft im Hintergrund weiter (Radio-Modus) - nur Modal verstecken, nicht stoppen
    const overlay = document.getElementById('musicPlayerModal');
    if (overlay) overlay.style.display = 'none';
}

function addImportExportButtons() {
    // Check if buttons already exist
    if (document.getElementById('importExportDiv')) return;
    
    const importExportDiv = document.createElement('div');
    importExportDiv.id = 'importExportDiv';
    importExportDiv.style.marginBottom = '15px';
    importExportDiv.style.display = 'flex';
    importExportDiv.style.gap = '8px';
    importExportDiv.style.flexWrap = 'wrap';
    
    const exportAllBtn = document.createElement('button');
    exportAllBtn.textContent = '📥 Export All';
    exportAllBtn.style.flex = '1';
    exportAllBtn.style.fontSize = '12px';
    exportAllBtn.onclick = exportAllProfiles;

    const exportCurrentBtn = document.createElement('button');
    exportCurrentBtn.textContent = '💾 Export Current';
    exportCurrentBtn.style.flex = '1';
    exportCurrentBtn.style.fontSize = '12px';
    exportCurrentBtn.onclick = exportCurrentProfile;
    
    const importBtn = document.createElement('button');
    importBtn.textContent = '📤 Import';
    importBtn.style.flex = '1';
    importBtn.style.fontSize = '12px';
	importBtn.style.background = '#3498db';
    importBtn.onclick = importProfiles;
    
    importExportDiv.appendChild(exportAllBtn);
	importExportDiv.appendChild(exportCurrentBtn);
    importExportDiv.appendChild(importBtn);
    
    // Insert before profile row
    const profileCard = document.querySelector('.card');
    const infoStatus = document.getElementById('infoStatus');
    profileCard.insertBefore(importExportDiv, infoStatus);
}

// Entfernt versehentlich eingeschleppte Keys wie "name" und "config" aus dem configObj
function cleanConfig(cfg) {
    const dirty = ['name', 'config'];
    const cleaned = {};
    for (const key of Object.keys(cfg)) {
        if (!dirty.includes(key)) cleaned[key] = cfg[key];
    }
    return cleaned;
}

function exportAllProfiles() {
    const profiles = [];
    let skipped = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key.startsWith("vcloud_profile_")) {
            const profileName = key.replace("vcloud_profile_", "");

            try {
                const cfg = cleanConfig(JSON.parse(localStorage.getItem(key)));
                const hasLegacyKey = Object.keys(cfg).some(k => !(k in defaultConfig));
                if (hasLegacyKey) throw new Error('legacy/unknown key(s) present');
                profiles.push({
                    name: profileName,
                    config: cfg
                });
            } catch (e) {
                console.warn(`⚠️ Corrupt/legacy profile "${profileName}" skipped during export:`, e);
                skipped++;
            }
        }
    }

    if (skipped > 0) {
        log(`⚠️ ${skipped} corrupt profile(s) skipped. Use Reset to clean them up.`);
    }

    if (profiles.length === 0) {
        log("⚠️ No profiles to export!");
        return;
    }

    // Manuelle Connection-Settings werden mit exportiert (rein informativ/als Backup),
    // aber beim Import bewusst NICHT wieder eingelesen (siehe importProfiles()).
    const exportPayload = {
        profiles: profiles,
        connection: loadManualConnection()
    };

    const dataStr = JSON.stringify(exportPayload, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vcloud_profiles_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    log("✅ " + profiles.length + " profile(s) exported!");
}

// Validiert ein importiertes Config-Objekt gegen die bekannten Vxx-Keys aus
// defaultConfig. Alles laeuft auf Vxx-Basis, keine Uebersetzung mehr noetig -
// unbekannte Keys (Tippfehler, Fantasie-Keys) werden verworfen und geloggt.
function sanitizeImportedConfig(cfg) {
    const sanitized = {};
    for (const [key, value] of Object.entries(cfg)) {
        if (key in defaultConfig) {
            sanitized[key] = value;
        } else if (key !== 'name' && key !== 'config') {
            console.warn(`⚠️ Unknown key "${key}" ignored (no matching Vxx entry in defaultConfig)`);
        }
    }
    return sanitized;
}

// Ersetzt configObj vollstaendig statt nur zu mergen: entfernt zuerst jede
// Property, die nicht in defaultConfig steht (Legacy-Keys wie "stealth_mode"
// aus alten localStorage-Stunden ueberleben sonst fuer immer, weil
// Object.assign() nur hinzufuegt/ueberschreibt, aber nie loescht), und
// wendet dann die (bereits sanitisierten) neuen Werte an.
function replaceConfigObj(newValues) {
    Object.keys(configObj).forEach(k => {
        if (!(k in defaultConfig)) delete configObj[k];
    });
    Object.assign(configObj, sanitizeImportedConfig(newValues));
}

function importProfiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                let data = JSON.parse(event.target.result);
                let count = 0;
                let lastName = null;

                // Neuestes Format: { profiles: [ { name, config }, ... ], connection: {...} }
                // Das "connection"-Feld ist bewusst NUR fuer den Export gedacht (Backup) und
                // wird hier absichtlich ignoriert/nicht wieder eingelesen.
                if (data && !Array.isArray(data) && Array.isArray(data.profiles)) {
                    data = data.profiles;
                }

                // Format: Array [ { name, config }, ... ]
                if (Array.isArray(data)) {
                    for (const entry of data) {
                        if (entry.name && entry.config) {
                            localStorage.setItem('vcloud_profile_' + entry.name, JSON.stringify(sanitizeImportedConfig(entry.config)));
                            count++;
                            lastName = entry.name;
                        }
                    }
                }
                // Altes Format (Fallback): { "Name": { config } }
                else if (typeof data === 'object') {
                    for (const [name, config] of Object.entries(data)) {
                        localStorage.setItem('vcloud_profile_' + name, JSON.stringify(sanitizeImportedConfig(config)));
                        count++;
                        lastName = name;
                    }
                }

                if (count === 0) throw new Error("No valid profiles found in file");
                updateProfileList();
                log(`✅ Imported ${count} profile(s)!`);

                // Zuletzt importiertes Profil direkt auswaehlen & anwenden,
                // damit die Einstellungen sofort sichtbar/aktiv sind.
                if (lastName) {
                    const sel = document.getElementById("profileSelect");
                    if (sel) {
                        sel.value = lastName;
                        loadProfile();
                    }
                }
            } catch (err) {
                log("❌ Import failed: " + err.message);
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportCurrentProfile() {
    const profileName = document.getElementById('profileName').value.trim();
    if (!profileName) {
        log("⚠️ Enter a profile name first!");
        return;
    }

    const cfg = { ...configObj };

    const profile = [{
        name: profileName,
        config: cfg
    }];

    const dataStr = JSON.stringify(profile, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vcloud_${profileName}_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log("✅ Profile exported: " + profileName);
}

// ===== NEW: Toggle Auto-Transmit Mode =====
function setAutoTransmitUI(enabled) {
    const btn = document.getElementById('autoTransmitBtn');
    if (!btn) return;
    if (enabled) {
        btn.textContent = 'Autosave';
        btn.style.background = 'linear-gradient(135deg, #27ae60 0%, #229954 100%)';
        btn.style.boxShadow = '0 4px 15px rgba(39, 174, 96, 0.4)';
    } else {
        btn.textContent = 'Hold-to-Save';
        btn.style.background = 'linear-gradient(135deg, #00d2d3 0%, #00a8a9 100%)';
        btn.style.boxShadow = '0 4px 15px rgba(0, 210, 211, 0.4)';
    }
}

function toggleAutoTransmit() {
    autoTransmitEnabled = !autoTransmitEnabled;
    localStorage.setItem('vcloud_auto_transmit', autoTransmitEnabled ? '1' : '0');
    setAutoTransmitUI(autoTransmitEnabled);
    if (autoTransmitEnabled) {
        log("✅ Auto-Mode activated - Changes send automatically!");
    } else {
        log("📡 Manual-Mode - Hold button to send!");
    }
}

// Hold-to-send logic
(function() {
    var holdTimer = null;
    var holdFired = false;
    var HOLD_MS = 500;

    function onDown(e) {
        if (autoTransmitEnabled) {
            // In automode: short tap = toggle to manual
            holdTimer = null;
            holdFired = false;
            return;
        }
        holdFired = false;
        var btn = document.getElementById('autoTransmitBtn');
        btn.style.background = 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)';
        btn.textContent = '📡 Sending...';
        holdTimer = setTimeout(function() {
            holdFired = true;
            sendConfig();
            log("📡 Manual Send triggered!");
            // reset visual after short delay
            setTimeout(function() {
                setAutoTransmitUI(false);
            }, 400);
        }, HOLD_MS);
    }

    function onUp(e) {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (!holdFired) {
            // Short tap
            toggleAutoTransmit();
        } else {
            setAutoTransmitUI(autoTransmitEnabled);
        }
        holdFired = false;
    }

    function onCancel(e) {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (!holdFired) setAutoTransmitUI(autoTransmitEnabled);
        holdFired = false;
    }

    document.addEventListener('DOMContentLoaded', function() {
        var btn = document.getElementById('autoTransmitBtn');
        if (!btn) return;
        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('mouseup', onUp);
        btn.addEventListener('mouseleave', onCancel);
        btn.addEventListener('touchstart', function(e) { e.preventDefault(); onDown(e); }, {passive: false});
        btn.addEventListener('touchend', function(e) { e.preventDefault(); onUp(e); }, {passive: false});
        btn.addEventListener('touchcancel', onCancel);
    });
})();

function log(msg){
    const el=document.getElementById("log");
    if(!el) return;
    const span=el.querySelector("span");
    if(span){
        span.textContent=msg;
        const textWidth=span.offsetWidth;
        const containerWidth=el.offsetWidth;
        const duration=Math.max(5,textWidth/50);
        span.style.animation="none";
        void span.offsetWidth;
        span.style.animation=`scrollLinear ${duration}s linear infinite`;
    }
}

function saveProfile(){
    const name=document.getElementById("profileName").value.trim();
    if(!name){log("⚠️ Enter profile name!"); return;}
    localStorage.setItem("vcloud_profile_"+name, JSON.stringify(cleanConfig(configObj)));
    updateProfileList();
    log("✅ Profile saved: "+name);
}

function loadProfile(){
    const sel=document.getElementById("profileSelect").value;
    if(!sel) return;

    // Default Profile (read-only, from server)
    if (sel.startsWith("__default__")) {
        const name = sel.replace("__default__", "");
        loadServerProfile(name, true);
        return;
    }

    // Cloud Profile
    if (sel.startsWith("__cloud__")) {
        const name = sel.replace("__cloud__", "");
        loadServerProfile(name, false);
        return;
    }

    // Local Profile (localStorage)
    const data = localStorage.getItem("vcloud_profile_" + sel);
    if(!data){log("⚠️ Profile not found!"); return;}

    let parsed;
    try {
        parsed = JSON.parse(data);
    } catch (e) {
        log(`❌ Profile "${sel}" is corrupt and cannot be loaded. Use Reset to clean it up.`);
        console.warn('Corrupt profile:', sel, e);
        return;
    }
    replaceConfigObj(parsed);
    generateSWButtons();
    generateConfigInputs();
    document.getElementById("profileName").value=sel;
    log("✅ Profile loaded: "+sel);
    
    // Auto-Save nach dem Laden eines Profils
    saveLastConfig();
    
    // Auto-Mode: automatisch senden bei Profilwechsel
    if (autoTransmitEnabled) {
        sendConfig();
    }
}

function deleteProfile(){
    const sel=document.getElementById("profileSelect").value;
    if(!sel){log("⚠️ Select a profile first!"); return;}
    if(sel.startsWith("__default__")){log("⚠️ Online-Profiles cannot be deleted!"); return;}
    if(sel.startsWith("__cloud__")){log("⚠️ Cloud-Profiles can only be managed on the server!"); return;}
    if(!confirm("Delete profile: "+sel+"?")){return;}
    localStorage.removeItem("vcloud_profile_"+sel);
    updateProfileList();
    document.getElementById("profileName").value="";
    log("✅ Profile deleted: "+sel);
}

// ===== Server Profile Functions =====
async function loadServerDefaultProfiles() {
    try {
        const res = await fetch('pub_ext/default_profiles.json?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        serverDefaultProfiles = Array.isArray(data) ? data : (data.profiles || []);
        updateProfileList();
        log('✅ Online-Profiles loaded from server (' + serverDefaultProfiles.length + ')');
    } catch (e) {
        console.warn('No default_profiles.json found:', e);
    }
}

async function loadServerUserProfiles() {
    try {
        const res = await fetch('pub_ext/user_profiles.json?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        // Array format: [ { name, config }, ... ] ODER neues Export-Format
        // { profiles: [...], connection: {...} } - "connection" wird hier
        // (wie ueberall sonst beim Import) bewusst nie ausgelesen.
        serverUserProfiles = Array.isArray(data) ? data : (data.profiles || []);
        updateProfileList();
        log('✅ Cloud-Profiles loaded (' + serverUserProfiles.length + ')');
    } catch (e) {
        console.warn('No user_profiles.json found:', e);
    }
}

function loadServerProfile(name, isDefault) {
    let profileData = null;
    if (isDefault) {
        const found = serverDefaultProfiles.find(p => p.name === name);
        if (found) profileData = found.config;
    } else {
        const found = serverUserProfiles.find(p => p.name === name);
        if (found) profileData = found.config;
    }
    if (!profileData) { log('⚠️ Profile not found: ' + name); return; }

    // Online-Profiles: prefill name field for "save as new"
    if (isDefault) {
        document.getElementById('profileName').value = name + ' (copy)';
    } else {
        document.getElementById('profileName').value = name;
    }

    replaceConfigObj(profileData);
    generateSWButtons();
    generateConfigInputs();
    saveLastConfig();
    log('✅ Profile loaded: ' + name + (isDefault ? ' [Default]' : ' [Cloud]'));
    if (autoTransmitEnabled) sendConfig();
}

function updateProfileList(){
    const sel = document.getElementById("profileSelect");
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Select Profile --</option>';

    // Group 1: Online-Profiles from server (read-only)
    if (serverDefaultProfiles.length > 0) {
        const grpDefault = document.createElement("optgroup");
        grpDefault.label = "📦 Online-Profiles";
        serverDefaultProfiles.forEach(p => {
            const opt = document.createElement("option");
            opt.value = "__default__" + p.name;
            opt.textContent = p.name;
            grpDefault.appendChild(opt);
        });
        sel.appendChild(grpDefault);
    }

    // Group 2: Cloud-Profiles from server
    if (serverUserProfiles.length > 0) {
        const grpCloud = document.createElement("optgroup");
        grpCloud.label = "☁️ Cloud-Profiles";
        serverUserProfiles.forEach(p => {
            const opt = document.createElement("option");
            opt.value = "__cloud__" + p.name;
            opt.textContent = p.name;
            grpCloud.appendChild(opt);
        });
        sel.appendChild(grpCloud);
    }

    // Group 3: Local Profiles from localStorage
    const localProfiles = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("vcloud_profile_")) {
            localProfiles.push(key.replace("vcloud_profile_", ""));
        }
    }
    if (localProfiles.length > 0) {
        const grpLocal = document.createElement("optgroup");
        grpLocal.label = "💾 My Profiles";
        localProfiles.forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            grpLocal.appendChild(opt);
        });
        sel.appendChild(grpLocal);
    }

    // Restore selection if still valid
    if (currentVal) sel.value = currentVal;
}

function generateConfigInputs(){
    // FOV Settings (Kreuz-Layout)
    const fovCont = document.getElementById("fovSettings");
    fovCont.innerHTML = "";
    
    // Create offset grid container
    const offsetGridDiv = document.createElement("div");
    offsetGridDiv.className = "offset-grid";
    
    const fovMap = {V39:"top",V40:"left",V41:"right",V42:"bottom"};
    ["V39", "V40", "V41", "V42"].forEach(k => {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = configObj[k];
        inp.placeholder = "0";
        inp.className = `area-${fovMap[k]}`;
        inp.oninput = (e) => {
            configObj[k] = e.target.value;
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
        offsetGridDiv.appendChild(inp);
    });
    
    fovCont.appendChild(offsetGridDiv);
    
    // Add QuickBot ColorProfile field below the offset-container
    // Get the offset-container parent (which is the card content)
    const offsetContainer = fovCont.parentElement;
    const card = offsetContainer.parentElement;
    
    // Remove old colorProfile if exists
    const oldColorProfile = card.querySelector('.color-profile-section');
    if (oldColorProfile) {
        oldColorProfile.remove();
    }
    
    const colorProfileRow = document.createElement("div");
    colorProfileRow.className = "color-profile-section";
    colorProfileRow.style.marginTop = "20px";
    colorProfileRow.style.display = "flex";
    colorProfileRow.style.flexDirection = "column";
    colorProfileRow.style.gap = "8px";
    colorProfileRow.style.width = "100%";
    
    const colorLabel = document.createElement("label");
    colorLabel.textContent = settingLabels.V43 || "QuickBot Color";
    colorLabel.style.fontSize = "14px";
    colorLabel.style.fontWeight = "bold";
    colorLabel.style.color = "#57606f";
    
    // Create container for text input and color picker
    const colorContainer = document.createElement("div");
    colorContainer.style.display = "flex";
    colorContainer.style.gap = "8px";
    colorContainer.style.alignItems = "center";
    
    const colorInput = document.createElement("input");
    colorInput.type = "text";
    colorInput.value = configObj.V43;
    colorInput.placeholder = "00000000";
    colorInput.maxLength = 10;
    colorInput.style.flex = "1";
    colorInput.style.textAlign = "center";
    colorInput.style.fontWeight = "bold";
    colorInput.style.fontFamily = "'Courier New', monospace";
    
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.style.width = "50px";
    colorPicker.style.height = "38px";
    colorPicker.style.border = "2px solid var(--border)";
    colorPicker.style.borderRadius = "4px";
    colorPicker.style.cursor = "pointer";
    colorPicker.title = "Pick a color";
    
    // Image upload button
    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = "📷";
    uploadBtn.title = "Upload image to analyze";
    uploadBtn.style.width = "50px";
    uploadBtn.style.height = "38px";
    uploadBtn.style.padding = "0";
    uploadBtn.style.fontSize = "20px";
    uploadBtn.onclick = (e) => {
        e.preventDefault();
        fileInput.click();
    };
    
    // Hidden file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    
    // Helper function: Convert decimal to #RRGGBB
    const decimalToHtmlColor = (decimal) => {
        const num = parseInt(decimal) || 0;
        // AutoIt decimal format is RGB: Red in high byte, Green in middle, Blue in low byte
        const r = (num >> 16) & 0xFF;
        const g = (num >> 8) & 0xFF;
        const b = num & 0xFF;
        return "#" + 
               r.toString(16).padStart(2, '0') + 
               g.toString(16).padStart(2, '0') + 
               b.toString(16).padStart(2, '0');
    };
    
    // Helper function: Convert #RRGGBB to decimal RGB
    const htmlColorToDecimal = (htmlColor) => {
        const hex = htmlColor.substring(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // AutoIt format: RGB (Red in high byte, Green in middle, Blue in low byte)
        return (r << 16) | (g << 8) | b;
    };
    
    // Flag to prevent recursive updates
    let isUpdating = false;
    
    // Helper function: Update color value from image picker
    const updateColorValue = (r, g, b) => {
        if (isUpdating) return;
        
        isUpdating = true;
        
        // Store in RGB format: (R << 16) | (G << 8) | B
        const rgbDecimal = (r << 16) | (g << 8) | b;
        const colorValue = rgbDecimal.toString().padStart(8, '0');
        
        colorInput.value = colorValue;
        configObj.V43 = colorValue;
        
        // For HTML color picker, use RGB
        const htmlColor = "#" + 
            r.toString(16).padStart(2, '0') + 
            g.toString(16).padStart(2, '0') + 
            b.toString(16).padStart(2, '0');
        colorPicker.value = htmlColor;
        
        // Use setTimeout to reset flag after event loop completes
        setTimeout(() => {
            isUpdating = false;
        }, 100);
        
        if(autoTransmitEnabled) sendConfig();
        saveLastConfig(); // Auto-Save bei Änderung
    };
    
    // Image preview and analysis modal
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Reset file input so the same file can be selected again
        e.target.value = '';
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Create modal for image analysis
                const modal = document.createElement("div");
                modal.style.position = "fixed";
                modal.style.top = "0";
                modal.style.left = "0";
                modal.style.width = "100%";
                modal.style.height = "100%";
                modal.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
                modal.style.zIndex = "10000";
                modal.style.display = "flex";
                modal.style.flexDirection = "column";
                modal.style.alignItems = "center";
                modal.style.justifyContent = "center";
                modal.style.padding = "20px";
                
                const modalContent = document.createElement("div");
                modalContent.style.backgroundColor = "#2f3640";
                modalContent.style.padding = "20px";
                modalContent.style.borderRadius = "12px";
                modalContent.style.maxWidth = "90%";
                modalContent.style.maxHeight = "90%";
                modalContent.style.overflow = "auto";
                
                const title = document.createElement("h3");
                title.textContent = "🎯 Click on the image to pick a color";
                title.style.color = "#00d2d3";
                title.style.marginTop = "0";
                title.style.textAlign = "center";
                
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                // Scale image to fit screen while maintaining aspect ratio
                const maxWidth = window.innerWidth * 0.8;
                const maxHeight = window.innerHeight * 0.7;
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                canvas.style.cursor = "crosshair";
                canvas.style.border = "2px solid #00d2d3";
                canvas.style.borderRadius = "8px";
                canvas.style.maxWidth = "100%";
                canvas.style.height = "auto";
                
                ctx.drawImage(img, 0, 0, width, height);
                
                // Draw center crosshair
                const centerX = width / 2;
                const centerY = height / 2;
                ctx.strokeStyle = "#00d2d3";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(centerX - 20, centerY);
                ctx.lineTo(centerX + 20, centerY);
                ctx.moveTo(centerX, centerY - 20);
                ctx.lineTo(centerX, centerY + 20);
                ctx.stroke();
                
                // Info display
                const infoDiv = document.createElement("div");
                infoDiv.style.marginTop = "15px";
                infoDiv.style.padding = "15px";
                infoDiv.style.backgroundColor = "#1e2227";
                infoDiv.style.borderRadius = "8px";
                infoDiv.style.color = "#00d2d3";
                infoDiv.style.fontFamily = "'Courier New', monospace";
                infoDiv.style.textAlign = "center";
                infoDiv.innerHTML = "Click anywhere or use the center color";
                
                // Get center pixel color
                const scaleX = img.width / width;
                const scaleY = img.height / height;
                const tempCanvas = document.createElement("canvas");
                const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCtx.drawImage(img, 0, 0);
                
                const centerPixel = tempCtx.getImageData(
                    Math.floor(img.width / 2),
                    Math.floor(img.height / 2),
                    1, 1
                ).data;
                
                // Buttons container
                const buttonsDiv = document.createElement("div");
                buttonsDiv.style.marginTop = "15px";
                buttonsDiv.style.display = "flex";
                buttonsDiv.style.gap = "10px";
                buttonsDiv.style.justifyContent = "center";
                
                const useCenterBtn = document.createElement("button");
                useCenterBtn.textContent = "✓ Use Center Color";
                useCenterBtn.style.padding = "10px 20px";
                useCenterBtn.style.fontSize = "14px";
                useCenterBtn.style.backgroundColor = "var(--success)";
                useCenterBtn.onclick = () => {
                    updateColorValue(centerPixel[0], centerPixel[1], centerPixel[2]);
                    document.body.removeChild(modal);
                };
                
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "✗ Cancel";
                cancelBtn.style.padding = "10px 20px";
                cancelBtn.style.fontSize = "14px";
                cancelBtn.style.backgroundColor = "var(--danger)";
                cancelBtn.onclick = () => {
                    document.body.removeChild(modal);
                };
                
                // Canvas click handler for eyedropper
                canvas.onclick = (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const x = Math.floor((e.clientX - rect.left) * scaleX);
                    const y = Math.floor((e.clientY - rect.top) * scaleY);
                    
                    const pixel = tempCtx.getImageData(x, y, 1, 1).data;
                    const r = pixel[0];
                    const g = pixel[1];
                    const b = pixel[2];
                    
                    // Update color immediately
                    updateColorValue(r, g, b);
                    
                    // Close modal immediately after picking color
                    document.body.removeChild(modal);
                    document.removeEventListener("keydown", escHandler);
                };
                
                // Hover effect to show pixel info
                canvas.onmousemove = (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const x = Math.floor((e.clientX - rect.left) * scaleX);
                    const y = Math.floor((e.clientY - rect.top) * scaleY);
                    
                    if (x >= 0 && x < img.width && y >= 0 && y < img.height) {
                        const pixel = tempCtx.getImageData(x, y, 1, 1).data;
                        canvas.title = `RGB: (${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                    }
                };
                
                buttonsDiv.appendChild(useCenterBtn);
                buttonsDiv.appendChild(cancelBtn);
                
                modalContent.appendChild(title);
                modalContent.appendChild(canvas);
                modalContent.appendChild(infoDiv);
                modalContent.appendChild(buttonsDiv);
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
                
                // Close on ESC
                const escHandler = (e) => {
                    if (e.key === "Escape" && document.body.contains(modal)) {
                        document.body.removeChild(modal);
                        document.removeEventListener("keydown", escHandler);
                    }
                };
                document.addEventListener("keydown", escHandler);
                
                // Close on background click
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        document.body.removeChild(modal);
                    }
                };
            };
        };
        reader.readAsDataURL(file);
    };
    
    // Initialize color picker from current value
    if(configObj.V43 && configObj.V43 !== "00000000") {
        colorPicker.value = decimalToHtmlColor(configObj.V43);
    } else {
        colorPicker.value = "#000000";
    }
    
    // Text input handler
    colorInput.oninput = (e) => {
        if (isUpdating) return;
        
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        configObj.V43 = e.target.value;
        
        if(e.target.value.length > 0) {
            colorPicker.value = decimalToHtmlColor(e.target.value);
        }
        
        if(autoTransmitEnabled) sendConfig();
        saveLastConfig(); // Auto-Save bei Änderung
    };
    
    // Color picker handler
    colorPicker.oninput = (e) => {
        if (isUpdating) return;
        
        const decimalValue = htmlColorToDecimal(e.target.value);
        colorInput.value = decimalValue.toString().padStart(8, '0');
        configObj.V43 = decimalValue.toString().padStart(8, '0');
        
        if(autoTransmitEnabled) sendConfig();
        saveLastConfig(); // Auto-Save bei Änderung
    };
    
    colorContainer.appendChild(colorInput);
    colorContainer.appendChild(colorPicker);
    colorContainer.appendChild(uploadBtn);
    colorContainer.appendChild(fileInput);
    
    colorProfileRow.appendChild(colorLabel);
    colorProfileRow.appendChild(colorContainer);
    
    // Insert after the offset-container
    card.insertBefore(colorProfileRow, offsetContainer.nextSibling);
    
    // Main Settings (grouped in rows)
    const main = document.getElementById("mainSettings");
    main.innerHTML = "";
    [
		["V28","V22"],
        ["V31","V21"],			
        ["V24","sense_master"],		
		["V46","V47"],
		["V17","V19"],
        ["V18","V20"],
		["V23","V25"]
    ].forEach(group => {
        const row = document.createElement("div");
        row.className = "setting-row";
        group.forEach(k => row.appendChild(makeField(k)));
        main.appendChild(row);
    });
    
    // Key Settings (grouped in rows)
    const keyss = document.getElementById("keySettings");
    keyss.innerHTML = "";
    [	
        ["V34"],
		["V36"],
        ["V37","V35"],
        ["V38","V32"],
        ["V29","V16"]
    ].forEach(group => {
        const row = document.createElement("div");
        row.className = "setting-row";
        group.forEach(k => row.appendChild(makeField(k)));
        keyss.appendChild(row);
    });
    
    // System Settings
    const other = document.getElementById("configInputs");
    other.innerHTML = "";
    [
		["V33","V30"],
		["V26","V27"],
        ["V9","V11"],
        ["V13","V15"],
		["V14","V10"],		
        ["V44","V12"],
        ["V45"]
    ].forEach(group => {
        const row = document.createElement("div");
        row.className = "setting-row";
        group.forEach(k => row.appendChild(makeField(k)));
        other.appendChild(row);
    });
}

// Helper function to update slider UI elements
function updateSliderUI(sliderKey, newValue) {
    // Find all labels to locate the right slider
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
        const labelTextSpan = label.querySelector('span:first-child');
        if (labelTextSpan && labelTextSpan.textContent === settingLabels[sliderKey]) {
            // Found the right label, now update its input field
            const valueInput = label.querySelector('.range-val-input');
            if (valueInput) {
                valueInput.value = newValue;
            }
            
            // Find the range slider in the same parent
            const container = label.parentElement;
            const rangeInput = container.querySelector('input[type="range"]');
            if (rangeInput) {
                rangeInput.value = newValue;
            }
            break;
        }
    }
}

function makeField(key) {
    const meta = settingMeta[key];
    const label = document.createElement("label");
    
    // Wrap label text in span for better control
    const labelText = document.createElement("span");
    labelText.textContent = settingLabels[key] || key;
    if (key === "V25" && configObj[key] > 0) {
        labelText.style.color = "#e74c3c";
    }
    if (key === "V24" && configObj[key] != 0) {
        labelText.style.color = "#e74c3c";
    }
    if (key === "V23" && configObj[key] == 0) {
        labelText.style.color = "#e74c3c";
    }
    label.appendChild(labelText);

    let input;
    
    if(meta && meta.type === "select") {
        input = document.createElement("select");
        const vals = meta.values;
        const lbls = meta.labels || vals;
        vals.forEach((v, i) => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = lbls[i];
            if(configObj[key] == v) opt.selected = true;
            input.appendChild(opt);
        });
        input.onchange = (e) => {
            const val = e.target.value;
            configObj[key] = isNaN(val) ? val : Number(val);
            if (key === "V24") {
                labelText.style.color = Number(val) !== 0 ? "#e74c3c" : "";
            }
            if (key === "V12") {
                if (musicPlayerAudio && !musicPlayerAudio.paused) {
                    const track = musicTracks.find(t => t.value === Number(val));
                    if (track) playTrack(track); else stopMusic();
                } 
            }
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
    }
    else if(meta && meta.type === "range") {
        // Create manual input field for direct value entry
        const manualInput = document.createElement("input");
        manualInput.type = "number";
        manualInput.className = "range-val-input";
        manualInput.min = meta.min;
        manualInput.max = meta.max;
        manualInput.step = meta.step || 1;
        
        // Special handling for sense_master - show average of both values
        const isMaster = (key === "sense_master");
        if (isMaster) {
            const avgValue = Math.round((configObj.V46 + configObj.V47) / 2);
            manualInput.value = avgValue;
        } else {
            manualInput.value = configObj[key];
        }
        
        // Add manual input to label
        label.appendChild(manualInput);
        
        const wrapper = document.createElement("div");
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        
        input = document.createElement("input");
        input.type = "range";
        input.min = meta.min;
        input.max = meta.max;
        if (isMaster) {
            input.value = Math.round((configObj.V46 + configObj.V47) / 2);
        } else {
            input.value = configObj[key];
        }
        input.step = meta.step || 1; // Default to whole numbers
        input.style.width = '100%';
        input.style.pointerEvents = 'none'; // Disable all pointer events
        
        // Create invisible overlay that captures drag events only
        const overlay = document.createElement("div");
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.cursor = 'pointer';
        overlay.style.zIndex = '1';
        
        let startX = 0;
        let startVal = 0;
        let dragging = false;
        
        const startDrag = (e) => {
            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
            const rect = input.getBoundingClientRect();
            const clickX = clientX - rect.left;
            const percentage = clickX / rect.width;
            const range = meta.max - meta.min;
            const clickValue = Math.round(meta.min + (percentage * range));
            
            // Only start drag if clicking near the current thumb position
            const currentPercentage = (input.value - meta.min) / range;
            const thumbX = currentPercentage * rect.width;
            const distance = Math.abs(clickX - thumbX);
            
            if (distance < 20) { // Within 20px of thumb
                dragging = true;
                startX = clientX;
                startVal = parseInt(input.value);
                e.preventDefault();
            }
        };
        
        const doDrag = (e) => {
            if (!dragging) return;
            
            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
            const rect = input.getBoundingClientRect();
            const deltaX = clientX - startX;
            
            // Reduce sensitivity by factor of 2.5 for finer control
            const dragSensitivity = 0.1;
            const deltaPercent = (deltaX / rect.width) * dragSensitivity;
            
            const range = meta.max - meta.min;
            const step = meta.step || 1;
            const deltaValue = deltaPercent * range;
            
            let newValue = startVal + deltaValue;
            newValue = Math.max(meta.min, Math.min(meta.max, newValue));
            
            // Round to step precision (whole numbers)
            newValue = Math.round(newValue / step) * step;
            
            input.value = newValue;
            
            // Special handling for sense_master - update both V46 and V47
            if (key === "sense_master") {
                configObj.V46 = newValue;
                configObj.V47 = newValue;
                
                // Update the UI of V46 and V47 sliders
                updateSliderUI('V46', newValue);
                updateSliderUI('V47', newValue);
            } else {
                configObj[key] = newValue;
            }
            
            manualInput.value = newValue;
            
            // Predelay: Bezeichnung rot wenn > 0
            if (key === "V25") {
                labelText.style.color = newValue > 0 ? "#e74c3c" : "";
            }
            // AAI-Ratio: Bezeichnung rot wenn == 0
            if (key === "V23") {
                labelText.style.color = newValue == 0 ? "#e74c3c" : "";
            }
            
            // Don't send during drag, only on release
            e.preventDefault();
        };
        
        const endDrag = () => {
            if (dragging && autoTransmitEnabled) {
                // Send config when releasing the slider in auto-transmit mode
                sendConfig();
            }
            if (dragging) {
                saveLastConfig(); // Auto-Save nach Slider-Änderung
            }
            dragging = false;
        };
        
        // Manual input field event handler
        manualInput.addEventListener('input', function() {
            let newValue = Number(this.value);
            
            // Clamp to min/max range
            if (newValue < meta.min) newValue = meta.min;
            if (newValue > meta.max) newValue = meta.max;
            
            // Update the value
            this.value = newValue;
            input.value = newValue;
            
            // Special handling for sense_master
            if (key === "sense_master") {
                configObj.V46 = newValue;
                configObj.V47 = newValue;
                updateSliderUI('V46', newValue);
                updateSliderUI('V47', newValue);
            } else {
                configObj[key] = newValue;
            }
            
            if (autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
            
            // Predelay: Bezeichnung rot wenn > 0
            if (key === "V25") {
                labelText.style.color = newValue > 0 ? "#e74c3c" : "";
            }
            // AAI-Ratio: Bezeichnung rot wenn == 0
            if (key === "V23") {
                labelText.style.color = newValue == 0 ? "#e74c3c" : "";
            }
        });
        
        overlay.addEventListener('mousedown', startDrag);
        overlay.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('touchmove', doDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
        
        wrapper.appendChild(input);
        wrapper.appendChild(overlay);
        
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "12px";
        wrap.appendChild(label);
        wrap.appendChild(wrapper);
        return wrap;
    }
    else if(meta && meta.type === "hkeyselect") {
        // Make label clickable for testing
        labelText.style.cursor = "pointer";
        labelText.style.textDecoration = "underline";
        labelText.style.color = "#00d2d3";
        labelText.title = "Click to test this key";
        labelText.onclick = () => {
            testKey(key, "hkey");
        };
        
        input = document.createElement("select");
        hkeyOptions.forEach(([val, lbl]) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = lbl;
            if(configObj[key] === val) opt.selected = true;
            input.appendChild(opt);
        });
        input.onchange = (e) => {
            configObj[key] = e.target.value;
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
    }
else if(meta && meta.type === "ukeyselect") {
    labelText.style.cursor = "pointer";
    labelText.style.textDecoration = "underline";
    labelText.style.color = "#00d2d3";
    labelText.title = "Click to test this key";
    labelText.onclick = () => { testKey(key, "ukey"); };

    const ukeyWrapper = document.createElement("div");
    ukeyWrapper.style.display = "flex";
    ukeyWrapper.style.flexDirection = "column";
    ukeyWrapper.style.gap = "5px";
    ukeyWrapper.style.width = "100%";

    const parseTokens = (raw) => {
        if (!raw) return [];
        return raw.split(",").map(s => s.trim()).filter(Boolean);
    };
    const serializeTokens = (tokens) => tokens.join(",");
    let tokens = parseTokens(configObj[key]);

    // ── Pills ─────────────────────────────────────────────────────────
    const pillRow = document.createElement("div");
    pillRow.style.display = "flex";
    pillRow.style.flexWrap = "wrap";
    pillRow.style.gap = "4px";
    pillRow.style.minHeight = "24px";

    const renderPills = () => {
        pillRow.innerHTML = "";
        if (tokens.length === 0) {
            const empty = document.createElement("span");
            empty.textContent = "—";
            empty.style.color = "#7f8c8d";
            empty.style.fontSize = "12px";
            pillRow.appendChild(empty);
            return;
        }
        tokens.forEach((tok, i) => {
            const pill = document.createElement("span");
            pill.style.background = "#00d2d3";
            pill.style.color = "#1e2227";
            pill.style.borderRadius = "10px";
            pill.style.padding = "2px 8px";
            pill.style.fontSize = "12px";
            pill.style.fontFamily = "'Courier New', monospace";
            pill.style.fontWeight = "bold";
            pill.style.cursor = "pointer";
            pill.title = "Click to remove";
            const display = tok.split("+").map(k => {
                const found = ukeyOptions.find(([v]) => v === k);
                return found ? found[1] : k;
            }).join(" + ");
            pill.textContent = display + " ✕";
            pill.onclick = () => { tokens.splice(i, 1); commit(); renderPills(); };
            pillRow.appendChild(pill);
        });
    };

    const commit = () => {
        configObj[key] = serializeTokens(tokens);
        if (autoTransmitEnabled) sendConfig();
        saveLastConfig();
    };

    // ── Dropdown (volle Breite) ───────────────────────────────────────
    const makeKeySelect = () => {
        const sel = document.createElement("select");
        sel.style.width = "100%";
        ukeyOptions.forEach(([val, lbl]) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = lbl;
            sel.appendChild(opt);
        });
        return sel;
    };

    const select1 = makeKeySelect();
    select1.style.width = "";
    select1.style.flex = "1";
    select1.style.minWidth = "0";

    // Buffer für die aktuell zusammengebaute Combo
    let comboBuffer = [];
    // merkt sich den zuletzt bekannten Dropdown-Wert um Änderungen zu erkennen
    let lastSelected = select1.value;

    // ── Buttons (alle anfangs versteckt) ─────────────────────────────
    const makeBtn = (text, title, bg) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = title;
        b.style.padding = "0";
        b.style.width = "28px";
        b.style.height = "28px";
        b.style.flexShrink = "0";
        b.style.background = bg;
        b.style.border = "none";
        b.style.borderRadius = "4px";
        b.style.cursor = "pointer";
        b.style.color = "white";
        b.style.fontWeight = "bold";
        b.style.fontSize = "13px";
        b.style.display = "none";
        return b;
    };

    const addBtn   = makeBtn("✓", "Key hinzufügen / Combo committen", "linear-gradient(135deg, #27ae60, #229954)");
    const comboBtn = makeBtn("𖦹", "Key zur Combo hinzufügen", "linear-gradient(135deg, #8e44ad, #6c3483)");
    const clearBtn = makeBtn("✕", "Combo-Buffer zurücksetzen", "linear-gradient(135deg, #e74c3c, #c0392b)");

    // Preview-Zeile
    const comboPreview = document.createElement("div");
    comboPreview.style.fontSize = "11px";
    comboPreview.style.color = "#8e44ad";
    comboPreview.style.fontFamily = "'Courier New', monospace";
    comboPreview.style.minHeight = "14px";

    const syncUI = () => {
        const changed = select1.value !== lastSelected || comboBuffer.length > 0;
        // ✓ zeigen wenn Dropdown geändert oder Combo läuft
        addBtn.style.display   = changed ? "inline-block" : "none";
        // +C zeigen wenn Dropdown geändert (zum Combo starten/erweitern)
        comboBtn.style.display = (select1.value !== lastSelected || comboBuffer.length > 0) ? "inline-block" : "none";
        // ✕ nur wenn Buffer gefüllt
        clearBtn.style.display = comboBuffer.length > 0 ? "inline-block" : "none";
        // Preview
        if (comboBuffer.length === 0) {
            comboPreview.textContent = "";
        } else {
            const display = comboBuffer.map(k => {
                const found = ukeyOptions.find(([v]) => v === k);
                return found ? found[1] : k;
            }).join(" + ");
            comboPreview.textContent = "⌨ " + display;
        }
    };

    // Dropdown geändert → Buttons einblenden
    select1.addEventListener("change", () => { syncUI(); });

    // +C: aktuellen Key in Combo-Buffer
    comboBtn.onclick = () => {
        const val = select1.value;
        if (!val || comboBuffer.includes(val)) return;
        comboBuffer.push(val);
        lastSelected = select1.value; // nach combo gilt aktueller wert als "base"
        syncUI();
    };

    // ✓: adden und alles zurücksetzen
    addBtn.onclick = () => {
        const token = comboBuffer.length > 0 ? comboBuffer.join("+") : select1.value;
        if (!token) return;
        if (!tokens.includes(token)) {
            tokens.push(token);
            commit();
            renderPills();
        }
        comboBuffer = [];
        lastSelected = select1.value;
        syncUI();
    };

    // ✕: nur Buffer leeren
    clearBtn.onclick = () => {
        comboBuffer = [];
        syncUI();
    };

    // ── Zeile: Dropdown + Buttons ─────────────────────────────────────
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "4px";
    btnRow.style.alignItems = "center";
    btnRow.appendChild(select1);
    btnRow.appendChild(comboBtn);
    btnRow.appendChild(addBtn);
    btnRow.appendChild(clearBtn);

    ukeyWrapper.appendChild(pillRow);
    ukeyWrapper.appendChild(comboPreview);
    ukeyWrapper.appendChild(btnRow);

    renderPills();

    const wrap = document.createElement("div");
    wrap.style.marginBottom = "6px";
    wrap.appendChild(label);
    wrap.appendChild(ukeyWrapper);
    return wrap;
}
    else if(meta && meta.type === "skeyselect") {
        // Make label clickable for testing
        labelText.style.cursor = "pointer";
        labelText.style.textDecoration = "underline";
        labelText.style.color = "#00d2d3";
        labelText.title = "Click to test this key";
        labelText.onclick = () => {
            testKey(key, "skey");
        };

        // Wrapper container for dropdown + text input + capture button
        const skeyWrapper = document.createElement("div");
        skeyWrapper.style.display = "flex";
        skeyWrapper.style.gap = "5px";
        skeyWrapper.style.alignItems = "center";
        skeyWrapper.style.width = "100%";

        // Dropdown with predefined options
        const skeySelect = document.createElement("select");
        skeySelect.style.flex = "1";
        skeySelect.style.minWidth = "0";

        // Add "Custom..." option at top
        const customOpt = document.createElement("option");
        customOpt.value = "__custom__";
        customOpt.textContent = "✏️ Custom...";
        skeySelect.appendChild(customOpt);

        let matchFound = false;
        skeyOptions.forEach(([val, lbl]) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = lbl;
            if(configObj[key] === val) { opt.selected = true; matchFound = true; }
            skeySelect.appendChild(opt);
        });

        // Custom text input (shown only when "Custom..." is selected)
        const customInput = document.createElement("input");
        customInput.type = "text";
        customInput.maxLength = 1;
        customInput.placeholder = "char";
        customInput.style.width = "48px";
        customInput.style.minWidth = "48px";
        customInput.style.flexShrink = "0";
        customInput.style.textAlign = "center";
        customInput.style.fontWeight = "bold";
        customInput.style.fontFamily = "'Courier New', monospace";
        customInput.style.fontSize = "13px";
        customInput.style.padding = "6px 4px";
        customInput.style.border = "1px solid var(--border)";
        customInput.style.borderRadius = "4px";
        customInput.style.background = "#f8f9fa";
        customInput.style.color = "var(--accent)";
        customInput.title = "Type or press a key";

        // X-Button: löscht custom (nur sichtbar wenn Wert gespeichert)
        const clearCustomBtn = document.createElement("button");
        clearCustomBtn.type = "button";
        clearCustomBtn.textContent = "✕";
        clearCustomBtn.title = "Clear custom value";
        clearCustomBtn.style.padding = "0";
        clearCustomBtn.style.width = "28px";
        clearCustomBtn.style.height = "28px";
        clearCustomBtn.style.flexShrink = "0";
        clearCustomBtn.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
        clearCustomBtn.style.border = "none";
        clearCustomBtn.style.borderRadius = "4px";
        clearCustomBtn.style.cursor = "pointer";
        clearCustomBtn.style.color = "white";
        clearCustomBtn.style.fontWeight = "bold";
        clearCustomBtn.style.fontSize = "13px";
        clearCustomBtn.style.display = "none";

        // ✓-Button: bestätigt Eingabe (nur sichtbar wenn getippt & ungespeichert)
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = "✓";
        confirmBtn.title = "Confirm value";
        confirmBtn.style.padding = "0";
        confirmBtn.style.width = "28px";
        confirmBtn.style.height = "28px";
        confirmBtn.style.flexShrink = "0";
        confirmBtn.style.background = "linear-gradient(135deg, #27ae60, #229954)";
        confirmBtn.style.border = "none";
        confirmBtn.style.borderRadius = "4px";
        confirmBtn.style.cursor = "pointer";
        confirmBtn.style.color = "white";
        confirmBtn.style.fontWeight = "bold";
        confirmBtn.style.fontSize = "13px";
        confirmBtn.style.display = "none";

        // Show/hide custom input depending on selection
        const showCustom = !matchFound;
        customInput.style.display = showCustom ? "inline-block" : "none";

        if (!matchFound) {
            skeySelect.value = "__custom__";
            customInput.value = configObj[key] || "";
            if (configObj[key]) clearCustomBtn.style.display = "inline-block";
        }

        const syncBtns = () => {
            const val = customInput.value;
            const saved = configObj[key];
            clearCustomBtn.style.display = (skeySelect.value === "__custom__" && saved && saved === val) ? "inline-block" : "none";
            confirmBtn.style.display = (skeySelect.value === "__custom__" && val && val !== saved) ? "inline-block" : "none";
        };

        skeySelect.onchange = (e) => {
            if (e.target.value === "__custom__") {
                customInput.style.display = "inline-block";
                customInput.focus();
            } else {
                customInput.style.display = "none";
                clearCustomBtn.style.display = "none";
                confirmBtn.style.display = "none";
                configObj[key] = e.target.value;
                if(autoTransmitEnabled) sendConfig();
                saveLastConfig();
            }
            syncBtns();
        };

        customInput.oninput = () => { syncBtns(); };

        customInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { confirmBtn.click(); e.preventDefault(); }
        });

        confirmBtn.onclick = () => {
            const val = customInput.value;
            if (!val) return;
            configObj[key] = val;
            customInput.style.background = "#e8f8e8";
            setTimeout(() => { customInput.style.background = "#f8f9fa"; }, 600);
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig();
            syncBtns();
        };

        clearCustomBtn.onclick = () => {
            customInput.value = "";
            configObj[key] = skeyOptions[0][0];
            skeySelect.value = skeyOptions[0][0];
            customInput.style.display = "none";
            clearCustomBtn.style.display = "none";
            confirmBtn.style.display = "none";
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig();
        };

        skeyWrapper.appendChild(skeySelect);
        skeyWrapper.appendChild(customInput);
        skeyWrapper.appendChild(clearCustomBtn);
        skeyWrapper.appendChild(confirmBtn);

        // Return with same structure as hkeyselect/ukeyselect:
        // label (only text) on top, skeyWrapper below – no nesting inside label
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "12px";
        wrap.appendChild(label);
        wrap.appendChild(skeyWrapper);
        return wrap;
    }
	else if(meta && meta.type === "ukeyselect_single") {
    labelText.style.cursor = "pointer";
    labelText.style.textDecoration = "underline";
    labelText.style.color = "#00d2d3";
    labelText.title = "Click to test this key";
    labelText.onclick = () => { testKey(key, "ukey"); };

    input = document.createElement("select");
    ukeyOptions.filter(([val]) => val !== "00").forEach(([val, lbl]) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = lbl;
        if(configObj[key] === val) opt.selected = true;
        input.appendChild(opt);
    });
    input.onchange = (e) => {
        configObj[key] = e.target.value;
        if(autoTransmitEnabled) sendConfig();
        saveLastConfig();
    };
	}
    else if(meta && meta.type === "button") {
        input = document.createElement("button");
        input.textContent = "SendKEY";
        input.style.width = "100%";
        input.style.padding = "8px";
        input.style.fontSize = "14px";
        input.style.fontWeight = "bold";
        input.style.background = "#27ae60";
        input.onclick = () => {
            sendSWPush(key);
        };
    }
    else if(meta && meta.type === "text") {
        input = document.createElement("input");
        input.type = "text";
        input.value = configObj[key];
        input.oninput = (e) => {
            configObj[key] = e.target.value;
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
    }
    else if(meta && meta.type === "colorpicker") {
        // Create container for text input and color picker
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.gap = "8px";
        container.style.alignItems = "center";
        
        // Text input for decimal value
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.value = configObj[key] || "00000000";
        textInput.maxLength = 10;
        textInput.placeholder = "00000000";
        textInput.style.flex = "1";
        textInput.style.fontFamily = "'Courier New', monospace";
        textInput.style.fontWeight = "bold";
        
        // Color picker input
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.style.width = "50px";
        colorInput.style.height = "38px";
        colorInput.style.border = "2px solid var(--border)";
        colorInput.style.borderRadius = "4px";
        colorInput.style.cursor = "pointer";
        colorInput.title = "Pick a color";
        
        // Helper function: Convert decimal to #RRGGBB
        const decimalToHtmlColor = (decimal) => {
            const num = parseInt(decimal) || 0;
            // AutoIt decimal format is RGB: Red in high byte, Green in middle, Blue in low byte
            const r = (num >> 16) & 0xFF;
            const g = (num >> 8) & 0xFF;
            const b = num & 0xFF;
            return "#" + 
                   r.toString(16).padStart(2, '0') + 
                   g.toString(16).padStart(2, '0') + 
                   b.toString(16).padStart(2, '0');
        };
        
        // Helper function: Convert #RRGGBB to decimal RGB
        const htmlColorToDecimal = (htmlColor) => {
            const hex = htmlColor.substring(1);
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            // AutoIt format: RGB (Red in high byte, Green in middle, Blue in low byte)
            return (r << 16) | (g << 8) | b;
        };
        
        // Initialize color picker from current value
        if(configObj[key] && configObj[key] !== "00000000") {
            colorInput.value = decimalToHtmlColor(configObj[key]);
        } else {
            colorInput.value = "#000000";
        }
        
        // Text input handler
        textInput.oninput = (e) => {
            // Only allow digits
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            configObj[key] = e.target.value;
            
            // Update color picker when text changes
            if(e.target.value.length > 0) {
                colorInput.value = decimalToHtmlColor(e.target.value);
            }
            
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
        
        // Color picker handler
        colorInput.oninput = (e) => {
            // Convert #RRGGBB to AutoIt decimal format (RGB)
            const decimalValue = htmlColorToDecimal(e.target.value);
            textInput.value = decimalValue.toString().padStart(8, '0');
            configObj[key] = decimalValue.toString().padStart(8, '0');
            
            if(autoTransmitEnabled) sendConfig();
            saveLastConfig(); // Auto-Save bei Änderung
        };
        
        container.appendChild(textInput);
        container.appendChild(colorInput);
        input = container;
    }
    
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    wrap.appendChild(label);
    if(input) wrap.appendChild(input);
    return wrap;
}

function showTxtFile(filename){
    document.getElementById("modalTitle").textContent="Viewing: "+filename;
    const m=document.getElementById("textModal");
    const b=document.getElementById("modalBody");
    const localOpenLink=document.getElementById("localOpenLink");

    b.textContent="Loading...";

    const map={ "vh_help_me.txt":"V7","vh_chg_log.txt":"V8" };

if(map[filename]){
    localOpenLink.style.display="inline-block";
    localOpenLink.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        sendLocalOpen(map[filename]);
        return false;
    };
}else{
    localOpenLink.style.display="none";
    localOpenLink.onclick=null;
}


    m.style.display="block";
    fetch(filename+"?t="+Date.now())
        .then(r=>r.ok?r.text():Promise.reject(r.statusText))
        .then(txt=>b.textContent=txt)
        .catch(err=>b.textContent="Error loading file:\n"+err);
}


function sendLocalOpen(swKey) {
    if(!client||!client.connected){ 
        log("⚠️ OFFLINE! Cannot send local open command."); 
        return; 
    }
    if(!currentTopic) { 
        log("⚠️ No topic configured!"); 
        return; 
    }
    
    const tempCfg={...configObj};
    for(const key in tempCfg) if(swKeys.includes(key)) tempCfg[key]=(key===swKey)?1:0;
    const cfgLine = orderedKeys.map(k => `${k}=${tempCfg[k]}`).join(";") + ";EOF";
    const obfuscated = _obfuscateString(cfgLine);

    client.publish(currentTopic,obfuscated);
    log(`✅ Sent local open: ${swKey}`);
    closeModal();
}

// Test a key by sending a temporary config with the key to test
function testKey(keyName, keyType) {
    if(!client||!client.connected){ 
        log("⚠️ OFFLINE! Cannot test key."); 
        return; 
    }
    if(!currentTopic) { 
        log("⚠️ No topic configured!"); 
        return; 
    }
    
    const keyValue = configObj[keyName];
    if (!keyValue || keyValue === "") {
        log(`⚠️ No key configured for ${settingLabels[keyName]}`);
        return;
    }
    
    // Create temporary config with V48 set
    const tempCfg = {...configObj};
    tempCfg.V48 = keyValue;
    tempCfg.V49 = keyType; // "hkey", "ukey", or "skey"
    const cfgLine = orderedKeys.map(k => `${k}=${tempCfg[k]}`).join(";") + `;V48=${keyValue};V49=${keyType};EOF`;
    const obfuscated = _obfuscateString(cfgLine);

    client.publish(currentTopic, obfuscated);
    log(`🔧 Testing ${settingLabels[keyName]}: ${keyValue}`);
}

function closeModal(){
    document.getElementById("textModal").style.display="none";
}

function generateSWButtons(){
    const container=document.getElementById("swButtons");
    container.innerHTML="";
    const grid=document.createElement("div");
    grid.style.display="grid";
    grid.style.gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))";
    grid.style.gap="10px";
    for(const key in configObj){
        if(!swKeys.includes(key)) continue;
        const btn=document.createElement("button");
        btn.textContent=settingLabels[key]||key;
        btn.style.fontSize="12px";
        if(key === "V2") btn.style.background="#c23616"; // exit_loader_sw (Shutdown Loader)
        if(key === "V1") btn.style.background="#16c24c"; // start_stop_sw (Runtime On/Off)
        btn.onclick=()=>sendSWPush(key);
        grid.appendChild(btn);
    }
    container.appendChild(grid);
}

function sendSWPush(swKey){
    if(swKey === "V7") { showTxtFile('vh_help_me.txt'); return; }
    if(swKey === "V8") { showTxtFile('vh_chg_log.txt'); return; }
    if(!client||!client.connected){ log("⚠️ OFFLINE!"); return; }
    if(!currentTopic) { log("⚠️ No topic configured!"); return; }
    const tempCfg={...configObj};
    for(const key in tempCfg) if(swKeys.includes(key)) tempCfg[key]=(key===swKey)?1:0;
    // IMPORTANT: Order must match _GetConfigString() in VH-CFG-TOOLz.au3 EXACTLY!
    const cfgLine = orderedKeys.map(k => `${k}=${tempCfg[k]}`).join(";") + ";EOF";
    const obfuscated = _obfuscateString(cfgLine);
    client.publish(currentTopic,obfuscated);
    log("✅ Sent Switch: " + swKey);
}

function selectServer(){
    // Small delay so browser renders the UI (incl. protocol switch button) before MQTT blocks
    setTimeout(connectMQTT, 100);
}

// ===== MQTT Monitor & Chat (Modal, reuses music-player styles) =====
let monitorTopic = "";
let monitorMessages = []; // {time, topic, payload}
const MONITOR_MAX_MESSAGES = 100;
let monitorPanelOpen = false;
let monitorUnreadCount = 0;

// ===== Chat encryption toggle (reuses _obfuscateString/_deobfuscateString) =====
// Marker prefix so a receiving client can tell an obfuscated chat payload apart
// from a plain one (config payloads never carry this marker, so they're unaffected).
const CHAT_ENC_PREFIX = "\u0001ENCV1\u0001";
let chatEncryptionEnabled = false;

// ===== Chat username =====
// Invisible control char used to separate "username" from "message text" inside
// the payload. Sent as part of the (optionally encrypted) text itself, so the
// name travels with the message no matter what topic it's on.
const CHAT_USER_SEP = "\u0002";
const CHAT_USERNAME_STORAGE_KEY = "vcloud_chat_username";
let chatUsername = localStorage.getItem(CHAT_USERNAME_STORAGE_KEY) || "";

function setChatUsername(val) {
    chatUsername = (val || "").trim().slice(0, 20);
    localStorage.setItem(CHAT_USERNAME_STORAGE_KEY, chatUsername);
    renderMonitorLog();
}

function toggleChatEncryption() {
    chatEncryptionEnabled = !chatEncryptionEnabled;
    const btn = document.getElementById('chatEncToggleBtn');
    if (btn) {
        btn.textContent = chatEncryptionEnabled ? '🔐 ENC ON' : '🔓 ENC OFF';
        btn.classList.toggle('active', chatEncryptionEnabled);
        btn.title = chatEncryptionEnabled
            ? 'Encryption ON - click to disable'
            : 'Encryption OFF - click to enable';
    }
    renderMonitorLog();
}

// Decodes a monitor payload for DISPLAY purposes only (chat window).
// Controlled purely by the global ENC toggle - same procedure as sending:
// ENC AN  -> try to deobfuscate (strips the chat marker if present, otherwise
//            deobfuscates the raw payload directly - same algorithm the config
//            channel already uses, so those packets get decoded too).
// ENC AUS -> always show the untouched original, exactly as it travels over the broker.
function _decodeChatDisplay(payload) {
    let text = payload;
    let wasEncrypted = false;

    if (chatEncryptionEnabled && typeof payload === 'string') {
        const raw = payload.startsWith(CHAT_ENC_PREFIX) ? payload.slice(CHAT_ENC_PREFIX.length) : payload;
        try {
            text = _deobfuscateString(raw);
            wasEncrypted = true;
        } catch (e) {
            text = payload;
            wasEncrypted = false;
        }
    }

    // Split off the username, if this message carries the separator (chat
    // messages do; plain config/status payloads on the same topic won't).
    let username = null;
    if (typeof text === 'string' && text.indexOf(CHAT_USER_SEP) !== -1) {
        const idx = text.indexOf(CHAT_USER_SEP);
        username = text.slice(0, idx);
        text = text.slice(idx + 1);
    }

    return { text, wasEncrypted, username };
}

function updateMonitorToggleIndicator() {
    const btn = document.getElementById('mqttMonitorToggleBtn');
    if (!btn) return;
    if (monitorUnreadCount > 0) {
        btn.classList.add('has-unread');
        btn.textContent = `Log (${monitorUnreadCount})`;
    } else {
        btn.classList.remove('has-unread');
        btn.textContent = 'Log';
    }
}

function appendMonitorMessage(topic, payload) {
    const time = new Date().toLocaleTimeString();
    monitorMessages.unshift({ time, topic, payload });
    if (monitorMessages.length > MONITOR_MAX_MESSAGES) monitorMessages.pop();
    renderMonitorLog();
    if (!monitorPanelOpen) {
        monitorUnreadCount++;
        updateMonitorToggleIndicator();
    }
}

function renderMonitorLog() {
    const container = document.getElementById('mqttMonitorLog');
    if (!container) return;
    container.innerHTML = monitorMessages.map(m => {
        const decoded = _decodeChatDisplay(m.payload);
        const lockIcon = decoded.wasEncrypted ? '🔒 ' : '';
        const isMe = decoded.username && chatUsername && decoded.username === chatUsername;
        const userTag = decoded.username
            ? `<span class="mqtt-monitor-user${isMe ? ' is-me' : ''}">${escapeHtml(decoded.username)}:</span> `
            : '';
        return `<div class="mqtt-monitor-row"><span class="mqtt-monitor-time">${m.time}</span><span class="mqtt-monitor-topic">${escapeHtml(m.topic)}</span><span class="mqtt-monitor-payload">${lockIcon}${userTag}${escapeHtml(decoded.text)}</span></div>`;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function clearMonitorLog() {
    monitorMessages = [];
    renderMonitorLog();
}

function subscribeMonitorTopic() {
    const input = document.getElementById('monitorTopicInput');
    const topic = input ? input.value.trim() : "";
    if (!topic) {
        log("⚠️ Please enter a topic to subscribe to.");
        return;
    }
    if (!client || !client.connected) {
        log("⚠️ OFFLINE! Cannot subscribe right now.");
        return;
    }
    client.subscribe(topic, (err) => {
        const statusEl = document.getElementById('monitorTopicStatus');
        if (err) {
            log(`❌ Subscribe failed for "${topic}": ${err.message}`);
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.textContent = `❌ Failed to subscribe: ${topic}`;
            }
            return;
        }
        monitorTopic = topic;
        log(`📬 Monitor subscribed to: ${topic}`);
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = `📡 Listening on: ${topic}`;
        }
    });
}

function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const text = input ? input.value.trim() : "";
    if (!text) return;
    if (!monitorTopic) {
        log("⚠️ Please subscribe to a topic first before chatting.");
        return;
    }
    if (!client || !client.connected) {
        log("⚠️ OFFLINE! Cannot send chat message.");
        return;
    }
    const uname = chatUsername || 'Anon';
    const combined = uname + CHAT_USER_SEP + text;
    const payload = chatEncryptionEnabled ? (CHAT_ENC_PREFIX + _obfuscateString(combined)) : combined;
    client.publish(monitorTopic, payload);
    input.value = "";
}

function openMqttMonitor() {
    monitorPanelOpen = true;
    monitorUnreadCount = 0;
    updateMonitorToggleIndicator();

    if (document.getElementById('mqttMonitorModal')) {
        document.getElementById('mqttMonitorModal').style.display = 'flex';
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'mqttMonitorModal';
    overlay.className = 'music-player-overlay';

    const box = document.createElement('div');
    box.className = 'music-player-box mqtt-monitor-box';

    const header = document.createElement('div');
    header.className = 'music-player-header';
    const title = document.createElement('span');
    title.textContent = '📡 MQTT Monitor & Chat';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close';
    closeBtn.textContent = '×';
    closeBtn.onclick = closeMqttMonitor;
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    const subRow = document.createElement('div');
    subRow.className = 'setting-row';
    const topicInput = document.createElement('input');
    topicInput.id = 'monitorTopicInput';
    topicInput.type = 'text';
    topicInput.placeholder = 'Topic to subscribe, e.g. home/#';
    const subBtn = document.createElement('button');
    subBtn.className = 'btn-mqtt-action';
    subBtn.textContent = 'Subscribe';
    subBtn.onclick = subscribeMonitorTopic;
    subRow.appendChild(topicInput);
    subRow.appendChild(subBtn);
    box.appendChild(subRow);

    const usernameRow = document.createElement('div');
    usernameRow.className = 'setting-row';
    usernameRow.style.marginTop = '8px';
    const usernameInput = document.createElement('input');
    usernameInput.id = 'chatUsernameInput';
    usernameInput.type = 'text';
    usernameInput.maxLength = 20;
    usernameInput.placeholder = 'Your name...';
    usernameInput.value = chatUsername;
    usernameInput.oninput = (e) => setChatUsername(e.target.value);
    const encBtn = document.createElement('button');
    encBtn.id = 'chatEncToggleBtn';
    encBtn.className = 'btn-chat-enc btn-mqtt-action' + (chatEncryptionEnabled ? ' active' : '');
    encBtn.textContent = chatEncryptionEnabled ? '🔐 ENC ON' : '🔓 ENC OFF';
    encBtn.title = chatEncryptionEnabled
        ? 'Encryption ON - click to disable'
        : 'Encryption OFF - click to enable';
    encBtn.onclick = toggleChatEncryption;
    usernameRow.appendChild(usernameInput);
    usernameRow.appendChild(encBtn);
    box.appendChild(usernameRow);

    const statusEl = document.createElement('div');
    statusEl.id = 'monitorTopicStatus';
    statusEl.className = 'status-value';
    statusEl.style.display = 'none';
    box.appendChild(statusEl);

    const logEl = document.createElement('div');
    logEl.id = 'mqttMonitorLog';
    logEl.className = 'mqtt-monitor-log';
    box.appendChild(logEl);

    const clearRow = document.createElement('div');
    clearRow.className = 'setting-row';
    clearRow.style.marginTop = '8px';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🧹 Clear Log';
    clearBtn.style.flex = '1';
    clearBtn.onclick = clearMonitorLog;
    clearRow.appendChild(clearBtn);
    box.appendChild(clearRow);

    const warning = document.createElement('div');
    warning.className = 'warning';
    warning.style.marginTop = '12px';
    warning.style.fontSize = '0.8rem';
    warning.textContent = '⚠️ Anyone subscribed to the same topic on this broker can read your chat messages. This is not a private channel.';
    box.appendChild(warning);

    const chatRow = document.createElement('div');
    chatRow.className = 'chat-send-row';
    const chatInput = document.createElement('input');
    chatInput.id = 'chatMessageInput';
    chatInput.type = 'text';
    chatInput.placeholder = 'Type a chat message...';
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn-chat-send';
    sendBtn.textContent = 'Send';
    sendBtn.onclick = sendChatMessage;
    chatRow.appendChild(chatInput);
    chatRow.appendChild(sendBtn);
    box.appendChild(chatRow);

    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) closeMqttMonitor(); };
    document.body.appendChild(overlay);

    renderMonitorLog();
}

function closeMqttMonitor() {
    // MQTT-Verbindung/Subscription läuft im Hintergrund weiter, nur das Modal wird versteckt
    monitorPanelOpen = false;
    const overlay = document.getElementById('mqttMonitorModal');
    if (overlay) overlay.style.display = 'none';
}

function connectMQTT(){
    if(client) client.end(true);
    if(!currentBroker) {
        log("⚠️ No server configured! Use URL parameters: #ip=X.X.X.X&mqtt_Topic=your/topic");
        document.getElementById("infoStatus").textContent = "❌ NOT CONFIGURED";
        document.getElementById("infoStatus").parentElement.classList.remove("connected");
        return;
    }
    
    document.getElementById("infoStatus").textContent = "🔄 CONNECTING...";
    document.getElementById("infoStatus").parentElement.classList.remove("connected");
    
    client=mqtt.connect(currentBroker,{clientId:"web_"+Math.random().toString(16).slice(2,8),username:currentUser,password:currentPass,clean:true});
    client.on("connect",()=>{ 
        log("✅ ONLINE: "+currentBroker); 
        document.getElementById("infoStatus").textContent = "✅ ONLINE";
        document.getElementById("infoStatus").parentElement.classList.add("connected");
        document.getElementById("protocolSwitchContainer").style.display = 'none';
        if(currentTopic) {
            client.subscribe(currentTopic);
            log("📬 Subscribed to: "+currentTopic);
        }
    });
    client.on("message",(t,m)=>{
        const payload = m.toString();
        log("📨 MSG: "+payload);
        appendMonitorMessage(t, payload);
    });
    client.on("error",e=>{
        log("❌ ERR: "+e.message);
        document.getElementById("infoStatus").textContent = "❌ ERROR";
        document.getElementById("infoStatus").parentElement.classList.remove("connected");
        document.getElementById("protocolSwitchContainer").style.display = 'block';
    });
    client.on("close",()=>{
        document.getElementById("infoStatus").textContent = "🔴 OFFLINE";
        document.getElementById("infoStatus").parentElement.classList.remove("connected");
        document.getElementById("protocolSwitchContainer").style.display = 'block';
    });
}

// ===== Simple transmit obfuscation (NOT real encryption, just makes the wire payload unreadable at a glance) =====
// Step 1: reverse the whole string
// Step 2: swap every pair of characters (0<->1, 2<->3, ...)
// Must be mirrored EXACTLY on the receiving side (AutoIt) to decode again.
function _obfuscateString(str) {
    const reversed = str.split('').reverse().join('');
    const arr = reversed.split('');
    for (let i = 0; i < arr.length - 1; i += 2) {
        const tmp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = tmp;
    }
    return arr.join('');
}

// Gegenstück zum Testen/Verifizieren (z.B. im MQTT-Monitor) - macht _obfuscateString() rückgängig
function _deobfuscateString(str) {
    const arr = str.split('');
    for (let i = 0; i < arr.length - 1; i += 2) {
        const tmp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = tmp;
    }
    return arr.join('').split('').reverse().join('');
}

function sendConfig(){
    if(!client||!client.connected){ 
        log("⚠️ OFFLINE! Please configure server via URL."); 
        return; 
    }
    if(!currentTopic) {
        log("⚠️ No topic configured! Add mqtt_Topic to URL.");
        return;
    }
    // IMPORTANT: Order must match _GetConfigString() in VH-CFG-TOOLz.au3 EXACTLY!
    const cfgLine = orderedKeys.map(k => `${k}=${configObj[k]}`).join(";") + ";EOF";
    const obfuscated = _obfuscateString(cfgLine);
    client.publish(currentTopic,obfuscated);
    log("✅ Config Sent to: "+currentTopic);
    
    // Auto-Save nach dem Senden
    saveLastConfig();
}

// ===== URL Parameter Handling =====
function getUrlParameter(name) {
    // Use Hash (#) instead of Query (?) so the IP is not transmitted to the server
    const hash = window.location.hash.substring(1); // Removes the '#'
    const urlParams = new URLSearchParams(hash);
    return urlParams.get(name);
}

function initializeServerSelect() {
    const manual = loadManualConnection();

    // Manuelle Werte haben Vorrang vor den URL-Hash-Parametern (bewusstes Override),
    // fallen aber automatisch auf die URL-Werte zurueck, sobald ein Feld leer ist.
    const urlIP = manual.ip || getUrlParameter('ip') || '';
    const urlBroker = getUrlParameter('mqtt_Broker');
    const urlPort = manual.mqtt_WSPort || getUrlParameter('mqtt_WSPort') || getUrlParameter('port') || '1884';
    const urlUser = manual.mqtt_User || getUrlParameter('mqtt_User') || '';
    const urlPass = manual.mqtt_Pass || getUrlParameter('mqtt_Pass') || '';
    const urlTopic = manual.mqtt_Topic || getUrlParameter('mqtt_Topic') || '';
    
    // Check if no parameters are provided
    const hasConfig = urlIP || urlBroker;
    
    if (!hasConfig) {
        // Show info box, hide main content
        document.getElementById('noConfigInfo').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
        log("⚠️ No configuration parameters found");
        return;
    }
    
    // Show main content, hide info box
    document.getElementById('noConfigInfo').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // Set current topic
    if (urlTopic) {
        currentTopic = urlTopic;
    }
    
    // Broker can be passed either as complete URL (mqtt_Broker) or as IP
    if (urlBroker) {
        // Complete broker URL was passed
        currentBroker = urlBroker;
    } else if (urlIP) {
        // IP was passed, build broker URL
        currentBroker = `ws://${urlIP}:${urlPort}/mqtt`;
    }
    
    // Set credentials
    currentUser = urlUser;
    currentPass = urlPass;
    
    // Update info display
    if (currentBroker) {
        document.getElementById("infoServer").textContent = currentBroker;
        log(`🌐 Remote Server: ${currentBroker}${currentTopic ? ' | Topic: ' + currentTopic : ' | ⚠️ No Topic!'}`);
    } else {
        document.getElementById("infoServer").textContent = "⚠️ Not configured - Use URL parameters!";
        log("⚠️ No server configured! Use URL: #ip=X.X.X.X&mqtt_Topic=your/topic");
    }
    
    if (currentTopic) {
        document.getElementById("infoTopic").textContent = currentTopic;
    } else {
        document.getElementById("infoTopic").textContent = "⚠️ Not configured - Add mqtt_Topic!";
    }
}

// ===== Manual Connection Setup Panel (Toggle + Save + Cancel) =====
function toggleConnSetup() {
    const panel = document.getElementById('connSetupPanel');
    const statusWrap = document.getElementById('infoServerTopicWrap');
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    if (isHidden) {
        const manual = loadManualConnection();
        document.getElementById('connIp').value = manual.ip || '';
        document.getElementById('connPort').value = manual.mqtt_WSPort || '';
        document.getElementById('connTopic').value = manual.mqtt_Topic || '';
        document.getElementById('connUser').value = manual.mqtt_User || '';
        document.getElementById('connPass').value = manual.mqtt_Pass || '';
        panel.style.display = 'block';
        if (statusWrap) statusWrap.style.display = 'none';
    } else {
        panel.style.display = 'none';
        if (statusWrap) statusWrap.style.display = 'block';
    }
}

function cancelConnSetup() {
    document.getElementById('connSetupPanel').style.display = 'none';
    const statusWrap = document.getElementById('infoServerTopicWrap');
    if (statusWrap) statusWrap.style.display = 'block';
}

function saveConnSetup() {
    const conn = {
        ip: document.getElementById('connIp').value.trim(),
        mqtt_WSPort: document.getElementById('connPort').value.trim(),
        mqtt_Topic: document.getElementById('connTopic').value.trim(),
        mqtt_User: document.getElementById('connUser').value.trim(),
        mqtt_Pass: document.getElementById('connPass').value.trim()
    };

    const hasAny = Object.values(conn).some(v => v);
    if (hasAny) {
        localStorage.setItem(CONN_STORAGE_KEY, JSON.stringify(conn));
        log("✅ Manual connection settings saved!");
    } else {
        localStorage.removeItem(CONN_STORAGE_KEY);
        log("🗑️ Manual connection settings cleared.");
    }

    document.getElementById('connSetupPanel').style.display = 'none';
    const statusWrap = document.getElementById('infoServerTopicWrap');
    if (statusWrap) statusWrap.style.display = 'block';

    // Mit den neuen Werten neu verbinden (manuelle Werte haben jetzt Vorrang vor der URL)
    initializeServerSelect();
    selectServer();
}

// ===== Protocol Switch (HTTP <-> HTTPS) =====
function initProtocolSwitchButton() {
    const isHttps = window.location.protocol === 'https:';
    const btn = document.getElementById('protocolSwitchBtn');
    const container = document.getElementById('protocolSwitchContainer');
    if (!container || !btn) return;
    container.style.display = 'block';
    if (isHttps) {
        btn.textContent = '⚠️ Connection issues? Switch to HTTP';
    } else {
        btn.textContent = '⚠️ Connection issues? Switch to HTTPS';
    }
}

function switchProtocol() {
    const isHttps = window.location.protocol === 'https:';
    const targetBase = isHttps ? PROTOCOL_HTTP_DOMAIN : PROTOCOL_HTTPS_DOMAIN;
    const newUrl = targetBase + window.location.pathname + window.location.search + window.location.hash;
    window.location.href = newUrl;
}


// Entfernt kaputte "vcloud_profile_*" Eintraege aus localStorage: sowohl
// syntaktisch ungueltiges JSON (z.B. nach fehlgeschlagenem Import) als auch
// Alt-Profile mit Legacy-Key-Namen (z.B. "stealth_mode" statt "V9") von vor
// dem Vxx-Umbau -> keine Backwards-Kompa, alles muss reines Vxx sein.
// Valide Vxx-Profile bleiben unangetastet. Gibt die Anzahl entfernter Eintraege zurueck.
function cleanupCorruptProfiles() {
    const badKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("vcloud_profile_")) continue;
        try {
            const parsed = JSON.parse(localStorage.getItem(key));
            if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
            const hasLegacyKey = Object.keys(parsed).some(k => !(k in defaultConfig));
            if (hasLegacyKey) throw new Error('legacy/unknown key(s) present');
        } catch (e) {
            badKeys.push(key);
        }
    }
    badKeys.forEach(k => localStorage.removeItem(k));
    return badKeys.length;
}

// ===== Reset Configuration to Defaults =====
function resetToDefaults() {
    // Show confirmation dialog
    const confirmed = confirm(
        "⚠️ RESET TO DEFAULTS ⚠️\n\n" +
        "This will:\n" +
        "• Reset all settings to factory defaults\n" +
        "• Clear the auto-saved configuration\n" +
        "• Remove any corrupt/broken profiles\n" +
        "• Keep your valid saved profiles (unchanged)\n\n" +
        "Are you sure you want to continue?"
    );
    
    if (!confirmed) {
        log("❌ Reset cancelled");
        return;
    }
    
    // Reset configObj to defaults
    replaceConfigObj(defaultConfig);
    
    // Clear auto-save from localStorage
    localStorage.removeItem('vcloud_last_config');
    localStorage.removeItem('vcloud_last_profile');
    localStorage.removeItem('vcloud_last_save_time');

    // Clean up any corrupt profile entries (e.g. from a failed/broken import)
    const removedCount = cleanupCorruptProfiles();
    
    // Update UI
    generateSWButtons();
    generateConfigInputs();
    updateProfileList();
    
    // Clear profile selection
    const profileSelect = document.getElementById('profileSelect');
    if (profileSelect) {
        profileSelect.value = '';
    }
    
    log("✅ Configuration reset to defaults!" + (removedCount > 0 ? ` (${removedCount} corrupt profile(s) removed)` : ""));
    
    // Optional: Send reset config if connected
    if (autoTransmitEnabled && client && client.connected) {
        sendConfig();
    }
}

// ===== Auto-Save/Load Last Config =====
function saveLastConfig() {
    try {
        localStorage.setItem('vcloud_last_config', JSON.stringify(configObj));
        localStorage.setItem('vcloud_last_profile', document.getElementById('profileSelect').value);
        localStorage.setItem('vcloud_last_save_time', new Date().toISOString());
    } catch (e) {
        console.warn('Could not save last config to localStorage:', e);
    }
}

function loadLastConfig() {
    try {
        const savedConfig = localStorage.getItem('vcloud_last_config');
        const savedProfile = localStorage.getItem('vcloud_last_profile');
        const saveTime = localStorage.getItem('vcloud_last_save_time');
        
        if (savedConfig) {
            const parsedConfig = JSON.parse(savedConfig);
            replaceConfigObj(parsedConfig);
            
            // UI aktualisieren
            generateSWButtons();
            generateConfigInputs();
            
            if (saveTime) {
                const date = new Date(saveTime);
                log(`✅ Last settings restored (saved: ${date.toLocaleString('de-DE')})`);
            } else {
                log(`✅ Last settings restored`);
            }
            
            // Letztes Profil wiederherstellen
            if (savedProfile) {
                const profileSelect = document.getElementById('profileSelect');
                if (profileSelect) {
                    profileSelect.value = savedProfile;
                    if (savedProfile !== '') {
                        log(`📁 Last profile: ${savedProfile}`);
                    }
                }
            }
            
            return true;
        }
    } catch (e) {
        console.warn('Could not load last config from localStorage:', e);
    }
    return false;
}

// Speichern bei jeder Änderung
function autoSaveConfig() {
    if (autoTransmitEnabled) {
        sendConfig();
    }
    saveLastConfig();
}

// Initialization on page load
document.addEventListener('DOMContentLoaded', function() {
    addImportExportButtons();
    updateProfileList();
    generateSWButtons();
    generateConfigInputs();
    initializeServerSelect();
    
    // Server profiles laden (async, kein Blocking)
    loadServerDefaultProfiles();
    loadServerUserProfiles();
    
    // Letzte Konfiguration laden
    const restored = loadLastConfig();
    
    selectServer();
    initProtocolSwitchButton();
    
    // Button-Status beim Start korrekt setzen
    setAutoTransmitUI(autoTransmitEnabled);
});
