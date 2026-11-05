import { notFound } from "next/navigation";
import { connection } from "next/server";
import ChangeOrderFlow from "@/components/ChangeOrderFlow";
import { getJob } from "@/lib/repo";

// Always render on request (reads the database).
export const instant = false;

const DEFAULT_JOB = "miller-kitchen";

export default async function Home(props: PageProps<"/">) {
  await connection();
  const { job: requested } = await props.searchParams;
  const job = await getJob(typeof requested === "string" ? requested : DEFAULT_JOB);
  if (!job) notFound();

  return (
    <ChangeOrderFlow
      key={job.id}
      job={{ id: job.id, title: job.title, scope: job.scope, homeowner: job.homeownerName, rateCents: job.laborRateCents }}
    />
  );
}
