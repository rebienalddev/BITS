// GitHub-based capture sync: uploads captures to QueueImages/ and lists them from any device.
// Token is stored once per device in localStorage — never hardcoded in the site.
const GH_SYNC = {
    owner: "rebienalddev",
    repo: "BITS",
    dir: "QueueImages",
    api: "https://api.github.com",
    tokenKey: "bits_gh_token",
};

function ghToken() {
    return localStorage.getItem(GH_SYNC.tokenKey) || "";
}

function ghAskForToken(force) {
    if (ghToken() && !force) return ghToken();
    const t = prompt(
        "Paste your GitHub token (classic, repo scope) once to enable photo syncing.\n" +
        "It is saved in this browser only and is never published."
    );
    if (t && t.trim()) {
        localStorage.setItem(GH_SYNC.tokenKey, t.trim());
    }
    return ghToken();
}

async function ghListQueueImages() {
    const res = await fetch(
        `${GH_SYNC.api}/repos/${GH_SYNC.owner}/${GH_SYNC.repo}/contents/${GH_SYNC.dir}?ref=main`,
        { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`);
    const files = await res.json();
    return files
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name))
        .map((f) => ({ name: f.name, path: f.path, url: f.download_url }))
        .sort((a, b) => (parseInt(a.name.match(/^(\d+)\./)?.[1] || 0, 10) - parseInt(b.name.match(/^(\d+)\./)?.[1] || 0, 10)));
}

async function ghNextImageNumber() {
    const files = await ghListQueueImages();
    return files.reduce((m, f) => Math.max(m, parseInt(f.name.match(/^(\d+)\./)?.[1] || 0, 10)), 0) + 1;
}

// Uploads a data:image/...;base64,... capture as a new numbered file in QueueImages/.
async function ghUploadQueueImage(dataUrl) {
    const token = ghToken();
    if (!token) return { skipped: true, reason: "no-token" };
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) return { ok: false, reason: "bad-data-url" };
    const ext = match[1] === "jpeg" || match[1] === "jpg" ? "jpg" : match[1];
    const number = await ghNextImageNumber();
    const res = await fetch(
        `${GH_SYNC.api}/repos/${GH_SYNC.owner}/${GH_SYNC.repo}/contents/${GH_SYNC.dir}/${number}.${ext}`,
        {
            method: "PUT",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `token ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `Queue capture ${number}.${ext}`,
                content: match[2],
            }),
        }
    );
    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401) localStorage.removeItem(GH_SYNC.tokenKey);
        throw new Error(`GitHub upload failed ${res.status}: ${errText.slice(0, 200)}`);
    }
    return { ok: true, number, fileName: `${number}.${ext}` };
}
