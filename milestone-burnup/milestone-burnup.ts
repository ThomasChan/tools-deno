/**
使用 deno 脚本抓取 gitlab 的 milestone 燃尽图，并保存为图片，然后通过 api 发送到指定地方

1. 安装 deno puppeteer

PUPPETEER_PRODUCT=chrome deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts

2. 执行脚本

deno run --allow-all milestone-burndown.ts

 */

import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";

const env = await load();
const {
  GITLAB_USERNAME,
  GITLAB_PASSWORD,
  GITLAB_LOGIN_URL,
  GITLAB_MILESTONE_URL,
  UPLOAD_TOKEN_URL,
  UPLOAD_API,
  IMAGE_URL,
  FILE_PATH,
  WEBHOOK_URL,
  CRON,
} = env;
const USERS = env.USERS.split(',');

async function captureScreenshot() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set screen size.
  await page.setViewport({ width: 2560, height: 900 });

  // Navigate to the login page
  await page.goto(GITLAB_LOGIN_URL, { waitUntil: 'networkidle2' });

  // Fill in the username and password
  await page.type('#username', GITLAB_USERNAME);
  await page.type('#password', GITLAB_PASSWORD);

  // Submit the login form
  const submitBtn = await page.waitForSelector('input[name="commit"]');
  if (!submitBtn) {
    throw new Error('Submit button not found!');
  }
  await submitBtn.click();

  await page.waitForTimeout(1000); // Wait for 5 seconds to ensure the login process is complete

  await page.goto(GITLAB_MILESTONE_URL, { waitUntil: 'networkidle2' });

  // Select the element that contains the burn down chart
  const chartElement = await page.$('.js-burnup-chart');
  if (chartElement) {
    await chartElement.screenshot({ path: FILE_PATH });
  } else {
      console.log('Chart not found!');
  }

  await browser.close();

  const picurl = await uploadImage(await getAccessToken());

  USERS.forEach(user => {
    sendToWebHook(user, picurl);
  });
}

async function getAccessToken() {
  try {
    const response = await fetch(UPLOAD_TOKEN_URL);
    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('Get access token successfully:', data.access_token);
    return data.access_token;
  } catch (error) {
    console.error(`Error get access token:`, error);
    throw error;
  }
}

async function uploadImage(accessToken: string) {
  const formData = new FormData();
  formData.append('file', new Blob([await Deno.readFile(FILE_PATH)], { type: 'image/png' }), FILE_PATH);

  try {
    const res = await fetch(UPLOAD_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        // 'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });
    const response = await res.json();
    console.log(response)
    if (!res.ok) {
      throw new Error(`Failed to upload image: ${res.statusText}`);
    }
    const url = `${IMAGE_URL}/${response.data}`;
    console.log('Image uploaded successfully:', url);
    return url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

async function sendToWebHook(touser: string, picurl: string) {
  try {
    let response;
    response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        touser,
        "msgtype": "image",
        "image": {
          "media_id": picurl,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to send to WebHook: ${response.statusText}`);
    }
    response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        touser,
        "msgtype": "text",
        "text": {
          "content": "milestone burn down chart",
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to send to WebHook: ${response.statusText}`);
    }
    console.log('Message sent to WebHook successfully.');
  } catch (error) {
    console.error('Error sending to WebHook:', error);
  }
}

cron(CRON, captureScreenshot);

console.log('Scheduled to run at 10:00 AM on Tuesdays and Thursdays.');
