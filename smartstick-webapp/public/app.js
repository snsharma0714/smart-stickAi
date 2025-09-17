window.addEventListener('DOMContentLoaded', () => {
  // 1. Place map inside the white area on the left
  let mapArea = document.querySelector('div#map-area');
  if (!mapArea) {
    mapArea = document.createElement('div');
    mapArea.id = 'map-area';
    mapArea.style = 'width: 95%; height: 35vh; max-height: 350px; margin: 2rem auto 1rem auto; border-radius: 1rem; box-shadow: 0 2px 8px #0002; background: #fff; display: flex; align-items: center; justify-content: center;';
    // Insert as the first child of body (left column)
    document.body.insertBefore(mapArea, document.body.firstChild);
  }
  let mapDiv = document.getElementById('map');
  if (!mapDiv) {
    mapDiv = document.createElement('div');
    mapDiv.id = 'map';
    mapDiv.style = 'width: 100%; height: 100%; min-height: 200px; border-radius: 1rem;';
    mapArea.appendChild(mapDiv);
  } else {
    mapDiv.style.display = 'block';
    mapDiv.style.background = '#fff';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    mapDiv.innerHTML = '';
  }

  const video = document.getElementById('webcam');
  const statusDiv = document.getElementById('status');
  let model;
  let lastAnnouncedObjects = '';

  // Camera setup with toggle for front/back
  let currentFacingMode = 'environment';
  async function setupWebcam(facingMode = currentFacingMode) {
    if (video.srcObject) {
      // Stop all tracks before switching
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    const constraints = { video: { facingMode } };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      return new Promise(resolve => {
        video.onloadedmetadata = () => { resolve(); };
      });
    } catch (err) {
      // Fallback to default camera if facingMode fails
      const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = fallbackStream;
      return new Promise(resolve => {
        video.onloadedmetadata = () => { resolve(); };
      });
    }
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
    await setupWebcam(currentFacingMode);
    await tf.setBackend('cpu');
    model = await cocoSsd.load();
    statusDiv.innerText = 'Model loaded. Detecting objects...';
    detectFrame();
  }
  // Camera switch button logic
  const switchCameraBtn = document.getElementById('switch-camera-btn');
  if (switchCameraBtn) {
    switchCameraBtn.onclick = async () => {
      currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
      await setupWebcam(currentFacingMode);
    };
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
  speak('Smart stick activated. Please connect your earphones for best results.');
  // (Removed touch-to-reload feature)

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

  const voiceDestinationBtn = document.getElementById('voice-destination-btn');
  let spokenDestination = '';
  if (voiceDestinationBtn) {
    voiceDestinationBtn.onclick = () => {
      console.log('Speak Destination button clicked');
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
              let transcript = event.results[i][0].transcript.trim();
              // Remove any trailing prompt text if present
              transcript = transcript.replace(/,? ?please say your destination\.?$/i, '');
              spokenDestination = transcript;
              console.log('Filtered destination:', spokenDestination);
              if (!spokenDestination) {
                speak('No destination detected. Please try again and speak clearly.');
                return;
              }
              speak(`Destination received: ${spokenDestination}. Getting directions.`);
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

  // 2. Load Leaflet CSS if not present
  if (!document.getElementById('leaflet-style')) {
    const leafletStyle = document.createElement('link');
    leafletStyle.id = 'leaflet-style';
    leafletStyle.rel = 'stylesheet';
    leafletStyle.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletStyle);
  }

  // 3. Load Leaflet JS and run map logic only after loaded
  function loadLeafletAndRun(callback) {
    if (window.L) {
      callback();
    } else if (!window.leafletLoading) {
      window.leafletLoading = true;
      const leafletScript = document.createElement('script');
      leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      leafletScript.onload = () => { window.L = L; callback(); };
      document.body.appendChild(leafletScript);
    } else {
      setTimeout(() => loadLeafletAndRun(callback), 100);
    }
  }

  // 4. Map and navigation logic
  let map, routeLine, userMarker, stepMarkers = [], navSteps = [], navStepIndex = 0, navWatchId = null;

  function showRouteOnMap(origin, dest, geometry) {
    loadLeafletAndRun(() => {
      const mapDiv = document.getElementById('map');
      if (!mapDiv) return;
      mapDiv.innerHTML = '';
      if (map) { map.remove(); map = null; }
      map = L.map('map').setView([origin[1], origin[0]], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      // Draw route
      if (geometry && geometry.coordinates && geometry.coordinates.length > 0) {
        const coords = geometry.coordinates.map(c => [c[1], c[0]]);
        routeLine = L.polyline(coords, { color: '#e91e63', weight: 5 }).addTo(map);
      }
      // Mark start and end
      L.marker([origin[1], origin[0]]).addTo(map).bindPopup('Start').openPopup();
      L.marker([dest[1], dest[0]]).addTo(map).bindPopup('Destination');
      // User marker
      userMarker = L.circleMarker([origin[1], origin[0]], { radius: 8, color: '#2ecc40', fillColor: '#2ecc40', fillOpacity: 0.8 }).addTo(map);
    });
  }

  function startTurnByTurnNavigation(origin, dest, steps, geometry) {
    navSteps = steps.map((s, idx) => {
      let start_location = null;
      if (
        s.way_points &&
        Array.isArray(s.way_points) &&
        s.way_points.length > 0 &&
        geometry.coordinates &&
        geometry.coordinates.length > s.way_points[0] &&
        geometry.coordinates[s.way_points[0]]
      ) {
        start_location = geometry.coordinates[s.way_points[0]];
      } else if (geometry.coordinates && geometry.coordinates[idx]) {
        start_location = geometry.coordinates[idx];
      } else if (geometry.coordinates && geometry.coordinates.length > 0) {
        start_location = geometry.coordinates[geometry.coordinates.length - 1];
      }
      return (start_location && Array.isArray(start_location) && typeof start_location[0] === 'number' && typeof start_location[1] === 'number')
        ? { ...s, start_location } : null;
    }).filter(Boolean);
    // Always show the map with route, start, and destination markers
    showRouteOnMap(origin, dest, geometry);
    if (navSteps.length === 0) {
      speak('No valid navigation steps found, but your route and location are shown on the map.');
      return;
    }
    navStepIndex = 0;
    if (navWatchId) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = navigator.geolocation.watchPosition(
      pos => {
        const userLng = pos.coords.longitude;
        const userLat = pos.coords.latitude;
        if (userMarker) userMarker.setLatLng([userLat, userLng]);
        // Check if user is near the next step
        if (navStepIndex < navSteps.length) {
          const step = navSteps[navStepIndex];
          const [stepLng, stepLat] = step.start_location;
          if (typeof stepLng === 'number' && typeof stepLat === 'number') {
            const dist = Math.sqrt(Math.pow(userLat - stepLat, 2) + Math.pow(userLng - stepLng, 2)) * 111000; // meters
            if (dist < 20) { // 20 meters threshold
              speak(`Step ${navStepIndex + 1}: ${step.instruction}`);
              navStepIndex++;
            }
          }
        } else if (navStepIndex === navSteps.length) {
          speak('You have arrived at your destination.');
          navStepIndex++;
        }
      },
      err => speak('Unable to track your location for navigation.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  function showRouteOnMapSafe(origin, dest, geometry) {
    loadLeafletAndRun(() => showRouteOnMap(origin, dest, geometry));
  }
  function startTurnByTurnNavigationSafe(origin, dest, steps, geometry) {
    loadLeafletAndRun(() => startTurnByTurnNavigation(origin, dest, steps, geometry));
  }

  // 5. Update getDirectionsAndSpeakORS to use turn-by-turn navigation
  async function getDirectionsAndSpeakORS(originLat, originLng, destination) {
    const apiKey = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk3NmZiMDYwNDk0ZDQwNTY5YjZlMzdjY2Y2YTFkYTI5IiwiaCI6Im11cm11cjY0In0=';
    const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(destination)}`;
    try {
      const geoRes = await fetch(geocodeUrl);
      const geoData = await geoRes.json();
      if (geoData.features && geoData.features.length > 0) {
        // Find closest feature
        let minDist = Infinity, bestFeature = geoData.features[0];
        for (const feature of geoData.features) {
          const [lng, lat] = feature.geometry.coordinates;
          const dLat = (lat - originLat) * Math.PI / 180;
          const dLng = (lng - originLng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(originLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const dist = 6371 * c;
          if (dist < minDist) { minDist = dist; bestFeature = feature; }
        }
        const destCoords = bestFeature.geometry.coordinates;
        const directionsUrl = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${apiKey}`;
        const body = { coordinates: [ [originLng, originLat], [destCoords[0], destCoords[1]] ] };
        const dirRes = await fetch(directionsUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const dirData = await dirRes.json();
        let steps = [];
        let geometry = null;
        if (dirData.features && dirData.features.length > 0) {
          steps = dirData.features[0].properties.segments[0].steps;
          geometry = dirData.features[0].geometry;
        } else if (dirData.routes && dirData.routes.length > 0) {
          steps = dirData.routes[0].segments[0].steps;
          geometry = dirData.routes[0].geometry;
        }
        if (steps && steps.length > 0 && geometry) {
          startTurnByTurnNavigationSafe([originLng, originLat], destCoords, steps, geometry);
          speak('Navigation started. Follow the instructions as you walk.');
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
});
