/**
 * TODO:
 * - use opened prs for "work in progress" section
 * - use PR comments to summarize the discussion
 * - proper error handling
 * - rate limiting for requests to external APIs
 */
import {
  isAfter,
  isBefore,
  parseISO,
  previousMonday,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import { Octokit } from "octokit";
import { Configuration, OpenAIApi } from "openai";
import assert from "node:assert";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import pLimit from "p-limit";

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

  let buffer = diff;
  while (true) {
    const nextChunk = buffer.indexOf("\ndiff");
    if (nextChunk === -1) {
      diffSections.push(buffer);
      return diffSections;
    }

    const section = buffer.slice(0, nextChunk);
    diffSections.push(section);
    buffer = buffer.slice(nextChunk + 1 /* \n symbol */);
  }
};

const splitByLength = (input: string, maxLength: number): string[] => {
  const result: string[] = [];
  let buffer = input;
  while (true) {
    if (buffer.length <= maxLength) {
      result.push(buffer);
      return result;
    }

    result.push(buffer.slice(0, maxLength));
    buffer = buffer.slice(maxLength);
  }
};

const splitDiffsIntoChunks = (
  diffs: string[],
  chunkMaxSize: number,
  sep: string = "\n"
): string[] => {
  const diffsChunked = diffs.flatMap((diff) =>
    splitByLength(diff, chunkMaxSize)
  );

  if (diffsChunked.length === 0) {
    return [];
  }

  const chunksPacked: string[] = [diffsChunked.shift()!];
  diffsChunked.forEach((chunk) => {
    const newChunk = chunksPacked[chunksPacked.length - 1] + sep + chunk;
    if (newChunk.length > chunkMaxSize) {
      chunksPacked.push(chunk);
    } else {
      chunksPacked[chunksPacked.length - 1] = newChunk;
    }
  });
  return chunksPacked;
};

const completeChat = async (
  systemMessage: string,
  userMessage: string,
  options?: { temperature?: number; model?: "gpt-4" | "gpt-3.5" }
) => {
  const temperature = options?.temperature ?? 0.7;
  const model = options?.model ?? "gpt-4";

  const response = await openai.createChatCompletion({
    model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature,
  });
  return response.data.choices[0].message?.content;
};

const compressDiff = async (diff: string) => {
  const systemPrompt =
    "You are a tool for extreme compression of git diffs. You receive git diff from the user and rewrite it in such a way that it preserves the meaning of the changes. The resulting text should be just a couple of sentences for each diff. Do not enumerate items of the resulting list, and do not prepend hyphens or minus signs.";

  try {
    return await completeChat(systemPrompt, diff, { temperature: 0 });
  } catch (err) {
    throw new Error(
      // @ts-expect-error
      `Failed to create chat completion: ${JSON.stringify(err!.toJSON())}`
    );
  }
};

const MODEL_MAX_TOKENS = 4096;
const DIFF_SYMBOLS_PER_TOKEN = 2;

const limit3 = pLimit(3);

const compressDiffFile = async (content: string) => {
  const diffs = splitDiffBySections(content);
  const buckets = splitDiffsIntoChunks(
    diffs,
    MODEL_MAX_TOKENS * DIFF_SYMBOLS_PER_TOKEN,
    "\n"
  );
  const compressed = await Promise.all(
    buckets.map((b) => limit3(() => compressDiff(b)))
  );
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

  const summarized = await completeChat(
    `You're a tool for pull request changes summarization.
You provided with the following structure:
- TITLE: Pull request title
- DESCRIPTION: Pull request description
- DIFF: Pull request code diff
After you recieve all this data you answer with a short and concise description of what changes are introduced in this pull request.
You try to mention all important changes but also to not overwhelm user with a lot of details.
You are to maximize describing what the change DOES and not what the change IS.
Your main goal is to tell what's new. You brief and straight to the point while doing that.`,
    `TITLE: ${pull.title}
DESCRIPTION:
${pull.body}\n\n
DIFF:
${summarizedDiff}`
  );

  if (!summarized) {
    throw new Error(`Failed to summarize`);
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

const withMongoClient = async <A>(
  f: (client: MongoClient) => PromiseLike<A>
): Promise<A> => {
  const client = new MongoClient(process.env.MONGO_CONNECTION_URI!);
  await client.connect();

  const result = await f(client);

  await client.close();

  return result;
};

const summarizePrs = async (
  owner: string,
  repo: string,
  startDate: Date,
  endDate: Date
) => {
  const prs = await withMongoClient(async (client) =>
    client
      .db("deltascape")
      .collection("pulls")
      .aggregate([
        {
          $match: {
            owner,
            repo,
          },
        },
        {
          $project: {
            mergedAtDate: {
              $dateFromString: {
                dateString: "$mergedAt",
              },
            },
            title: 1,
            summarized: 1,
          },
        },
        {
          $match: {
            mergedAtDate: { $gte: startDate, $lte: endDate },
          },
        },
      ])
      .toArray()
  );

  const changes = prs.map((pr) => `${pr.title}\n${pr.summarized}`).join("\n\n");

  return completeChat(
    `You're a tool for summarizing changes over the past week in the project repository. The user will send you a list of pull request names and descriptions. You answer with a short and concise description of what changes are introduced. You are to maximize describing what the change DOES and not what the change IS. Your main goal is to tell what's new. You are brief and straight to the point while doing that. You try to mention all important changes but also to not overwhelm users with many details. Group what can be grouped, and prioritize important changes over fixes and dependency updates.`,
    changes
  );
};

const summarizeRepoUpdates = async (
  owner: string,
  startDate: Date,
  endDate: Date
) => {
  const updates = await withMongoClient(async (client) =>
    client
      .db("deltascape")
      .collection("weeklyUpdates")
      .find({ owner, weekStartAt: { $gte: startDate, $lte: endDate } })
      .toArray()
  );

  const changes = updates.map(({ update }) => update).join("\n\n");

  const summary = completeChat(
    `You're a tool for summarizing changes over the past week in the project repository. The user will send you a list of updates. Each update is a desscription of changes happened over the past week in one of the organisation projects. You answer with a short and concise description of what changes are introduced across whole organization. You are to maximize describing what the change DOES and not what the change IS. Your main goal is to tell what's new. You are brief and straight to the point while doing that. You try to mention all important changes but also to not overwhelm users with many details. Group what can be grouped, and prioritize important changes over fixes and dependency updates.`,
    changes
  );

  const shortSummary = await completeChat(
    "You are a summarization tool. Given a list of changes over the last week, you summarize it into 1-2 sentences. You are straight to the point and produce a concise summary.",
    changes
  );

  return { summary, shortSummary };
};

const storeLastWeekRepoUpdate = (
  owner: string,
  repo: string,
  startDate: Date,
  endDate: Date
) =>
  withMongoClient((client) =>
    summarizePrs(owner, repo, startDate, endDate).then((summary) =>
      client.db("deltascape").collection("weeklyUpdates").insertOne({
        owner,
        repo,
        createdAt: new Date(),
        weekStartAt: startDate,
        update: summary,
      })
    )
  );

const storeLastWeekOrgUpdate = (
  owner: string,
  startDate: Date,
  endDate: Date
) =>
  withMongoClient((client) =>
    summarizeRepoUpdates(owner, startDate, endDate).then(
      ({ summary, shortSummary }) =>
        client.db("deltascape").collection("weeklyOrgUpdates").insertOne({
          owner,
          createdAt: new Date(),
          weekStartAt: startDate,
          update: summary,
          shortUpdate: shortSummary,
        })
    )
  );

const storeLastWeekPrs = (
  owner: string,
  repo: string,
  startDate: Date,
  endDate: Date
) =>
  withMongoClient((client) =>
    fetchLastWeekPulls(owner, repo, startDate, endDate).then(
      async (prNumbers) => {
        for (const number of prNumbers) {
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
      }
    )
  );

const oneSentenceSummary = async (text: string) => {
  const systemMessage = `You're tool for summarizing project changes over the last week. You produce extremely short (1 sentence) description of the changes the user sent to you. You try to preserve new features and important updates only. You skip generic, abstract information and keep only juicy parts.`;
  return completeChat(systemMessage, text);
};

const main = async () => {
  const [_interpreter, _file, command, param1, param2] = process.argv as [
    string,
    string,
    ...(string | undefined)[]
  ];

  const now = new Date();

  switch (command) {
    case "lastweekrepos": {
      if (!param1 || !param2) {
        throw "provide owner and repo";
      }

      const endDate = startOfWeek(now, { weekStartsOn: 1 });

      console.log(
        await fetchLastWeekPulls(param1, param2, subWeeks(endDate, 1), endDate)
      );
      return;
    }

    case "storelastweekprs": {
      if (!param1 || !param2) {
        throw "provide owner and repo";
      }

      const endDate = startOfWeek(now, { weekStartsOn: 1 });
      await storeLastWeekPrs(param1, param2, subWeeks(endDate, 1), endDate);
      return;
    }

    case "storelastweekrepoupdate": {
      if (!param1 || !param2) {
        throw "provide owner and repo";
      }

      const endDate = startOfWeek(now, { weekStartsOn: 1 });
      await storeLastWeekRepoUpdate(
        param1,
        param2,
        subWeeks(endDate, 1),
        endDate
      );
      return;
    }

    case "storelastweekorgupdate": {
      if (!param1) {
        throw "provide owner";
      }

      const endDate = startOfWeek(now, { weekStartsOn: 1 });
      await storeLastWeekOrgUpdate(param1, subWeeks(endDate, 1), endDate);
      return;
    }
  }
};

main();
