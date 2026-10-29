

const video = document.getElementById("camera-view");
const canvas = document.getElementById("final-canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start-btn");
const startBtnLabel = document.getElementById("start-btn-label");
const downloadBtn = document.getElementById("download-btn");
const sendEmailBtn = document.getElementById("send-email-btn");
const sendEmailLabel = document.getElementById("send-email-label");
const emailInput = document.getElementById("email-input");
const emailStatus = document.getElementById("email-status");
const emailApiUrl = (() => {
    const apiUrl = new URL("/api/send-email", window.location.origin);
    if (
        window.location.port === "5500" ||
        (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "3000")
    ) {
        apiUrl.port = "3000";
    }
    return apiUrl.toString();
})();
const flashEl = document.getElementById("flash");
const cropGuide = document.getElementById("crop-guide");
const hudShotCounter = document.getElementById("hud-shot-counter");
const cameraStatusPill = document.getElementById("camera-status-pill");
const cameraStatusText = document.getElementById("camera-status-text");
const cameraErrorBanner = document.getElementById("camera-error-banner");
const cameraErrorMsg = document.getElementById("camera-error-msg");
const btnRetryCamera = document.getElementById("btn-retry-camera");
const switchCameraBtn = document.getElementById("switch-camera-btn");
const switchCameraLabel = document.getElementById("switch-camera-label");

const selectionGrid = document.getElementById("selection-grid");
const confirmSelectionBtn = document.getElementById("confirm-selection-btn");
const btnRetake = document.getElementById("btn-retake");
const btnBackToSelect = document.getElementById("btn-back-to-select");
const btnNext3 = document.getElementById("btn-next-3");
const btnBackToStudio = document.getElementById("btn-back-to-studio");
const btnRestart = document.getElementById("btn-restart");
const countdownBtn = document.getElementById("countdown-btn");
const mirrorToggle = document.getElementById("mirror-toggle");

let countdownCanceled = false;
let mirroringEnabled = true;

const photoPool = document.getElementById("photo-pool");
const activeSlotLabel = document.getElementById("active-slot-label");
const slotHotspots = document.querySelectorAll(".slot-hotspot");

const stageViews = document.querySelectorAll(".stage-view");
const stepNodes = document.querySelectorAll(".step-node");

let activeStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let capturedPhotos = [];
let selectedSlotIndices = [0, 1, 2];
let activeReplacingSlot = 0;
let currentFilter = "none";
let currentFrameImg = null;

const DEFAULT_WINDOW_SET = [118, 122, 692, 742];

const FRAMES = [
    {
        title: "Emerald",
        windows: [
            [126, 193, 680, 754],
            [128, 912, 683, 1473],
            [117, 1683, 672, 2244],
        ],
    },
    {
        title: "Midnight Floral",
        windows: [
            [108, 141, 641, 756],
            [135, 906, 662, 1494],
            [135, 1675, 653, 2261],
        ],
    },
    {
        title: "Mean Girls",
        windows: [
            [149, 129, 677, 669],
            [154, 904, 682, 1444],
            [154, 1675, 682, 2300],
        ],
    },
    {
        title: "Kitten",
        windows: [
            [164, 119, 632, 734],
            [164, 890, 639, 1504],
            [164, 1645, 636, 2262],
        ],
    },
    {
        title: "Stitch",
        windows: [
            [118, 180, 692, 741],
            [116, 894, 690, 1513],
            [118, 1665, 692, 2283],
        ],
    },
    {
        title: "Bunny Blue",
        windows: [
            [118, 122, 692, 742],
            [118, 894, 690, 1514],
            [118, 1665, 692, 2285],
        ],
    },
    {
        title: "Kawaii",
    },
    {
        title: "Bunny Beige",
    },
    {
        title: "Le Juifvin",
        windows: [
            [118, 124, 692, 739],
            [118, 892, 693, 1507],
            [110, 1668, 693, 2282],
        ],
    },
    { title: "Blush" },
    { title: "Sky Blue" },
    { title: "Berry" },
    { title: "Sage" },
    { title: "Pink Bear" },
];

FRAMES.forEach((frame, idx) => {
    frame.id = `pb-${String(idx + 1).padStart(2, "0")}`;
    if (!frame.windows) frame.windows = DEFAULT_WINDOW_SET;
});

const customFrameWindowMap = Object.fromEntries(FRAMES.map((f) => [f.id, f.windows]));

function buildFrameSidebar() {
    const sidebar = document.getElementById("frame-sidebar");
    if (!sidebar) return;
    sidebar.innerHTML = "";
    FRAMES.forEach((frame, idx) => {
        const img = document.createElement("img");
        img.src = `assets/frames/PB${String(idx + 1).padStart(2, "0")}.png`;
        img.className = `frame-item${idx === 0 ? " selected" : ""}`;
        img.dataset.id = frame.id;
        img.crossorigin = "anonymous";
        img.title = frame.title;
        img.alt = `${frame.title} frame preview`;
        sidebar.appendChild(img);
    });
    currentFrameImg = sidebar.querySelector(".frame-item");
}

buildFrameSidebar();

const standardFrameWindows = [
    [80, 80, 720, 773],
    [80, 853, 720, 1546],
    [80, 1627, 720, 2320],
];

function goToStage(num) {
    stageViews.forEach((view, idx) => {
        view.classList.toggle("active", idx + 1 === num);
    });

    stepNodes.forEach((node, idx) => {
        const stepNum = idx + 1;
        node.classList.toggle("active", stepNum === num);
        node.classList.toggle("completed", stepNum < num);
    });

    if (num === 1) {
        initCameraStream();
        const isComplete = capturedPhotos.length >= 6;
        if (startBtn) startBtn.disabled = isComplete;
        if (isComplete) startBtnLabel.innerText = "All 6 Photos Captured";
    } else {
        cancelPendingCountdown();
        if (video && video.srcObject) {
            video.pause();
        }
    }

    if (num === 3) {
        const canvasHolder = document.getElementById("canvas-wrapper-3");
        if (canvasHolder && canvas.parentElement !== canvasHolder) {
            canvasHolder.insertBefore(canvas, canvasHolder.firstChild);
        }
        renderStudio();
    }

    if (num === 4) {
        const printEasel = document.getElementById("canvas-wrapper-4");
        if (printEasel && canvas.parentElement !== printEasel) {
            printEasel.appendChild(canvas);
        }
    }
}

async function enumerateCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter((d) => d.kind === "videoinput");
        if (switchCameraBtn) {
            switchCameraBtn.disabled = availableCameras.length === 0;
            switchCameraBtn.title =
                availableCameras.length === 0 ? "No cameras detected" : availableCameras.length === 1 ? "Only one camera available" : "Switch Camera";
        }
    } catch (e) {
        console.warn("enumerateDevices failed:", e);
    }
}

async function startCameraById(deviceId) {
    if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
    }
    updateCameraStatus("Connecting Camera...", "warning");
    if (cameraErrorBanner) cameraErrorBanner.style.display = "none";
    try {
        const constraints = {
            video: deviceId
                ? {
                      deviceId: { exact: deviceId },
                      width: { ideal: 1920, min: 1280 },
                      height: { ideal: 1080, min: 720 },
                  }
                : { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, facingMode: "user" },
            audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            updateCameraStatus("Camera Ready", "ready");
            updateGuideDimensions();
        };

        await enumerateCameras();
    } catch (err) {
        console.error("Camera access failed:", err);
        let message = "Please grant camera permissions in your browser to proceed.";
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            message = "No camera device was detected on your computer.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            message = "Your camera is currently in use by another application.";
        }
        showCameraError(message);
    }
}

async function initCameraStream() {
    if (activeStream && activeStream.active) {
        try {
            await video.play();
            updateCameraStatus("Camera Ready", "ready");
            return;
        } catch (e) {
            console.warn("Video resume error:", e);
        }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const secure = window.isSecureContext !== false;
        showCameraError(
            secure
                ? "Webcam API is not supported by your browser or environment."
                : "Camera access is blocked because you opened the app over an insecure connection. Open it using http://localhost:3000 instead of the LAN IP or Live Server URL, then reload.",
        );
        return;
    }

    await startCameraById(null);
}

if (btnRetryCamera) {
    btnRetryCamera.onclick = () => initCameraStream();
}

if (switchCameraBtn) {
    const camMenu = document.getElementById("cam-dropdown-menu");

    function buildCameraMenu() {
        if (!camMenu) return;
        camMenu.innerHTML = "";
        availableCameras.forEach((cam, i) => {
            const label = cam.label || `Camera ${i + 1}`;
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", i === currentCameraIndex ? "true" : "false");
            li.className = "cam-dropdown-item" + (i === currentCameraIndex ? " active" : "");
            li.innerHTML = `
                <span class="cam-item-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                </span>
                <span>${label.length > 28 ? label.slice(0, 26) + "…" : label}</span>`;
            li.onclick = async () => {
                if (i === currentCameraIndex) {
                    closeDropdown();
                    return;
                }
                currentCameraIndex = i;
                const shortLabel = label.length > 16 ? label.slice(0, 14) + "…" : label;
                if (switchCameraLabel) switchCameraLabel.textContent = shortLabel;
                closeDropdown();
                await startCameraById(cam.deviceId);
                buildCameraMenu();
            };
            camMenu.appendChild(li);
        });
    }

    function openDropdown() {
        buildCameraMenu();
        camMenu.classList.add("open");
        switchCameraBtn.setAttribute("aria-expanded", "true");
    }

    function closeDropdown() {
        camMenu.classList.remove("open");
        switchCameraBtn.setAttribute("aria-expanded", "false");
    }

    switchCameraBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = camMenu.classList.contains("open");
        isOpen ? closeDropdown() : openDropdown();
    };

    document.addEventListener("click", (e) => {
        if (!document.getElementById("cam-dropdown-wrap")?.contains(e.target)) {
            closeDropdown();
        }
    });
}

window.addEventListener("resize", updateGuideDimensions);

function updateCameraStatus(text, state) {
    if (!cameraStatusText || !cameraStatusPill) return;
    cameraStatusText.innerText = text;
    cameraStatusPill.classList.remove("warning", "error");
    if (state === "warning") cameraStatusPill.classList.add("warning");
    if (state === "error") cameraStatusPill.classList.add("error");
}

function showCameraError(msg) {
    if (cameraErrorBanner && cameraErrorMsg) {
        cameraErrorMsg.innerText = msg;
        cameraErrorBanner.style.display = "flex";
    }
    updateCameraStatus("Camera Offline", "error");
}

function updateGuideDimensions() {
    if (!video || !cropGuide) return;
    const guideBox = cropGuide.querySelector(".guide-box");
    if (!guideBox) return;

    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const slotRatio = 0.923;
    const paddingFactor = 0.88;

    let targetHeight = rect.height * paddingFactor;
    let targetWidth = targetHeight * slotRatio;

    if (targetWidth > rect.width * paddingFactor) {
        targetWidth = rect.width * paddingFactor;
        targetHeight = targetWidth / slotRatio;
    }

    guideBox.style.width = `${Math.round(targetWidth)}px`;
    guideBox.style.height = `${Math.round(targetHeight)}px`;
}

function triggerFlash() {
    if (!flashEl) return;
    flashEl.style.opacity = "1";
    setTimeout(() => {
        flashEl.style.opacity = "0";
    }, 100);
}

function captureVideoFrame() {
    const shotCanvas = document.createElement("canvas");
    shotCanvas.width = video.videoWidth || 1280;
    shotCanvas.height = video.videoHeight || 720;
    const tCtx = shotCanvas.getContext("2d");

    if (mirroringEnabled) {
        tCtx.translate(shotCanvas.width, 0);
        tCtx.scale(-1, 1);
    }
    tCtx.drawImage(video, 0, 0, shotCanvas.width, shotCanvas.height);
    capturedPhotos.push(shotCanvas);
}

async function countdownTick(seconds) {
    const overlay = document.getElementById("countdown-overlay");
    for (let s = seconds; s > 0; s--) {
        if (countdownCanceled) return false;
        if (overlay) overlay.textContent = s;
        await new Promise((r) => setTimeout(r, 1000));
    }
    if (overlay) overlay.textContent = "";
    return !countdownCanceled;
}

function resetCountdownButton() {
    countdownCanceled = false;
    countdownBtn.setAttribute("aria-pressed", "false");
    const overlay = document.getElementById("countdown-overlay");
    if (overlay) overlay.textContent = "";
}

function cancelPendingCountdown() {
    countdownCanceled = true;
}

countdownBtn.onclick = () => {
    countdownCanceled = false;
    const enabled = countdownBtn.getAttribute("aria-pressed") !== "true";
    countdownBtn.setAttribute("aria-pressed", String(enabled));
    const overlay = document.getElementById("countdown-overlay");
    if (!enabled && overlay) overlay.textContent = "";
    if (startBtn && !startBtn.disabled && capturedPhotos.length < 6) {
        startBtnLabel.innerText = remainingStatusLabel();
    }
};

function remainingStatusLabel() {
    const n = capturedPhotos.length;
    if (n >= 6) return "All 6 Photos Captured";
    return `Capture Photo ${n + 1} of 6`;
}

mirrorToggle.onclick = () => {
    mirroringEnabled = !mirroringEnabled;
    mirrorToggle.setAttribute("aria-pressed", String(mirroringEnabled));
    video.classList.toggle("no-mirror", !mirroringEnabled);
};

startBtn.onclick = async () => {
    if (capturedPhotos.length >= 6 || countdownCanceled) return;
    startBtn.disabled = true;
    if (!video || video.readyState < 2 || !video.videoWidth) {
        updateCameraStatus("Camera not ready", "warning");
        startBtn.disabled = false;
        return;
    }

    if (countdownBtn.getAttribute("aria-pressed") === "true") {
        if (!countdownBtn.disabled) countdownBtn.disabled = true;
        const ok = await countdownTick(3);
        countdownBtn.disabled = false;
        if (!ok) {
            countdownCanceled = false;
            if (hudShotCounter) hudShotCounter.innerText = `${capturedPhotos.length} of 6 Captured`;
            startBtnLabel.innerText = remainingStatusLabel();
            startBtn.disabled = false;
            return;
        }
    }

    triggerFlash();
    captureVideoFrame();

    const photosCaptured = capturedPhotos.length;
    if (hudShotCounter) hudShotCounter.innerText = `${photosCaptured} of 6 Captured`;

    if (photosCaptured === 6) {
        startBtn.disabled = true;
        startBtnLabel.innerText = "All 6 Photos Captured";
        if (hudShotCounter) hudShotCounter.innerText = "6 of 6 Complete";
        buildSelectionGallery();
        goToStage(2);
        return;
    }

    startBtnLabel.innerText = `Capture Photo ${photosCaptured + 1} of 6`;
};

function buildSelectionGallery() {
    selectionGrid.innerHTML = "";
    selectedSlotIndices = [0, 1, 2];

    capturedPhotos.forEach((photoCanvas, idx) => {
        const card = document.createElement("div");
        card.className = "photo-card";
        card.dataset.index = idx;

        const img = document.createElement("img");
        img.src = photoCanvas.toDataURL("image/jpeg", 0.9);

        const orderBadge = document.createElement("div");
        orderBadge.className = "order-badge";

        const assignedPos = selectedSlotIndices.indexOf(idx);
        if (assignedPos !== -1) {
            card.classList.add("selected");
            orderBadge.innerText = assignedPos + 1;
            orderBadge.style.display = "flex";
        } else {
            orderBadge.style.display = "none";
        }

        card.onclick = () => {
            const foundIdx = selectedSlotIndices.indexOf(idx);
            if (foundIdx !== -1) {

                selectedSlotIndices.splice(foundIdx, 1);
            } else {
                if (selectedSlotIndices.length < 3) {
                    selectedSlotIndices.push(idx);
                } else {

                    selectedSlotIndices.shift();
                    selectedSlotIndices.push(idx);
                }
            }
            refreshGalleryBadges();
        };

        card.appendChild(img);
        card.appendChild(orderBadge);
        selectionGrid.appendChild(card);
    });
}

function refreshGalleryBadges() {
    const cards = selectionGrid.querySelectorAll(".photo-card");
    cards.forEach((card) => {
        const idx = parseInt(card.dataset.index, 10);
        const badge = card.querySelector(".order-badge");
        const pos = selectedSlotIndices.indexOf(idx);
        if (pos !== -1) {
            card.classList.add("selected");
            badge.innerText = pos + 1;
            badge.style.display = "flex";
        } else {
            card.classList.remove("selected");
            badge.style.display = "none";
        }
    });
}

btnRetake.onclick = () => {
    capturedPhotos = [];
    selectedSlotIndices = [0, 1, 2];
    startBtn.disabled = false;
    startBtnLabel.innerText = "Capture Photo 1 of 6";
    if (hudShotCounter) hudShotCounter.innerText = "0 of 6 Captured";
    goToStage(1);
};

confirmSelectionBtn.onclick = () => {
    if (selectedSlotIndices.length !== 3) {
        alert("Please select exactly 3 photos for your photobooth strip.");
        return;
    }
    goToStage(3);
};

function renderStudio() {
    buildPhotoTray();
    updateSlotOverlayUI();
    renderStrip();
}

function updateSlotOverlayUI() {
    const frameId = currentFrameImg ? currentFrameImg.dataset.id : "pb-01";
    const windows = customFrameWindowMap[frameId] || standardFrameWindows;
    slotHotspots.forEach((hotspot, idx) => {
        const [x1, y1, x2, y2] = windows[idx];
        const selected = idx === activeReplacingSlot;
        hotspot.classList.toggle("active", selected);
        hotspot.classList.remove("drop-target");
        hotspot.setAttribute("aria-pressed", String(selected));
        hotspot.setAttribute(
            "aria-label",
            `Select slot ${idx + 1}, currently showing photo ${selectedSlotIndices[idx] + 1}`,
        );
        hotspot.style.left = `${(x1 / 800) * 100}%`;
        hotspot.style.top = `${(y1 / 2400) * 100}%`;
        hotspot.style.width = `${((x2 - x1) / 800) * 100}%`;
        hotspot.style.height = `${((y2 - y1) / 2400) * 100}%`;
    });
    if (activeSlotLabel) {
        activeSlotLabel.innerText = `Slot ${activeReplacingSlot + 1} selected`;
    }
}

function selectTargetSlot(slotIndex) {
    activeReplacingSlot = slotIndex;
    updateSlotOverlayUI();
    buildPhotoTray();
}

function replaceSlotPhoto(slotIndex, photoIndex) {
    if (!Number.isInteger(photoIndex) || photoIndex < 0 || photoIndex >= capturedPhotos.length) return;
    const previousPhoto = selectedSlotIndices[slotIndex];
    const previousSlot = selectedSlotIndices.indexOf(photoIndex);
    if (previousSlot >= 0 && previousSlot !== slotIndex) {
        selectedSlotIndices[previousSlot] = previousPhoto;
    }
    selectedSlotIndices[slotIndex] = photoIndex;
    activeReplacingSlot = slotIndex;
    updateSlotOverlayUI();
    buildPhotoTray();
    renderStrip();
}

slotHotspots.forEach((hotspot) => {
    hotspot.onclick = () => selectTargetSlot(parseInt(hotspot.dataset.slot, 10));
    hotspot.ondragover = (event) => {
        event.preventDefault();
        hotspot.classList.add("drop-target");
    };
    hotspot.ondragleave = () => hotspot.classList.remove("drop-target");
    hotspot.ondrop = (event) => {
        event.preventDefault();
        const photoIndex = parseInt(event.dataTransfer.getData("text/plain"), 10);
        replaceSlotPhoto(parseInt(hotspot.dataset.slot, 10), photoIndex);
    };
});

function buildPhotoTray() {
    photoPool.innerHTML = "";
    capturedPhotos.forEach((photoCanvas, idx) => {
        const item = document.createElement("button");
        item.type = "button";
        item.draggable = true;
        item.className = "tray-photo";
        item.setAttribute("aria-label", `Use photo ${idx + 1} in slot ${activeReplacingSlot + 1}`);
        if (selectedSlotIndices[activeReplacingSlot] === idx) {
            item.classList.add("active-in-slot");
        } else if (selectedSlotIndices.includes(idx)) {
            item.classList.add("is-assigned");
        }

        const img = document.createElement("img");
        img.src = photoCanvas.toDataURL("image/jpeg", 0.85);
        img.alt = `Captured photo ${idx + 1}`;

        const caption = document.createElement("span");
        caption.className = "tray-caption";
        const assignment = selectedSlotIndices.indexOf(idx);
        caption.innerText =
            assignment === activeReplacingSlot
                ? `Photo ${idx + 1} · Current`
                : assignment >= 0
                  ? `Photo ${idx + 1} · Slot ${assignment + 1}`
                  : `Photo ${idx + 1}`;

        item.onclick = () => replaceSlotPhoto(activeReplacingSlot, idx);
        item.ondragstart = (event) => {
            event.dataTransfer.setData("text/plain", String(idx));
            event.dataTransfer.effectAllowed = "move";
        };
        item.ondragend = () => slotHotspots.forEach((target) => target.classList.remove("drop-target"));

        item.appendChild(img);
        item.appendChild(caption);
        photoPool.appendChild(item);
    });
}

document.querySelectorAll("#frame-sidebar .frame-item").forEach((img) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = `frame-choice${img.classList.contains("selected") ? " selected" : ""}`;
    choice.setAttribute("aria-label", img.title || "Choose frame");
    choice.setAttribute("aria-pressed", String(img.classList.contains("selected")));

    const label = document.createElement("span");
    label.className = "frame-choice-label";
    label.innerText = img.title || "Frame";
    if (!img.alt) img.alt = `${img.title || "Photo"} frame preview`;
    img.replaceWith(choice);
    choice.append(img, label);

    choice.onclick = () => {
        document.querySelectorAll("#frame-sidebar .frame-choice").forEach((option) => {
            const selected = option === choice;
            option.classList.toggle("selected", selected);
            option.setAttribute("aria-pressed", String(selected));
            option.querySelector(".frame-item").classList.toggle("selected", selected);
        });
        currentFrameImg = img;
        updateSlotOverlayUI();
        renderStrip();
    };
});

document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.onclick = () => {
        document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentFilter = chip.dataset.filter;
        renderStrip();
    };
});

function renderStrip() {
    if (selectedSlotIndices.length !== 3 || capturedPhotos.length < 3) return;

    const photosToRender = selectedSlotIndices.map((i) => capturedPhotos[i]);
    const w = 800;
    const h = 2400;
    canvas.width = w;
    canvas.height = h;

    const frameId = currentFrameImg ? currentFrameImg.dataset.id : "pb-01";

    ctx.filter = "none";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    const drawPhotosInWindows = (windows) => {
        photosToRender.forEach((photo, index) => {
            const [x1, y1, x2, y2] = windows[index];
            const destW = x2 - x1;
            const destH = y2 - y1;
            const sourceRatio = photo.width / photo.height;
            const destRatio = destW / destH;
            let sx = 0,
                sy = 0,
                sw = photo.width,
                sh = photo.height;
            if (sourceRatio > destRatio) {
                sw = sh * destRatio;
                sx = (photo.width - sw) / 2;
            } else {
                sh = sw / destRatio;
                sy = (photo.height - sh) / 2;
            }
            ctx.save();
            ctx.filter = currentFilter;
            ctx.drawImage(photo, sx, sy, sw, sh, x1, y1, destW, destH);
            ctx.restore();
        });
    };

    const drawImageFit = (img) => {
        if (!img) return;
        ctx.drawImage(img, 0, 0, w, h);
    };

    const windows = customFrameWindowMap[frameId] || standardFrameWindows;
    drawPhotosInWindows(windows);
    drawImageFit(currentFrameImg);
}

btnBackToSelect.onclick = () => goToStage(2);
btnNext3.onclick = () => goToStage(4);
btnBackToStudio.onclick = () => goToStage(3);
btnRestart.onclick = () => {
    if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
    }
    location.reload();
};

downloadBtn.onclick = () => {
    const printCanvas = document.createElement("canvas");
    const printCtx = printCanvas.getContext("2d");
    const gap = 4;

    printCanvas.width = canvas.width * 2 + gap;
    printCanvas.height = canvas.height;

    printCtx.fillStyle = "#ffffff";
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);

    printCtx.drawImage(canvas, 0, 0);
    printCtx.drawImage(canvas, canvas.width + gap, 0);

    const downloadLink = document.createElement("a");
    downloadLink.download = `BITS_Photobooth_${Date.now()}.png`;
    downloadLink.href = printCanvas.toDataURL("image/png");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
};

sendEmailBtn.onclick = async () => {
    if (!emailInput.reportValidity()) return;

    sendEmailBtn.disabled = true;
    sendEmailLabel.innerText = "Sending...";
    emailStatus.innerText = "";
    emailStatus.classList.remove("success", "error");

    try {
        const imageBase64 = canvas.toDataURL("image/png");
        const response = await fetch(emailApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailInput.value, imageBase64 }),
        });
        const responseBody = await response.text();
        let result;
        try {
            result = JSON.parse(responseBody);
        } catch {
            if (response.status === 404) {
                throw new Error("The email service is unavailable. Start the app with npm start and try again.");
            }
            if (response.status === 413) {
                throw new Error("The photostrip is too large to email. Please try again with a smaller image.");
            }
            throw new Error(
                `The email service returned an unexpected response (HTTP ${response.status}). Check that the app server is running, then try again.`,
            );
        }

        if (!response.ok) {
            throw new Error(result.error || "Failed to send your photostrip.");
        }
        if (!result.success) {
            throw new Error("The server could not confirm delivery. Please try again.");
        }

        emailStatus.innerText = "Your photostrip has been sent to your email.";
        emailStatus.classList.add("success");
    } catch (error) {
        console.error("Photostrip email failed:", error);
        emailStatus.innerText = error.message || "Unable to send your photostrip. Please try again.";
        emailStatus.classList.add("error");
    } finally {
        sendEmailBtn.disabled = false;
        sendEmailLabel.innerText = "Send";
    }
};

window.addEventListener("DOMContentLoaded", () => {
    initCameraStream();
});
