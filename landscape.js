

const video = document.getElementById("camera-view");
const canvas = document.getElementById("final-canvas");
const canvasWrap3 = document.getElementById("canvas-wrapper-3");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start-btn");
const startBtnLabel = document.getElementById("start-btn-label");
const downloadBtn = document.getElementById("download-btn");
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
const MAX_SHOTS = 3;
let selectedSlotIndices = [0];
let activeReplacingSlot = 0;
let currentFilter = "none";
let currentFrameImg = null;

const CANVAS_W = 1800;
const CANVAS_H = 1200;

const DEFAULT_WINDOW_SET = [[79, 71, 1707, 1133]];

const PLACEHOLDER_WINDOW_SET = [[67, 53, 1739, 1149]];

const FRAMES = [
    {
        title: "Landscape Frame 1",
        src: "LandscapeFrame1.png",
        windows: DEFAULT_WINDOW_SET,
    },
    {
        title: "Landscape Frame 2",
        src: "LandscapeFrame2.png",
        windows: DEFAULT_WINDOW_SET,
    },
    {
        title: "Landscape Frame 3",
        src: "LandscapeFrame3.png",
        windows: DEFAULT_WINDOW_SET,
    },
    {
        title: "Landscape Frame 4",
        src: "LandscapeFrame4.png",
        windows: DEFAULT_WINDOW_SET,
    },
    {
        title: "Landscape Frame 5",
        src: "LandscapeFrame5.png",
        windows: DEFAULT_WINDOW_SET,
    },
];

FRAMES.forEach((frame, idx) => {
    frame.id = `ls-${String(idx + 1).padStart(2, "0")}`;
    if (!frame.windows) frame.windows = DEFAULT_WINDOW_SET;
});

const customFrameWindowMap = Object.fromEntries(FRAMES.map((f) => [f.id, f.windows]));

const EXCLUDED_FRAMES = new Set();

function buildFrameSidebar() {
    const sidebar = document.getElementById("frame-sidebar");
    if (!sidebar) return;
    sidebar.innerHTML = "";
    FRAMES.forEach((frame, idx) => {
        if (EXCLUDED_FRAMES.has(frame.title)) return;
        const img = document.createElement("img");
        img.src = frame.src;
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

const standardFrameWindows = DEFAULT_WINDOW_SET;

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
        const isComplete = capturedPhotos.length >= MAX_SHOTS;
        if (startBtn) startBtn.disabled = isComplete;
        if (isComplete) startBtnLabel.innerText = "All 3 Photos Captured";
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
        fitStripPreview();
    }

    if (num === 4) {
        const printEasel = document.getElementById("canvas-wrapper-4");
        if (printEasel && canvas.parentElement !== printEasel) {
            printEasel.appendChild(canvas);
        }
        canvas.style.width = "";
        canvas.style.height = "";
        if (canvasWrap3) canvasWrap3.style.width = "";
    }
}

function fitStripPreview() {
    if (!canvas || !canvasWrap3 || canvas.parentElement !== canvasWrap3) return;
    const easel = canvasWrap3.parentElement;
    if (!easel) return;

    canvas.style.width = "";
    canvas.style.height = "";
    canvasWrap3.style.width = "";

    const availW = easel.clientWidth;
    const availH = easel.clientHeight;
    if (!availW || !availH) return;

    const ratio = canvas.width / canvas.height;
    let cssH = availH;
    let cssW = cssH * ratio;
    if (cssW > availW) {
        cssW = availW;
        cssH = cssW / ratio;
    }
    cssW = Math.floor(cssW);
    cssH = Math.floor(cssH);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvasWrap3.style.width = `${cssW}px`;
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
        const baseVideo = deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" };
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: false });
        } catch (constrainedErr) {
            if (constrainedErr.name === "OverconstrainedError" || constrainedErr.name === "ConstraintNotSatisfiedError") {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
                    audio: false,
                });
            } else {
                throw constrainedErr;
            }
        }
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
        let message = "Connecting camera...";
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            message = "No camera device was detected on your computer.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            message = "Your camera is currently in use by another application.";
        } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            message = "Waiting for camera permission. Allow it in your browser - it will connect automatically.";
        } else if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
            message = "The selected camera doesn't support the requested settings. Try another camera.";
        }
        showCameraError(message);
        scheduleCameraReconnect(err);
    }
}


function secureCameraUrl() {
    const host = window.location.hostname || "localhost";
    if (/^\d+(\.\d+){3}$/.test(host) || host.includes(":")) {
        return "https://" + host + ":3443";
    }
    return "https://" + host;
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
                : "Camera access needs a secure connection. Open " + secureCameraUrl() + " (tap Advanced → Proceed if warned), allow camera access once, and it will connect automatically.",
        );
        return;
    }

    await startCameraById(null);
}

let cameraReconnectTimer = null;

function scheduleCameraReconnect(err) {
    const denied = err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
    const unavailable = err && (err.name === "NotFoundError" || err.name === "DevicesNotFoundError");
    if (denied || unavailable) {
        if (!cameraReconnectTimer) {
            cameraReconnectTimer = setTimeout(() => {
                cameraReconnectTimer = null;
                initCameraStream();
            }, 3000);
        }
        try {
            navigator.permissions?.query({ name: "camera" }).then((p) => {
                p.onchange = () => {
                    if (p.state === "granted") {
                        if (cameraReconnectTimer) { clearTimeout(cameraReconnectTimer); cameraReconnectTimer = null; }
                        initCameraStream();
                    }
                };
            }).catch(() => {});
        } catch (e) { /* permissions API unsupported */ }
    }
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
window.addEventListener("resize", fitStripPreview);
window.addEventListener("orientationchange", () => setTimeout(fitStripPreview, 150));

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

    const frameId = currentFrameImg ? currentFrameImg.dataset.id : "ls-01";
    const windows = customFrameWindowMap[frameId] || standardFrameWindows;
    const guideWindow = windows.length === 1 ? windows[0] : PLACEHOLDER_WINDOW_SET[0];
    const [wx1, wy1, wx2, wy2] = guideWindow;
    const slotRatio = (wx2 - wx1) / (wy2 - wy1);
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
    if (startBtn && !startBtn.disabled && capturedPhotos.length < MAX_SHOTS) {
        startBtnLabel.innerText = remainingStatusLabel();
    }
};

function remainingStatusLabel() {
    const n = capturedPhotos.length;
    if (n >= MAX_SHOTS) return "All 3 Photos Captured";
    return `Capture Photo ${n + 1} of ${MAX_SHOTS}`;
}

mirrorToggle.onclick = () => {
    mirroringEnabled = !mirroringEnabled;
    mirrorToggle.setAttribute("aria-pressed", String(mirroringEnabled));
    video.classList.toggle("no-mirror", !mirroringEnabled);
};

function commitCapture() {
    triggerFlash();
    captureVideoFrame();

    const photosCaptured = capturedPhotos.length;
    if (hudShotCounter) hudShotCounter.innerText = `${photosCaptured} of ${MAX_SHOTS} Captured`;

    if (photosCaptured === MAX_SHOTS) {
        countdownBtn.disabled = false;
        startBtn.disabled = true;
        startBtnLabel.innerText = "All 3 Photos Captured";
        if (hudShotCounter) hudShotCounter.innerText = "3 of 3 Complete";
        buildSelectionGallery();
        goToStage(2);
        return true;
    }

    startBtnLabel.innerText = `Capture Photo ${photosCaptured + 1} of ${MAX_SHOTS}`;
    startBtn.disabled = false;
    return false;
}

startBtn.onclick = async () => {
    if (capturedPhotos.length >= MAX_SHOTS || countdownCanceled) return;
    startBtn.disabled = true;
    if (!video || video.readyState < 2 || !video.videoWidth) {
        updateCameraStatus("Camera not ready", "warning");
        startBtn.disabled = false;
        return;
    }

    const autoShooting = countdownBtn.getAttribute("aria-pressed") === "true";
    if (autoShooting && !countdownBtn.disabled) countdownBtn.disabled = true;

    if (!autoShooting) {
        commitCapture();
        return;
    }

    while (capturedPhotos.length < MAX_SHOTS) {
        const ok = await countdownTick(3);
        if (!ok) {
            countdownCanceled = false;
            if (hudShotCounter) hudShotCounter.innerText = `${capturedPhotos.length} of ${MAX_SHOTS} Captured`;
            startBtnLabel.innerText = remainingStatusLabel();
            countdownBtn.disabled = false;
            startBtn.disabled = false;
            return;
        }

        if (commitCapture()) {
            return;
        }
    }

    if (!autoShooting) startBtn.disabled = false;
};

function buildSelectionGallery() {
    selectionGrid.innerHTML = "";
    selectedSlotIndices = [0];

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
                return;
            }
            selectedSlotIndices = [idx];
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
    selectedSlotIndices = [0];
    resetCountdownButton();
    startBtn.disabled = false;
    startBtnLabel.innerText = "Capture Photo 1 of 3";
    if (hudShotCounter) hudShotCounter.innerText = "0 of 3 Captured";
    goToStage(1);
};

confirmSelectionBtn.onclick = () => {
    if (selectedSlotIndices.length !== 1) {
        alert("Please select exactly 1 photo for your photostrip.");
        return;
    }
    goToStage(3);
};

function renderStudio() {
    buildPhotoTray();
    updateSlotOverlayUI();
    renderStrip();
    fitStripPreview();
}

function updateSlotOverlayUI() {
    const frameId = currentFrameImg ? currentFrameImg.dataset.id : "ls-01";
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
        hotspot.style.left = `${(x1 / CANVAS_W) * 100}%`;
        hotspot.style.top = `${(y1 / CANVAS_H) * 100}%`;
        hotspot.style.width = `${((x2 - x1) / CANVAS_W) * 100}%`;
        hotspot.style.height = `${((y2 - y1) / CANVAS_H) * 100}%`;
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
    if (selectedSlotIndices.length !== 1 || capturedPhotos.length < 1) return;

    const photosToRender = selectedSlotIndices.map((i) => capturedPhotos[i]);
    const w = CANVAS_W;
    const h = CANVAS_H;
    canvas.width = w;
    canvas.height = h;

    const frameId = currentFrameImg ? currentFrameImg.dataset.id : "ls-01";

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
btnNext3.onclick = () => {
    autoEnqueuePhotostrip();
    goToStage(4);
};
btnBackToStudio.onclick = () => goToStage(3);
btnRestart.onclick = () => {
    if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
    }
    location.reload();
};

downloadBtn.onclick = () => {
    const downloadLink = document.createElement("a");
    downloadLink.download = `BITS_Photobooth_${Date.now()}.png`;
    downloadLink.href = buildDoubleStripDataUrl();
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
};

function buildDoubleStripCanvas() {
    const printCanvas = document.createElement("canvas");
    const printCtx = printCanvas.getContext("2d");
    const gap = 4;

    printCanvas.width = canvas.width * 2 + gap;
    printCanvas.height = canvas.height;

    printCtx.fillStyle = "#ffffff";
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);

    printCtx.drawImage(canvas, 0, 0);
    printCtx.drawImage(canvas, canvas.width + gap, 0);

    return printCanvas;
}

function buildDoubleStripDataUrl() {
    return buildDoubleStripCanvas().toDataURL("image/png");
}


function compressCanvasToBudget(canvas, budgetChars, startQuality, floorQuality, floorWidth) {
    let quality = startQuality;
    const work = document.createElement("canvas");
    const wc = work.getContext("2d");
    let width = canvas.width;
    for (;;) {
        work.width = width;
        work.height = Math.round((width / canvas.width) * canvas.height);
        wc.clearRect(0, 0, work.width, work.height);
        wc.drawImage(canvas, 0, 0, work.width, work.height);
        const dataUrl = work.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= budgetChars) return dataUrl;
        if (quality > floorQuality) {
            quality = floorQuality;
            continue;
        }
        if (width <= floorWidth) return dataUrl;
        width = Math.max(floorWidth, Math.round(width * 0.8));
    }
}



function smartQueueOrigin() {
    if (window.location.port === "3000" || window.location.port === "3443" || window.location.protocol === "https:") {
        return window.location.origin;
    }
    const host = window.location.hostname || "localhost";
    return "http://" + host + ":3000";
}

const PHOTO_QUEUE_STORAGE_KEY = "bits_photobooth_captured_queue";

const queueApiBase = smartQueueOrigin();

function readLocalQueue() {
    try {
        return JSON.parse(localStorage.getItem(PHOTO_QUEUE_STORAGE_KEY) || "[]") || [];
    } catch (e) {
        return [];
    }
}

function writeLocalQueue(localQueue) {

    while (localQueue.length > 200) localQueue.shift();
    localStorage.setItem(PHOTO_QUEUE_STORAGE_KEY, JSON.stringify(localQueue));
    window.dispatchEvent(new Event("storage"));
}

async function pushStripToServer(stripImg, timestamp) {
    const response = await fetch(new URL("/api/queue", queueApiBase).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: stripImg, timestamp }),
    });
    if (!response.ok) throw new Error(`Server responded ${response.status}`);
    return await response.json();
}

async function autoEnqueuePhotostrip() {
    try {
        const stripImg = canvas.toDataURL("image/png");

        if (readLocalQueue().some((i) => i.imageBase64 === stripImg)) {
            return;
        }

        const timestamp = new Date().toISOString();

        let serverItem = null;
        try {
            const result = await pushStripToServer(stripImg, timestamp);
            if (result && result.item) serverItem = result.item;
        } catch (serverErr) {
            console.log("Server queue push unavailable, buffering locally:", serverErr);
        }


        try {
            if (typeof ghAskForToken === "function" && !ghToken()) ghAskForToken();
            const ghResult = await ghUploadQueueImage(stripImg);
            if (ghResult && ghResult.ok) console.log("Capture synced to GitHub:", ghResult.fileName);
        } catch (ghErr) {
            console.log("GitHub sync unavailable:", ghErr.message);
        }

        const queueItem = {
            id: serverItem ? serverItem.id : (readLocalQueue().reduce((m, i) => Math.max(m, i.id || 0), 0) + 1),
            ticketNumber: serverItem ? serverItem.ticketNumber : undefined,
            imageBase64: stripImg,
            status: "pending",
            createdAt: timestamp,
            updatedAt: timestamp,
            synced: Boolean(serverItem),
        };

        const localQueue = readLocalQueue();
        localQueue.push(queueItem);
        writeLocalQueue(localQueue);
    } catch (err) {
        console.error("Failed to enqueue photostrip:", err);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    initCameraStream();
});
