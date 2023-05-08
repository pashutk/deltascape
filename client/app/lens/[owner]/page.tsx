import { formatRelative, startOfWeek, subWeeks } from "date-fns";
import { parseISO } from "date-fns";
import Link from "next/link";
import { Octokit } from "octokit";
import { MongoClient, WithId, Document } from "mongodb";
import { useState } from "react";
import Update from "./update";

const supportedOrgs = [
  { org: "Effect-TS", repos: ["schema", "match", "io"] },
  { org: "directus", repos: ["directus"] },
  { org: "qdrant", repos: ["qdrant"] },
  { org: "flipperdevices", repos: ["flipperzero-firmware"] },
];

async function fetchOrg(owner: string) {
  const octokit = new Octokit({
    auth: process.env.OCTOKIT_API_KEY,
  });
  if (!supportedOrgs.some(({ org }) => org === owner)) {
    return undefined;
  }

  const orgData = await octokit.rest.orgs.get({ org: owner });
  return orgData.data;
}

async function fetchRepos(owner: string) {
  const octokit = new Octokit({
    auth: process.env.OCTOKIT_API_KEY,
  });

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
    .filter((item): item is WithId<Document> => item !== undefined);
  await client.close();

  return repos.map(({ data }) => ({
    id: data.name,
    description: data.description,
    updatedAt: parseISO(data.updated_at),
    lastWeekUpdate: updates.find((update) => update.repo === data.name)?.update,
  }));
}

async function fetchLastWeekUpdate(owner: string) {
  const client = new MongoClient(process.env.MONGO_CONNECTION_URI!);
  await client.connect();

  const weekStartAt = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
  const [update] = await client
    .db("deltascape")
    .collection("weeklyOrgUpdates")
    .find({ owner, weekStartAt })
    .toArray();

  await client.close();
  return update;
}

export default async function Owner({
  params: { owner },
}: {
  params: { owner: string };
}) {
  const [repos, orgData, updates] = await Promise.all([
    fetchRepos(owner),
    fetchOrg(owner),
    fetchLastWeekUpdate(owner),
  ]);
  const description = orgData?.description;

  return (
    <main className="min-h-screen items-center justify-between px-4 py-8 md:p-24">
      <div className="relative place-items-center max-w-5xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:gap-8">
          <div>
            <h1 className="text-center text-5xl font-extrabold leading-none tracking-tight text-gray-900 dark:text-white mb-8 md:mb-16">
              {owner}
            </h1>
            {description && (
              <p className="text-center text-gray-500 dark:text-gray-400 mb-8 -mt-4 md:-mt-8">
                {description}
              </p>
            )}
          </div>
          <div>
            {updates && (
              <Update short={updates.shortUpdate} full={updates.update} />
            )}
          </div>
        </div>
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
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
