# Audio Clipper

A simple, clean HTML5 audio recording tool with a modern black and white design.

## Features

- Microphone selection from available audio input devices
- Live waveform visualization of audio input
- Customizable recording duration (1-300 seconds)
- Automatic recording stop based on preset duration
- Clip queue for managing multiple recordings
- Play, download, or delete individual audio clips
- Download recorded audio clips as WAV files

## Usage

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge recommended)
2. Allow microphone access when prompted
3. Select your preferred microphone from the dropdown menu
4. Set your desired recording duration (in seconds)
5. Click "Record" to start recording
6. Recording will automatically stop after the specified duration
7. The clip will be added to the clip queue below
8. You can play, download, or delete each clip in the queue
9. Alternatively, click "Download Clip" to save the most recent recording

## Notes

- This application requires microphone access permissions
- All audio processing is done locally in your browser; no data is sent to any server
- For best results, use in a quiet environment and position the microphone properly
- The application works best in modern browsers with Web Audio API support
- Clips are stored in browser memory and will be lost when the page is refreshed or closed

## Technical Implementation

- Built with vanilla JavaScript, HTML5, and CSS
- Uses the Web Audio API for audio processing and real-time waveform visualization
- Uses the MediaRecorder API for recording audio
- Implements requestAnimationFrame for smooth waveform animation
- Responsive design that works on both desktop and mobile devices

## Browser Compatibility

- Chrome 49+
- Firefox 53+
- Edge 79+
- Safari 14.1+ 