/**
使用 deno 脚本读取 gitlab 项目的 issues，将匹配 labels 的 issues 批量更新到指定 milestone

deno run --allow-all updateIssues.ts \
  --host=https://gitlab \
  --token=<gitlab-bot-token> \
  --projectId=<gitlab-project-id> \
  --milestoneName=<gitlab-milestone-name> \
  --labelsToMatch="P2,Auto Bug" \
  --labelsToExclude="customer,enhancement,feature" \
  --perPage=100
 */

// 导入Deno的GitLab库
import { Gitlab } from 'https://esm.sh/@gitbeaker/rest?dts';

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
const host = args.host;
const token = args.token;
const projectId = parseInt(args.projectId);
const milestoneName = args.milestoneName;
const milestoneExclude = (args.milestoneExclude ?? '').split(',');
const labelsToMatch = (args.labelsToMatch ?? '').split(',');
const labelsToExclude = (args.labelsToExclude ?? '').split(',');
const perPage = parseInt(args.perPage);

// GitLab API 配置
const api = new Gitlab({
  host: host,
  token: token,
});

if (Object.keys(args).length < 7) {
  console.error(`Usage:
deno run --allow-net updateIssues.ts \
  --host=https://gitlab.test.org \
  --token=<gitlab-bot-token> \
  --projectId=<gitlab-project-id> \
  --milestoneName=<gitlab-milestone-name> \
  --labelsToMatch="P2,Auto Bug" \
  --labelsToExclude="customer,enhancement,feature" \
  --perPage=100`);
  Deno.exit(1);
}

// 记录处理过的issues
const processedIssues = new Set();

// 获取Milestone ID
async function getMilestoneId(): Promise<number | undefined> {
  const milestones = await api.ProjectMilestones.all(projectId);

  const milestone = milestones.find(m => m.title === milestoneName);
  return milestone ? milestone.id : undefined;
}

const milestoneId = await getMilestoneId();
if (!milestoneId) {
  console.error('Milestone not found');
  Deno.exit(1);
}

// 获取并更新issues
async function updateIssues() {
  let page = 1;
  let issuesUpdated = 0;

  while (true) {
    try {
      console.log(`Processing page ${page}...`);
      const issues = await api.Issues.all({
        projectId: projectId,
        labels: labelsToMatch.join(','),
        scope: 'all',
        state: 'opened',
        perPage: perPage,
        page: page,
      });

      if (issues.length === 0) {
        break; // 没有更多的issues，结束循环
      }

      for (const issue of issues) {
        // 跳过已处理的issues
        if (processedIssues.has(issue.iid)) {
          continue;
        }
        if (!issue.milestone) {
          continue;
        }
        // 跳过已经在目标milestone中的issues
        if (issue.milestone.id === milestoneId) {
          continue;
        }
        if (milestoneExclude.includes(issue.milestone.title)) {
          continue;
        }

        // 过滤掉不需要的标签
        const issueLabels = issue.labels || [];
        const shouldExclude = labelsToExclude.some(excludeLabel => issueLabels.includes(excludeLabel));
        if (shouldExclude) {
          continue;
        }

        // 更新issue的milestone
        await api.Issues.edit(projectId, issue.iid, {
          milestoneId,
        });
        console.log(`https://gitlab/group/project/-/issues/${issue.iid} updated ${issue.milestone.title} to ${milestoneName}`);
        issuesUpdated++;
        processedIssues.add(issue.iid); // 记录处理过的issue
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    } catch (error) {
      console.error(`Error fetching issues: ${error}`);
      throw error; // 抛出错误以便于重试逻辑可以捕获
    }
  }

  console.log(`Total issues updated: ${issuesUpdated}`);
}

// 重试逻辑
async function retryUpdateIssues(retries = 5) {
  try {
    await updateIssues();
  } catch (error) {
    console.error(`Error updating issues: ${error}`);
    if (retries > 0) {
      console.log(`Retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒
      await retryUpdateIssues(retries - 1);
    } else {
      console.error('Max retries reached. Exiting.');
    }
  }
}

// 启动脚本
retryUpdateIssues()
  .then(() => {
    console.log('Processed total issues', processedIssues.size);
    Deno.exit(0);
  })
  .catch(e => {
    console.error(e);
    console.log('Processed total issues', processedIssues.size);
    Deno.exit(1);
  });
