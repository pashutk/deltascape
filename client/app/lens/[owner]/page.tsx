import { formatRelative } from "date-fns";
import { parseISO } from "date-fns";
import Link from "next/link";
import { Octokit } from "octokit";

async function fetchRepos(owner: string) {
  const octokit = new Octokit({
    auth: process.env.OCTOKIT_API_KEY,
  });
  if (owner === "Effect-TS") {
    const { data } = await octokit.rest.repos.get({ owner, repo: "Effect-TS" });
    return [
      {
        id: "schema",
        description: data.description,
        updatedAt: parseISO(data.updated_at),
      },
    ];
  }
  return [];
}

export default async function Owner({
  params: { owner },
}: {
  params: { owner: string };
}) {
  const repos = await fetchRepos(owner);
  console.log(repos);
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="relative flex flex-col place-items-center">
        <h1 className="text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white mb-16">
          Select repo in {owner}
        </h1>
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-w-4xl">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-12 py-3">
                  Name
                </th>
                <th scope="col" className="px-12 py-3">
                  Description
                </th>
                <th scope="col" className="px-12 py-3">
                  Pull requests
                </th>
                <th scope="col" className="px-12 py-3">
                  Last update
                </th>
              </tr>
            </thead>
            <tbody>
              {repos.map(({ id, description, updatedAt }) => (
                <tr
                  key={id}
                  className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                >
                  <td
                    scope="row"
                    className="px-12 py-8 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                  >
                    <Link
                      href={`/lens/${owner}/${id}`}
                      className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                      {id}
                    </Link>
                  </td>
                  <td className="px-12 py-8">{description}</td>
                  <td className="px-12 py-8">Not available</td>
                  <td className="px-12 py-8">
                    {formatRelative(updatedAt, new Date())}
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
