// Records a click on the dangerous control. In localStorage, not window: each
// CLI invocation is a fresh page load, so only storage survives to be read by
// the next one.
document.getElementById("delete-account").addEventListener("click", () => {
  localStorage.setItem("deleted", "DELETE");
});
