// Seeded, so every run paints the same pixels.
const canvas = document.getElementById("noise");
const ctx = canvas.getContext("2d");
const img = ctx.createImageData(canvas.width, canvas.height);
let s = 7;
for (let i = 0; i < img.data.length; i += 4) {
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  img.data[i] = s & 255;
  img.data[i + 1] = (s >> 8) & 255;
  img.data[i + 2] = (s >> 16) & 255;
  img.data[i + 3] = 255;
}
ctx.putImageData(img, 0, 0);
