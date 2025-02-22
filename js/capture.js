// This script will be injected into the page to capture the screenshot
async function captureScreenshot() {
  // Wait for html2canvas to be loaded
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    const canvas = await html2canvas(document.body, {
      width: 1280,
      height: 800,
      scale: 0.5, // Reduce size for better performance
      useCORS: true, // Allow cross-origin images
      allowTaint: true,
      backgroundColor: "#ffffff",
    });

    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (error) {
    console.error("Capture error:", error);
    throw error;
  }
}
