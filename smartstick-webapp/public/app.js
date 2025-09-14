const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');
let model;
let lastAnnouncedObjects = '';

async function setupWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => { resolve(); };
  });
}

function speak(text) {
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utter);
  }
}

function vibrate() {
  if ('vibrate' in navigator) {
    // Strong, long vibration pattern
    navigator.vibrate([500, 200, 500]);
  }
}

async function runDetection() {
  await setupWebcam();
  await tf.setBackend('cpu');
  model = await cocoSsd.load();
  statusDiv.innerText = 'Model loaded. Detecting objects...';
  detectFrame();
}

async function detectFrame() {
  const predictions = await model.detect(video);
  let objects = predictions.map(p => p.class);
  let objectsStr = objects.join(', ');
  statusDiv.innerText = objects.length > 0 ? `Detected: ${objectsStr}` : 'No obstacles detected.';
  if (objectsStr !== lastAnnouncedObjects) {
    if (objects.length > 0) {
      objects.forEach(obj => {
        speak(`Warning! ${obj} ahead.`);
        vibrate();
      });
    }
    lastAnnouncedObjects = objectsStr;
  }
  requestAnimationFrame(detectFrame);
}

runDetection();
// Startup spoken instruction
window.addEventListener('DOMContentLoaded', () => {
  speak('Smart stick activated. Please connect your earphones for best results.');
  // Start detection immediately
  runDetection();
  // Add touch-to-reload feature
  document.body.addEventListener('touchstart', () => {
    location.reload();
  });

  // Emergency long-press for location
  let pressTimer;
  document.body.addEventListener('touchstart', function(e) {
    pressTimer = setTimeout(function() {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(function(pos) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          speak(`Emergency! Your location is latitude ${lat}, longitude ${lon}.`);
          // For email, open mailto link (user must send manually)
          window.open(`mailto:?subject=Emergency Location&body=My location is: https://maps.google.com/?q=${lat},${lon}`);
        }, function() {
          speak('Unable to get location.');
        });
      } else {
        speak('Geolocation not supported.');
      }
    }, 1500); // 1.5s long-press
  });
  document.body.addEventListener('touchend', function(e) {
    clearTimeout(pressTimer);
  });

  // Battery status alert
  if ('getBattery' in navigator) {
    navigator.getBattery().then(function(battery) {
      if (battery.level <= 0.2) {
        speak('Warning! Battery is low.');
      }
    });
  }
});
