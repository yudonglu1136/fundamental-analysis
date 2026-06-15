# Guru Intelligence iOS Design Pack

Product Design prototype for the future iOS version of Guru Intelligence.

Confirmed product direction:

- First release is Guru-research-first.
- Bottom tabs: Guru, DBMF, Valuation, Portfolio.
- Visual language follows the existing dark buy-side terminal.
- Portfolio remains a core tab, but not the first screen after login.

## Run

```bash
npm install
npm run dev -- --port 5294
```

Open:

```text
http://127.0.0.1:5294/
```

## Verify

```bash
npm run build
node -e "(async()=>{const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1500,height:1100}});await page.goto('http://127.0.0.1:5294/',{waitUntil:'domcontentloaded'});await page.getByTestId('direction-cards').click();const cards=await page.locator('.directionIntro h2').textContent();await page.getByTestId('direction-deep').click();const deep=await page.locator('.directionIntro h2').textContent();const phones=await page.locator('.phoneShell').count();await browser.close();console.log({cards,deep,phones});})()"
```

## Files

- `src/App.jsx`: three iOS design directions and phone screens.
- `src/styles.css`: mobile terminal design system for the prototype.
- `qa/ios-design-board.png`: latest QA screenshot.
- `design-qa.md`: Product Design QA report.
