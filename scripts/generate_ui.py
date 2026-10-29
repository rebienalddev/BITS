import re

with open('index.html', 'r') as f:
    original = f.read()

# Extract frames
frames_match = re.search(r'<div class="frame-grid" id="frame-sidebar">(.*?)</div>', original, re.DOTALL)
frames_html = frames_match.group(1).strip() if frames_match else ""

# Extract preload layers
preloads_match = re.search(r'<div style="display:none;">(.*?)</div>', original, re.DOTALL)
preloads_html = preloads_match.group(1).strip() if preloads_match else ""

# Extract filters
filters_match = re.search(r'<div id="filter-container">(.*?)</div>', original, re.DOTALL)
filters_html = filters_match.group(1).strip() if filters_match else ""

new_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TechnoBooth Pro</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<header class="header">
    <div class="header-title">TechnoBooth</div>
    <div class="steps">
        <div class="step active" id="step-1"><div class="step-num">1</div> Select Frame</div>
        <div class="step" id="step-2"><div class="step-num">2</div> Take a Pic</div>
        <div class="step" id="step-3"><div class="step-num">3</div> Filter</div>
        <div class="step" id="step-4"><div class="step-num">4</div> Download</div>
    </div>
</header>

<div class="screens-wrapper">
    <!-- SCREEN 1: Frame Selection -->
    <div class="screen active" id="screen-1">
        <div class="screen-header">
            <h2 class="screen-title">Choose Your Frame</h2>
            <p class="screen-subtitle">Select a design to start your session.</p>
        </div>
        <div class="frame-scroll-area">
            <div class="frame-grid" id="frame-sidebar">
                {frames_html}
            </div>
        </div>
        <div class="action-bar">
            <button id="btn-next-1" class="btn">Next Step: Take Photos</button>
        </div>
    </div>

    <!-- SCREEN 2: Camera -->
    <div class="screen" id="screen-2">
        <div class="screen-header">
            <h2 class="screen-title">Strike a Pose!</h2>
            <p class="screen-subtitle">Get ready, you'll take 6 photos in a row.</p>
        </div>
        <div class="camera-workspace">
            <div class="camera-container">
                <video id="camera-view" autoplay playsinline></video>
                <div id="camera-guide"></div>
            </div>
        </div>
        <div class="action-bar">
            <button id="start-btn" class="btn">Start Shoot</button>
        </div>
    </div>

    <!-- SCREEN 3: Filters -->
    <div class="screen" id="screen-3">
        <div class="screen-header">
            <h2 class="screen-title">Apply a Filter</h2>
            <p class="screen-subtitle">Enhance your photos before saving.</p>
        </div>
        <div class="filter-workspace">
            <div class="canvas-showcase" id="canvas-wrapper-3">
                <canvas id="final-canvas"></canvas>
            </div>
            <div class="filter-sidebar" id="filter-container">
                {filters_html}
            </div>
        </div>
        <div class="action-bar">
            <button id="btn-next-3" class="btn">Next Step: Preview</button>
        </div>
    </div>

    <!-- SCREEN 4: Preview & Download -->
    <div class="screen" id="screen-4">
        <div class="screen-header">
            <h2 class="screen-title">Your Photos are Ready!</h2>
            <p class="screen-subtitle">Save your strip or start a new session.</p>
        </div>
        <div class="final-workspace" id="canvas-wrapper-4">
            <!-- Canvas moved here -->
        </div>
        <div class="action-bar" style="gap: 20px;">
            <button id="download-btn" class="btn" style="display:none;">Save Jpeg</button>
            <button id="btn-restart" class="btn btn-secondary">Start Over</button>
        </div>
    </div>
</div>

<!-- SELECTION MODAL -->
<div id="selection-screen">
    <div class="selection-modal">
        <h3>Select Your Best 3 Photos</h3>
        <div id="selection-grid"></div>
        <button id="confirm-selection-btn" class="btn">Create Strip</button>
    </div>
</div>

<div id="flash"></div>

<div style="display:none;">
    {preloads_html}
</div>

<script src="script.js"></script>
<script>
    const screens = document.querySelectorAll('.screen');
    const steps = document.querySelectorAll('.step');

    function goToScreen(num) {{
        screens.forEach((s, i) => s.classList.toggle('active', i + 1 === num));
        steps.forEach((s, i) => s.classList.toggle('active', i + 1 <= num));
        
        if (num === 2) {{
            window.dispatchEvent(new Event('resize'));
        }}
        if (num === 4) {{
            document.getElementById('canvas-wrapper-4').appendChild(document.getElementById('final-canvas'));
        }}
    }}

    document.getElementById('btn-next-1').addEventListener('click', () => goToScreen(2));
    document.getElementById('btn-next-3').addEventListener('click', () => goToScreen(4));
    document.getElementById('btn-restart').addEventListener('click', () => location.reload());

    const originalConfirm = document.getElementById('confirm-selection-btn').onclick;
    document.getElementById('confirm-selection-btn').onclick = (e) => {{
        const selectedCount = document.querySelectorAll('.selection-thumb.selected').length;
        if (selectedCount !== 3) {{
            alert('Please select exactly 3 photos.');
            return;
        }}
        originalConfirm.call(document.getElementById('confirm-selection-btn'), e);
        goToScreen(3);
    }};
</script>
</body>
</html>"""

with open('index.html', 'w') as f:
    f.write(new_html)
