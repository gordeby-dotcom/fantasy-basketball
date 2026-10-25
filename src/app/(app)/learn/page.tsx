import { Card } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card title="The game plan in 3 steps">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            During the season, build the best roster: trade for players who score more in your league&apos;s scoring (big
            rebounders, double-double guys) and pick up players who are playing well.
          </li>
          <li>Watch who&apos;s hot and cold. Sell a player on a hot streak; buy a star who&apos;s in a slump.</li>
          <li>
            In the fantasy playoffs, games matter most: stream players with 3–4 games that week, and before the trade deadline trade
            for 4-4-4 schedules.
          </li>
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
