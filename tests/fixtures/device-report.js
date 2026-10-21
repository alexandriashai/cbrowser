const report = {
  pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine",
  hover: matchMedia("(hover: none)").matches ? "none" : "hover",
  touch: String(navigator.maxTouchPoints),
  motion: matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
  width: String(window.innerWidth),
  dpr: String(window.devicePixelRatio),
};
document.getElementById("report").textContent =
  Object.entries(report).map(([k, v]) => `${k}:${v}`).join(" ");
fetch(`/report?${new URLSearchParams(report)}`).catch(() => {});
