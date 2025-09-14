const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');
let model;
let lastObjects = '';
let lastDirection = '';
let sirenAudio = null;
let lastSpeakTime = 0;
const SPEAK_INTERVAL = 5000; // 5 seconds

// Load siren sound
function loadSiren() {
  sirenAudio = new Audio('https://cdn.pixabay.com/audio/2022/10/16/audio_12b6b1b7b7.mp3'); // Free siren sound
}

function playSiren() {
  if (sirenAudio) {
    sirenAudio.currentTime = 0;
    sirenAudio.play();
  }
}

async function setupWebcam() {
  const constraints = { video: { width: 320, height: 240 } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => { resolve(); };
  });
}

// Mobile-friendly UI prompt
const promptDiv = document.createElement('div');
promptDiv.style.position = 'fixed';
promptDiv.style.bottom = '1rem';
promptDiv.style.left = '50%';
promptDiv.style.transform = 'translateX(-50%)';
promptDiv.style.background = '#e91e63';
promptDiv.style.color = '#fff';
promptDiv.style.padding = '1rem 2rem';
promptDiv.style.borderRadius = '2rem';
promptDiv.style.fontSize = '1.2rem';
promptDiv.style.zIndex = '999';
promptDiv.style.boxShadow = '0 2px 8px #0005';
promptDiv.innerText = 'App is running. Point your camera and listen for guidance.';
document.body.appendChild(promptDiv);

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  }
}

function vibrate(pattern = [200, 100, 200]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function getDirection(predictions) {
  // Analyze bounding boxes to suggest direction
  const width = video.videoWidth;
  let left = 0, right = 0, center = 0;
  predictions.forEach(p => {
    const x = p.bbox[0];
    const w = p.bbox[2];
    if (x + w < width / 3) left++;
    else if (x > 2 * width / 3) right++;
    else center++;
  });
  if (center > 0) return 'center';
  if (left > right) return 'left';
  if (right > left) return 'right';
  return 'clear';
}

function isTrafficObject(predictions) {
  // Detect vehicles, traffic light, bus, etc.
  return predictions.some(p => ['car','bus','truck','motorcycle','bicycle','traffic light'].includes(p.class));
}

function estimateDistance(bbox) {
  // Simple estimation: smaller bbox width = farther object
  // Calibrate based on camera FOV and resolution for better accuracy
  const refWidth = 320; // webcam width
  const refObjWidth = 80; // typical object width in pixels at 1 meter
  const objWidth = bbox[2];
  const distance = (refObjWidth / objWidth) || 0;
  // Clamp and round for user-friendly output
  return Math.max(0.5, Math.min(distance, 5)).toFixed(1); // meters
}

async function runDetection() {
  loadSiren();
  await setupWebcam();
  model = await cocoSsd.load();
  statusDiv.innerText = 'Model loaded. Detecting objects...';
  detectFrame();
}

async function detectFrame() {
  const predictions = await model.detect(video);
  let objects = predictions.map(p => p.class).join(', ');
  let direction = getDirection(predictions);
  let traffic = isTrafficObject(predictions);

  let distanceMsg = '';
  let speakMsg = '';
  const now = Date.now();
  if (predictions.length > 0) {
    let closest = predictions.reduce((a, b) => (a.bbox[2] > b.bbox[2] ? a : b));
    let distance = estimateDistance(closest.bbox);
    distanceMsg = `${closest.class} detected, ${distance} meters ahead.`;
    statusDiv.innerText = `Detected: ${objects}\n${distanceMsg}`;
    if (traffic) {
      speakMsg = `Caution! Vehicle or traffic detected. ${distanceMsg}`;
      vibrate([500, 200, 500]);
      playSiren();
    } else {
      if (direction === 'left') speakMsg = `Obstacle left. Move right. ${distanceMsg}`;
      else if (direction === 'right') speakMsg = `Obstacle right. Move left. ${distanceMsg}`;
      else if (direction === 'center') speakMsg = `Obstacle ahead. Scan left and right. ${distanceMsg}`;
      else speakMsg = `Path clear. Go forward.`;
      vibrate();
    }
    speak(speakMsg);
    lastSpeakTime = now;
    lastObjects = objects;
    lastDirection = direction;
  } else {
    statusDiv.innerText = 'No obstacles detected.';
    if (lastObjects !== '' || lastDirection !== 'clear') {
      speak('Path is now clear. You can move forward.');
      vibrate([100]);
      lastObjects = '';
      lastDirection = 'clear';
      lastSpeakTime = now;
    }
  }
  setTimeout(() => requestAnimationFrame(detectFrame), 100);
}

// Voice command support
let recognition;
function setupVoiceCommands() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = function(event) {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const command = event.results[i][0].transcript.trim().toLowerCase();
          if (command.includes('scan left')) {
            speak('Scanning left. Please move your camera to the left.');
          } else if (command.includes('scan right')) {
            speak('Scanning right. Please move your camera to the right.');
          } else if (command.includes('go forward')) {
            speak('Moving forward. Please proceed.');
          } else if (command.includes('help')) {
            speak('Emergency help activated.');
            vibrate([500, 200, 500]);
            playSiren();
          }
        }
      }
    };
    recognition.onerror = function(event) {
      console.log('Voice recognition error:', event.error);
    };
    recognition.start();
  } else {
    console.log('Speech recognition not supported in this browser.');
  }
}

// Spoken onboarding tutorial for visually impaired users
function onboardingTutorial() {
  const tutorial = `Welcome to Smart Stick App. This app will guide you using voice and vibration. Point your phone camera ahead and listen for instructions. You can use voice commands like 'scan left', 'scan right', or 'go forward'. To repeat the last message, say 'repeat'. You do not need to look at the screen. All feedback is provided by sound and vibration.`;
  speak(tutorial);
}

window.addEventListener('load', () => {
  runDetection();
  setupVoiceCommands();
  onboardingTutorial();
});
