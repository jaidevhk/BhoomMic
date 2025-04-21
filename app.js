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
    let animationFrameId;
    
    // Clip queue to store multiple recordings
    let clipQueue = [];
    
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
            animationFrameId = requestAnimationFrame(draw);
            
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
        
        // Cancel any existing animation frame before starting a new one
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        // Start the animation
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
                
                // Add to clip queue
                const timestamp = new Date();
                const clipName = `Clip ${clipQueue.length + 1} - ${formatTimestamp(timestamp)}`;
                
                clipQueue.push({
                    id: Date.now(),
                    name: clipName,
                    blob: audioBlob,
                    url: URL.createObjectURL(audioBlob),
                    timestamp: timestamp,
                    duration: recordingDuration
                });
                
                // Update UI
                updateClipQueue();
                
                // Enable download button
                downloadButton.disabled = false;
                
                // Update UI
                recordButton.textContent = 'Record';
                recordButton.classList.remove('recording');
                isRecording = false;
                
                showStatus('Recording complete! Clip added to queue.', 'success');
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
    
    // Format timestamp for clip names
    function formatTimestamp(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Show status message
    function showStatus(message, type = '') {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message';
        
        if (type) {
            statusMessage.classList.add(type);
        }
    }
    
    // Update clip queue UI
    function updateClipQueue() {
        // Check if clip queue container exists, if not create it
        let clipQueueContainer = document.querySelector('.clip-queue');
        if (!clipQueueContainer) {
            clipQueueContainer = document.createElement('div');
            clipQueueContainer.className = 'clip-queue';
            clipQueueContainer.innerHTML = '<h2>Saved Clips</h2>';
            document.querySelector('.container').insertBefore(
                clipQueueContainer, 
                document.querySelector('.download-container')
            );
        }
        
        // Clear existing clips
        const clipsContainer = clipQueueContainer.querySelector('.clips-container') || document.createElement('div');
        clipsContainer.className = 'clips-container';
        clipsContainer.innerHTML = '';
        
        // Add clips to container
        if (clipQueue.length === 0) {
            clipsContainer.innerHTML = '<p class="no-clips">No clips recorded yet</p>';
        } else {
            clipQueue.forEach((clip, index) => {
                const clipElement = document.createElement('div');
                clipElement.className = 'clip-item';
                clipElement.dataset.id = clip.id;
                
                clipElement.innerHTML = `
                    <div class="clip-info">
                        <span class="clip-name">${clip.name}</span>
                        <span class="clip-duration">${formatTime(clip.duration)}</span>
                    </div>
                    <div class="clip-controls">
                        <button class="play-clip">Play</button>
                        <button class="download-clip">Download</button>
                        <button class="delete-clip">Delete</button>
                    </div>
                `;
                
                clipsContainer.appendChild(clipElement);
                
                // Add event listeners for play button
                clipElement.querySelector('.play-clip').addEventListener('click', () => {
                    playClip(clip);
                });
                
                // Add event listeners for download button
                clipElement.querySelector('.download-clip').addEventListener('click', () => {
                    downloadClip(clip);
                });
                
                // Add event listeners for delete button
                clipElement.querySelector('.delete-clip').addEventListener('click', () => {
                    deleteClip(clip.id);
                });
            });
        }
        
        // Add clips container to queue container if it's not already there
        if (!clipQueueContainer.querySelector('.clips-container')) {
            clipQueueContainer.appendChild(clipsContainer);
        }
    }
    
    // Play clip
    function playClip(clip) {
        const audio = new Audio(clip.url);
        audio.play();
    }
    
    // Download clip
    function downloadClip(clip) {
        const downloadLink = document.createElement('a');
        downloadLink.href = clip.url;
        downloadLink.download = `audio-clip-${clip.timestamp.toISOString().slice(0, 19).replace(/[:-]/g, '')}.wav`;
        downloadLink.click();
    }
    
    // Delete clip
    function deleteClip(id) {
        const clipIndex = clipQueue.findIndex(clip => clip.id === id);
        
        if (clipIndex !== -1) {
            // Revoke object URL to free memory
            URL.revokeObjectURL(clipQueue[clipIndex].url);
            
            // Remove from queue
            clipQueue.splice(clipIndex, 1);
            
            // Update UI
            updateClipQueue();
            
            showStatus('Clip deleted', 'success');
        }
    }
    
    // Download current audio
    function downloadAudio() {
        if (clipQueue.length === 0) return;
        
        // Download the most recent clip
        downloadClip(clipQueue[clipQueue.length - 1]);
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
            
            // Initialize empty clip queue
            updateClipQueue();
        }
    }
    
    init();
}); 