import express from "express";
import puppeteer from "puppeteer";
import { executablePath } from "puppeteer";

const app = express();
app.use(express.json({ limit: "1mb" }));

function extractSummaryAndReports(pageUrl, pageContent) {
  const summary = {
    url: pageUrl,
    geqFound: /window\.geq/.test(pageContent),
    reUtilsDetected: /re_utils/.test(pageContent),
    collectionFired: /_geps=/.test(pageContent),
    suppressionFired: /_gess=/.test(pageContent),
  };

  const markdownReport = `
### Retention Troubleshooter Report
**URL:** ${pageUrl}

| Check             | Result     |
|------------------|------------|
| window.geq       | ${summary.geqFound ? "✅ Found" : "❌ Not Found"} |
| re_utils.js      | ${summary.reUtilsDetected ? "✅ Found" : "❌ Not Found"} |
| Collection Fired | ${summary.collectionFired ? "✅ Yes" : "❌ No"} |
| Suppression Fired| ${summary.suppressionFired ? "✅ Yes" : "❌ No"} |
`;

  const htmlReport = `
<h3>Retention Troubleshooter Report</h3>
<strong>URL:</strong> ${pageUrl}<br/><br/>
<table border="1" cellpadding="6" cellspacing="0">
  <tr><th>Check</th><th>Result</th></tr>
  <tr><td>window.geq</td><td>${
    summary.geqFound ? "✅ Found" : "❌ Not Found"
  }</td></tr>
  <tr><td>re_utils.js</td><td>${
    summary.reUtilsDetected ? "✅ Found" : "❌ Not Found"
  }</td></tr>
  <tr><td>Collection Fired</td><td>${
    summary.collectionFired ? "✅ Yes" : "❌ No"
  }</td></tr>
  <tr><td>Suppression Fired</td><td>${
    summary.suppressionFired ? "✅ Yes" : "❌ No"
  }</td></tr>
</table>
`;

  return { summary, markdownReport, htmlReport };
}

app.post("/run-troubleshooter", async (req, res) => {
  const { url, paths = [] } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL." });

  const fullUrls = [url, ...paths.map((p) => new URL(p, url).href)];

  let browser;
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath:
        "/opt/render/.cache/puppeteer/chrome/linux-140.0.7339.82/chrome-linux64/chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const results = [];

    for (const fullUrl of fullUrls) {
      const page = await browser.newPage();
      await page.goto(fullUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const content = await page.content();
      results.push(extractSummaryAndReports(fullUrl, content));
      await page.close();
    }

    await browser.close();
    res.json({ results });
  } catch (err) {
    if (browser) await browser.close();
    console.error("Troubleshooter failed:", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Troubleshooter API running on port ${PORT}`);
});
