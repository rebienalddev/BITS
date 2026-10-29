import re

with open('index.html', 'r') as f:
    original = f.read()

# Extract frames
frames_match = re.search(r'<div class="sidebar-frames" id="frame-sidebar">.*?<p[^>]*>SELECT FRAME</p>(.*?)</div>', original, re.DOTALL)
frames_html = frames_match.group(1).strip() if frames_match else ""

# Extract preload layers
preloads_match = re.search(r'<!-- Preload Layer for sandwiching -->(.*?)<div class="viewport">', original, re.DOTALL)
preloads_html = preloads_match.group(1).strip() if preloads_match else ""

# Extract filters
filters_match = re.search(r'<div id="filter-container">(.*?)</div>', original, re.DOTALL)
filters_html = filters_match.group(1).strip() if filters_match else ""

new_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TechnoBytes</title>
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

<div class="screen active" id="screen-1">
    <h2 class="screen-title">Select a Frame</h2>
    <div class="frame-grid" id="frame-sidebar">
        {frames_html}
    </div>
    <button id="btn-next-1">Next Step</button>
</div>

<div class="screen" id="screen-2">
    <h2 class="screen-title">Take a Pic</h2>
    <div class="camera-container">
        <video id="camera-view" autoplay playsinline></video>
        <div id="camera-guide"></div>
    </div>
    <button id="start-btn">Start Shoot</button>
</div>

<div class="screen" id="screen-3">
    <h2 class="screen-title">Choose a Filter</h2>
    <div class="filter-layout">
        <div class="canvas-wrapper" id="canvas-wrapper-3">
            <canvas id="final-canvas"></canvas>
        </div>
        <div id="filter-container">
            {filters_html}
        </div>
    </div>
    <button id="btn-next-3">Next Step</button>
</div>

<div class="screen" id="screen-4">
    <h2 class="screen-title">Your Photos are Ready!</h2>
    <div class="canvas-wrapper" id="canvas-wrapper-4"></div>
    <div class="actions">
        <button id="download-btn" style="display:none;">Save Jpeg</button>
        <button id="btn-restart">Start Over</button>
    </div>
</div>

<div id="selection-screen">
    <h3>Select 3 Photos</h3>
    <div id="selection-grid"></div>
    <button id="confirm-selection-btn">Create Strip</button>
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
