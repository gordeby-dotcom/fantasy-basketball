import { Card } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card title="The game plan in 3 steps">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Check this week&apos;s matchup. Who has more games left?</li>
          <li>Pick up free agents who play 3–4 games this week, and drop your players with the fewest games.</li>
          <li>Near the trade deadline, trade for players with 4-game weeks in the fantasy playoffs.</li>
        </ol>
      </Card>
      <Card title="Words to know">
        <dl className="divide-y divide-line">
          {Object.values(GLOSSARY).map((g) => (
            <div key={g.term} className="py-3">
              <dt className="font-bold">{g.term}</dt>
              <dd className="mt-0.5 text-muted">{g.text}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
