function businessLogoBuffer(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,([A-Za-z\d+/=]+)$/i);
  return match ? Buffer.from(match[2], "base64") : null;
}

function drawBusinessLogo(doc, dataUrl, x, y, width, height, align = "left") {
  const buffer = businessLogoBuffer(dataUrl);
  if (!buffer) return false;
  try {
    doc.image(buffer, x, y, {
      fit: [width, height],
      align,
      valign: "center",
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = { businessLogoBuffer, drawBusinessLogo };
