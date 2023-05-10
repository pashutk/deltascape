import { formatRelative, parseISO } from "date-fns";
import { MongoClient } from "mongodb";
import Link from "next/link";
import styles from "./index.module.css";

async function fetchPRs(owner: string, repo: string) {
  const supportedOrgs = [
    { org: "Effect-TS", repos: ["schema", "match", "io"] },
    { org: "directus", repos: ["directus"] },
    { org: "qdrant", repos: ["qdrant"] },
    { org: "flipperdevices", repos: ["flipperzero-firmware"] },
  ];

  if (
    supportedOrgs.some(
      ({ org: supportedOrg, repos: supportedRepos }) =>
        supportedOrg === owner &&
        supportedRepos.some((supportedRepo) => supportedRepo === repo)
    )
  ) {
    const client = new MongoClient(process.env.MONGO_CONNECTION_URI!);
    await client.connect();
    const pulls = await client
      .db("deltascape")
      .collection("pulls")
      .find({ owner, repo })
      .toArray();

    return pulls.map((pull) => ({
      id: pull.number,
      title: pull.title,
      summary: pull.summarized,
      mergedAt: parseISO(pull.mergedAt),
      githubUrl: pull.htmlUrl,
    }));
  }

  return [];
}

type Props = {
  params: {
    repo: string;
    owner: string;
  };
};

export default async function Repo({ params: { owner, repo } }: Props) {
  const pulls = await fetchPRs(owner, repo);
  return (
    <main className="min-h-screen items-center justify-between p-8 md:p-24">
      <div className="relative place-items-center">
        <h1 className="text-center text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white mb-8 md:mb-16 max-w-5xl mx-auto">
          {owner}/{repo} pull requests
        </h1>
        {/* <div className="max-w-5xl mx-auto mb-8">
          <p className="text-center text-gray-500 dark:text-gray-400">
            This week, major changes include bug fixes, improvements in
            stability and code structure, and the addition of new features like
            an auto-clicker, weather station protocol support, and API version
            in device info.{" "}
            <Link
              href="/"
              className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
            >
              Here is a summary of the changes
              <svg
                aria-hidden="true"
                className="w-5 h-5 ml-1"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </Link>
          </p>
        </div> */}
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-w-5xl mx-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Pull Request
                </th>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Merged
                </th>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody>
              {pulls.map(({ id, title, summary, mergedAt, githubUrl }) => (
                <tr
                  key={id}
                  className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                >
                  <td
                    scope="row"
                    className="px-4 md:px-8 lg:px-12 py-2 font-medium text-gray-900 dark:text-white"
                  >
                    {title}{" "}
                    <span className="whitespace-nowrap">
                      (
                      <a
                        href={githubUrl}
                        className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
                      >
                        #{id}
                      </a>
                      )
                    </span>
                  </td>
                  <td className="px-4 md:px-8 lg:px-12 py-2">
                    {formatRelative(mergedAt, new Date())}
                  </td>
                  <td className="px-4 md:px-8 lg:px-12 py-2">{summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
