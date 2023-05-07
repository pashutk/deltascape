import Image from "next/image";
import Link from "next/link";
import { Octokit } from "octokit";

async function fetchOwners() {
  const octokit = new Octokit({ auth: process.env.OCTOKIT_API_KEY });
  const { data } = await octokit.rest.orgs.get({ org: "Effect-TS" });
  return [
    {
      id: "Effect-TS",
      reposCount: 1,
      avatarUrl: data.avatar_url,
      description: data.description,
    },
  ];
}

export default async function Home() {
  const owners = await fetchOwners();
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="relative flex flex-col place-items-center">
        <h1 className="text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white mb-16">
          Select owner/organization
        </h1>
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-w-4xl">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-4 md:px-12 py-2 md:py-3">
                  Logo
                </th>
                <th scope="col" className="px-4 md:px-12 py-2 md:py-3">
                  Owner/Organization
                </th>
                <th scope="col" className="px-4 md:px-12 py-2 md:py-3">
                  Description
                </th>
                <th scope="col" className="px-4 md:px-12 py-2 md:py-3">
                  Repos
                </th>
                <th scope="col" className="px-4 md:px-12 py-2 md:py-3">
                  Last update
                </th>
              </tr>
            </thead>
            <tbody>
              {owners.map(({ id, reposCount, avatarUrl, description }) => (
                <tr
                  key={id}
                  className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                >
                  <td className="px-4 md:px-12 py-4 md:py-8">
                    <Image
                      src={avatarUrl}
                      width={64}
                      height={64}
                      alt={`${id} org avatar`}
                    />
                  </td>
                  <td
                    scope="row"
                    className="px-4 md:px-12 py-4 md:py-8 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                  >
                    <Link
                      href={`/lens/${id}`}
                      className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                      {id}
                    </Link>
                  </td>
                  <td className="px-4 md:px-12 py-4 md:py-8">{description}</td>
                  <td className="px-4 md:px-12 py-4 md:py-8">{reposCount}</td>
                  <td className="px-4 md:px-12 py-4 md:py-8">Not available</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
