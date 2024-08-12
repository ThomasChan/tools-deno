/**
使用 deno 脚本读取 gitlab issue，并重新分配给指定用户

deno run --allow-all reassignee.ts \
  --token=<gitlab-bot-token> \
  --assignee=A \
  --assignTo=B \
  --projectId=21 \
  --labelsToMatch="bug,TO DO" \
  --labelsToExclude="QA,not a bug,not our bug,wontfix,not reproduced,feature,duplicate,Product Bug"
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
const host = args.host ?? 'https://gitlab';
const token = args.token;
const projectId = parseInt(args.projectId ?? '21');
const assignee = args.assignee; // A 用户的用户名
const assignTo = args.assignTo; // B 用户的用户名
const perPage = parseInt(args.perPage ?? '100');
const labelsToMatch = args.labelsToMatch.split(',');
const labelsToExclude = args.labelsToExclude.split(',');

// GitLab API 配置
const api = new Gitlab({
  host: host,
  token: token,
});

// 更新 issue 的 assignee
async function reassignIssue(issueId: number, assigneeIds: number[]) {
  try {
    await api.Issues.edit(projectId, issueId, {
      assigneeIds,
    });
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`Issue ${issueId} 已重新分配给用户 ${assigneeIds.join(',')}`);
  } catch (error) {
    console.error(`重新分配 Issue ${issueId} 失败:`, error);
  }
}

async function main() {
  try {
    const users = await api.Users.all();
    const transferFrom = users.find(user => user.username === assignee);
    const transferTo = users.find(user => user.username === assignTo);
    if (!transferFrom || !transferTo) {
      console.error('找不到指定的用户');
      return Deno.exit(1);
    }

    let processed = 0;

    while (true) {
      const issues = await api.Issues.all({
        projectId: projectId,
        assigneeUsername: [assignee],
        state: 'opened',
        labels: labelsToMatch.join(','),
        perPage: perPage,
        page: 1,
      });

      if (!issues.length) {
        break;
      }

      for (const issue of issues) {
        // 过滤掉不需要的标签
        const issueLabels = issue.labels || [];
        const shouldExclude = labelsToExclude.some(excludeLabel => issueLabels.includes(excludeLabel));
        if (shouldExclude) {
          continue;
        }

        await reassignIssue(issue.iid, issue.assignees.map(assigner => assigner.id).filter(id => id !== transferFrom.id).concat(transferTo.id));
      }

      processed += issues.length;
      console.log(`Processed ${processed} issues`);
    }

    Deno.exit(0);
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
}

main();
