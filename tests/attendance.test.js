const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");

const BASE_URL = process.env.APP_URL || "http://127.0.0.1:50813";

async function runTests() {
  const driver = await new Builder().forBrowser("chrome").build();

  try {
    // Test 1: Application loads
    await driver.get(BASE_URL);
    await driver.wait(until.elementLocated(By.css("body")), 10000);

    const title = await driver.getTitle();
    console.log("Page title:", title);

    assert.ok(title.length > 0, "The page should have a title");
    console.log("PASS: Application page loads");

    // Test 2: Health endpoint responds
    await driver.get(`${BASE_URL}/api/health`);
    const response = await driver.findElement(By.css("body")).getText();

    assert.ok(response.includes('"status":"ok"'),
      "Health endpoint should return status ok");

    console.log("PASS: Health endpoint responds");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
  }
}

runTests();
