// @ts-nocheck
/**
 * @file 通过大模型将 class component 转换为 hooks component
 * @author chenjunhao
 *
 * 本脚本使用 deno js 编写，需要先安装 deno 环境。
 * 运行脚本需要提供一个参数：
 * 1. 文件路径
 *
 * 示例用法：
 * deno run --allow-all ./convert-class-to-hooks.ts ../packages/lhotse/src/components/ModalIframeSrc.js
 */

import { load } from "https://deno.land/std/dotenv/mod.ts";

const env = await load();

const API_URL = env["API_URL"];
const API_KEY = env["API_KEY"];
if (!API_URL || !API_KEY) {
  throw new Error("API_URL or API_KEY is not set in .env file");
}
if (!API_KEY.includes(":")) {
  throw new Error("API_KEY is not in the format of 'key: value'");
}
const [key, value] = API_KEY.split(':').map(str => str.trim());

const inputFile = Deno.args[0];
if (!inputFile) {
  throw new Error("Please provide a file path as an argument");
}
const fileContent = await Deno.readTextFile(inputFile);

const startTime = +new Date();

const headers = {
  "Content-Type": "application/json",
};
headers[key] = value;

const systemPrompt = await Deno.readTextFile("./prompt-class-to-hooks.md");

const body = {
  messages: [
    {
      role: 'system',
      content: systemPrompt.trim(),
    },
    {
      role: 'user',
      content: fileContent.trim(),
    },
  ],
  // "model": "moonshot-v1-128k",
  // "max_tokens": 4096 * 3,
  // "model": "gpt-4o",
  // "max_tokens": 4096,
  model: 'deepseek-chat',
  temperature: 0.0,
};

const options = {
  method: "POST",
  headers,
  body: JSON.stringify(body),
};

console.log("正在调用大模型，请稍候...");

const response = await fetch(API_URL, options);

if (!response.ok) {
  console.log(response);
  Deno.exit(1);
}

const result = await response.json();
if (!result.choices?.[0].message?.content) {
  console.log(result);
  Deno.exit(1);
}

function clone(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

const resultClone = clone(result);
delete resultClone.choices[0].message.content;
console.log(resultClone);

console.log(`完成转换，耗时 ${(+new Date() - startTime) / 1000}s`);

const path = inputFile.slice(0, inputFile.lastIndexOf('.'));
const ext = inputFile.slice(inputFile.lastIndexOf('.') + 1);
const tempFileName = `${path}.new.${ext}`;
await Deno.writeTextFile(tempFileName, result.choices[0].message.content);

const process = Deno.run({
  cmd: ["code", tempFileName],
  stdout: "inherit",
  stderr: "inherit"
});

await process.status();

const answer = await prompt(`请确认转换结果是否正确，如果正确请输入 "y"，否则请输入 "n"：`);
if (answer?.toLowerCase() === "y") {
  await Deno.writeTextFile(inputFile, await Deno.readTextFile(tempFileName));
}
await Deno.remove(tempFileName);

Deno.exit(0);
