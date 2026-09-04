// Prevent duplicate injection
if (window.hasUhmegleLocatorLoaded) {
    console.log("Locator already active.");
} else {
    window.hasUhmegleLocatorLoaded = true;

    // Load Leaflet CSS and JS dynamically so we don't need local asset files
    function loadMapDependencies() {
        if (document.getElementById('leaflet-css')) return;
        
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = initializeMapUI;
        document.head.appendChild(script);
    }

    let mapInstance = null;
    let markerInstance = null;

    function initializeMapUI() {
        if (document.getElementById('peer-locator-box')) return;

        // Create container UI overlay
        const container = document.createElement('div');
        container.id = 'peer-locator-box';
        container.innerHTML = `
            <div id="peer-locator-header">Peer Radar</div>
            <div id="peer-location-text">Waiting for connection...</div>
            <div id="map"></div>
        `;
        
        // Apply clean styling
        const style = document.createElement('style');
        style.innerHTML = `
            #peer-locator-box {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 300px;
                background: #1e1e1e;
                color: #ffffff;
                border-radius: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden;
                border: 1px solid #333;
            }
            #peer-locator-header {
                background: #2d2d2d;
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.5px;
                border-bottom: 1px solid #3d3d3d;
            }
            #peer-location-text {
                padding: 10px 14px;
                font-size: 12px;
                color: #b0b0b0;
                background: #252525;
            }
            #map {
                width: 100%;
                height: 180px;
                background: #111;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(container);

        // Initialize Leaflet Map
        if (window.L) {
            mapInstance = L.map('map').setView([20, 0], 1);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
                attribution: '© OpenStreetMap'
            }).addTo(mapInstance);
        }
    }

    // Intercept WebRTC Peer Connection to pull public IP candidates
    const OriginalPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OriginalPeerConnection) {
        window.RTCPeerConnection = function (...args) {
            const pc = new OriginalPeerConnection(...args);

            pc.addEventListener('icecandidate', (event) => {
                if (event.candidate && event.candidate.candidate) {
                    const candidateLine = event.candidate.candidate;
                    // Regex to parse IPv4 addresses from ICE candidates
                    const ipMatch = candidateLine.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
                    
                    if (ipMatch) {
                        const ip = ipMatch[1];
                        // Filter out local network IPs
                        if (!ip.startsWith('192.') && !ip.startsWith('10.') && !ip.startsWith('127.')) {
                            fetchPeerLocation(ip);
                        }
                    }
                }
            });

            return pc;
        };
        window.RTCPeerConnection.prototype = OriginalPeerConnection.prototype;
    }

    let lastFetchedIp = "";
    async function fetchPeerLocation(ip) {
        if (lastFetchedIp === ip) return; // Prevent spamming requests for the same peer connection
        lastFetchedIp = ip;

        try {
            const response = await fetch(`https://ipapi.co/${ip}/json/`);
            const data = await response.json();

            if (data.error) {
                console.warn("IP Lookup limitation hit:", data.reason);
                return;
            }

            const city = data.city || "Unknown City";
            const region = data.region || "Unknown Region";
            const country = data.country_name || "Unknown Country";
            const lat = data.latitude;
            const lon = data.longitude;

            // Update UI text
            const textBox = document.getElementById('peer-location-text');
            if (textBox) {
                textBox.innerHTML = `<b style="color: #fff;">${city}, ${region}</b><br>${country}`;
            }

            // Update Map Pin
            if (mapInstance && lat && lon) {
                mapInstance.setView([lat, lon], 10);
                if (markerInstance) {
                    mapInstance.removeLayer(markerInstance);
                }
                markerInstance = L.marker([lat, lon]).addTo(mapInstance);
            }
        } catch (err) {
            console.error("Geolocation fetch error:", err);
        }
    }

    // Trigger UI injection once the document body is ready
    if (document.body) {
        loadMapDependencies();
    } else {
        document.addEventListener('DOMContentLoaded', loadMapDependencies);
    }
}