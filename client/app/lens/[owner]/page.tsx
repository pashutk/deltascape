import { formatRelative } from "date-fns";
import { parseISO } from "date-fns";
import Link from "next/link";
import { Octokit } from "octokit";
import { MongoClient } from "mongodb";

async function fetchRepos(owner: string) {
  const octokit = new Octokit({
    auth: process.env.OCTOKIT_API_KEY,
  });
  const supportedOrgs = [
    { org: "Effect-TS", repos: ["schema", "match", "io"] },
    { org: "directus", repos: ["directus"] },
    { org: "qdrant", repos: ["qdrant"] },
    { org: "flipperdevices", repos: ["flipperzero-firmware"] },
  ];

  const org = supportedOrgs.find(({ org }) => org === owner);
  if (!org) {
    return [];
  }

  const repos = await Promise.all(
    org.repos.map((repo) => octokit.rest.repos.get({ owner, repo }))
  );

  const client = new MongoClient(process.env.MONGO_CONNECTION_URI!);
  await client.connect();
  const updates = (
    await Promise.all(
      org.repos.map((repo) =>
        client
          .db("deltascape")
          .collection("weeklyUpdates")
          .find({ owner, repo }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray()
      )
    )
  )
    .map(([item]) => item)
    .filter((item) => item !== undefined);
  await client.close();

  return repos.map(({ data }) => ({
    id: data.name,
    description: data.description,
    updatedAt: parseISO(data.updated_at),
    lastWeekUpdate: updates.find((update) => update.repo === data.name)?.update,
  }));
}

export default async function Owner({
  params: { owner },
}: {
  params: { owner: string };
}) {
  const repos = await fetchRepos(owner);
  return (
    <main className="min-h-screen items-center justify-between p-8 md:p-24">
      <div className="relative place-items-center">
        <h1 className="text-center text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white mb-8 md:mb-16">
          {owner} repositories
        </h1>
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-w-5xl mx-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Description
                </th>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Updated at
                </th>
                <th scope="col" className="px-4 md:px-8 lg:px-12 py-3">
                  Last week update
                </th>
              </tr>
            </thead>
            <tbody>
              {repos.map(({ id, description, updatedAt, lastWeekUpdate }) => (
                <tr
                  key={id}
                  className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                >
                  <td
                    scope="row"
                    className="px-4 md:px-8 lg:px-12 py-8 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                  >
                    <Link
                      href={`/lens/${owner}/${id}`}
                      className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                      {id}
                    </Link>
                  </td>
                  <td className="px-4 md:px-8 lg:px-12 py-8">{description}</td>
                  <td className="px-4 md:px-8 lg:px-12 py-8">
                    {formatRelative(updatedAt, new Date())}
                  </td>
                  <td className="px-4 md:px-8 lg:px-12 py-8 whitespace-pre-wrap">
                    {lastWeekUpdate ?? "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
