import { chromium } from '@playwright/test';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1600,height:1100}});
  await page.goto('http://127.0.0.1:4317');
  await page.locator('.contract-node').first().waitFor();
  await page.waitForTimeout(1200);
  console.log(JSON.stringify(await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(n => ({id:n.dataset.id,width:n.offsetWidth,height:n.offsetHeight,transform:n.style.transform})))));
  console.log(JSON.stringify(await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map(element => ({ id: element.dataset.id, rect: element.getBoundingClientRect() }));
    const labels = [...document.querySelectorAll('.edge-origin-label')].map(element => ({ id: element.dataset.edgeId, rect: element.getBoundingClientRect() }));
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      nodeLabelCollisions: labels.flatMap(label => nodes.filter(node => intersects(label.rect, node.rect)).map(node => `${label.id}:${node.id}`)),
      labelLabelCollisions: labels.flatMap((label, index) => labels.slice(index + 1).filter(other => intersects(label.rect, other.rect)).map(other => `${label.id}:${other.id}`)),
    };
  })));
  await page.screenshot({path:'test-results/current-canvas.png'});
} finally { await browser.close(); }
