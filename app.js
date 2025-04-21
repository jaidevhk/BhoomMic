document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const micSelect = document.getElementById('mic-select');
    const waveformCanvas = document.getElementById('waveform');
    const recordButton = document.getElementById('record-button');
    const durationInput = document.getElementById('duration');
    const timeDisplay = document.getElementById('time-display');
    const downloadButton = document.getElementById('download-button');
    const statusMessage = document.getElementById('status-message');
    
    // Canvas context
    const canvasCtx = waveformCanvas.getContext('2d');
    
    // Audio contexts and variables
    let audioContext;
    let audioStream;
    let mediaRecorder;
    let audioChunks = [];
    let analyser;
    let isRecording = false;
    let recordingTimer;
    let recordingDuration;
    let recordingStartTime;
    let audioBlob;
    let audioUrl;
    
    // Set canvas size
    function resizeCanvas() {
        waveformCanvas.width = waveformCanvas.clientWidth;
        waveformCanvas.height = waveformCanvas.clientHeight;
    }
    
    // Handle window resize
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Initialize audio context
    async function initAudio() {
        try {
            // Get list of available audio devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            // Populate select dropdown
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${index + 1}`;
                micSelect.appendChild(option);
            });
            
            // If no devices found
            if (audioInputs.length === 0) {
                showStatus('No microphones found', 'error');
                return false;
            }
            
            // Initialize audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            return true;
        } catch (error) {
            showStatus(`Error initializing audio: ${error.message}`, 'error');
            return false;
        }
    }
    
    // Connect to selected microphone
    async function connectMicrophone() {
        try {
            // Stop any existing stream
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
            
            // Get selected device ID
            const deviceId = micSelect.value;
            
            // Get user media with selected device
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create analyser for waveform
            const source = audioContext.createMediaStreamSource(audioStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            
            // Enable record button
            recordButton.disabled = false;
            
            // Start drawing waveform
            drawWaveform();
            
            return true;
        } catch (error) {
            showStatus(`Error connecting to microphone: ${error.message}`, 'error');
            return false;
        }
    }
    
    // Draw waveform on canvas
    function drawWaveform() {
        if (!analyser) return;
        
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            // Schedule next frame
            requestAnimationFrame(draw);
            
            // Get waveform data
            analyser.getByteTimeDomainData(dataArray);
            
            // Clear canvas
            canvasCtx.fillStyle = '#f8f8f8';
            canvasCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
            
            // Draw waveform
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = isRecording ? '#f44336' : '#000000';
            canvasCtx.beginPath();
            
            const sliceWidth = waveformCanvas.width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * waveformCanvas.height / 2;
                
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            canvasCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
            canvasCtx.stroke();
        };
        
        draw();
    }
    
    // Start recording
    function startRecording() {
        if (!audioStream) return;
        
        try {
            // Reset audio chunks
            audioChunks = [];
            
            // Create media recorder
            mediaRecorder = new MediaRecorder(audioStream);
            
            // Handle data available
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            // Handle recording stop
            mediaRecorder.onstop = () => {
                // Create blob and URL
                audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                
                // Revoke previous URL if exists
                if (audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                }
                
                audioUrl = URL.createObjectURL(audioBlob);
                
                // Enable download button
                downloadButton.disabled = false;
                
                // Update UI
                recordButton.textContent = 'Record';
                recordButton.classList.remove('recording');
                isRecording = false;
                
                showStatus('Recording complete! Click "Download Clip" to save.', 'success');
            };
            
            // Get recording duration from input
            recordingDuration = parseInt(durationInput.value) || 10;
            if (recordingDuration < 1) recordingDuration = 1;
            if (recordingDuration > 300) recordingDuration = 300;
            
            // Start recording
            mediaRecorder.start();
            
            // Update UI
            recordButton.textContent = 'Recording...';
            recordButton.classList.add('recording');
            isRecording = true;
            recordingStartTime = Date.now();
            
            // Start timer
            updateTimer();
            recordingTimer = setInterval(updateTimer, 100);
            
            // Set timeout to stop recording
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    stopRecording();
                }
            }, recordingDuration * 1000);
            
            showStatus('Recording in progress...', 'success');
        } catch (error) {
            showStatus(`Error starting recording: ${error.message}`, 'error');
        }
    }
    
    // Stop recording
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordingTimer);
            timeDisplay.textContent = formatTime(recordingDuration);
        }
    }
    
    // Update timer display
    function updateTimer() {
        if (!recordingStartTime) return;
        
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        const remaining = Math.max(0, recordingDuration - elapsed);
        
        timeDisplay.textContent = formatTime(remaining);
        
        // Auto stop if we reach zero
        if (remaining <= 0 && mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        }
    }
    
    // Format time as MM:SS
    function formatTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Show status message
    function showStatus(message, type = '') {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message';
        
        if (type) {
            statusMessage.classList.add(type);
        }
    }
    
    // Download recorded audio
    function downloadAudio() {
        if (!audioBlob) return;
        
        const downloadLink = document.createElement('a');
        downloadLink.href = audioUrl;
        downloadLink.download = `audio-clip-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.wav`;
        downloadLink.click();
    }
    
    // Event listeners
    micSelect.addEventListener('change', connectMicrophone);
    
    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    
    downloadButton.addEventListener('click', downloadAudio);
    
    // Initialize app
    async function init() {
        if (await initAudio()) {
            showStatus('Select a microphone and click Record to start', 'success');
            
            // Connect to default microphone
            if (micSelect.options.length > 0) {
                await connectMicrophone();
            }
        }
    }
    
    init();
}); 