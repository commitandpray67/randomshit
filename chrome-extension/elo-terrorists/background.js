chrome.runtime.onInstalled.addListener(() => {
  drawIcon();
});

function drawIcon() {
  try {
    const size = 128;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Dark background
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, size, size);

    // Red glowing circle
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // "ET" label
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${size * 0.34}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ET", size / 2, size / 2);

    const imageData = ctx.getImageData(0, 0, size, size);
    chrome.action.setIcon({ imageData });
  } catch {
    // OffscreenCanvas unavailable — browser will use default icon
  }
}
