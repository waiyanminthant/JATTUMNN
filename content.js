// content.js

let hoveredElement = null;

document.addEventListener("mouseover", (event) => {
  hoveredElement = event.target;
});

function getFullTextFromElement(element) {
  if (!element) return "";

  // Try to find a parent that is a block-level container likely to hold a full sentence/paragraph
  const container = element.closest("p, div, section, article, li, blockquote, h1, h2, h3, h4, h5, h6, td, th");
  
  if (container) {
    return container.innerText.trim();
  }
  
  // Fallback: use the element itself, but if its text is very short, maybe go up one level
  let text = element.innerText.trim();
  if (text.length < 20 && element.parentElement) {
    text = element.parentElement.innerText.trim();
  }
  return text;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getHoveredElementText") {
    const text = hoveredElement ? getFullTextFromElement(hoveredElement) : "";
    sendResponse({ text });
  }
});