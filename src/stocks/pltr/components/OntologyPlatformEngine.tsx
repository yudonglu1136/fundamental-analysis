import { InsightBox, BulletList, type PltrComponentProps } from "./PLTRPrimitives";

export function OntologyPlatformEngine({ dashboard }: PltrComponentProps) {
  return (
    <InsightBox title="Platform / Product Engine">
      <div className="grid gap-4 md:grid-cols-2">
        <BulletList
          items={[
            "Gotham anchors defense, intelligence, and national security workflows.",
            "Foundry organizes data, logic, ontology, analytics, and workflow development.",
            "AIP connects LLMs and agents to private operational data with governance.",
            "Apollo deploys and upgrades software across cloud, classified, edge, and disconnected environments.",
          ]}
        />
        <div>
          <p className="font-semibold text-ink">Qualitative moat score: {dashboard.ontology.score}/100</p>
          <p className="mt-2">
            The moat case depends on ontology depth, workflow embedding, permission complexity, deployment speed, and switching costs. It is not allowed to inflate valuation without explicit links to retention, pricing, growth, or margin.
          </p>
        </div>
      </div>
    </InsightBox>
  );
}
