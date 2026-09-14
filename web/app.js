// import is done dynamically inside loadWasmEngine() to avoid blocking the entire script

console.log("Initializing application...");
const statusEl = document.getElementById('status');
const sendBtn = document.getElementById('sendBtn');
const connectBtn = document.getElementById('connectBtn');

function updateStatus(msg) {
    console.log(msg);
    if (statusEl) statusEl.innerText = `Status: ${msg}`;
}

// 1. INITIATE NETWORK FIRST
// On localhost, connect to the local signaling server.
// In production (Vercel), connect to the deployed Render signaling server.
const SIGNALING_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `ws://${window.location.hostname}:8080`
    : 'wss://file-transfer-tool-5igy.onrender.com';
const ws = new WebSocket(SIGNALING_SERVER);
console.log(`[Network] Connecting to signaling server: ${SIGNALING_SERVER}`);

ws.onopen = () => updateStatus("Connected to WebSocket. Open Tab #2, then click 'Connect to Peer'.");
ws.onerror = (err) => updateStatus("WebSocket error! Is Node server running on port 8080?");
ws.onclose = () => updateStatus("WebSocket connection closed.");

const peerConnection = new RTCPeerConnection({ 
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
});

let dataChannel = null;
let engine = null;

// Receiver state (File System Access API - stream to disk)
let fileHandle;
let writableStream;
let expectedSize = 0;
let receivedBytes = 0;
let incomingFileName = 'downloaded_file';

// 2. LOAD WASM ASYNCHRONOUSLY
// engine.js is Emscripten output with MODULARIZE=1 but NOT EXPORT_ES6=1,
// so it sets a global `createEngineModule` var. We load it via a script tag.
async function loadWasmEngine() {
    try {
        console.log("[Wasm] Fetching and compiling engine...");
        
        // engine.js was built with -sEXPORT_ES6=1, so it's a proper ES module
        const { default: createEngineModule } = await import('./engine.js');
        const Module = await createEngineModule();
        engine = new Module.TransferEngine(64 * 1024);
        console.log("[Wasm] Engine loaded and ready.");
    } catch (error) {
        console.error("[Wasm] Failed to load WebAssembly module:", error);
        console.warn("[Wasm] File transfer will work WITHOUT compression as a fallback.");
    }
}
loadWasmEngine();

// 3. SIGNALING LOGIC
peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        console.log("[WebRTC] Sending ICE candidate");
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
        }
    }
};

ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.log(`[WebSocket] Received: ${message.type}`);

    try {
        if (message.type === 'offer') {
            // Ignore duplicate offers if we are already connected or connecting
            if (peerConnection.signalingState !== 'stable') {
                console.warn(`[WebRTC] Ignored offer: state is ${peerConnection.signalingState}`);
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', answer: answer }));
            console.log("[WebRTC] Answer created and sent");
        } 
        else if (message.type === 'answer') {
            // Only accept an answer if we actually sent an offer
            if (peerConnection.signalingState !== 'have-local-offer') {
                console.warn(`[WebRTC] Ignored answer: state is ${peerConnection.signalingState}`);
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
            console.log("[WebRTC] Remote description set from answer");
        } 
        else if (message.type === 'ice-candidate') {
            // ICE candidates cannot be added until the remote SDP is set
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            } else {
                console.warn("[WebRTC] Ignored ICE candidate: no remote description set yet");
            }
        }
    } catch (error) {
        console.error("[WebRTC] Handshake error:", error);
    }
};

// DATA CHANNEL SETUP
function setupDataChannel(channel) {
    channel.onopen = () => {
        updateStatus("WebRTC Data Channel OPEN! Ready for transfer.");
        sendBtn.disabled = false;
    };
    channel.onclose = () => {
        updateStatus("WebRTC Data Channel closed.");
        sendBtn.disabled = true;
    };
    channel.onmessage = handleIncomingData;
}

// RECEIVER LOGIC (File System Access API - stream to disk)
async function handleIncomingData(event) {
    // 1. Handle Metadata & Prompt for Save Location
    if (typeof event.data === 'string') {
        const metadata = JSON.parse(event.data);
        expectedSize = metadata.fileSize;
        incomingFileName = metadata.fileName;
        receivedBytes = 0;
        
        console.log(`[Receiver] Incoming file: ${incomingFileName} (${expectedSize} bytes)`);
        updateStatus(`Incoming file "${incomingFileName}" (${expectedSize} bytes). Choose save location...`);
        
        try {
            // Prompt the user to select where to save the file
            fileHandle = await window.showSaveFilePicker({
                suggestedName: incomingFileName
            });
            // Open a direct stream to the hard drive
            writableStream = await fileHandle.createWritable();
            console.log("[Receiver] Stream to disk opened. Ready for data.");
            updateStatus(`Receiving file "${incomingFileName}"...`);
        } catch (err) {
            console.error("[Receiver] User cancelled save or stream failed:", err);
            updateStatus("File save cancelled.");
        }
        return;
    }

    // Ensure the stream is open before accepting binary data
    if (!writableStream) {
        console.warn("[Receiver] Dropping chunk: file stream not ready.");
        return;
    }

    // 2. Handle Binary File Chunks
    const compressedView = new Uint8Array(event.data);
    
    // Write to C++ RECV INPUT buffer
    engine.getRecvInputView(compressedView.byteLength).set(compressedView);
    
    // Decompress and get raw bytes from C++ RECV OUTPUT buffer
    const rawView = engine.decompressAndGetOutputView(compressedView.byteLength);
    
    // 3. Write directly to the hard drive (bypassing RAM accumulation)
    await writableStream.write(rawView);
    receivedBytes += rawView.byteLength;

    updateStatus(`Progress: ${receivedBytes} / ${expectedSize} bytes`);

    // 4. Close the stream when complete
    if (expectedSize > 0 && receivedBytes >= expectedSize) {
        console.log("[Receiver] File fully received and decompressed to disk.");
        await writableStream.close();
        
        // Reset state
        receivedBytes = 0;
        expectedSize = 0;
        fileHandle = null;
        writableStream = null;
        updateStatus(`File "${incomingFileName}" saved to disk!`);
    }
}

// UI HOOKS
connectBtn.onclick = async () => {
    if (ws.readyState !== WebSocket.OPEN) {
        alert("WebSocket is not connected yet.");
        return;
    }
    updateStatus("Creating WebRTC offer...");
    dataChannel = peerConnection.createDataChannel("file-transfer");
    dataChannel.binaryType = "arraybuffer";
    setupDataChannel(dataChannel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', offer: offer }));
    updateStatus("Offer sent to signaling server. Waiting for peer in Tab #2...");
};

peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    dataChannel.binaryType = "arraybuffer";
    updateStatus("Data channel received from initiator!");
    setupDataChannel(dataChannel);
};

// SENDER LOGIC
document.getElementById('sendBtn').onclick = () => {
    const file = document.getElementById('fileInput').files[0];
    if (!file) {
        console.error("[UI] No file selected");
        return;
    }
    if (!engine) {
        console.error("[Wasm] Engine not loaded yet");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("WebRTC DataChannel is not connected.");
        return;
    }

    console.log(`[Sender] Starting transfer: ${file.name} (${file.size} bytes)`);
    updateStatus(`Sending "${file.name}" (${file.size} bytes)...`);
    
    // Send metadata first so the receiver knows what to expect
    dataChannel.send(JSON.stringify({ 
        fileName: file.name, 
        fileSize: file.size 
    }));

    const reader = new FileReader();
    const CHUNK_SIZE = 64 * 1024;
    const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB safety threshold
    let offset = 0;

    function sendNextChunk() {
        if (offset >= file.size) {
            console.log("[Sender] File transfer complete");
            updateStatus(`Finished sending "${file.name}"!`);
            return;
        }

        // BACKPRESSURE: If the network buffer is too full, pause reading
        if (dataChannel.bufferedAmount > BUFFER_THRESHOLD) {
            console.log("[Sender] Network congested. Pausing engine...");
            
            // Wait for the buffer to drain, then resume
            dataChannel.onbufferedamountlow = () => {
                dataChannel.onbufferedamountlow = null;
                console.log("[Sender] Buffer drained. Resuming engine.");
                sendNextChunk(); 
            };
            return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }

    // Set the threshold on the channel itself
    dataChannel.bufferedAmountLowThreshold = BUFFER_THRESHOLD / 2;

    reader.onload = (e) => {
        const rawView = new Uint8Array(e.target.result);
        
        // 1. Write raw bytes to C++ INPUT buffer
        engine.getSendInputView().set(rawView);
        
        // 2. Compress and get exact OUTPUT view
        const compressedView = engine.compressAndGetOutputView(rawView.byteLength);
        
        // 3. Send over WebRTC
        if (compressedView.byteLength > 0) {
            // We must copy the view buffer to send it safely before Wasm overwrites it
            dataChannel.send(new Uint8Array(compressedView));
        }
        
        offset += rawView.byteLength;
        sendNextChunk(); // Read the next chunk immediately
    };

    sendNextChunk();
};
