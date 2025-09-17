const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');
let model;
let lastObjects = '';
let lastDirection = '';
let sirenAudio = null;
let lastSpeakTime = 0;
const SPEAK_INTERVAL = 5000; // 5 seconds
let useBackCamera = true;

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

// Add camera toggle button
const cameraToggleBtn = document.createElement('button');
cameraToggleBtn.innerText = 'Switch Camera';
cameraToggleBtn.style.position = 'fixed';
cameraToggleBtn.style.top = '1rem';
cameraToggleBtn.style.right = '1rem';
cameraToggleBtn.style.zIndex = '1000';
cameraToggleBtn.style.background = '#e91e63';
cameraToggleBtn.style.color = '#fff';
cameraToggleBtn.style.border = 'none';
cameraToggleBtn.style.borderRadius = '1rem';
cameraToggleBtn.style.padding = '0.7rem 1.2rem';
cameraToggleBtn.style.fontSize = '1rem';
cameraToggleBtn.style.boxShadow = '0 2px 8px #0005';
document.body.appendChild(cameraToggleBtn);

cameraToggleBtn.onclick = async () => {
  useBackCamera = !useBackCamera;
  await setupWebcam();
};

async function setupWebcam() {
  // Use back or front camera based on toggle
  let constraints;
  if (useBackCamera) {
    constraints = { video: { facingMode: { exact: "environment" }, width: 320, height: 240 } };
  } else {
    constraints = { video: { facingMode: "user", width: 320, height: 240 } };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    return new Promise(resolve => {
      video.onloadedmetadata = () => { resolve(); };
    });
  } catch (err) {
    // Fallback to default camera if requested camera is not available
    const fallbackConstraints = { video: { width: 320, height: 240 } };
    const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    video.srcObject = stream;
    return new Promise(resolve => {
      video.onloadedmetadata = () => { resolve(); };
    });
  }
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
      if (direction === 'left') speakMsg = `Obstacle on the left. Please move right.`;
      else if (direction === 'right') speakMsg = `Obstacle on the right. Please move left.`;
      else if (direction === 'center') speakMsg = `Obstacle ahead. Please scan left and right.`;
      else speakMsg = `Path is clear. You can go forward.`;
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
  setTimeout(() => requestAnimationFrame(detectFrame), 50); // Faster detection loop
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

// GPS integration: Announce current location
const gpsBtn = document.createElement('button');
gpsBtn.innerText = 'Announce Location';
gpsBtn.style.position = 'fixed';
gpsBtn.style.bottom = '4rem';
gpsBtn.style.right = '1rem';
gpsBtn.style.zIndex = '1000';
gpsBtn.style.background = '#1976d2';
gpsBtn.style.color = '#fff';
gpsBtn.style.border = 'none';
gpsBtn.style.borderRadius = '1rem';
gpsBtn.style.padding = '0.7rem 1.2rem';
gpsBtn.style.fontSize = '1rem';
gpsBtn.style.boxShadow = '0 2px 8px #0005';
document.body.appendChild(gpsBtn);

gpsBtn.onclick = () => {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lon = position.coords.longitude.toFixed(5);
        speak(`Your current location is latitude ${lat}, longitude ${lon}.`);
      },
      () => {
        speak('Unable to get your location.');
      }
    );
  } else {
    speak('Geolocation is not supported on this device.');
  }
};

// Step 1: Destination input for navigation
const navDiv = document.createElement('div');
navDiv.style.position = 'fixed';
navDiv.style.top = '1rem';
navDiv.style.left = '50%';
navDiv.style.transform = 'translateX(-50%)';
navDiv.style.background = '#fff';
navDiv.style.padding = '1rem 2rem';
navDiv.style.borderRadius = '2rem';
navDiv.style.boxShadow = '0 2px 8px #0005';
navDiv.style.zIndex = '1001';
navDiv.innerHTML = `
  <label for="destination" style="font-size:1rem; color:#333;">Destination:</label>
  <input id="destination" type="text" placeholder="Enter destination" style="margin-left:0.5rem; width:180px; font-size:1rem;">
  <button id="navigateBtn" style="margin-left:0.5rem; font-size:1rem; background:#1976d2; color:#fff; border:none; border-radius:1rem; padding:0.5rem 1rem;">Navigate</button>
`;
document.body.appendChild(navDiv);

document.getElementById('navigateBtn').onclick = async () => {
  const destination = document.getElementById('destination').value;
  if (!destination) {
    speak('Please enter a destination.');
    return;
  }
  speak(`Getting directions to ${destination}.`);
  // Step 2: Prepare for geocoding and route guidance (API integration needed)
  // You can use Google Maps Directions API or OpenRouteService API here
  // For now, just announce the destination
  // TODO: Integrate with directions API and announce step-by-step guidance
}

// Remove duplicate event listeners and use only the correct button ID
const voiceDestinationBtn = document.getElementById('voice-destination-btn');
let spokenDestination = '';
if (voiceDestinationBtn) {
  voiceDestinationBtn.onclick = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const destinationRecognition = new SpeechRecognition();
      destinationRecognition.continuous = false;
      destinationRecognition.interimResults = false;
      destinationRecognition.lang = 'en-US';
      speak('Please say your destination.');
      destinationRecognition.onresult = function(event) {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            spokenDestination = event.results[i][0].transcript.trim();
            speak(`Destination received: ${spokenDestination}. Getting directions.`);
            // Start navigation with OpenRouteService
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                position => {
                  const lat = position.coords.latitude;
                  const lng = position.coords.longitude;
                  getDirectionsAndSpeakORS(lat, lng, spokenDestination);
                },
                () => speak('Unable to get your current location.')
              );
            } else {
              speak('Geolocation is not supported.');
            }
          }
        }
      };
      destinationRecognition.onerror = function(event) {
        speak('Sorry, I could not understand. Please try again.');
      };
      destinationRecognition.start();
    } else {
      speak('Speech recognition not supported in this browser.');
      alert('Speech recognition not supported in this browser.');
    }
  };
} else {
  console.error('Speak Destination button not found in DOM');
}

// Step 2: Spoken route guidance using OpenRouteService API
async function getDirectionsAndSpeakORS(originLat, originLng, destination) {
  const apiKey = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk3NmZiMDYwNDk0ZDQwNTY5YjZlMzdjY2Y2YTFkYTI5IiwiaCI6Im11cm11cjY0In0=';
  // Geocode destination to get coordinates
  const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(destination)}`;
  try {
    const geoRes = await fetch(geocodeUrl);
    const geoData = await geoRes.json();
    if (geoData.features && geoData.features.length > 0) {
      const destCoords = geoData.features[0].geometry.coordinates;
      // Get walking directions
      const directionsUrl = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${apiKey}`;
      const body = {
        coordinates: [
          [originLng, originLat],
          [destCoords[0], destCoords[1]]
        ]
      };
      const dirRes = await fetch(directionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const dirData = await dirRes.json();
      if (dirData.features && dirData.features.length > 0) {
        const steps = dirData.features[0].properties.segments[0].steps;
        for (let i = 0; i < steps.length; i++) {
          const instruction = steps[i].instruction;
          speak(`Step ${i + 1}: ${instruction}`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before next step
        }
        speak('You have arrived at your destination.');
      } else {
        speak('Sorry, directions could not be found.');
      }
    } else {
      speak('Could not find destination location.');
    }
  } catch (err) {
    speak('Error getting directions.');
  }
}

// Trigger navigation after voice input
function startNavigationWithVoiceORS() {
  if (spokenDestination) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          getDirectionsAndSpeakORS(lat, lng, spokenDestination);
        },
        () => speak('Unable to get your current location.')
      );
    } else {
      speak('Geolocation is not supported.');
    }
  } else {
    speak('No destination provided.');
  }
}

// Update voiceDestinationBtn to start navigation after receiving destination
const originalVoiceBtnHandler = document.getElementById('voiceDestinationBtn').onclick;
document.getElementById('voiceDestinationBtn').onclick = () => {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const destinationRecognition = new SpeechRecognition();
    destinationRecognition.continuous = false;
    destinationRecognition.interimResults = false;
    destinationRecognition.lang = 'en-US';
    speak('Please say your destination.');
    destinationRecognition.onresult = function(event) {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          spokenDestination = event.results[i][0].transcript.trim();
          speak(`Destination received: ${spokenDestination}. Getting directions.`);
          startNavigationWithVoiceORS();
        }
      }
    };
    destinationRecognition.onerror = function(event) {
      speak('Sorry, I could not understand. Please try again.');
    };
    destinationRecognition.start();
  } else {
    speak('Speech recognition not supported in this browser.');
  }
};

window.addEventListener('load', () => {
  runDetection();
  setupVoiceCommands();
  onboardingTutorial();
});
