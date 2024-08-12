/**
使用 deno 脚本读取 gitlab issue，并使用大模型 api 进行产品模块分类，然后打上标签

deno run --allow-all relabel.ts --token=<gitlab-bot-ken> --projectId=21
 */

// 导入Deno的GitLab库
import { Gitlab, IssueSchemaWithBasicLabels } from 'https://esm.sh/@gitbeaker/rest?dts';

// 解析命名参数
function parseArgs(args: string[]) {
  const params: { [key: string]: string } = {};
  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key.startsWith('--')) {
      params[key.slice(2)] = value;
    }
  });
  return params;
}

const args = parseArgs(Deno.args);

// 从命名参数中获取配置
const host = args.host ?? 'https://gitlab';
const token = args.token;
const projectId = parseInt(args.projectId ?? '21');
const perPage = parseInt(args.perPage ?? '100');
const labelsToExclude = (args.labelsToExclude ?? 'QA,bug').split(',');

const TRANSLATION_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const API_KEY = "sk-xxx";

// GitLab API 配置
const api = new Gitlab({
  host: host,
  token: token,
});

let page = 4; // 1;
let processed = 0;
let allModuleLabels: string[] = [];

interface Message {
  role: string;
  content: string;
}

const systemPrompt = `你是一位专业的互联网产品经理，拥有在 SalesForce、PowerBI、Tableau、Looker、Metabase 等产品中的经验，擅长分析和判断用户提出的需求。
你的任务是将 gitlab 中的每一个 issue 打上 label 标记，将 issue 按产品模块进行归类。
你的产品模块现在有：
<moduleLabels>
  AI分析,API服务,HQL,SSO,UX优化,仪表盘,前端技术,加速引擎,参数过滤器,后端技术,图表,复杂报表,应用设置,指标管理,数据填报,数据导出,数据权限,数据模型,数据科学,数据连接,数据集,数据集成,用户管理,租户管理,系统设置,表格,门户
</moduleLabels>
共 27 个。
你将会按照 gitlab 中的 issue 标题和描述，将 issue 打上对应的 label 标记，并归类到对应的模块中。
你需要注意每一个 issue 应该只对应一个模块。
在接下来的对话中，请直接告诉用户输出的 issue 内容对应的产品模块，不需要做任何解释说明。`;

async function suggestLabels(issue: IssueSchemaWithBasicLabels, noDescription = false, messages: Message[] = []) {
  try {
    const body = {
      "model": "moonshot-v1-8k",
      "messages": [
        {
          "role": "system",
          content: systemPrompt,
        },
        {
          "role": "user",
          "content": `<issueTitle>${issue.title}<issueTitle>${noDescription ? '' : `\n\n<issueDescription>${issue.description}</issueDescription>`}`,
        },
        ...messages,
      ],
      "temperature": 0
    };
    const response = await fetch(TRANSLATION_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    let label = result.choices?.[0].message?.content;
    if (!label) {
      if (result?.error?.message === "Invalid request: Your request exceeded model token limit: 8192") {
        console.log(`Issue https://gitlab/group/project/-/issues/${issue.iid} ${issue.title} description is too long, retry with title only...`);
        return await suggestLabels(issue, true);
      }
      throw new Error(JSON.stringify(result));
    }
    if (!label.startsWith('M::')) {
      label = `M::${label}`;
    }
    if (!allModuleLabels.includes(label)) {
      return await suggestLabels(issue, noDescription, [
        {
          "role": "assistant",
          "content": result.choices?.[0].message?.content,
        },
        {
          "role": "user",
          "content": `你给出的产品模块 label 不是 <moduleLabels> 中的，请只从 <moduleLabels> 中挑选符合的`,
        },
      ]);
    }
    return label;
  } catch (error) {
    throw error;
  }
}

// 更新 issue 的 labels
async function editIssue(issue: IssueSchemaWithBasicLabels) {
  const start = +new Date();
  console.log(`Processing page:${page} with issue:${issue.iid} ${issue.title}`);
  const addLabels = await suggestLabels(issue);
  await api.Issues.edit(projectId, issue.iid, {
    addLabels,
  });
  console.log(`Add new module label: ${addLabels} to issue https://gitlab/group/project/-/issues/${issue.iid} ${issue.title}`);
  console.log(`Took ${(+new Date() - start) / 1000}s`);
  await new Promise(resolve => setTimeout(resolve, 200));
}

async function main() {
  allModuleLabels = (await api.ProjectLabels.all(
    projectId,
    {
      search: 'M::',
      perPage: 1000,
    },
  )).map(label => label.name);
  console.log(allModuleLabels.map(label => label.replace('M::', '')).join(','));
  console.log(`Module Labels total ${allModuleLabels.length}`);
  while (true) {
    const issues = await api.Issues.all({
      projectId: projectId,
      state: 'opened',
      perPage: perPage,
      page,
    });

    if (!issues.length) {
      break;
    }

    for (const issue of issues) {
      // 过滤掉不需要的标签
      const issueLabels = issue.labels || [];
      const shouldExclude = labelsToExclude.some(label => label.startsWith('M::') || issueLabels.includes(label));
      if (shouldExclude) {
        continue;
      }

      await editIssue(issue);
    }

    page += 1;
    processed += issues.length;
  }
  console.log(`Processed ${processed} total issues`);
  Deno.exit(0);
}

main();
