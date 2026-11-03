import { connection } from "next/server";
import ChangeOrderFlow from "@/components/ChangeOrderFlow";
import { getJob } from "@/lib/repo";

// Always render on request (reads the database).
export const instant = false;

export default async function Home() {
  await connection();
  const job = (await getJob("miller-kitchen"))!;
  return (
    <ChangeOrderFlow
      job={{
        id: job.id,
        title: job.title,
        scope: job.scope,
        homeowner: job.homeownerName,
        rateCents: job.laborRateCents,
      }}
    />
  );
}
