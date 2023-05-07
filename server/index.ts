/**
 * TODO:
 * - use opened prs for "work in progress" section
 * - use PR comments to summarize the discussion
 * - proper error handling
 * - rate limiting for requests to external APIs
 */
import { isAfter, isBefore, parseISO, subDays } from "date-fns";
import { Octokit } from "octokit";
import { Configuration, OpenAIApi } from "openai";
import assert from "node:assert";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();
assert(process.env.OCTOKIT_API_KEY);
assert(process.env.OPENAI_API_KEY);
assert(process.env.OPENAI_ORG_ID);
assert(process.env.MONGO_CONNECTION_URI);

const octokit = new Octokit({ auth: process.env.OCTOKIT_API_KEY });

const configuration = new Configuration({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

type OctokitResponse<Method extends () => any> =
  ReturnType<Method> extends Promise<{
    data: infer T;
  }>
    ? T
    : never;

const fetchText = (url: string): Promise<string> =>
  fetch(url).then((a) => a.text());

const splitDiffBySections = (diff: string) => {
  const diffSections: string[] = [];
  if (!diff) {
    return diffSections;
  }

  const lines = diff.split("\n");

  let section = "";
  while (lines.length) {
    const line = lines.shift();
    if (line === undefined) {
      return diffSections;
    }

    if (line.startsWith("diff ")) {
      diffSections.push(section);
      section = line;
    } else {
      section += `\n${line}`;
    }
  }
  diffSections.push(section);
  return diffSections;
};

const joinStringsUpToLength = (
  strings: string[],
  maxLength: number,
  sep: string
) => {
  if (strings.length === 0) {
    return [];
  }

  const result: string[] = [strings[0]];
  for (let i = 1; i < strings.length; i++) {
    const diff = strings[i];
    const last = result[result.length - 1];
    if (last.length + diff.length < maxLength) {
      result[result.length - 1] = last + diff;
    } else {
      result.push(diff);
    }
  }
  return result;
};

const compressDiff = async (diff: string) => {
  const systemPrompt =
    "You are a tool for extreme compression of git diffs. You receive git diff from the user and rewrite it in such a way that it preserves the meaning of the changes. The resulting text should be just a couple of sentences for each diff. Do not enumerate items of the resulting list, and do not prepend hyphens or minus signs.";

  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: diff },
    ],
    temperature: 0,
  });

  return response.data.choices[0].message?.content;
};

const compressDiffFile = async (content: string) => {
  const diffs = splitDiffBySections(content);
  const chunks = joinStringsUpToLength(diffs, 4096 * 2, "\n");
  const compressed = await Promise.all(chunks.map((c) => compressDiff(c)));
  return compressed.filter((a) => a).join("\n");
};

type PRReport = {
  // id
  owner: string;
  repo: string;
  number: number;
  // pr source data
  htmlUrl: string;
  diffUrl: string;
  title: string;
  author?: string;
  authorAvatar?: string;
  authorHtmlUrl?: string;
  body?: string;
  commentsUrl: string;
  mergedAt: string;
  // summarized
  summarized: string;
  summarizedDiff: string;
};

const getReportForPullRequest = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRReport> => {
  const { data: pull } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const diff = await fetchText(pull.diff_url);
  const summarizedDiff = await compressDiffFile(diff);

  const summarizeResponse = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You're a tool for pull request changes summarization.
You provided with the following structure:
- TITLE: Pull request title
- DESCRIPTION: Pull request description
- DIFF: Pull request code diff
After you recieve all this data you answer with a short and concise description of what changes are introduced in this pull request.
You try to mention all important changes but also to not overwhelm user with a lot of details.
Your main goal is to tell what's new. You brief and straight to the point while doing that.`,
      },
      {
        role: "user",
        content: `TITLE: ${pull.title}
DESCRIPTION:
${pull.body}\n\n
DIFF:
${summarizedDiff}`,
      },
    ],
  });

  const summarized = summarizeResponse.data.choices[0].message?.content;
  if (!summarized) {
    throw new Error(
      `Failed to summarize: ${JSON.stringify(summarizeResponse.data)}`
    );
  }

  if (!pull.merged_at) {
    throw new Error(
      `Failed to summarize not merged PR ${owner}/${repo}/${prNumber}`
    );
  }

  return {
    owner,
    repo,
    number: prNumber,
    htmlUrl: pull.html_url,
    diffUrl: pull.diff_url,
    title: pull.title,
    body: pull.body ?? undefined,
    author: pull.user?.login,
    authorAvatar: pull.user?.avatar_url,
    authorHtmlUrl: pull.user?.html_url,
    commentsUrl: pull.comments_url,
    mergedAt: pull.merged_at,
    summarized,
    summarizedDiff,
  };
};

const fetchLastWeekPulls = async (
  owner: string,
  repo: string,
  startDate: Date,
  endDate: Date
): Promise<number[]> => {
  const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "closed",
    per_page: 10,
    sort: "updated",
    direction: "desc",
  });

  const pulls: OctokitResponse<typeof octokit.rest.pulls.list> = [];
  for await (const { data } of iterator) {
    data.forEach((pull) => {
      if (!pull.merged_at) {
        return;
      }

      const mergedAt = parseISO(pull.merged_at);
      const mergedDuringDateRange =
        isBefore(mergedAt, endDate) && isAfter(mergedAt, startDate);

      if (mergedDuringDateRange) {
        pulls.push(pull);
      }
    });

    if (
      data.some(({ updated_at }) => isBefore(parseISO(updated_at), startDate))
    ) {
      break;
    }
  }

  return pulls.map(({ number }) => number);
};

const main = async () => {
  const client = new MongoClient(process.env.MONGO_CONNECTION_URI!);
  await client.connect();

  const owner = "Effect-TS";
  const repo = "schema";
  const endDate = new Date();

  const prNumbers: number[] = await fetchLastWeekPulls(
    owner,
    repo,
    subDays(endDate, 30),
    endDate
  );

  console.log(prNumbers);

  // const prs = [268, 267, 266, 265];
  const prs = [
    264, 261, 259, 258, 257, 256, 255, 254, 252, 251, 250, 249, 248, 247, 246,
    245, 244, 236, 243, 217, 237, 241, 240, 239, 238, 231, 235, 234, 233, 232,
    230, 229, 228, 227,
  ];

  for (const number of prs) {
    const report = await getReportForPullRequest(owner, repo, number);
    console.log(report);
    await client
      .db("deltascape")
      .collection("pulls")
      .updateOne(
        { owner: report.owner, repo: report.repo, number: report.number },
        { $set: report },
        { upsert: true }
      );
  }

  await client.close();
};

main();
