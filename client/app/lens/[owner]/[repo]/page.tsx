import { formatRelative, parseISO } from "date-fns";
import { MongoClient } from "mongodb";

async function fetchRRs(owner: string, repo: string) {
  if (owner === "Effect-TS" && repo === "schema") {
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
  const pulls = await fetchRRs(owner, repo);
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="relative flex flex-col place-items-center">
        <h1 className="text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white mb-16">
          Select PR in {owner}/{repo}
        </h1>
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-w-4xl">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-12 py-3">
                  Pull Request
                </th>
                <th scope="col" className="px-12 py-3">
                  Title
                </th>
                <th scope="col" className="px-12 py-3">
                  Merged
                </th>
                <th scope="col" className="px-12 py-3">
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
                    className="px-12 py-8 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                  >
                    <a
                      href={githubUrl}
                      className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                      {id}
                    </a>
                  </td>
                  <td className="px-12 py-8">{title}</td>
                  <td className="px-12 py-8">
                    {formatRelative(mergedAt, new Date())}
                  </td>
                  <td className="px-12 py-8">{summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
